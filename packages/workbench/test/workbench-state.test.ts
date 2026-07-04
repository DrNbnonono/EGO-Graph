import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readWorkbenchState } from "../src/index.js";

describe("workbench state", () => {
  it("builds a terminal and web ready state model", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-workbench-"));
    const state = await readWorkbenchState({ workspaceRoot: process.cwd(), egoHome });

    expect(state.product).toBe("EGO-Graph");
    expect(state.title).toContain("紫莲花");
    expect(state.model.label).toBeDefined();
    expect(state.storage.sqlite).toContain("ego.sqlite");
    expect(state.sessions.length).toBeGreaterThan(0);
    expect(state.tools.map((tool) => tool.name)).toContain("Workspace");
    expect(state.quickCommands).toContain("/scan");
    expect(state.progress.completed).toContain("Agent Runtime 自主决策循环");
  });
});
