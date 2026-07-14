import type { ToolDefinition, ToolRiskLevel, SandboxProfile } from "@ego-graph/tools";
import type { ZodTypeAny, z } from "zod";
import {
  buildPermissionRecoveryHint,
  hasPermission,
  requiredPermissionForTool,
  type PermissionLevel,
} from "./safety-policy.js";
import {
  evaluatePermissionRules,
  permissionRulesForLevel,
  wildcardMatch,
  type PermissionRule,
} from "./permission-rules.js";
import type { PermissionLifecycleState } from "./permissions/permission-lifecycle.js";
import {
  consumeOperationApproval,
  validateOperationApproval,
  type OperationApproval,
} from "./permissions/grants-v2.js";

export type ToolCallProtocol = {
  id: string;
  name: string;
  input: unknown;
  permissionRequired: PermissionLevel;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  sandboxProfile: SandboxProfile;
  timeoutMs: number;
  toolIdentity?: string;
  permissionAction?: string;
  permissionResources?: string[];
  /**
   * Security action this tool performs (e.g. "inspect", "exploit", "report").
   * High-risk and network-scoped tools are gated against the active
   * SecurityScope's allowedActions/forbiddenActions before execution.
   */
  requiredAction?: string;
};

/**
 * Structural shape compatible with @ego-graph/security-tools SecurityScope.
 * Declared here as a plain interface so tool-executor does not need a hard
 * runtime dependency on the security-tools package; any object with these
 * fields (including a real SecurityScope) is accepted.
 */
export type SecurityScopeGate = {
  allowedActions: string[];
  forbiddenActions: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  expiresAt: string;
};

export type ToolExecutorEvent = {
  id: string;
  type:
    | "tool.completed"
    | "tool.failed"
    | "tool.timeout"
    | "tool.cancelled"
    | "tool.blocked"
    | "permission.requested"
    | "permission.replied"
    | "tool.output.truncated";
  runId: string;
  sessionId: string;
  createdAt: string;
  phase: "tool_running" | "blocked";
  permissionLevel: PermissionLevel;
  message: string;
  payload: Record<string, unknown>;
};

export type ToolExecutorResult = {
  status: "completed" | "failed" | "timeout" | "cancelled" | "blocked";
  call: ToolCallProtocol;
  event: ToolExecutorEvent;
  output?: Record<string, unknown>;
};

export type ExecuteToolCallInput<
  InputSchema extends ZodTypeAny,
  OutputSchema extends ZodTypeAny,
> = {
  tool: ToolDefinition<InputSchema, OutputSchema>;
  input: unknown;
  call?: ToolCallProtocol;
  workspaceRoot: string;
  permissionLevel: PermissionLevel;
  /** Exact, single-use approval for tools declaring requiresApproval. */
  operationApproval?: OperationApproval;
  workspaceId?: string;
  signal?: AbortSignal;
  permissionRules?: PermissionRule[];
  /**
   * Persistent permission lifecycle (saved allow/always grants). When
   * provided, a tool that would otherwise hit an `ask` rule is auto-approved
   * if a saved rule with effect `allow` matches the tool's action+resource,
   * mirroring opencode's "allow always" reuse. Without this the lifecycle is
   * dead code: saved grants would never be honored within a run.
   */
  permissionLifecycle?: PermissionLifecycleState;
  /**
   * Invoked when a tool call is auto-approved from a saved permission grant,
   * so the session can emit a `permission.replied` event for auditability.
   */
  onAutoApprovedPermission?(detail: {
    action: string;
    resources: string[];
    matchedRule: PermissionRule;
  }): void;
  /** When provided, high-risk/network tools are gated against this scope. */
  securityScope?: SecurityScopeGate;
  runId: string;
  sessionId: string;
  maxOutputChars?: number;
};

