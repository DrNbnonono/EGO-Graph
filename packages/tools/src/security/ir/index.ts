import { z } from "zod";
import type { ToolDefinition } from "../../tool-definition.js";
import {
  buildIncidentTimeline,
  detectAnomalies,
  parseLogEntries,
} from "../parsers/log-parser.js";
import { extractIocs, summarizeIocs } from "../parsers/ioc-patterns.js";

/**
 * Incident-response tool adapters (security.ir.*). All operate on local log
 * text (no network), so they are read-only and fixture-friendly for CI.
 */

const logInput = z.object({
  content: z.string(),
  maxLines: z.number().int().min(1).max(5_000).optional(),
});
const irOutput = z.object({
  findings: z.array(z.string()),
  recordCount: z.number(),
  anomalies: z.number(),
  timeline: z.array(z.record(z.string())).optional(),
  iocSummary: z.record(z.number()).optional(),
});

function irTool(
  name: string,
  description: string,
  run: (content: string, maxLines: number) => z.infer<typeof irOutput>,
): ToolDefinition<typeof logInput, typeof irOutput> {
  return {
    name,
    description,
    inputSchema: logInput,
    outputSchema: irOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: name,
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      return output.findings.map((finding) => ({
        summary: finding,
        kind: "fact" as const,
        confidence: 0.7,
      }));
    },
    async execute(input) {
      return run(input.content, input.maxLines ?? 500);
    },
  };
}

export function createIrSecurityToolRegistry(): {
  tools: ToolDefinition<typeof logInput, typeof irOutput>[];
} {
  const logParse = irTool(
    "security.ir.log_parse",
    "Parse incident-response logs into structured records with timestamps and levels.",
    (content, maxLines) => {
      const records = parseLogEntries(content, { maxLines });
      const errors = records.filter((record) => record.level === "error" || record.level === "critical").length;
      return {
        findings: [
          `Parsed ${records.length} log record(s); ${errors} error/critical level.`,
        ],
        recordCount: records.length,
        anomalies: 0,
      };
    },
  );
  const timeline = irTool(
    "security.ir.timeline",
    "Build an ordered incident timeline from parseable log timestamps.",
    (content, maxLines) => {
      const records = parseLogEntries(content, { maxLines });
      const built = buildIncidentTimeline(records);
      return {
        findings: [`Timeline built with ${built.length} timestamped event(s).`],
        recordCount: records.length,
        anomalies: 0,
        timeline: built.map((event) => ({
          ...(event.timestamp ? { timestamp: event.timestamp } : {}),
          ...(event.host ? { host: event.host } : {}),
          level: event.level,
          summary: event.summary,
        })),
      };
    },
  );
  const ioc = irTool(
    "security.ir.ioc_extract",
    "Extract IP/domain/hash/CVE/email IOC candidates from log text.",
    (content) => {
      const matches = extractIocs(content);
      const summary = summarizeIocs(matches);
      const topKinds = Object.entries(summary)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kind, count]) => `${kind}:${count}`);
      return {
        findings: [
          matches.length > 0
            ? `Extracted ${matches.length} IOC(s): ${topKinds.join(", ")}.`
            : "No IOC candidates found in provided text.",
        ],
        recordCount: matches.length,
        anomalies: 0,
        iocSummary: summary,
      };
    },
  );
  const anomaly = irTool(
    "security.ir.anomaly",
    "Flag authentication failures, privilege escalation, and brute-force candidates.",
    (content, maxLines) => {
      const records = parseLogEntries(content, { maxLines });
      const anomalies = detectAnomalies(records);
      return {
        findings: [
          anomalies.length > 0
            ? `Detected ${anomalies.length} anomalous record(s).`
            : "No anomalies detected with current heuristics.",
        ],
        recordCount: records.length,
        anomalies: anomalies.length,
      };
    },
  );
  return { tools: [logParse, timeline, ioc, anomaly] };
}
