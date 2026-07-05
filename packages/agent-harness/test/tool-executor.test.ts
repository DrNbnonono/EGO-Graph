import type { ToolDefinition } from "@ego-graph/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createToolCall, executeToolCall } from "../src/tool-executor.js";

const inputSchema = z.object({ value: z.string().default("ok") });
const outputSchema = z.object({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  result: z.string().optional(),
});

function createTool(
  overrides: Partial<ToolDefinition<typeof inputSchema, typeof outputSchema>>,
): ToolDefinition<typeof inputSchema, typeof outputSchema> {
  return {
    name: "test.tool",
    description: "A test tool.",
    inputSchema,
    outputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 1_000,
    async execute() {
      return { result: "ok" };
    },
    ...overrides,
  };
}

describe("tool executor", () => {
  it("creates a normalized ToolCall protocol from tool metadata", () => {
    const call = createToolCall(
      createTool({
        name: "security.audit",
        riskLevel: "high",
        sandboxProfile: "process",
        requiresApproval: true,
      }),
      { value: "x" },
    );

    expect(call).toMatchObject({
      name: "security.audit",
      input: { value: "x" },
      permissionRequired: "security-active",
      riskLevel: "high",
      requiresApproval: true,
      sandboxProfile: "process",
      timeoutMs: 1_000,
    });
    expect(call.id).toMatch(/^tool-call-/);
  });

  it("emits tool.blocked when permission is insufficient", async () => {
    const result = await executeToolCall({
      tool: createTool({ name: "security.audit", riskLevel: "high" }),
      input: { value: "x" },
      workspaceRoot: process.cwd(),
      permissionLevel: "read-only",
      approvalGranted: true,
      runId: "run-tool-1",
      sessionId: "session-tool-1",
    });

    expect(result.status).toBe("blocked");
    expect(result.event.type).toBe("tool.blocked");
    expect(result.event.message).toContain("permission");
    expect(result.event.payload.recoveryHint).toContain("/allow security-active");
  });

  it("emits tool.failed instead of tool.completed when execution throws", async () => {
    const result = await executeToolCall({
      tool: createTool({
        async execute() {
          throw new Error("boom");
        },
      }),
      input: {},
      workspaceRoot: process.cwd(),
      permissionLevel: "shell-readonly",
      approvalGranted: true,
      runId: "run-tool-2",
      sessionId: "session-tool-2",
    });

    expect(result.status).toBe("failed");
    expect(result.event.type).toBe("tool.failed");
    expect(result.event.payload.debug).toMatchObject({ error: "boom" });
  });

  it("emits tool.timeout and truncates long stdout/stderr in user payload", async () => {
    const result = await executeToolCall({
      tool: createTool({
        timeoutMs: 10,
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return { stdout: "late" };
        },
      }),
      input: {},
      workspaceRoot: process.cwd(),
      permissionLevel: "shell-readonly",
      approvalGranted: true,
      runId: "run-tool-3",
      sessionId: "session-tool-3",
      maxOutputChars: 20,
    });

    expect(result.status).toBe("timeout");
    expect(result.event.type).toBe("tool.timeout");
    expect(result.event.payload.recoveryHint).toContain("timeout");

    const completed = await executeToolCall({
      tool: createTool({
        async execute() {
          return {
            stdout: "x".repeat(40),
            stderr: "y".repeat(40),
            result: "ok",
          };
        },
      }),
      input: {},
      workspaceRoot: process.cwd(),
      permissionLevel: "shell-readonly",
      approvalGranted: true,
      runId: "run-tool-4",
      sessionId: "session-tool-4",
      maxOutputChars: 20,
    });

    expect(completed.status).toBe("completed");
    expect(completed.event.type).toBe("tool.completed");
    expect(String(completed.event.payload.output.stdout)).toHaveLength(23);
    expect(completed.event.payload.debug).toMatchObject({
      fullOutput: expect.objectContaining({ result: "ok" }),
    });
  });
});
