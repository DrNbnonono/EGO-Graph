import { describe, expect, it } from "vitest";
import { z } from "zod";
import { executeToolCall } from "../src/tool-executor.js";
import {
  createPermissionLifecycleState,
  replyToPermissionRequest,
} from "../src/permissions/permission-lifecycle.js";
import type {
  PermissionLifecycleState,
} from "../src/permissions/permission-lifecycle.js";
import type { ToolDefinition } from "@ego-graph/tools";

const inputSchema = z.string();
const outputSchema = z.object({ findings: z.array(z.string()) });
type TestTool = ToolDefinition<typeof inputSchema, typeof outputSchema>;

function makeTool(): TestTool {
  return {
    name: "shell.readonly",
    description: "run a readonly shell command",
    inputSchema,
    outputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "shell.readonly",
    riskLevel: "low",
    sandboxProfile: "none",
    async execute() {
      return { findings: ["ok"] };
    },
  };
}

async function runOnce(lifecycle?: PermissionLifecycleState, approvalGranted = false) {
  const tool = makeTool();
  // shell.readonly is `ask` at shell-readonly permission level.
  return executeToolCall({
    tool,
    input: "echo hi",
    workspaceRoot: ".",
    permissionLevel: "shell-readonly",
    approvalGranted,
    ...(lifecycle ? { permissionLifecycle: lifecycle } : {}),
    runId: "run",
    sessionId: "session",
  });
}

describe("permission lifecycle integration", () => {
  it("blocks with permission.requested when no saved grant exists", async () => {
    const result = await runOnce();
    expect(result.status).toBe("blocked");
    expect(result.event.type).toBe("permission.requested");
  });

  it("auto-approves when a saved allow grant matches the action", async () => {
    // Seed the lifecycle: a prior reply with save=true produces a saved rule.
    let lifecycle = createPermissionLifecycleState();
    lifecycle = {
      ...lifecycle,
      pending: [
        {
          id: "req-1",
          runId: "run",
          sessionId: "session",
          action: "shell.readonly",
          resources: ["*"],
          createdAt: "2026-07-06T00:00:00.000Z",
          status: "pending",
        },
      ],
    };
    lifecycle = replyToPermissionRequest({
      state: lifecycle,
      reply: { requestId: "req-1", effect: "allow", save: true },
      mode: "always",
      now: "2026-07-06T00:00:01.000Z",
    });
    expect(lifecycle.savedRules.length).toBeGreaterThan(0);

    const result = await runOnce(lifecycle);
    expect(result.status).toBe("completed");
    expect(result.event.type).toBe("tool.completed");
  });

  it("invokes onAutoApprovedPermission when a saved grant is used", async () => {
    let lifecycle = createPermissionLifecycleState();
    lifecycle = {
      ...lifecycle,
      pending: [
        {
          id: "req-2",
          runId: "run",
          sessionId: "session",
          action: "shell.readonly",
          resources: ["*"],
          createdAt: "2026-07-06T00:00:00.000Z",
          status: "pending",
        },
      ],
    };
    lifecycle = replyToPermissionRequest({
      state: lifecycle,
      reply: { requestId: "req-2", effect: "allow", save: true },
      mode: "always",
    });

    let autoApproved: { action: string; matchedEffect: string } | undefined;
    const tool = makeTool();
    const result = await executeToolCall({
      tool,
      input: "echo hi",
      workspaceRoot: ".",
      permissionLevel: "shell-readonly",
      approvalGranted: false,
      permissionLifecycle: lifecycle,
      onAutoApprovedPermission(detail) {
        autoApproved = { action: detail.action, matchedEffect: detail.matchedRule.effect };
      },
      runId: "run",
      sessionId: "session",
    });
    expect(result.status).toBe("completed");
    expect(autoApproved?.action).toBe("shell.readonly");
    expect(autoApproved?.matchedEffect).toBe("allow");
  });

  it("still blocks when the saved grant is for a different action", async () => {
    let lifecycle = createPermissionLifecycleState();
    lifecycle = {
      ...lifecycle,
      savedRules: [{ action: "workspace.edit", resource: "*", effect: "allow" }],
    };
    const result = await runOnce(lifecycle);
    expect(result.status).toBe("blocked");
    expect(result.event.type).toBe("permission.requested");
  });

  it("once-mode does not persist a reusable grant", async () => {
    let lifecycle = createPermissionLifecycleState();
    lifecycle = {
      ...lifecycle,
      pending: [
        {
          id: "req-3",
          runId: "run",
          sessionId: "session",
          action: "shell.readonly",
          resources: ["*"],
          createdAt: "2026-07-06T00:00:00.000Z",
          status: "pending",
        },
      ],
    };
    lifecycle = replyToPermissionRequest({
      state: lifecycle,
      reply: { requestId: "req-3", effect: "allow", save: false },
      // explicitly not "always"
      now: "2026-07-06T00:00:01.000Z",
    });
    expect(lifecycle.savedRules).toHaveLength(0);
    // No saved rule -> next call still blocks.
    const result = await runOnce(lifecycle);
    expect(result.status).toBe("blocked");
  });
});
