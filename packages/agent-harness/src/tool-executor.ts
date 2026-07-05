import type { ToolDefinition, ToolRiskLevel, SandboxProfile } from "@ego-graph/tools";
import type { ZodTypeAny, z } from "zod";
import {
  buildPermissionRecoveryHint,
  hasPermission,
  requiredPermissionForTool,
  type PermissionLevel,
} from "./safety-policy.js";

export type ToolCallProtocol = {
  id: string;
  name: string;
  input: unknown;
  permissionRequired: PermissionLevel;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  sandboxProfile: SandboxProfile;
  timeoutMs: number;
};

export type ToolExecutorEvent = {
  id: string;
  type: "tool.completed" | "tool.failed" | "tool.timeout" | "tool.blocked";
  runId: string;
  sessionId: string;
  createdAt: string;
  phase: "tool_running" | "blocked";
  permissionLevel: PermissionLevel;
  message: string;
  payload: Record<string, unknown>;
};

export type ToolExecutorResult = {
  status: "completed" | "failed" | "timeout" | "blocked";
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
  approvalGranted?: boolean;
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

  if (call.requiresApproval && !input.approvalGranted) {
    return failResult(input, call, "tool.blocked", "Tool requires approval before execution.", {
      ...basePayload,
      recoveryHint: "Approve the pending tool call before retrying.",
    });
  }

  try {
    const output = await withTimeout(
      input.tool.execute(parsedInput.data as z.output<InputSchema>, {
        workspaceRoot: input.workspaceRoot,
      }),
      call.timeoutMs,
    );
    const parsedOutput = input.tool.outputSchema.safeParse(output);
    if (!parsedOutput.success) {
      return failResult(input, call, "tool.failed", "Tool output schema validation failed.", {
        ...basePayload,
        recoveryHint: "Inspect the tool implementation; it returned an invalid shape.",
        debug: { issues: parsedOutput.error.issues, output },
      });
    }

    const outputRecord = parsedOutput.data as Record<string, unknown>;
    if (outputRecord.status === "failed") {
      return failResult(input, call, "tool.failed", `Tool failed: ${call.name}`, {
        ...basePayload,
        output: truncateToolOutput(outputRecord, input.maxOutputChars),
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
          output: truncateToolOutput(outputRecord, input.maxOutputChars),
          debug: { fullOutput: outputRecord },
        },
      },
    };
  } catch (error) {
    const message =
      error instanceof ToolTimeoutError ? "Tool timed out." : "Tool execution failed.";
    return failResult(
      input,
      call,
      error instanceof ToolTimeoutError ? "tool.timeout" : "tool.failed",
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
  type: "tool.failed" | "tool.timeout" | "tool.blocked",
  message: string,
  payload: Record<string, unknown>,
): ToolExecutorResult {
  return {
    status: type === "tool.timeout" ? "timeout" : type === "tool.blocked" ? "blocked" : "failed",
    call,
    event: {
      id: `${call.id}-${type.split(".")[1]}`,
      type,
      runId: input.runId,
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      phase: type === "tool.blocked" ? "blocked" : "tool_running",
      permissionLevel: input.permissionLevel,
      message,
      payload,
    },
  };
}

class ToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool timed out after ${timeoutMs}ms`);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new ToolTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function truncateToolOutput(
  output: Record<string, unknown>,
  maxChars = 12_000,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(output).map(([key, value]) => [
      key,
      typeof value === "string" ? truncateText(value, maxChars) : value,
    ]),
  );
}

function truncateText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars))}...`;
}

function buildToolRecoveryHint(toolName: string, reason: "failed" | "timeout"): string {
  if (reason === "timeout") {
    return `The ${toolName} call exceeded its timeout; narrow the input or raise timeoutMs for an approved run.`;
  }
  return `Inspect ${toolName} output in debug details and retry after fixing the cause.`;
}
