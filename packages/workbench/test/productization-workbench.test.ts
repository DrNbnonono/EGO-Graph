import { describe, expect, it } from "vitest";
import {
  createRuntimeMetricsSampler,
  getBuiltinCommands,
  readWorkbenchState,
} from "../src/index.js";

describe("productized workbench state", () => {
  it("reports process CPU from sampled deltas instead of a static load average", () => {
    let usage = { user: 1_000, system: 1_000 };
    let now = 1_000_000_000n;
    const sampler = createRuntimeMetricsSampler({
      cpuUsage: () => usage,
      hrtime: () => now,
      cpuCount: () => 4,
      rssBytes: () => 256 * 1024 * 1024,
      totalMemoryBytes: () => 1024 * 1024 * 1024,
      freeMemoryBytes: () => 512 * 1024 * 1024,
    });

    const first = sampler.sample();
    usage = { user: 51_000, system: 1_000 };
    now = 2_000_000_000n;
    const second = sampler.sample();

    expect(first.cpuPercent).toBeNull();
    expect(second.cpuPercent).toBeGreaterThan(0);
    expect(second.memoryRssMb).toBe(256);
    expect(second.systemMemoryPercent).toBe(50);
  });

  it("exposes slash command manifests for the command palette", () => {
    const commands = getBuiltinCommands();

    expect(commands.map((command) => command.name)).toEqual([
      "/help",
      "/model",
      "/models",
      "/plan",
      "/patch",
      "/scan",
      "/memory",
      "/skills",
      "/mcp",
      "/prompt",
      "/compact",
      "/status",
      "/clear",
    ]);
    expect(commands.find((command) => command.name === "/patch")?.requiresApproval).toBe(true);
    expect(commands.find((command) => command.name === "/model")?.uiAction).toBe("open-models");
  });

  it("includes productized metrics and command state in workbench output", async () => {
    const state = await readWorkbenchState({ workspaceRoot: process.cwd() });

    expect(state.runtime.metrics.memoryRssMb).toBeGreaterThan(0);
    expect(state.runtime.metrics.sampledAt).toMatch(/T/);
    expect(state.commandsRegistry.map((command) => command.name)).toContain("/skills");
    expect(state.prompt.summary).toContain("System Prompt");
  });
});
