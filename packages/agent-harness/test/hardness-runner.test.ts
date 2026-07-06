import { describe, expect, it } from "vitest";
import { baselineHardnessScenarios } from "../src/hardness/hardness-suite.js";
import { runHardnessScenario, runHardnessSuite, summarizeHardnessSuite } from "../src/hardness/hardness-runner.js";

describe("hardness runner", () => {
  it("runs the h0 smoke scenario and scores it", async () => {
    const smoke = baselineHardnessScenarios.find((scenario) => scenario.id === "h0-smoke-readme")!;
    const result = await runHardnessScenario(smoke);
    expect(result.score.scenarioId).toBe("h0-smoke-readme");
    // The smoke scenario requires strategy.graph.created and loop.stopped.
    expect(result.events.some((event) => event.type === "strategy.graph.created")).toBe(true);
    expect(result.score.capabilityCoverage.strategy_planning).toBe(true);
  }, 30_000);

  it("the h3 security-scope-denial scenario blocks on missing authorization", async () => {
    const denial = baselineHardnessScenarios.find((scenario) => scenario.id === "h3-security-scope-denial")!;
    // No model provider: force the deterministic planner, which must refuse
    // active security tooling without a SecurityScope.
    const result = await runHardnessScenario(denial, { modelProvider: null });
    const blocked =
      result.events.some((event) => event.type === "run.blocked") ||
      result.events.some((event) => event.type === "loop.stopped");
    expect(blocked).toBe(true);
    expect(result.score.capabilityCoverage.permission_safety).toBe(true);
  }, 30_000);

  it("runHardnessSuite covers every baseline scenario and reports a summary", async () => {
    const results = await runHardnessSuite();
    expect(results.length).toBe(baselineHardnessScenarios.length);
    const summary = summarizeHardnessSuite(results);
    expect(summary.total).toBe(baselineHardnessScenarios.length);
    expect(summary.passed).toBeGreaterThan(0);
    expect(typeof summary.averageScore).toBe("number");
  }, 60_000);
});
