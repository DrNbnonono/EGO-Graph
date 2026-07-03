import {
  checkPolicyGate,
  type ToolDefinition,
  type ToolEvidenceCandidate,
  type ToolRiskLevel,
} from "@ego-graph/tools";
import type { ZodTypeAny } from "zod";
import {
  createDeterministicPlanner,
  type AgentDecision,
  type AgentObservation,
  type AgentPlanner,
} from "./agent-planner.js";
import {
  addEvidenceItem,
  createEvidenceBoard,
  evidenceItemFromFinding,
  type EvidenceBoard,
} from "./evidence-board.js";
import {
  createInitialMissionGraph,
  updateMissionNodeStatus,
  type MissionGraph,
  type MissionNodeKind,
  type MissionNodeStatus,
} from "./mission-graph.js";
import { parseTaskSpec, type TaskSpecInput } from "./task-spec.js";
import { createTrajectoryEvent, type TrajectoryEvent } from "./trajectory.js";

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
  planner?: AgentPlanner;
  maxIterations?: number;
  approvedTools?: string[];
  allowedRiskLevels?: ToolRiskLevel[];
  sandboxAvailable?: boolean;
};

export type MissionRunResult = {
  runId: string;
  status: "complete" | "blocked";
  evidence: Evidence[];
  evidenceBoard: EvidenceBoard;
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
  await append("task.parsed", "Task parsed", { task });

  let graph = createInitialMissionGraph(task);
  await append("graph.created", "Mission graph created", { graph });
  const updateGraph = async (
    kind: MissionNodeKind,
    status: MissionNodeStatus,
    data: Record<string, unknown> = {},
  ): Promise<MissionGraph> => {
    graph = updateMissionNodeStatus(graph, kind, status);
    await append("graph.updated", `${kind} marked ${status}`, { graph, ...data });
    return graph;
  };

  const evidence: Evidence[] = [];
  let evidenceBoard = createEvidenceBoard();
  const observations: AgentObservation[] = [];
  const planner = input.planner ?? createDeterministicPlanner();
  const fallbackPlanner = createDeterministicPlanner();
  const maxIterations = input.maxIterations ?? input.overlay.tools.length + 2;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    await updateGraph("plan", "running", { iteration });
    await updateGraph("tool_select", "running", { iteration });
    const plannerContext = {
      task,
      graph,
      tools: input.overlay.tools,
      evidence,
      observations,
    };
    let decision: AgentDecision;
    try {
      decision = await planner.decide(plannerContext);
    } catch (error) {
      await append("model.failed", "Model-backed planner failed", {
        planner: planner.name ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      });
      decision = await fallbackPlanner.decide(plannerContext);
      await append("planner.fallback", "Fell back to deterministic planner", {
        planner: fallbackPlanner.name ?? "deterministic",
      });
    }
    await updateGraph("plan", "complete", { iteration });
    await updateGraph("tool_select", "complete", { iteration });
    await append("decision.made", decision.rationale, { decision, iteration });

    if (decision.type === "finish") {
      await updateGraph("evaluate", "complete", { iteration });
      await updateGraph("verdict", "complete", { iteration });
      await updateGraph("report", "complete", { iteration });
      await append("evaluation.completed", decision.rationale, {
        evidenceCount: evidence.length,
        observationCount: observations.length,
      });
      await append("run.completed", "Mission completed", { evidenceCount: evidence.length });
      return { runId: input.runId, status: "complete", evidence, evidenceBoard, events };
    }

    if (decision.type === "block") {
      await updateGraph("evaluate", "blocked", { iteration });
      await updateGraph("verdict", "blocked", { iteration });
      await append("run.blocked", decision.rationale, {
        evidenceCount: evidence.length,
        observationCount: observations.length,
      });
      return { runId: input.runId, status: "blocked", evidence, evidenceBoard, events };
    }

    const tool = input.overlay.tools.find((candidate) => candidate.name === decision.toolName);
    if (!tool) {
      const reason = `Planner selected unknown tool: ${decision.toolName}`;
      await updateGraph("execute_tools", "blocked", { iteration, tool: decision.toolName });
      await append("run.blocked", reason, { decision });
      return { runId: input.runId, status: "blocked", evidence, evidenceBoard, events };
    }

    await updateGraph("safety_gate", "running", { iteration, tool: tool.name });
    const permissionDecision = checkPolicyGate(tool, {
      allowedScope: task.allowedScope,
      scenario: task.scenario,
      ...(input.approvedTools ? { approvedTools: input.approvedTools } : {}),
      ...(input.allowedRiskLevels ? { allowedRiskLevels: input.allowedRiskLevels } : {}),
      ...(input.sandboxAvailable === undefined ? {} : { sandboxAvailable: input.sandboxAvailable }),
    });
    await append("safety.checked", permissionDecision.reason, {
      tool: tool.name,
      allowed: permissionDecision.allowed,
    });

    if (!permissionDecision.allowed) {
      await updateGraph("safety_gate", "blocked", { iteration, tool: tool.name });
      await append("run.blocked", permissionDecision.reason, { tool: tool.name });
      return { runId: input.runId, status: "blocked", evidence, evidenceBoard, events };
    }
    await updateGraph("safety_gate", "complete", { iteration, tool: tool.name });

    await updateGraph("execute_tools", "running", { iteration, tool: tool.name });
    await updateGraph("action", "running", { iteration, tool: tool.name });
    await append("tool.started", `Started ${tool.name}`, { tool: tool.name });
    const parsedInput = tool.inputSchema.parse(decision.input);
    const rawOutput = await tool.execute(parsedInput, { workspaceRoot: input.workspaceRoot });
    const output = tool.outputSchema.parse(rawOutput) as Record<string, unknown>;
    await append("tool.completed", `Completed ${tool.name}`, { tool: tool.name, output });
    await updateGraph("action", "complete", { iteration, tool: tool.name });
    await updateGraph("execute_tools", "complete", { iteration, tool: tool.name });

    const findings = Array.isArray(output.findings) ? output.findings : [];
    const observation: AgentObservation = {
      toolName: tool.name,
      output,
      findings: findings.map((finding) => String(finding)),
    };
    observations.push(observation);
    await updateGraph("observation", "complete", { iteration, tool: tool.name });
    await append("observation.created", `Observed ${tool.name} output`, observation);

    const evidenceCandidates: ToolEvidenceCandidate[] =
      tool.evidenceMapper?.(output) ??
      findings.map((finding) => ({
        summary: String(finding),
        raw: output,
      }));

    for (const candidate of evidenceCandidates) {
      await updateGraph("update_evidence", "running", { iteration, tool: tool.name });
      const item = {
        summary: candidate.summary,
        source: tool.name,
        raw: candidate.raw ?? output,
      };
      const boardItem = evidenceItemFromFinding({
        ...item,
        ...(candidate.kind ? { kind: candidate.kind } : {}),
        ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }),
      });
      evidence.push(item);
      evidenceBoard = addEvidenceItem(evidenceBoard, boardItem);
      await append("evidence.created", item.summary, item);
      await updateGraph("update_evidence", "complete", { iteration, tool: tool.name });
    }
  }

  const reason = `Planner exceeded ${maxIterations} iteration(s) without reaching a final decision.`;
  await updateGraph("evaluate", "blocked", { evidenceCount: evidence.length });
  await updateGraph("verdict", "blocked", { evidenceCount: evidence.length });
  await append("run.blocked", reason, { evidenceCount: evidence.length });
  return { runId: input.runId, status: "blocked", evidence, evidenceBoard, events };
}
