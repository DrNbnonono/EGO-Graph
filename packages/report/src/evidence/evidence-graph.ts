/**
 * Evidence graph: reconstruct a directed graph of evidence, hypotheses, and
 * observations from an agent run's event stream.
 *
 * This is the core "Evidence-Guided Orchestration Graph" artifact: every
 * conclusion the agent states must be traceable to tool output, and every
 * rejected hypothesis must remain visible. The graph is rebuilt from events
 * (pure function), so it can be regenerated at any time for replay/audit.
 *
 * To stay zero-dependency, we accept a minimal structural event shape rather
 * than importing the full AgentRunEvent type from @ego-graph/agent-harness
 * (which would create a package cycle). Any object with these fields works.
 */

export type EvidenceNodeKind =
  | "fact"
  | "hypothesis"
  | "artifact"
  | "decision_trace"
  | "summary";

export type EvidenceNode = {
  id: string;
  kind: EvidenceNodeKind;
  summary: string;
  source?: string;
  confidence?: number;
  toolName?: string;
  createdAt?: string;
};

export type EvidenceEdgeRelation =
  | "supports"
  | "contradicts"
  | "derived_from"
  | "produced_by";

export type EvidenceEdge = {
  from: string;
  to: string;
  relation: EvidenceEdgeRelation;
};

export type EvidenceGraph = {
  runId: string;
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
};

export type ResidualRisk = {
  id: string;
  description: string;
  /** Ids of evidence nodes that are missing or weakly supported. */
  missingEvidence: string[];
  severity: "low" | "medium" | "high";
};

/** Minimal event shape the evidence builder consumes. */
export type EvidenceInputEvent = {
  type: string;
  runId: string;
  message: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
};

export function buildEvidenceGraphFromEvents(events: EvidenceInputEvent[]): EvidenceGraph {
  const nodes = new Map<string, EvidenceNode>();
  const edges: EvidenceEdge[] = [];
  const runId = events[0]?.runId ?? "unknown-run";

  // Seed hypotheses from the strategy graph snapshot carried in the payload.
  for (const event of events) {
    if (event.type === "strategy.graph.created" || event.type === "strategy.graph.updated") {
      const graph = readPayloadField(event, "strategyGraph") as
        | { hypotheses?: Array<{ id: string; title: string; status?: string; confidence?: number }> }
        | undefined;
      for (const hypothesis of graph?.hypotheses ?? []) {
        const nodeId = `hypothesis:${hypothesis.id}`;
        nodes.set(nodeId, {
          id: nodeId,
          kind: "hypothesis",
          summary: hypothesis.title,
          ...(typeof hypothesis.confidence === "number" ? { confidence: hypothesis.confidence } : {}),
          ...(event.createdAt ? { createdAt: event.createdAt } : {}),
        });
      }
    }
  }

  // Observations become fact nodes linked to the tool that produced them.
  let observationIndex = 0;
  for (const event of events) {
    if (event.type === "observation.created") {
      const toolName = readPayloadField(event, "tool") as string | undefined;
      const findings = readPayloadField(event, "findings") as string[] | undefined;
      const summary = (findings?.[0] ?? event.message).slice(0, 200);
      const nodeId = `observation:${observationIndex++}`;
      nodes.set(nodeId, {
        id: nodeId,
        kind: "fact",
        summary,
        ...(toolName ? { toolName, source: toolName } : {}),
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
      });
      // Link observation to the leading hypothesis (produced_by).
      if (nodes.size > 1) {
        const firstHypothesis = firstHypothesisId(nodes);
        if (firstHypothesis) {
          edges.push({ from: firstHypothesis, to: nodeId, relation: "produced_by" });
        }
      }
    }
    if (event.type === "evidence.created") {
      const candidate = readPayloadField(event, "candidate") as
        | { summary?: string; kind?: EvidenceNodeKind; confidence?: number }
        | undefined;
      const payloadSummary = readPayloadField(event, "summary") as string | undefined;
      const payloadSource = readPayloadField(event, "source") as string | undefined;
      const toolName = readPayloadField(event, "toolName") as string | undefined;
      const summary = candidate?.summary ?? payloadSummary ?? event.message;
      const nodeId = `evidence:${observationIndex++}`;
      nodes.set(nodeId, {
        id: nodeId,
        kind: candidate?.kind ?? "fact",
        summary,
        ...(typeof candidate?.confidence === "number" ? { confidence: candidate.confidence } : {}),
        ...(toolName ? { toolName, source: toolName } : payloadSource ? { source: payloadSource } : {}),
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
      });
    }
  }

  // Strategy updates link evidence to hypothesis confidence changes.
  for (const event of events) {
    if (event.type === "strategy.graph.updated") {
      const updates = readPayloadField(event, "updates") as
        | Array<{ kind: string; ref: string; summary: string }>
        | undefined;
      for (const update of updates ?? []) {
        if (update.kind === "hypothesis_changed") {
          const hypothesisId = `hypothesis:${update.ref}`;
          // Find the most recent evidence/observation node and link it.
          const recentEvidence = mostRecentEvidenceNode(nodes);
          if (recentEvidence) {
            edges.push({ from: hypothesisId, to: recentEvidence.id, relation: "supports" });
          }
        }
      }
    }
  }

  return {
    runId,
    nodes: [...nodes.values()],
    edges,
  };
}

