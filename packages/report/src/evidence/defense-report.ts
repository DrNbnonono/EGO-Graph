import type { ReproBundle } from "./repro-bundle.js";

/**
 * Defense report: a Markdown rendering of a {@link ReproBundle} suitable for
 * the contest's offline defense (40% of finals scoring). Every section cites
 * tool names, timestamps, evidence node ids, and approval records so a
 * reviewer can audit any claim against the run transcript.
 */

export type DefenseReportMetadata = {
  scenario?: string;
  author?: string;
  model?: string;
};

export type RenderDefenseReportInput = {
  bundle: ReproBundle;
  metadata?: DefenseReportMetadata;
};

export function renderDefenseReport(input: RenderDefenseReportInput): string {
  const { bundle, metadata } = input;
  const sections: string[] = [];
  sections.push("# EGO-Graph Defense Report");
  sections.push("");
  sections.push("## Executive Summary");
  sections.push("");
  sections.push(`- **Run ID**: ${bundle.runId}`);
  sections.push(`- **Goal**: ${bundle.goal}`);
  sections.push(`- **Status**: ${bundle.status}`);
  sections.push(`- **Generated**: ${bundle.generatedAt}`);
  if (metadata?.scenario) {
    sections.push(`- **Scenario**: ${metadata.scenario}`);
  }
  if (metadata?.author) {
    sections.push(`- **Author**: ${metadata.author}`);
  }
  if (metadata?.model) {
    sections.push(`- **Model**: ${metadata.model}`);
  }
  sections.push(`- **Tool invocations**: ${bundle.toolInvocations.length}`);
  sections.push(`- **Evidence nodes**: ${bundle.evidenceGraph.nodes.length}`);
  sections.push(`- **Residual risks**: ${bundle.residualRisks.length}`);
  sections.push("");

  sections.push("## Scope and Authorization");
  sections.push("");
  if (bundle.scope.length > 0) {
    for (const item of bundle.scope) {
      sections.push(`- ${item}`);
    }
  } else {
    sections.push("No explicit scope assumptions were recorded.");
  }
  sections.push("");

  sections.push("## Tool Invocations");
  sections.push("");
  if (bundle.toolInvocations.length === 0) {
    sections.push("No tool invocations were recorded.");
  } else {
    for (const invocation of bundle.toolInvocations) {
      const capability = invocation.capabilitySource ? ` (capability: ${invocation.capabilitySource})` : "";
      const status = invocation.status ? ` — ${invocation.status}` : "";
      sections.push(
        `${invocation.step}. **${invocation.tool}**${capability}${status}`,
      );
      if (invocation.outputPreview) {
        sections.push(`   - Output: ${invocation.outputPreview}`);
      }
    }
  }
  sections.push("");

  sections.push("## Evidence Graph");
  sections.push("");
  if (bundle.evidenceGraph.nodes.length === 0) {
    sections.push("No evidence nodes were recorded.");
  } else {
    sections.push("### Nodes");
    sections.push("");
    for (const node of bundle.evidenceGraph.nodes) {
      const confidence = typeof node.confidence === "number" ? ` (confidence ${node.confidence.toFixed(2)})` : "";
      const source = node.source ? ` via ${node.source}` : "";
      const createdAt = node.createdAt ? ` @ ${node.createdAt}` : "";
      sections.push(`- \`${node.id}\` [${node.kind}]${confidence}${source}${createdAt}: ${node.summary}`);
    }
    sections.push("");
    if (bundle.evidenceGraph.edges.length > 0) {
      sections.push("### Edges");
      sections.push("");
      for (const edge of bundle.evidenceGraph.edges) {
        sections.push(`- \`${edge.from}\` --${edge.relation}--> \`${edge.to}\``);
      }
    }
  }
  sections.push("");

  sections.push("## Decision Trace");
  sections.push("");
  if (bundle.decisionTrace.length === 0) {
    sections.push("No planner decisions were recorded.");
  } else {
    for (const step of bundle.decisionTrace) {
      const tool = step.toolName ? ` using ${step.toolName}` : "";
      sections.push(`${step.step}. [${step.type}] ${step.action}${tool}: ${step.rationale}`);
      if (step.evidenceRefs.length > 0) {
        sections.push(`   - Evidence: ${step.evidenceRefs.join("; ")}`);
      }
      if (step.strategyUpdateRefs.length > 0) {
        sections.push(`   - Strategy updates: ${step.strategyUpdateRefs.join(", ")}`);
      }
    }
  }
  sections.push("");

  sections.push("## Approval History");
  sections.push("");
  if (bundle.approvals.length === 0) {
    sections.push("No permission decisions were recorded.");
  } else {
    for (const approval of bundle.approvals) {
      const source = approval.source ? ` (${approval.source})` : "";
      const createdAt = approval.createdAt ? ` @ ${approval.createdAt}` : "";
      sections.push(
        `- ${approval.effect.toUpperCase()} ${approval.action} on ${approval.resources.join(", ") || "*"}${source}${createdAt}`,
      );
    }
  }
  sections.push("");

  sections.push("## Residual Risks");
  sections.push("");
  if (bundle.residualRisks.length === 0) {
    sections.push("No residual risks were identified.");
  } else {
    for (const risk of bundle.residualRisks) {
      sections.push(`- **[${risk.severity.toUpperCase()}]** ${risk.description}`);
      if (risk.missingEvidence.length > 0) {
        sections.push(`   - Missing evidence: ${risk.missingEvidence.join(", ")}`);
      }
    }
  }
  sections.push("");

  sections.push("## Reproduction");
  sections.push("");
  sections.push("This report was generated from a serialized ReproBundle. To reproduce:");
  sections.push("");
  sections.push("1. Load the run transcript from `.ego/trajectories/<runId>.jsonl`.");
  sections.push("2. Replay with `ego replay <runId>` or rebuild the bundle via `buildReproBundleFromEvents`.");
  sections.push("3. Each tool invocation above lists its capability source (external/builtin) for environment parity.");
  sections.push("");

  return sections.join("\n");
}
