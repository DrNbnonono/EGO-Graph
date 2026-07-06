import { z } from "zod";
import type { ToolDefinition } from "../../tool-definition.js";

/**
 * Defensive reporting tool adapter (security.report.*). Produces a structured
 * vulnerability-draft record from evidence lines that downstream report/evidence
 * packages can render. Read-only and offline; no network, no sandbox.
 */

const reportInput = z.object({
  title: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  evidence: z.array(z.string()),
  recommendation: z.string().optional(),
});
const reportOutput = z.object({
  findings: z.array(z.string()),
  draft: z.record(z.unknown()),
});

export function createReportSecurityToolRegistry(): {
  tools: ToolDefinition<typeof reportInput, typeof reportOutput>[];
} {
  const draft: ToolDefinition<typeof reportInput, typeof reportOutput> = {
    name: "security.report.vulnerability_draft",
    description: "Draft a defensive vulnerability report from collected evidence.",
    inputSchema: reportInput,
    outputSchema: reportOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "report",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 15_000,
    evidenceMapper(output) {
      const draft = output.draft as { title?: string; severity?: string };
      return [
        {
          summary: `${draft.title ?? "Draft"} [${draft.severity ?? "unknown"}]`,
          kind: "decision_trace" as const,
          confidence: 0.7,
          raw: output.draft,
        },
      ];
    },
    async execute(input) {
      const title = input.title ?? input.evidence[0] ?? "Security finding";
      const severity = input.severity ?? inferSeverity(input.evidence);
      return {
        findings: [`Draft vulnerability report: ${title} [${severity}].`],
        draft: {
          title,
          severity,
          evidence: input.evidence,
          recommendation:
            input.recommendation ??
            "Validate authorization, reproduce on the owned fixture, and document remediation with a regression test.",
        },
      };
    },
  };
  return { tools: [draft] };
}

function inferSeverity(evidence: string[]): "low" | "medium" | "high" | "critical" {
  const text = evidence.join(" ");
  if (/rce|critical|credential|admin|unauthorized|reverse shell/iu.test(text)) {
    return "critical";
  }
  if (/xss|csrf|sqli|sql injection|leak|exposed/iu.test(text)) {
    return "high";
  }
  if(/open redirect|misconfig|verbose|deprecated/iu.test(text)) {
    return "medium";
  }
  return "low";
}