export function createToolCall(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  input: unknown,
): ToolCallProtocol {
  return {
    id: `tool-call-${new Date().toISOString().replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
    name: tool.name,
    input,
    permissionRequired: requiredPermissionForTool(tool),
    riskLevel: tool.riskLevel ?? tool.permission.risk,
    requiresApproval: tool.requiresApproval ?? tool.permission.risk === "high",
    sandboxProfile: tool.sandboxProfile ?? "none",
    timeoutMs: tool.timeoutMs ?? 30_000,
    toolIdentity: toolIdentity(tool),
    permissionAction: tool.permissionAction ?? tool.name,
  };
}

export async function executeToolCall<
  InputSchema extends ZodTypeAny,
  OutputSchema extends ZodTypeAny,
>(input: ExecuteToolCallInput<InputSchema, OutputSchema>): Promise<ToolExecutorResult> {
  const call = input.call ?? createToolCall(input.tool, input.input);
  const createdAt = new Date().toISOString();
  const basePayload = {
    tool: call,
    permissionRequired: call.permissionRequired,
    riskLevel: call.riskLevel,
    sandboxProfile: call.sandboxProfile,
  };

  const currentIdentity = toolIdentity(input.tool);
  if (call.toolIdentity && call.toolIdentity !== currentIdentity) {
    return failResult(input, call, "tool.blocked", "Refusing stale tool call identity.", {
      ...basePayload,
      recoveryHint: "Refresh the tool manifest and retry the call.",
      debug: { expectedIdentity: currentIdentity, receivedIdentity: call.toolIdentity },
    });
  }

  const parsedInput = input.tool.inputSchema.safeParse(input.input);
  if (!parsedInput.success) {
    return failResult(input, call, "tool.failed", "Tool input schema validation failed.", {
      ...basePayload,
      recoveryHint: "Check the tool input schema and retry with valid arguments.",
      debug: { issues: parsedInput.error.issues },
    });
  }

  if (!hasPermission(input.permissionLevel, call.permissionRequired)) {
    return failResult(input, call, "tool.blocked", "Tool blocked by permission policy.", {
      ...basePayload,
      recoveryHint: buildPermissionRecoveryHint(call.permissionRequired),
    });
  }

  const permissionAction = call.permissionAction ?? input.tool.permissionAction ?? input.tool.name;
  const permissionResources =
    call.permissionResources ??
    input.tool.permissionResources?.(parsedInput.data as z.output<InputSchema>) ??
    inferPermissionResources(parsedInput.data);
  const permissionDecision = evaluatePermissionRules({
    action: permissionAction,
    resources: permissionResources,
    rules: input.permissionRules ?? permissionRulesForLevel(input.permissionLevel),
  });
  const exactApproval = validateOperationApproval({
    approval: input.operationApproval,
    call,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId ?? input.workspaceRoot,
  });
  if (permissionDecision.effect === "deny") {
    return failResult(input, call, "tool.blocked", "Tool blocked by permission rule.", {
      ...basePayload,
      action: permissionAction,
      resources: permissionResources,
      matchedRule: permissionDecision.matchedRule,
      recoveryHint: "Adjust the permission policy only if this action is authorized.",
    });
  }
  if (permissionDecision.effect === "ask") {
    // Honor persistent "allow always" grants before falling back to blocking
    // on a human decision. This is what makes the permission lifecycle real:
    // a saved grant auto-approves the call without re-prompting the user.
    const savedAllow = input.permissionLifecycle?.savedRules.find(
      (rule) =>
        rule.effect === "allow" &&
        wildcardMatch(permissionAction, rule.action) &&
        permissionResources.every((resource) => wildcardMatch(resource, rule.resource)),
    );
    if (exactApproval.valid) {
      // A call-bound approval may satisfy the ask decision for this exact
      // input, but it never creates a reusable permission grant.
    } else if (savedAllow) {
      input.onAutoApprovedPermission?.({
        action: permissionAction,
        resources: permissionResources,
        matchedRule: savedAllow,
      });
    } else {
      return failResult(
        input,
        call,
        "permission.requested",
        "Tool requires permission approval.",
        {
          ...basePayload,
          action: permissionAction,
          resources: permissionResources,
          matchedRule: permissionDecision.matchedRule,
          savePolicy: permissionResources,
          recoveryHint: "Approve or deny the pending permission request.",
        },
      );
    }
  }

  // Security scope gate: high-risk or network-scoped tools must clear an
  // explicit authorization scope. Without this gate, "security-active"
  // permission alone would be enough to run intrusive tools, which defeats
  // the contest requirement of evidence-grounded, scope-bounded autonomy.
  const scopeCheck = evaluateSecurityScopeGate(input, call);
  if (scopeCheck) {
    return failResult(input, call, "tool.blocked", scopeCheck.message, {
      ...basePayload,
      recoveryHint: scopeCheck.recoveryHint,
    });
  }

  if (call.requiresApproval) {
    if (!exactApproval.valid) {
      return failResult(input, call, "tool.blocked", "Tool requires an exact operation approval.", {
        ...basePayload,
        approvalReason: exactApproval.reason,
        recoveryHint: "Approve this exact tool call before retrying.",
      });
    }
    consumeOperationApproval(input.operationApproval!);
  }

  try {
    const output = await executeWithCancellation({
      timeoutMs: call.timeoutMs,
      ...(input.signal ? { signal: input.signal } : {}),
      execute: (signal, deadlineAt) => input.tool.execute(parsedInput.data as z.output<InputSchema>, {
        workspaceRoot: input.workspaceRoot,
        signal,
        deadlineAt,
        ...(input.securityScope ? { securityScope: input.securityScope } : {}),
      }),
    });
    const parsedOutput = input.tool.outputSchema.safeParse(output);
    if (!parsedOutput.success) {
      return failResult(input, call, "tool.failed", "Tool output schema validation failed.", {
        ...basePayload,
        recoveryHint: "Inspect the tool implementation; it returned an invalid shape.",
        debug: { issues: parsedOutput.error.issues, output },
      });
    }

    const outputRecord = parsedOutput.data as Record<string, unknown>;
    const maxOutputChars = input.maxOutputChars ?? input.tool.maxOutputBytes ?? 12_000;
    const truncatedOutput = truncateToolOutput(outputRecord, maxOutputChars);
    if (outputRecord.status === "failed") {
      return failResult(input, call, "tool.failed", `Tool failed: ${call.name}`, {
        ...basePayload,
        output: truncatedOutput.output,
        truncated: truncatedOutput.truncated,
        recoveryHint: buildToolRecoveryHint(call.name, "failed"),
        debug: { fullOutput: outputRecord },
      });
    }

    return {
      status: "completed",
      call,
      output: outputRecord,
      event: {
        id: `${call.id}-completed`,
        type: "tool.completed",
        runId: input.runId,
        sessionId: input.sessionId,
        createdAt,
        phase: "tool_running",
        permissionLevel: input.permissionLevel,
        message: `Tool completed: ${call.name}`,
        payload: {
          ...basePayload,
          output: truncatedOutput.output,
          truncated: truncatedOutput.truncated,
          debug: { fullOutput: outputRecord },
        },
      },
    };
  } catch (error) {
    const message =
      error instanceof ToolTimeoutError
        ? "Tool timed out."
        : error instanceof ToolCancelledError
          ? "Tool was cancelled."
          : "Tool execution failed.";
    return failResult(
      input,
      call,
      error instanceof ToolTimeoutError
        ? "tool.timeout"
        : error instanceof ToolCancelledError
          ? "tool.cancelled"
          : "tool.failed",
      message,
      {
        ...basePayload,
        recoveryHint: buildToolRecoveryHint(
          call.name,
          error instanceof ToolTimeoutError ? "timeout" : "failed",
        ),
        debug: { error: error instanceof Error ? error.message : String(error) },
      },
    );
  }
}

function failResult<InputSchema extends ZodTypeAny, OutputSchema extends ZodTypeAny>(
  input: ExecuteToolCallInput<InputSchema, OutputSchema>,
  call: ToolCallProtocol,
  type: "tool.failed" | "tool.timeout" | "tool.cancelled" | "tool.blocked" | "permission.requested",
  message: string,
  payload: Record<string, unknown>,
): ToolExecutorResult {
  return {
    status:
      type === "tool.timeout"
        ? "timeout"
        : type === "tool.cancelled"
          ? "cancelled"
        : type === "tool.blocked" || type === "permission.requested"
          ? "blocked"
          : "failed",
    call,
    event: {
      id: `${call.id}-${type.split(".")[1]}`,
      type,
      runId: input.runId,
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      phase: type === "tool.blocked" || type === "permission.requested" ? "blocked" : "tool_running",
      permissionLevel: input.permissionLevel,
      message,
      payload,
    },
  };
}

function toolIdentity(tool: ToolDefinition<ZodTypeAny, ZodTypeAny>): string {
  return tool.identity ?? `${tool.name}@${tool.version ?? "1"}`;
}

function inferPermissionResources(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [String(input ?? "")];
  }
  const record = input as Record<string, unknown>;
  for (const key of ["command", "path", "url", "target", "value", "pattern"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return [value];
    }
  }
  return ["*"];
}

class ToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool timed out after ${timeoutMs}ms`);
  }
}

