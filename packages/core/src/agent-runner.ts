import {checkToolPermission, type ToolDefinition} from "@ego-graph/tools";
import type {ZodTypeAny} from "zod";
import {createInitialMissionGraph} from "./mission-graph.js";
import {parseTaskSpec, type TaskSpecInput} from "./task-spec.js";
import {createTrajectoryEvent, type TrajectoryEvent} from "./trajectory.js";

export type Evidence = {
  summary: string;
  source: string;
  raw: Record<string, unknown>;
};

export type MissionOverlay = {
  name: string;
  tools: ToolDefinition<ZodTypeAny, ZodTypeAny>[];
};

export type MissionTrajectoryStore = {
  append(event: TrajectoryEvent): Promise<void>;
};

export type MissionRunInput = {
  workspaceRoot: string;
  task: TaskSpecInput;
  overlay: MissionOverlay;
  trajectoryStore: MissionTrajectoryStore;
  runId: string;
};

export type MissionRunResult = {
  runId: string;
  status: "complete" | "blocked";
  evidence: Evidence[];
  events: TrajectoryEvent[];
};

export async function runMission(input: MissionRunInput): Promise<MissionRunResult> {
  const events: TrajectoryEvent[] = [];
  const append = async (
    type: TrajectoryEvent["type"],
    message: string,
    data: Record<string, unknown> = {},
  ) => {
    const event = createTrajectoryEvent(input.runId, type, message, data);
    events.push(event);
    await input.trajectoryStore.append(event);
  };

  const task = parseTaskSpec(input.task);
  await append("task.parsed", "Task parsed", {task});

  const graph = createInitialMissionGraph(task);
  await append("graph.created", "Mission graph created", {graph});

  const evidence: Evidence[] = [];

  for (const tool of input.overlay.tools) {
    const decision = checkToolPermission(tool, task.allowedScope);
    await append("safety.checked", decision.reason, {
      tool: tool.name,
      allowed: decision.allowed,
    });

    if (!decision.allowed) {
      await append("run.blocked", decision.reason, {tool: tool.name});
      return {runId: input.runId, status: "blocked", evidence, events};
    }

    await append("tool.started", `Started ${tool.name}`, {tool: tool.name});
    const parsedInput = tool.inputSchema.parse({fixture: task.targets[0]});
    const rawOutput = await tool.execute(parsedInput, {workspaceRoot: input.workspaceRoot});
    const output = tool.outputSchema.parse(rawOutput) as Record<string, unknown>;
    await append("tool.completed", `Completed ${tool.name}`, {tool: tool.name, output});

    const findings = Array.isArray(output.findings) ? output.findings : [];
    for (const finding of findings) {
      const item = {summary: String(finding), source: tool.name, raw: output};
      evidence.push(item);
      await append("evidence.created", item.summary, item);
    }
  }

  await append("run.completed", "Mission completed", {evidenceCount: evidence.length});
  return {runId: input.runId, status: "complete", evidence, events};
}
