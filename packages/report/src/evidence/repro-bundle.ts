import type { EvidenceInputEvent } from "./evidence-graph.js";
import {
  buildEvidenceGraphFromEvents,
  summarizeResidualRisk,
  type EvidenceGraph,
  type ResidualRisk,
} from "./evidence-graph.js";
import { buildDecisionTraceFromEvents, type DecisionTraceStep } from "./decision-trace.js";

/**
 * Reproduction bundle: a single serializable artifact that captures
 * everything needed to replay and audit a run — the goal, scope,
 * tool invocations (with capability source), evidence graph, decision trace,
 * residual risks, and approval history. This is what the contest's "答辩
 * 报告" cites so reviewers can verify every claim.
 */

export type ReproToolInvocation = {
  step: number;
  tool: string;
  capabilitySource?: string;
  status?: string;
  inputPreview?: string;
  outputPreview?: string;
};

export type ReproApproval = {
  action: string;
  resources: string[];
  effect: string;
  source?: string;
  createdAt?: string;
};

export type ReproBundle = {
  runId: string;
  goal: string;
  scope: string[];
  status: "complete" | "blocked" | "unknown";
  toolInvocations: ReproToolInvocation[];
  evidenceGraph: EvidenceGraph;
  decisionTrace: DecisionTraceStep[];
  residualRisks: ResidualRisk[];
  approvals: ReproApproval[];
  generatedAt: string;
};

export type BuildReproBundleInput = {
  events: EvidenceInputEvent[];
  /** Optional explicit goal/scope; otherwise inferred from the run.started event. */
  goal?: string;
  scope?: string[];
};

export function buildReproBundleFromEvents(input: BuildReproBundleInput, now: string = new Date().toISOString()): ReproBundle {
  const events = input.events;
  const evidenceGraph = buildEvidenceGraphFromEvents(events);
  const decisionTrace = buildDecisionTraceFromEvents(events);
  const residualRisks = summarizeResidualRisk(evidenceGraph, events);
  const runId = events[0]?.runId ?? "unknown";
  const goal = input.goal ?? inferGoal(events);
  const scope = input.scope ?? inferScope(events);
  const status = inferStatus(events);
  const toolInvocations = collectToolInvocations(events);
  const approvals = collectApprovals(events);

  return {
    runId,
    goal,
    scope,
    status,
    toolInvocations,
    evidenceGraph,
    decisionTrace,
    residualRisks,
    approvals,
    generatedAt: now,
  };
}

export function serializeReproBundle(bundle: ReproBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function deserializeReproBundle(text: string): ReproBundle {
  return JSON.parse(text) as ReproBundle;
}

function inferGoal(events: EvidenceInputEvent[]): string {
  const started = events.find((event) => event.type === "run.started");
  const userMessage = events.find((event) => event.type === "user.message");
  const startedPayload = started?.payload as { goal?: string; userMessage?: string } | undefined;
  return userMessage?.message ?? startedPayload?.goal ?? startedPayload?.userMessage ?? started?.message ?? "(unknown goal)";
}

function inferScope(events: EvidenceInputEvent[]): string[] {
  const started = events.find((event) => event.type === "run.started");
  const permissionLevel = (started?.payload as { permissionLevel?: string } | undefined)
    ?.permissionLevel;
  const inferred = permissionLevel ? [`permission:${permissionLevel}`] : [];
  for (const event of events) {
    if (event.type === "strategy.graph.created" || event.type === "strategy.graph.updated") {
      const graph = (event.payload as { strategyGraph?: { assumptions?: string[] } } | undefined)?.strategyGraph;
      if (graph?.assumptions) {
        return [...inferred, ...graph.assumptions].slice(0, 5);
      }
    }
  }
  return inferred;
}

function inferStatus(events: EvidenceInputEvent[]): ReproBundle["status"] {
  const lastRelevant = [...events]
    .reverse()
    .find((event) =>
      ["run.completed", "run.blocked", "run.cancelled", "loop.stopped"].includes(event.type),
    );
  if (!lastRelevant) {
    return "unknown";
  }
  if (lastRelevant.type === "run.completed") {
    return "complete";
  }
  if (lastRelevant.type === "run.blocked") {
    return "blocked";
  }
  return "unknown";
}

function collectToolInvocations(events: EvidenceInputEvent[]): ReproToolInvocation[] {
  const invocations: ReproToolInvocation[] = [];
  let step = 0;
  let current: ReproToolInvocation | undefined;
  for (const event of events) {
    if (event.type === "tool.started") {
      step += 1;
      const tool = (event.payload as { tool?: string } | undefined)?.tool ?? "unknown";
      current = { step, tool };
      invocations.push(current);
    }
    if (event.type === "tool.completed" && current) {
      current.status = "completed";
      current.outputPreview = String((event.payload as { output?: { findings?: unknown[] } } | undefined)?.output?.findings?.[0] ?? "").slice(0, 120);
    }
    if ((event.type === "tool.failed" || event.type === "tool.timeout" || event.type === "tool.blocked") && current) {
      current.status = event.type === "tool.failed" ? "failed" : event.type === "tool.timeout" ? "timeout" : "blocked";
    }
    if (event.type === "scheduler.job.completed" && current) {
      const source = (event.payload as { capabilitySource?: string } | undefined)?.capabilitySource;
      if (source) {
        current.capabilitySource = source;
      }
    }
  }
  return invocations;
}

function collectApprovals(events: EvidenceInputEvent[]): ReproApproval[] {
  const approvals: ReproApproval[] = [];
  for (const event of events) {
    if (event.type === "permission.requested" || event.type === "permission.replied") {
      const payload = (event.payload ?? {}) as {
        action?: string;
        resources?: string[];
        matchedRule?: { effect?: string };
        source?: string;
      };
      approvals.push({
        action: payload.action ?? "*",
        resources: payload.resources ?? [],
        effect: payload.matchedRule?.effect ?? (event.type === "permission.replied" ? "allow" : "ask"),
        ...(payload.source ? { source: payload.source } : {}),
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
      });
    }
  }
  return approvals;
}