class ToolCancelledError extends Error {
  constructor() {
    super("Tool execution was cancelled");
  }
}

async function executeWithCancellation<T>(input: {
  timeoutMs: number;
  signal?: AbortSignal;
  execute(signal: AbortSignal, deadlineAt: string): Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", onAbort, { once: true });
  if (input.signal?.aborted) controller.abort(input.signal.reason);
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new ToolTimeoutError(input.timeoutMs));
  }, input.timeoutMs);
  timeout.unref?.();
  const deadlineAt = new Date(Date.now() + input.timeoutMs).toISOString();
  try {
    return await Promise.race([
      input.execute(controller.signal, deadlineAt),
      new Promise<T>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(timedOut ? new ToolTimeoutError(input.timeoutMs) : new ToolCancelledError());
        }, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}

function truncateToolOutput(
  output: Record<string, unknown>,
  maxChars = 12_000,
): { output: Record<string, unknown>; truncated: boolean } {
  let truncated = false;
  const visible = Object.fromEntries(
    Object.entries(output).map(([key, value]) => [
      key,
      typeof value === "string"
        ? truncateText(value, maxChars, () => {
            truncated = true;
          })
        : value,
    ]),
  );
  return { output: visible, truncated };
}

function truncateText(value: string, maxChars: number, onTruncate: () => void): string {
  if (value.length <= maxChars) {
    return value;
  }
  onTruncate();
  return `${value.slice(0, Math.max(0, maxChars))}...`;
}

function buildToolRecoveryHint(toolName: string, reason: "failed" | "timeout"): string {
  if (reason === "timeout") {
    return `The ${toolName} call exceeded its timeout; narrow the input or raise timeoutMs for an approved run.`;
  }
  return `Inspect ${toolName} output in debug details and retry after fixing the cause.`;
}

/**
 * Decide whether a tool must be gated by a SecurityScope, and if so whether
 * the supplied scope permits it.
 *
 * Returns undefined when the tool is not security-gated (low/medium risk on
 * local files), otherwise returns a block descriptor with a recovery hint.
 *
 * The requiredAction is taken from the tool's declared `requiredAction` when
 * present (security tools set this), falling back to a name-based inference
 * ("security." prefix tools default to "inspect" unless their name suggests
 * otherwise). This keeps the gate useful without forcing every ToolDefinition
 * to declare a security action.
 */
function evaluateSecurityScopeGate(
  input: ExecuteToolCallInput<ZodTypeAny, ZodTypeAny>,
  call: ToolCallProtocol,
): { message: string; recoveryHint: string } | undefined {
  const tool = input.tool;
  // The SecurityScope gate only applies to tools that reach outside the
  // workspace (network scope) or explicitly declare they need a scope. Local
  // high-risk tools that only read workspace files (e.g. a local package
  // manifest audit) are bounded by the permission/approval gates instead —
  // forcing a scope on them would block legitimate local static analysis.
  const isNetwork = tool.permission.scope === "network";
  const requiresScope = Boolean((tool as { requiresSecurityScope?: boolean }).requiresSecurityScope);
  if (!isNetwork && !requiresScope) {
    return undefined;
  }

  const scope = input.securityScope;
  if (!scope) {
    return {
      message: "Security task requires an explicit authorization scope before this tool runs.",
      recoveryHint:
        "Define a SecurityScope (target, allowedActions, riskLevel, expiresAt) and re-run within scope.",
    };
  }

  const expiry = Date.parse(scope.expiresAt);
  if (Number.isNaN(expiry) || expiry < Date.now()) {
    return {
      message: "SecurityScope has expired; refuse or renew the scope before retrying.",
      recoveryHint: "Re-issue a SecurityScope with a future expiresAt.",
    };
  }

  const requiredAction = inferRequiredSecurityAction(tool, call);
  if (scope.forbiddenActions.includes(requiredAction)) {
    return {
      message: `${requiredAction} is forbidden by the active SecurityScope.`,
      recoveryHint: `Remove ${requiredAction} from forbiddenActions or choose a different tool.`,
    };
  }
  if (!scope.allowedActions.includes(requiredAction)) {
    return {
      message: `${requiredAction} is not in the SecurityScope allowedActions list.`,
      recoveryHint: `Add ${requiredAction} to allowedActions if the task truly requires it.`,
    };
  }

  const scopeRiskRank = securityRiskRank(scope.riskLevel);
  const toolRiskRank =
    call.riskLevel === "high" ? 3 : call.riskLevel === "medium" ? 2 : 1;
  if (toolRiskRank > scopeRiskRank) {
    return {
      message: `Tool risk (${call.riskLevel}) exceeds SecurityScope risk level (${scope.riskLevel}).`,
      recoveryHint: "Raise the scope risk level only if the engagement authorizes it.",
    };
  }

  return undefined;
}

function inferRequiredSecurityAction(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  call: ToolCallProtocol,
): string {
  if (call.requiredAction) {
    return call.requiredAction;
  }
  const name = tool.name.toLowerCase();
  if (name.includes("exploit") || name.includes("attack")) return "exploit";
  if (name.includes("scan") || name.includes("fingerprint")) return "fingerprint";
  if (name.includes("report")) return "report";
  if (name.includes("evidence")) return "evidence.save";
  return "inspect";
}

function securityRiskRank(risk: SecurityScopeGate["riskLevel"]): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[risk];
}