/**
 * Summarize residual risk: hypotheses still `open`/low-confidence, evidence
 * gaps that were never closed, and any tool failures with no fallback.
 */
export function summarizeResidualRisk(graph: EvidenceGraph, events: EvidenceInputEvent[]): ResidualRisk[] {
  const risks: ResidualRisk[] = [];
  // Open/low-confidence hypotheses.
  for (const node of graph.nodes) {
    if (node.kind === "hypothesis" && (node.confidence ?? 0) < 0.6) {
      risks.push({
        id: `risk-${node.id}`,
        description: `Hypothesis under-supported: ${node.summary}`,
        missingEvidence: supportingEvidenceIds(graph, node.id),
        severity: (node.confidence ?? 0) < 0.3 ? "high" : "medium",
      });
    }
  }
  // Tool failures without fallback.
  for (const event of events) {
    if (event.type === "tool.failed" || event.type === "tool.timeout") {
      const tool = readPayloadField(event, "tool") as string | undefined;
      risks.push({
        id: `risk-tool-${tool ?? "unknown"}`,
        description: `Tool ${tool ?? "(unknown)"} failed without a documented fallback.`,
        missingEvidence: [],
        severity: "medium",
      });
    }
  }
  // Scheduler residual risks (forwarded from batch.completed).
  for (const event of events) {
    if (event.type === "scheduler.batch.completed") {
      const residualRisks = readPayloadField(event, "residualRisks") as
        | Array<{ jobId: string; toolName: string; reason: string }>
        | undefined;
      for (const risk of residualRisks ?? []) {
        risks.push({
          id: `risk-sched-${risk.jobId}`,
          description: `${risk.toolName}: ${risk.reason}`,
          missingEvidence: [],
          severity: "high",
        });
      }
    }
  }
  return risks;
}

export function evidenceNodeIndex(graph: EvidenceGraph): Map<string, EvidenceNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function readPayloadField(event: EvidenceInputEvent, key: string): unknown {
  const payload = event.payload;
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

function firstHypothesisId(nodes: Map<string, EvidenceNode>): string | undefined {
  for (const node of nodes.values()) {
    if (node.kind === "hypothesis") {
      return node.id;
    }
  }
  return undefined;
}

function mostRecentEvidenceNode(nodes: Map<string, EvidenceNode>): EvidenceNode | undefined {
  let recent: EvidenceNode | undefined;
  for (const node of nodes.values()) {
    if (node.kind === "fact" || node.kind === "artifact") {
      recent = node;
    }
  }
  return recent;
}

function supportingEvidenceIds(graph: EvidenceGraph, hypothesisId: string): string[] {
  return graph.edges
    .filter((edge) => edge.from === hypothesisId)
    .map((edge) => edge.to);
}
