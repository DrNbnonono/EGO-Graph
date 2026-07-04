export type ReportEvidence = {
  summary: string;
  source: string;
};

export type ReportDecision = {
  step: number;
  type: string;
  rationale: string;
  toolName?: string;
};

export type ReportObservation = {
  toolName: string;
  findings: string[];
};

export type ReportPolicyDecision = {
  step: number;
  toolName: string;
  allowed: boolean;
  reason: string;
};

export type ReportInput = {
  runId: string;
  scenario: string;
  goal: string;
  status: "complete" | "blocked";
  scope?: string[];
  evidence: ReportEvidence[];
  decisions?: ReportDecision[];
  observations?: ReportObservation[];
  policyDecisions?: ReportPolicyDecision[];
};

export function renderMarkdownReport(input: ReportInput): string {
  const evidenceLines = input.evidence
    .map((item, index) => `${index + 1}. ${item.summary} (source: ${item.source})`)
    .join("\n");
  const scopeLines = (input.scope ?? []).map((target) => `- ${target}`).join("\n");
  const decisionLines = (input.decisions ?? [])
    .map((decision) => {
      const tool = decision.toolName ? ` using ${decision.toolName}` : "";
      return `${decision.step}. ${decision.type}${tool}: ${decision.rationale}`;
    })
    .join("\n");
  const observationLines = (input.observations ?? [])
    .map((observation, index) => {
      const findings = observation.findings.length > 0 ? observation.findings.join("; ") : "none";
      return `${index + 1}. ${observation.toolName}: ${findings}`;
    })
    .join("\n");
  const reproductionLines = (input.decisions ?? [])
    .filter((decision) => decision.toolName)
    .map((decision, index) => `${index + 1}. Run ${decision.toolName} for the authorized target.`)
    .join("\n");
  const policyLines = (input.policyDecisions ?? [])
    .map((decision) => {
      const status = decision.allowed ? "allowed" : "blocked";
      return `${decision.step}. ${decision.toolName}: ${status} - ${decision.reason}`;
    })
    .join("\n");

  return [
    "# EGO-Graph Report",
    "",
    "## Summary",
    "",
    `- Run ID: ${input.runId}`,
    `- Scenario: ${input.scenario}`,
    `- Goal: ${input.goal}`,
    `- Status: ${input.status}`,
    "",
    "## Scope",
    "",
    scopeLines || "No explicit scope was recorded.",
    "",
    "## Policy Decisions",
    "",
    policyLines || "No policy decisions were recorded.",
    "",
    "## Findings",
    "",
    evidenceLines || "No evidence was collected.",
    "",
    "## Evidence",
    "",
    evidenceLines || "No evidence was collected.",
    "",
    "## Decision Trace",
    "",
    decisionLines || "No planner decisions were recorded.",
    "",
    "## Observations",
    "",
    observationLines || "No observations were recorded.",
    "",
    "## Reproduction",
    "",
    reproductionLines || "No tool-backed reproduction steps were recorded.",
    "",
    "## Limitations",
    "",
    "This report was generated from an authorized controlled scenario fixture.",
    "",
  ].join("\n");
}
