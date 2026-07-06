import type {
  StrategyDomain,
  StrategyEvidenceGap,
  StrategyGraph,
  StrategyHypothesis,
  StrategyRiskPosture,
} from "./strategy-graph.js";

/**
 * Runtime lifecycle updates for a {@link StrategyGraph}.
 *
 * `createInitialStrategyGraph` seeds the graph once per run, but the
 * resulting hypotheses and evidence gaps are never mutated afterwards.
 * This module turns that static scaffold into a live lifecycle: each tool
 * observation can close an evidence gap, adjust hypothesis confidence, and
 * advance the current stage. The loop then emits `strategy.graph.updated`
 * so the UI, report, and repro bundle can cite a strategy that actually
 * reflects what the agent learned.
 *
 * All functions are pure and immutable (consistent with strategy-graph.ts):
 * they return a new {@link StrategyGraph} and never mutate the input.
 */

export type StrategyHypothesisPatch = {
  status?: StrategyHypothesis["status"];
  confidence?: number;
  requiredEvidence?: string[];
};

export type StrategyUpdateKind =
  | "hypothesis_changed"
  | "gap_closed"
  | "stage_progressed"
  | "posture_advanced";

export type StrategyUpdate = {
  kind: StrategyUpdateKind;
  /** Hypothesis id, gap id, or stage id this update refers to. */
  ref: string;
  /** Human-readable one-liner describing what changed and why. */
  summary: string;
};

export type StrategyObservation = {
  /** Tool that produced the observation (e.g. "workspace.grep"). */
  tool: string;
  /** Human-readable findings the tool returned. */
  findings: string[];
  /** Optional raw observation payload used to refine domain-specific heuristics. */
  output?: Record<string, unknown>;
};

export type StrategyUpdateResult = {
  graph: StrategyGraph;
  updates: StrategyUpdate[];
};

/**
 * Apply a partial patch to a hypothesis. Returns `changed: false` when the
 * hypothesis does not exist or the patch is a no-op, so callers can skip
 * emitting a `strategy.graph.updated` event.
 */
export function updateHypothesis(input: {
  graph: StrategyGraph;
  hypothesisId: string;
  patch: StrategyHypothesisPatch;
}): StrategyUpdateResult {
  const hypothesis = input.graph.hypotheses.find((h) => h.id === input.hypothesisId);
  if (!hypothesis) {
    return { graph: input.graph, updates: [] };
  }
  const merged = mergeHypothesis(hypothesis, input.patch);
  if (
    merged.status === hypothesis.status &&
    merged.confidence === hypothesis.confidence &&
    merged.requiredEvidence.length === hypothesis.requiredEvidence.length
  ) {
    return { graph: input.graph, updates: [] };
  }
  const hypotheses = input.graph.hypotheses.map((h) =>
    h.id === merged.id ? merged : h,
  );
  const graph: StrategyGraph = { ...input.graph, hypotheses };
  return {
    graph,
    updates: [
      {
        kind: "hypothesis_changed",
        ref: merged.id,
        summary: `Hypothesis ${merged.id} ${merged.status} (confidence ${merged.confidence.toFixed(2)}).`,
      },
    ],
  };
}

/**
 * Mark an evidence gap as closed and attach the supporting evidence to every
 * hypothesis that required it. Closing the authorization gap (g3) on a
 * `blocked` posture additionally advances the posture to `network_active` so
 * the run can continue with authorized active tooling.
 */
export function closeEvidenceGap(input: {
  graph: StrategyGraph;
  gapId: string;
  evidence: { summary: string; source: string };
}): StrategyUpdateResult {
  const gap = input.graph.evidenceGaps.find((g) => g.id === input.gapId);
  if (!gap) {
    return { graph: input.graph, updates: [] };
  }
  const updates: StrategyUpdate[] = [];
  const evidenceGaps = input.graph.evidenceGaps.map((g) =>
    g.id === gap.id
      ? { ...g, verification: appendEvidence(g.verification, input.evidence.summary) }
      : g,
  );
  let hypotheses = input.graph.hypotheses.map((hypothesis) => {
    const stillRequired = hypothesis.requiredEvidence.filter(
      (evidence) => !evidenceReferencesGap(evidence, gap),
    );
    if (stillRequired.length === hypothesis.requiredEvidence.length) {
      return hypothesis;
    }
    const confidence = Math.min(1, hypothesis.confidence + 0.15);
    updates.push({
      kind: "hypothesis_changed",
      ref: hypothesis.id,
      summary: `Gap ${gap.id} closed; ${hypothesis.id} confidence ${confidence.toFixed(2)}.`,
    });
    return { ...hypothesis, requiredEvidence: stillRequired, confidence };
  });
  let riskPosture = input.graph.riskPosture;
  if (gap.id === "g3" && input.graph.riskPosture === "blocked") {
    riskPosture = advancePosture(input.graph.domain);
    updates.push({
      kind: "posture_advanced",
      ref: "riskPosture",
      summary: `Authorization gap g3 closed; posture ${input.graph.riskPosture} -> ${riskPosture}.`,
    });
    hypotheses = reopenActiveStagesForPosture(hypotheses);
  }
  updates.unshift({
    kind: "gap_closed",
    ref: gap.id,
    summary: `Evidence gap ${gap.id} closed via ${input.evidence.source}.`,
  });
  const graph: StrategyGraph = {
    ...input.graph,
    evidenceGaps,
    hypotheses,
    riskPosture,
  };
  return { graph, updates: dedupeUpdates(updates) };
}

