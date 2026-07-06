import type {
  createTerminalAgentToolRegistry,
  ToolDefinition,
  ToolEvidenceCandidate,
} from "@ego-graph/tools";
import { type ZodTypeAny, type z } from "zod";
import type { AgentRunEvent, AgentRunEventType, PermissionLevel } from "./session.js";
import { createToolCall, executeToolCall, type SecurityScopeGate } from "./tool-executor.js";
import type { PermissionLifecycleState } from "./permissions/permission-lifecycle.js";
import type { PermissionRule } from "./permission-rules.js";

export type HarnessToolEventInput = {
  type: AgentRunEventType;
  runId: string;
  sessionId: string;
  message: string;
  payload: Record<string, unknown>;
};

export type HarnessEvidenceEventInput = {
  runId: string;
  sessionId: string;
  toolName: string;
  candidate: ToolEvidenceCandidate;
  output: Record<string, unknown>;
};

export type ExecuteHarnessToolStepInput = {
  runId: string;
  sessionId: string;
  workspaceRoot: string;
  toolRegistry: ReturnType<typeof createTerminalAgentToolRegistry>;
  permissionLevel: PermissionLevel;
  toolName: string;
  toolInput: Record<string, unknown>;
  /** When set, high-risk/network tools are gated against this scope. */
  securityScope?: SecurityScopeGate;
  /** Persistent permission grants honored before falling back to a prompt. */
  permissionLifecycle?: PermissionLifecycleState;
  emit(event: HarnessToolEventInput): Promise<AgentRunEvent>;
  emitEvidence(event: HarnessEvidenceEventInput): Promise<AgentRunEvent>;
};

export async function* executeHarnessToolStep(
  input: ExecuteHarnessToolStepInput,
): AsyncIterable<AgentRunEvent> {
  const tool = input.toolRegistry.get(input.toolName);
  const toolCall = createToolCall(tool, input.toolInput);

  yield await input.emit({
    type: "tool.requested",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Tool requested: ${tool.name}`,
    payload: { tool: summarizeHarnessTool(tool), toolCall },
  });

  yield await input.emit({
    type: "tool.started",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Started ${tool.name}`,
    payload: { tool: tool.name, toolCall },
  });

  const result = await executeToolCall({
    tool,
    input: input.toolInput,
    call: toolCall,
    workspaceRoot: input.workspaceRoot,
    permissionLevel: input.permissionLevel,
    approvalGranted: !toolCall.requiresApproval || input.permissionLevel === "security-active",
    ...(input.securityScope ? { securityScope: input.securityScope } : {}),
    ...(input.permissionLifecycle ? { permissionLifecycle: input.permissionLifecycle } : {}),
    onAutoApprovedPermission(detail) {
      // Emit an auditable permission.replied event so the TUI, report, and
      // repro bundle record that this call was auto-approved from a saved
      // grant rather than a fresh human decision.
      void input
        .emit({
          type: "permission.replied",
          runId: input.runId,
          sessionId: input.sessionId,
          message: `Permission auto-approved from saved grant: ${detail.action} on ${detail.resources.join(", ")}.`,
          payload: {
            tool: tool.name,
            action: detail.action,
            resources: detail.resources,
            matchedRule: detail.matchedRule satisfies PermissionRule,
            source: "saved-grant",
          },
        })
        .catch(() => {
          // Swallow: the run does not depend on the audit event landing.
        });
    },
    runId: input.runId,
    sessionId: input.sessionId,
  });

  yield await input.emit({
    type: result.event.type,
    runId: input.runId,
    sessionId: input.sessionId,
    message: result.event.message,
    payload: {
      ...result.event.payload,
      tool: tool.name,
      toolCall: result.call,
    },
  });

  if (result.status !== "completed") {
    yield await input.emit({
      type: "reflection.created",
      runId: input.runId,
      sessionId: input.sessionId,
      message: `Reflection: ${tool.name} did not complete; inspect debug details or retry with narrower input.`,
      payload: {
        tool: tool.name,
        toolCall,
        recoveryHint: result.event.payload.recoveryHint,
        status: result.status,
      },
    });
    return;
  }

  if (result.event.payload.truncated === true) {
    yield await input.emit({
      type: "tool.output.truncated",
      runId: input.runId,
      sessionId: input.sessionId,
      message: `Output truncated for ${tool.name}.`,
      payload: {
        tool: tool.name,
        toolCall,
        maxOutputBytes: tool.maxOutputBytes,
      },
    });
  }

  const output = result.output ?? {};
  const findings = Array.isArray(output.findings) ? output.findings.map(String) : [];
  yield await input.emit({
    type: "observation.created",
    runId: input.runId,
    sessionId: input.sessionId,
    message: findings[0] ?? `Observed ${tool.name} output.`,
    payload: { tool: tool.name, findings, output },
  });

  // When the model proposes a patch via the workspace.edit tool inside the
  // loop, surface it as a patch.proposed event so the session can pause for
  // human approval — mirroring how plan-driven patches already flow.
  if (
    tool.name === "workspace.edit" &&
    typeof (output as { status?: string }).status === "string" &&
    (output as { status?: string }).status === "proposed"
  ) {
    const editOutput = output as {
      previewId: string;
      goal: string;
      files: string[];
      diff: string;
    };
    yield await input.emit({
      type: "patch.proposed",
      runId: input.runId,
      sessionId: input.sessionId,
      message: `Model-proposed patch ready for ${editOutput.files.length} file(s).`,
      payload: {
        approvalId: `approval-${editOutput.previewId}`,
        diff: editOutput.diff,
        files: editOutput.files,
        source: "loop-edit-tool",
      },
    });
  }

  const candidates =
    tool.evidenceMapper?.(output as z.output<ZodTypeAny>) ??
    findings.map((summary) => ({ summary, raw: output }));
  for (const candidate of candidates) {
    yield await input.emitEvidence({
      runId: input.runId,
      sessionId: input.sessionId,
      toolName: tool.name,
      candidate,
      output,
    });
  }

  yield await input.emit({
    type: "reflection.created",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Reflection: ${tool.name} reduced the evidence gap with ${findings.length} finding(s).`,
    payload: { tool: tool.name, findingsCount: findings.length },
  });
}

export function summarizeHarnessTool(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    scope: tool.permission.scope,
    riskLevel: tool.riskLevel ?? tool.permission.risk,
    requiresApproval: Boolean(tool.requiresApproval),
    sandboxProfile: tool.sandboxProfile ?? (tool.permission.requiresSandbox ? "docker" : "none"),
    timeoutMs: tool.timeoutMs,
  };
}
