import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteEgoStore } from "../src/index.js";

const now = "2026-07-04T00:00:00.000Z";

describe("agent kernel SQLite store", () => {
  it("stores Hermes events, memories, and draft plans", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-kernel-store-"));
    try {
      const store = new SqliteEgoStore(join(dir, "ego.sqlite"));

      await store.saveHermesEvent({
        id: "hermes-1",
        type: "plan.updated",
        sessionId: "session-1",
        runId: "run-1",
        source: "test",
        payload: { status: "draft" },
        createdAt: now,
      });
      await store.saveMemory({
        id: "memory-1",
        scope: "project",
        content: "Remember that patches require approval.",
        source: "test",
        tags: ["policy"],
        references: ["README.md"],
        createdAt: now,
        updatedAt: now,
      });
      await store.saveAgentPlan({
        planId: "plan-1",
        sessionId: "session-1",
        runId: "run-1",
        mode: "coding",
        message: "Update README",
        status: "draft",
        plan: ["Inspect README", "Generate patch"],
        contextSummary: "Goal: Update README",
        memoryIds: ["memory-1"],
        createdAt: now,
        updatedAt: now,
      });

      await store.updateAgentPlanStatus("plan-1", "approved", "run-1", now);

      expect((await store.listHermesEvents({ sessionId: "session-1" }))[0]?.type).toBe(
        "plan.updated",
      );
      expect((await store.listMemories({ scope: "project" }))[0]?.content).toContain(
        "patches require approval",
      );
      expect(await store.getAgentPlan("plan-1")).toMatchObject({
        planId: "plan-1",
        status: "approved",
        runId: "run-1",
      });
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
