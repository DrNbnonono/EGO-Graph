import {describe, expect, it} from "vitest";
import {createFixtureReadTool} from "@ego-graph/tools";
import {runMission, type MissionTrajectoryStore} from "../src/agent-runner.js";

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
    expect(result.events.map((event) => event.type)).toContain("run.completed");
    expect(events.map((event) => event.type)).toContain("evidence.created");
  });
});
