import type { ToolDefinition } from "../tool-definition.js";
import { ZodTypeAny } from "zod";
import { ToolRegistry } from "../tool-registry.js";
import {
  clearCapabilityCache,
  createBinaryCapabilityDetector,
  createBuiltinOnlyCapability,
  detectAllCapabilities,
  registerCapabilityDetector,
  summarizeCapabilityStatus,
  renderCapabilityStatusLine,
  type CapabilityDetector,
  type CapabilitySummary,
  type ToolCapability,
} from "./capability-registry.js";
import { createWebSecurityToolRegistry } from "./web/index.js";
import { createIrSecurityToolRegistry } from "./ir/index.js";
import { createPcapSecurityToolRegistry } from "./pcap/index.js";
import { createReverseSecurityToolRegistry } from "./reverse/index.js";
import { createVulnSecurityToolRegistry } from "./vuln/index.js";
import { createReportSecurityToolRegistry } from "./report/index.js";

export type {
  CapabilityDetector,
  CapabilitySource,
  CapabilitySummary,
  ToolCapability,
} from "./capability-registry.js";

/**
 * Combined security tool suite.
 *
 * Composes every domain registry (web, ir, pcap, reverse, vuln, report) into a
 * single {@link ToolRegistry} and registers the builtin capability detectors
 * (tshark/file/binwalk/strings/semgrep/ghidra/cve-feed) so tool adapters can
 * probe the host once and decide external-vs-builtin execution.
 *
 * Extensibility contract: MCP/plugin tool packs call
 * {@link registerCapabilityDetector} and push additional
 * {@link ToolDefinition}s into the returned registry at runtime — no edits to
 * this package required.
 */

let builtinDetectorsRegistered = false;

/**
 * Register the default builtin capability detectors (tshark, file, binwalk,
 * semgrep, strings, ghidra headless, offline cve-feed). Idempotent and safe
 * to call multiple times. Plugins may register additional detectors via the
 * exported {@link registerCapabilityDetector}.
 */
export function registerBuiltinSecurityDetectors(): void {
  if (builtinDetectorsRegistered) {
    return;
  }
  builtinDetectorsRegistered = true;
  const detectors: CapabilityDetector[] = [
    createBinaryCapabilityDetector({
      name: "tshark",
      label: "tshark (pcap dissection)",
      binary: "tshark",
      versionArgs: ["--version"],
      versionPattern: /^T-Shirt|tshark\s+\S+/i,
      builtinFallback: true,
    }),
    createBinaryCapabilityDetector({
      name: "file",
      label: "file (magic identification)",
      binary: "file",
      versionArgs: ["--version"],
      builtinFallback: true,
    }),
    createBinaryCapabilityDetector({
      name: "binwalk",
      label: "binwalk (firmware analysis)",
      binary: "binwalk",
      versionArgs: ["--help"],
      builtinFallback: true,
    }),
    createBinaryCapabilityDetector({
      name: "semgrep",
      label: "semgrep (SAST)",
      binary: "semgrep",
      versionArgs: ["--version"],
      builtinFallback: true,
    }),
    createBuiltinOnlyCapability({ name: "strings", label: "strings (builtin)" }),
    createBuiltinOnlyCapability({ name: "ghidra", label: "ghidra headless (unavailable)" }),
    createBuiltinOnlyCapability({ name: "cve-feed", label: "offline CVE fixture feed" }),
  ];
  for (const detector of detectors) {
    registerCapabilityDetector(detector);
  }
}

/**
 * Build a security-tool registry containing every domain's tools. Caller is
 * expected to merge this into the terminal-agent tool registry.
 */
export function createSecurityToolRegistry(): ToolRegistry {
  registerBuiltinSecurityDetectors();
  const registry = new ToolRegistry();
  const domains = [
    createWebSecurityToolRegistry().tools,
    createIrSecurityToolRegistry().tools,
    createPcapSecurityToolRegistry().tools,
    createReverseSecurityToolRegistry().tools,
    createVulnSecurityToolRegistry().tools,
    createReportSecurityToolRegistry().tools,
  ];
  for (const tools of domains) {
    for (const tool of tools) {
      registry.register(tool as ToolDefinition<ZodTypeAny, ZodTypeAny>);
    }
  }
  return registry;
}

/**
 * Convenience: list every domain tool definition (without a registry), useful
 * for manifests and capability reports.
 */
export function listSecurityTools(): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
  registerBuiltinSecurityDetectors();
  return [
    ...createWebSecurityToolRegistry().tools,
    ...createIrSecurityToolRegistry().tools,
    ...createPcapSecurityToolRegistry().tools,
    ...createReverseSecurityToolRegistry().tools,
    ...createVulnSecurityToolRegistry().tools,
    ...createReportSecurityToolRegistry().tools,
  ] as ToolDefinition<ZodTypeAny, ZodTypeAny>[];
}

/**
 * Detect all registered security capabilities and return a snapshot. The
 * agent loop emits this as a `tool.capability.report` event so the TUI/Web
 * can render a one-line status footer.
 */
export async function detectSecurityCapabilities(): Promise<ToolCapability[]> {
  registerBuiltinSecurityDetectors();
  return detectAllCapabilities();
}

/**
 * One-line status summary for the UI, e.g. "7 tool(s) | 2 external | 4 builtin | 1 unavailable".
 */
export async function renderSecurityCapabilityStatus(): Promise<{
  capabilities: ToolCapability[];
  summary: CapabilitySummary;
  line: string;
}> {
  const capabilities = await detectSecurityCapabilities();
  const summary = summarizeCapabilityStatus(capabilities);
  return { capabilities, summary, line: renderCapabilityStatusLine(summary) };
}

export { clearCapabilityCache, summarizeCapabilityStatus } from "./capability-registry.js";
export {
  registerCapabilityDetector,
  unregisterCapabilityDetector,
  detectCapability,
  detectAllCapabilities,
} from "./capability-registry.js";
export type { EgressPolicy } from "./sandbox/boundary.js";
export { enforceEgressAllowlist, redactSecrets, DEFAULT_EGRESS_POLICY } from "./sandbox/boundary.js";
export type { ParsedLogRecord } from "./parsers/log-parser.js";
export { parseLogEntries, buildIncidentTimeline, detectAnomalies } from "./parsers/log-parser.js";
export { summarizePcap } from "./parsers/pcap-parser.js";
export { identifyBinary } from "./parsers/elf-pe-parser.js";
export { extractIocs, summarizeIocs } from "./parsers/ioc-patterns.js";
