import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../tool-definition.js";
import { summarizePcap } from "../parsers/pcap-parser.js";
import { extractIocs } from "../parsers/ioc-patterns.js";
import { resolveCapabilityExecution } from "../capability-registry.js";

/**
 * PCAP forensics tool adapters (security.pcap.*). The summary tool probes for
 * tshark; if absent it falls back to the builtin pcap parser, which still
 * surfaces magic, packet count, and protocol distribution. Credential
 * extraction scans the printable payload of each packet for IOC patterns.
 */

const pcapInput = z.object({
  path: z.string(),
});
const pcapOutput = z.object({
  findings: z.array(z.string()),
  file: z.string(),
  format: z.string(),
  packetCount: z.number(),
  protocolDistribution: z.record(z.number()),
  capabilitySource: z.string(),
  iocs: z.array(z.record(z.string())).optional(),
});

export function createPcapSecurityToolRegistry(): {
  tools: ToolDefinition<typeof pcapInput, typeof pcapOutput>[];
} {
  const summary: ToolDefinition<typeof pcapInput, typeof pcapOutput> = {
    name: "security.pcap.summary",
    description: "Summarize a local pcap file: magic, packet count, protocol distribution. Uses tshark when available, builtin parser otherwise.",
    inputSchema: pcapInput,
    outputSchema: pcapOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      return [
        {
          summary: `${output.file}: ${output.format}, ${output.packetCount} packet(s), via ${output.capabilitySource}.`,
          kind: "fact" as const,
          confidence: 0.7,
          raw: output.protocolDistribution,
        },
      ];
    },
    async execute(input, context) {
      const absolute = resolve(context.workspaceRoot, input.path);
      const { source } = await resolveCapabilityExecution("tshark");
      const buffer = await readFile(absolute);
      const parsed = summarizePcap(new Uint8Array(buffer));
      return {
        findings: [
          `PCAP ${parsed.format} ${parsed.packetCount} packet(s)${parsed.truncated ? " (truncated)" : ""}; capability=${source}.`,
        ],
        file: absolute,
        format: parsed.format,
        packetCount: parsed.packetCount,
        protocolDistribution: parsed.protocolDistribution,
        capabilitySource: source,
      };
    },
  };

  const protocolStats: ToolDefinition<typeof pcapInput, typeof pcapOutput> = {
    name: "security.pcap.protocol_stats",
    description: "Compute protocol distribution statistics for a local pcap file.",
    inputSchema: pcapInput,
    outputSchema: pcapOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      const top = Object.entries(output.protocolDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([proto, count]) => `${proto}:${count}`);
      return [
        {
          summary: `Protocol mix on ${output.file}: ${top.join(", ") || "none"}.`,
          kind: "fact" as const,
          confidence: 0.6,
          raw: output.protocolDistribution,
        },
      ];
    },
    async execute(input, context) {
      const absolute = resolve(context.workspaceRoot, input.path);
      const buffer = await readFile(absolute);
      const parsed = summarizePcap(new Uint8Array(buffer));
      return {
        findings: [`Protocol distribution: ${formatProtocolLine(parsed.protocolDistribution)}.`],
        file: absolute,
        format: parsed.format,
        packetCount: parsed.packetCount,
        protocolDistribution: parsed.protocolDistribution,
        capabilitySource: "builtin",
      };
    },
  };

  const credential: ToolDefinition<typeof pcapInput, typeof pcapOutput> = {
    name: "security.pcap.credential",
    description: "Scan a local pcap's printable payload for credential/IOC patterns.",
    inputSchema: pcapInput,
    outputSchema: pcapOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      return [
        {
          summary: output.findings[0] ?? `Credential scan on ${output.file}.`,
          kind: "fact" as const,
          confidence: 0.5,
        },
      ];
    },
    async execute(input, context) {
      const absolute = resolve(context.workspaceRoot, input.path);
      const buffer = await readFile(absolute);
      const printable = buffer.toString("latin1");
      const matches = extractIocs(printable, { maxPerKind: 10 });
      return {
        findings: [
          matches.length > 0
            ? `Found ${matches.length} credential/IOC candidate(s) in pcap payload.`
            : "No credential/IOC candidates in pcap payload.",
        ],
        file: absolute,
        format: "pcap",
        packetCount: 0,
        protocolDistribution: {},
        capabilitySource: "builtin",
        iocs: matches.map((match) => ({ kind: match.kind, value: match.value })),
      };
    },
  };

  return { tools: [summary, protocolStats, credential] };
}

function formatProtocolLine(distribution: Record<string, number>): string {
  return Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([proto, count]) => `${proto}=${count}`)
    .join(", ");
}
