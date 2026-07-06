import { describe, expect, it } from "vitest";
import {
  createPermissionLifecycleState,
  enqueuePermissionRequest,
  expirePermissionRequests,
  replyToPermissionRequest,
} from "../src/index.js";

describe("permission lifecycle", () => {
  it("moves pending requests to history and saves always-allow rules", () => {
    const state = enqueuePermissionRequest({
      state: createPermissionLifecycleState(),
      now: "2026-07-06T00:00:00.000Z",
      request: {
        id: "perm-1",
        runId: "run",
        sessionId: "session",
        action: "shell.readonly",
        resources: ["pnpm test"],
        createdAt: "2026-07-06T00:00:00.000Z",
      },
    });
    const replied = replyToPermissionRequest({
      state,
      mode: "always",
      now: "2026-07-06T00:00:01.000Z",
      reply: { requestId: "perm-1", effect: "allow", save: true },
    });

    expect(replied.pending).toHaveLength(0);
    expect(replied.history[0]?.status).toBe("approved");
    expect(replied.savedRules).toContainEqual({
      action: "shell.readonly",
      resource: "pnpm test",
      effect: "allow",
    });
  });

  it("expires stale requests", () => {
    const state = enqueuePermissionRequest({
      state: createPermissionLifecycleState(),
      now: "2026-07-06T00:00:00.000Z",
      ttlMs: 1_000,
      request: {
        id: "perm-2",
        runId: "run",
        sessionId: "session",
        action: "security.scan",
        resources: ["target"],
        createdAt: "2026-07-06T00:00:00.000Z",
      },
    });
    const expired = expirePermissionRequests({
      state,
      now: "2026-07-06T00:00:02.000Z",
    });

    expect(expired.pending).toHaveLength(0);
    expect(expired.history[0]?.status).toBe("expired");
  });
});
