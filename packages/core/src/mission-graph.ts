import type { TaskSpec } from "./task-spec.js";

export type MissionNodeKind =
  | "parse_task"
  | "goal"
  | "subgoal"
  | "plan"
  | "tool_select"
  | "safety_gate"
  | "execute_tools"
  | "action"
  | "observation"
  | "update_evidence"
  | "evaluate"
  | "verdict"
  | "report";

export type MissionNodeStatus = "pending" | "ready" | "running" | "complete" | "blocked";

export type MissionNode = {
  id: string;
  kind: MissionNodeKind;
  status: MissionNodeStatus;
  dependsOn: string[];
  rationale: string;
};

export type MissionGraph = {
  id: string;
  taskId: string;
  status: "planned" | "running" | "complete" | "blocked";
  nodes: MissionNode[];
};

export function createInitialMissionGraph(task: TaskSpec): MissionGraph {
  const kinds: MissionNodeKind[] = [
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
  ];

  const nodes = kinds.map((kind, index): MissionNode => {
    const previous = index === 0 ? [] : [`node-${index}`];
    return {
      id: `node-${index + 1}`,
      kind,
      status: index === 0 ? "complete" : index === 1 ? "ready" : "pending",
      dependsOn: previous,
      rationale: `${kind} is required to complete ${task.scenario}`,
    };
  });

  return {
    id: `graph-${task.id}`,
    taskId: task.id,
    status: "planned",
    nodes,
  };
}

export function updateMissionNodeStatus(
  graph: MissionGraph,
  kind: MissionNodeKind,
  status: MissionNodeStatus,
): MissionGraph {
  const nodes = graph.nodes.map((node) => (node.kind === kind ? { ...node, status } : node));
  const hasBlockedNode = nodes.some((node) => node.status === "blocked");
  const allComplete = nodes.every((node) => node.status === "complete");

  return {
    ...graph,
    status: hasBlockedNode ? "blocked" : allComplete ? "complete" : "running",
    nodes,
  };
}
