import type { ToolDefinition } from "@ego-graph/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createToolCall, executeToolCall } from "../src/tool-executor.js";
import { createOperationApproval } from "../src/permissions/grants-v2.js";

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

function createApprovedCall(
  tool: ToolDefinition<typeof inputSchema, typeof outputSchema>,
  input: unknown,
  sessionId: string,
  workspaceId: string,
) {
  const call = createToolCall(tool, input);
  return {
    call,
    operationApproval: createOperationApproval({
      call,
      sessionId,
      workspaceId,
      source: "api",
      createdBy: "test",
    }),
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
      runId: "run-tool-1",
      sessionId: "session-tool-1",
    });

    expect(result.status).toBe("blocked");
    expect(result.event.type).toBe("tool.blocked");
    expect(result.event.message).toContain("permission");
    expect(result.event.payload.recoveryHint).toContain("/allow security-active");
  });

  it("emits permission.requested when a matching rule asks for approval", async () => {
    const result = await executeToolCall({
      tool: createTool({
        name: "shell.write",
        riskLevel: "high",
        permission: { scope: "file", risk: "high", requiresSandbox: false },
      }),
      input: { value: "pnpm test" },
      workspaceRoot: process.cwd(),
      permissionLevel: "security-active",
      permissionRules: [
        { action: "*", resource: "*", effect: "deny" },
        { action: "shell.write", resource: "pnpm test", effect: "ask" },
      ],
      runId: "run-permission-ask",
      sessionId: "session-permission-ask",
    });

    expect(result.status).toBe("blocked");
    expect(result.event.type).toBe("permission.requested");
    expect(result.event.payload).toMatchObject({
      action: "shell.write",
      resources: ["pnpm test"],
      savePolicy: ["pnpm test"],
    });
  });

  it("rejects stale tool calls when the call identity no longer matches the tool", async () => {
    const result = await executeToolCall({
      tool: createTool({
        name: "workspace.read",
        identity: "workspace.read@2",
      }),
      input: { value: "README.md" },
      call: {
        id: "tool-call-stale",
        name: "workspace.read",
        input: { value: "README.md" },
        permissionRequired: "read-only",
        riskLevel: "low",
        requiresApproval: false,
        sandboxProfile: "none",
        timeoutMs: 1_000,
        toolIdentity: "workspace.read@1",
      },
      workspaceRoot: process.cwd(),
      permissionLevel: "read-only",
      runId: "run-stale",
      sessionId: "session-stale",
    });

    expect(result.status).toBe("blocked");
    expect(result.event.message).toContain("stale");
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
      runId: "run-tool-4",
      sessionId: "session-tool-4",
      maxOutputChars: 20,
    });

    expect(completed.status).toBe("completed");
    expect(completed.event.type).toBe("tool.completed");
    expect(completed.event.payload.truncated).toBe(true);
    expect(String(completed.event.payload.output.stdout)).toHaveLength(23);
    expect(completed.event.payload.debug).toMatchObject({
      fullOutput: expect.objectContaining({ result: "ok" }),
    });
  });

  it("blocks network security tools when no SecurityScope is provided", async () => {
    const tool = createTool({
      name: "security.scan",
      riskLevel: "high",
      permission: { scope: "network", risk: "high", requiresSandbox: false },
    });
    const approved = createApprovedCall(tool, { value: "x" }, "session-scope-1", process.cwd());
    const result = await executeToolCall({
      tool,
      input: { value: "x" },
      call: approved.call,
      workspaceRoot: process.cwd(),
      permissionLevel: "security-active",
      operationApproval: approved.operationApproval,
      runId: "run-scope-1",
      sessionId: "session-scope-1",
      // no securityScope
    });
    expect(result.status).toBe("blocked");
    expect(result.event.message).toContain("authorization scope");
  });

  it("blocks network security tools when the SecurityScope has expired", async () => {
    const tool = createTool({
      name: "security.scan",
      riskLevel: "high",
      permission: { scope: "network", risk: "high", requiresSandbox: false },
    });
    const approved = createApprovedCall(tool, { value: "x" }, "session-scope-2", process.cwd());
    const result = await executeToolCall({
      tool,
      input: { value: "x" },
      call: approved.call,
      workspaceRoot: process.cwd(),
      permissionLevel: "security-active",
      operationApproval: approved.operationApproval,
      runId: "run-scope-2",
      sessionId: "session-scope-2",
      securityScope: {
        allowedActions: ["inspect", "fingerprint"],
        forbiddenActions: ["exploit"],
        riskLevel: "high",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.event.message).toContain("expired");
  });

  it("runs a network security tool when the scope authorizes the action", async () => {
    const tool = createTool({
      name: "security.fingerprint",
      riskLevel: "high",
      permission: { scope: "network", risk: "high", requiresSandbox: false },
    });
    const approved = createApprovedCall(tool, { value: "x" }, "session-scope-3", process.cwd());
    const result = await executeToolCall({
      tool,
      input: { value: "x" },
      call: approved.call,
      workspaceRoot: process.cwd(),
      permissionLevel: "security-active",
      operationApproval: approved.operationApproval,
      runId: "run-scope-3",
      sessionId: "session-scope-3",
      securityScope: {
        allowedActions: ["inspect", "fingerprint"],
        forbiddenActions: ["exploit", "ddos"],
        riskLevel: "high",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    expect(result.status).toBe("completed");
  });

  it("blocks when the required action is forbidden even if the scope is otherwise valid", async () => {
    const tool = createTool({
      name: "security.exploit_target",
      riskLevel: "high",
      permission: { scope: "network", risk: "high", requiresSandbox: false },
    });
    const approved = createApprovedCall(tool, { value: "x" }, "session-scope-4", process.cwd());
    const result = await executeToolCall({
      tool,
      input: { value: "x" },
      call: approved.call,
      workspaceRoot: process.cwd(),
      permissionLevel: "security-active",
      operationApproval: approved.operationApproval,
      runId: "run-scope-4",
      sessionId: "session-scope-4",
      securityScope: {
        allowedActions: ["inspect"],
        forbiddenActions: ["exploit"],
        riskLevel: "high",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.event.message).toContain("forbidden");
  });

  it("does not gate local high-risk tools (e.g. manifest audit) on SecurityScope", async () => {
    // Local static analysis reads workspace files only; it must remain usable
    // after a call-bound approval even when no network scope is declared.
    const tool = createTool({
      name: "security.package_manifest_audit",
      riskLevel: "high",
      permission: { scope: "file", risk: "high", requiresSandbox: false },
    });
    const approved = createApprovedCall(tool, { value: "x" }, "session-scope-5", process.cwd());
    const result = await executeToolCall({
      tool,
      input: { value: "x" },
      call: approved.call,
      workspaceRoot: process.cwd(),
      permissionLevel: "security-active",
      operationApproval: approved.operationApproval,
      runId: "run-scope-5",
      sessionId: "session-scope-5",
      // no securityScope — must still run
    });
    expect(result.status).toBe("completed");
  });
});
