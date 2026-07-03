import {describe, expect, it} from "vitest";
import {createInitialMissionGraph, updateMissionNodeStatus} from "../src/mission-graph.js";
import {parseTaskSpec} from "../src/task-spec.js";

describe("MissionGraph", () => {
  it("creates parse, plan, execute, evaluate, and report nodes", () => {
    const task = parseTaskSpec({
      scenario: "web_pentest",
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: ["fixture://web-pentest/basic"],
      constraints: ["authorized-fixture-only"],
    });

    const graph = createInitialMissionGraph(task);

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "parse_task",
      "plan",
      "safety_gate",
      "execute_tools",
      "evaluate",
      "report",
    ]);
    expect(graph.status).toBe("planned");
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