/**
 * Mark a stage as the current stage. Used by the loop after a stage's
 * candidate tools have produced enough evidence to move on.
 */
export function progressStage(input: {
  graph: StrategyGraph;
  stageId: string;
}): { graph: StrategyGraph; currentStageId: string | undefined; updates: StrategyUpdate[] } {
  const stage = input.graph.stages.find((s) => s.id === input.stageId);
  if (!stage) {
    return { graph: input.graph, currentStageId: undefined, updates: [] };
  }
  return {
    graph: input.graph,
    currentStageId: stage.id,
    updates: [
      {
        kind: "stage_progressed",
        ref: stage.id,
        summary: `Stage advanced to ${stage.title}.`,
      },
    ],
  };
}

/**
 * Heuristically map a tool observation onto the strategy graph. This is the
 * primary entry point called by the agent loop after each tool completes:
 *
 * - Domain-specific tools (web.*, security.ir.*, security.pcap.*, ctf.*) bump
 *   the leading domain hypothesis and close the domain evidence gap (g4).
 * - `evidence.write` / `evidence.save` / `report.*` close the report-stage
 *   gap and confirm the leading hypothesis.
 * - Read-only context tools (workspace.*) close the scope/context gap (g1).
 * - Any finding containing an explicit indicator (flag, IOC, CVE, hash)
 *   strengthens the leading hypothesis more aggressively.
 *
 * The mapping is intentionally conservative: a single observation never
 * fully resolves a hypothesis, and idempotent (re-applying the same
 * observation produces no further updates).
 */
export function applyObservationToStrategy(input: {
  graph: StrategyGraph;
  observation: StrategyObservation;
}): StrategyUpdateResult {
  const { observation } = input;
  let result: StrategyUpdateResult = { graph: input.graph, updates: [] };
  const domainGap = findGapByPriority(input.graph, "g4");
  const contextGap = findGapByPriority(input.graph, "g1");
  const evidenceGap = findGapByPriority(input.graph, "g2");
  const leadingHypothesis = findLeadingHypothesis(input.graph);

  if (isContextTool(observation.tool) && contextGap) {
    result = mergeResults(
      result,
      closeEvidenceGap({
        graph: result.graph,
        gapId: contextGap.id,
        evidence: evidenceFromObservation(observation),
      }),
    );
  }

  if (isDomainTool(observation.tool, input.graph.domain) && domainGap) {
    result = mergeResults(
      result,
      closeEvidenceGap({
        graph: result.graph,
        gapId: domainGap.id,
        evidence: evidenceFromObservation(observation),
      }),
    );
  }

  if (isEvidenceOrReportTool(observation.tool) && evidenceGap) {
    result = mergeResults(
      result,
      closeEvidenceGap({
        graph: result.graph,
        gapId: evidenceGap.id,
        evidence: evidenceFromObservation(observation),
      }),
    );
  }

  // Any observation with substantive findings nudges the leading hypothesis
  // toward "supported" once, but never beyond a sane cap, and never twice for
  // the same tool. This keeps the confidence signal monotonic and idempotent.
  if (leadingHypothesis && hasSubstantiveFindings(observation)) {
    const current = result.graph.hypotheses.find((h) => h.id === leadingHypothesis.id);
    if (current && current.confidence < 0.8 && !observationAlreadyApplied(current, observation)) {
      const confidence = Math.min(0.8, current.confidence + confidenceBump(observation));
      result = mergeResults(
        result,
        updateHypothesis({
          graph: result.graph,
          hypothesisId: current.id,
          patch: { confidence },
        }),
      );
      result = markObservationApplied(result, current.id, observation);
    }
  }

  return result;
}

function mergeHypothesis(
  hypothesis: StrategyHypothesis,
  patch: StrategyHypothesisPatch,
): StrategyHypothesis {
  const confidence =
    patch.confidence === undefined
      ? hypothesis.confidence
      : Math.max(0, Math.min(1, patch.confidence));
  return {
    id: hypothesis.id,
    title: hypothesis.title,
    status: patch.status ?? hypothesis.status,
    confidence,
    requiredEvidence: patch.requiredEvidence ?? hypothesis.requiredEvidence,
  };
}

function appendEvidence(verification: string, evidence: string): string {
  const tag = "[closed]";
  if (verification.startsWith(tag)) {
    return verification;
  }
  return `${tag} ${verification} :: ${evidence}`;
}

