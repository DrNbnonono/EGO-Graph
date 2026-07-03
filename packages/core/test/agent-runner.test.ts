import { describe, expect, it } from "vitest";
import { createFixtureReadTool } from "@ego-graph/tools";
import { runMission, type AgentPlanner, type MissionTrajectoryStore } from "../src/index.js";

describe("runMission", () => {
  it("runs the controlled web pentest fixture and records evidence", async () => {
    const events: Awaited<Parameters<MissionTrajectoryStore["append"]>[0]>[] = [];
    const trajectoryStore: MissionTrajectoryStore = {
      async append(event) {
        events.push(event);
      },
    };

    const result = await runMission({
      workspaceRoot: process.cwd(),
      task: {
        scenario: "web_pentest",
        goal: "Assess the controlled fixture for exposed admin hints",
        targets: ["fixture://web-pentest/basic"],
        constraints: ["authorized-fixture-only"],
      },
      overlay: {
        name: "web_pentest",
        tools: [createFixtureReadTool()],
      },
      trajectoryStore,
      runId: "run-test-001",
    });

    expect(result.status).toBe("complete");
    expect(result.evidence[0]?.summary).toContain("admin hint");
    expect(result.evidenceBoard.items[0]?.summary).toContain("admin hint");
    expect(result.events.map((event) => event.type)).toContain("graph.updated");
    expect(result.events.map((event) => event.type)).toContain("decision.made");
    expect(result.events.map((event) => event.type)).toContain("observation.created");
    expect(result.events.map((event) => event.type)).toContain("evaluation.completed");
    expect(result.events.map((event) => event.type)).toContain("run.completed");
    expect(events.map((event) => event.type)).toContain("evidence.created");
  });

  it("falls back to deterministic planning when a planner fails", async () => {
    const trajectoryStore: MissionTrajectoryStore = {
      async append() {
        // The test only needs returned in-memory events.
      },
    };
    const failingPlanner: AgentPlanner = {
      name: "model:test",
      async decide() {
        throw new Error("model unavailable");
      },
    };

    const result = await runMission({
      workspaceRoot: process.cwd(),
      task: {
        scenario: "web_pentest",
        goal: "Assess the controlled fixture for exposed admin hints",
        targets: ["fixture://web-pentest/basic"],
        constraints: ["authorized-fixture-only"],
      },
      overlay: {
        name: "web_pentest",
        tools: [createFixtureReadTool()],
      },
      trajectoryStore,
      runId: "run-test-model-fallback",
      planner: failingPlanner,
    });

    expect(result.status).toBe("complete");
    expect(result.events.map((event) => event.type)).toContain("model.failed");
    expect(result.events.map((event) => event.type)).toContain("planner.fallback");
  });

  it("blocks when a planner selects a tool outside the overlay", async () => {
    const trajectoryStore: MissionTrajectoryStore = {
      async append() {
        // The test only needs the returned in-memory events.
      },
    };
    const planner: AgentPlanner = {
      async decide() {
        return {
          type: "use_tool",
          toolName: "missing.tool",
          rationale: "Try a tool that is not registered in this overlay.",
          input: {},
          expectedEvidence: "No evidence expected.",
        };
      },
    };

    const result = await runMission({
      workspaceRoot: process.cwd(),
      task: {
        scenario: "web_pentest",
        goal: "Assess the controlled fixture for exposed admin hints",
        targets: ["fixture://web-pentest/basic"],
        constraints: ["authorized-fixture-only"],
      },
      overlay: {
        name: "web_pentest",
        tools: [createFixtureReadTool()],
      },
      trajectoryStore,
      runId: "run-test-unknown-tool",
      planner,
    });

    expect(result.status).toBe("blocked");
    expect(result.events.at(-1)?.message).toContain("unknown tool");
  });
});
