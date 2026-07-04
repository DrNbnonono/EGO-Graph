import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqlitePath, SqliteEgoStore } from "@ego-graph/storage";
import { describe, expect, it } from "vitest";
import { readWorkbenchState } from "../src/index.js";

describe("agent kernel workbench state", () => {
  it("summarizes memory, plans, Hermes, skills, search, and MCP state", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-kernel-workbench-"));
    const store = new SqliteEgoStore(sqlitePath(egoHome));
    const now = "2026-07-04T00:00:00.000Z";

    await store.saveHermesEvent({
      id: "hermes-workbench-1",
      type: "memory.written",
      sessionId: "session-workbench",
      source: "test",
      payload: { memoryId: "memory-workbench-1" },
      createdAt: now,
    });
    await store.saveMemory({
      id: "memory-workbench-1",
      scope: "project",
      content: "Workbench should show memory state.",
      source: "test",
      tags: ["workbench"],
      references: [],
      createdAt: now,
      updatedAt: now,
    });
    await store.saveAgentPlan({
      planId: "plan-workbench-1",
      sessionId: "session-workbench",
      mode: "coding",
      message: "Show plan state",
      status: "draft",
      plan: ["Render plan status"],
      contextSummary: "Goal: Show plan state",
      memoryIds: ["memory-workbench-1"],
      createdAt: now,
      updatedAt: now,
    });
    store.close();

    const state = await readWorkbenchState({ workspaceRoot: process.cwd(), egoHome });

    expect(state.memory.total).toBe(1);
    expect(state.memory.recent[0]?.content).toContain("Workbench");
    expect(state.plans.draftCount).toBe(1);
    expect(state.hermes.recentEvents[0]?.type).toBe("memory.written");
    expect(state.skills.map((skill) => skill.name)).toContain("web-search");
    expect(state.search.status).toBe("ready");
    expect(state.mcp.transport).toBe("stdio-v1");
  });
});