function evidenceReferencesGap(evidence: string, gap: StrategyEvidenceGap): boolean {
  const lower = evidence.toLowerCase();
  return (
    lower.includes(gap.id.toLowerCase()) ||
    (gap.id === "g1" && (lower.includes("scope") || lower.includes("context"))) ||
    (gap.id === "g2" && (lower.includes("artifact") || lower.includes("evidence"))) ||
    (gap.id === "g3" && (lower.includes("author") || lower.includes("scope"))) ||
    (gap.id === "g4" && (lower.includes("domain") || lower.includes("check")))
  );
}

function advancePosture(_domain: StrategyDomain): StrategyRiskPosture {
  // Closing the authorization gap means the user supplied a SecurityScope,
  // so the posture is no longer blocked. The exact target posture depends on
  // the scope's risk level, which is enforced separately by the
  // SecurityScope gate in tool-executor. Here we conservatively pick
  // network_active, the highest non-blocked posture.
  return "network_active";
}

function reopenActiveStagesForPosture(
  hypotheses: StrategyHypothesis[],
): StrategyHypothesis[] {
  return hypotheses.map((hypothesis) =>
    hypothesis.id === "h2"
      ? { ...hypothesis, status: "rejected", confidence: Math.max(0.1, hypothesis.confidence - 0.5) }
      : hypothesis,
  );
}

function findGapByPriority(graph: StrategyGraph, gapId: string): StrategyEvidenceGap | undefined {
  return graph.evidenceGaps.find((g) => g.id === gapId);
}

function findLeadingHypothesis(graph: StrategyGraph): StrategyHypothesis | undefined {
  return graph.hypotheses.find((h) => h.id === "h3") ?? graph.hypotheses[0];
}

function isContextTool(tool: string): boolean {
  return tool.startsWith("workspace.");
}

function isDomainTool(tool: string, domain: StrategyDomain): boolean {
  if (domain === "web_pentest" || domain === "vulnerability_research") {
    return /^(web|local_fixture|security\.web|security\.vuln)\./u.test(tool);
  }
  if (domain === "incident_response") {
    return /^(security\.ir|ctf|workspace)\./u.test(tool);
  }
  if (domain === "pcap_forensics") {
    return /^(security\.pcap|ctf\.pcap)\./u.test(tool);
  }
  if (domain === "reverse_engineering") {
    return /^(security\.reverse|security\.file|ctf)\./u.test(tool);
  }
  if (domain === "code_audit") {
    return /^(security\.vuln|security|workspace|check)\./u.test(tool);
  }
  return tool.startsWith("workspace.") || tool.startsWith("security.");
}

function isEvidenceOrReportTool(tool: string): boolean {
  return /^(evidence|report|security\.report)\./u.test(tool);
}

function hasSubstantiveFindings(observation: StrategyObservation): boolean {
  return observation.findings.some((finding) => finding.trim().length > 0);
}

function confidenceBump(observation: StrategyObservation): number {
  const indicator = /\b(flag|IOC|CVE-\d{4}-\d+|[0-9a-f]{32,64}|漏[洞洞点]|凭[证据]|backdoor|webshell)\b/iu.test(
    observation.findings.join(" "),
  );
  return indicator ? 0.2 : 0.1;
}

function observationAlreadyApplied(
  hypothesis: StrategyHypothesis,
  observation: StrategyObservation,
): boolean {
  // We stash applied-tool fingerprints inside requiredEvidence using a
  // sentinel prefix that is stripped before display by summarizeStrategyGraph.
  return hypothesis.requiredEvidence.some((evidence) =>
    evidence.startsWith(appliedToolSentinel(observation.tool)),
  );
}

function markObservationApplied(
  result: StrategyUpdateResult,
  hypothesisId: string,
  observation: StrategyObservation,
): StrategyUpdateResult {
  const hypotheses = result.graph.hypotheses.map((hypothesis) => {
    if (hypothesis.id !== hypothesisId) {
      return hypothesis;
    }
    const sentinel = appliedToolSentinel(observation.tool);
    if (hypothesis.requiredEvidence.some((evidence) => evidence.startsWith(sentinel))) {
      return hypothesis;
    }
    return {
      ...hypothesis,
      requiredEvidence: [...hypothesis.requiredEvidence, `${sentinel} ${observation.findings.length} finding(s)`],
    };
  });
  return { graph: { ...result.graph, hypotheses }, updates: result.updates };
}

function appliedToolSentinel(tool: string): string {
  return `__applied:${tool}`;
}

function evidenceFromObservation(observation: StrategyObservation): {
  summary: string;
  source: string;
} {
  const first = observation.findings[0]?.trim();
  return {
    summary: first ?? `${observation.tool} produced evidence.`,
    source: observation.tool,
  };
}

function mergeResults(a: StrategyUpdateResult, b: StrategyUpdateResult): StrategyUpdateResult {
  return { graph: b.graph, updates: dedupeUpdates([...a.updates, ...b.updates]) };
}

function dedupeUpdates(updates: StrategyUpdateResult["updates"]): StrategyUpdateResult["updates"] {
  const seen = new Set<string>();
  const result: StrategyUpdateResult["updates"] = [];
  for (const update of updates) {
    const key = `${update.kind}:${update.ref}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(update);
  }
  return result;
}
