import { describe, expect, it } from "vitest";
import { createInitialMissionGraph, updateMissionNodeStatus } from "../src/mission-graph.js";
import { parseTaskSpec } from "../src/task-spec.js";

describe("MissionGraph", () => {
  it("creates the full evidence-guided agent loop", () => {
    const task = parseTaskSpec({
      scenario: "web_pentest",
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: ["fixture://web-pentest/basic"],
      constraints: ["authorized-fixture-only"],
    });

    const graph = createInitialMissionGraph(task);

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "parse_task",
      "goal",
      "subgoal",
      "plan",
      "tool_select",
      "safety_gate",
      "execute_tools",
      "action",
      "observation",
      "update_evidence",
      "evaluate",
      "verdict",
      "report",
    ]);
    expect(graph.status).toBe("planned");
    expect(graph.nodes[0]?.status).toBe("complete");
    expect(graph.nodes[1]?.status).toBe("ready");
    expect(graph.nodes[1]?.dependsOn).toEqual(["node-1"]);
  });

  it("updates node status and derives graph status", () => {
    const task = parseTaskSpec({
      scenario: "web_pentest",
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: ["fixture://web-pentest/basic"],
      constraints: ["authorized-fixture-only"],
    });

    const graph = createInitialMissionGraph(task);
    const running = updateMissionNodeStatus(graph, "plan", "running");
    const blocked = updateMissionNodeStatus(running, "safety_gate", "blocked");

    expect(running.nodes.find((node) => node.kind === "plan")?.status).toBe("running");
    expect(running.status).toBe("running");
    expect(blocked.status).toBe("blocked");
  });
});
