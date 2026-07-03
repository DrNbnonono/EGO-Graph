export type ReportEvidence = {
  summary: string;
  source: string;
};

export type ReportInput = {
  runId: string;
  scenario: string;
  goal: string;
  status: "complete" | "blocked";
  evidence: ReportEvidence[];
};

export function renderMarkdownReport(input: ReportInput): string {
  const evidenceLines = input.evidence
    .map((item, index) => `${index + 1}. ${item.summary} (source: ${item.source})`)
    .join("\n");

  return [
    "# EGO-Graph Report",
    "",
    `- Run ID: ${input.runId}`,
    `- Scenario: ${input.scenario}`,
    `- Goal: ${input.goal}`,
    `- Status: ${input.status}`,
    "",
    "## Findings",
    "",
    evidenceLines || "No evidence was collected.",
    "",
    "## Limitations",
    "",
    "This report was generated from an authorized controlled scenario fixture.",
    "",
  ].join("\n");
}
