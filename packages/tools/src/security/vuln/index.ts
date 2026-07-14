import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../tool-definition.js";
import { resolveCapabilityExecution } from "../capability-registry.js";
import { extractIocs } from "../parsers/ioc-patterns.js";
import { builtinReceipt, executeExternalBinary } from "../runtime-adapter.js";

/**
 * Vulnerability-research tool adapters (security.vuln.*).
 *
 * manifest_audit parses package.json/lockfiles for known-risky dependency
 * patterns. cve_lookup is fixture-based (offline CVE name/index lookup against
 * a small embedded advisory snippet set, swappable for a real feed later).
 * semgrep probes the external binary; on miss it degrades to a heuristic
 * regex scan so CI can still produce findings.
 */

const manifestInput = z.object({ manifestPath: z.string() });
const manifestOutput = z.object({
  findings: z.array(z.string()),
  manifest: z.string(),
  packageCount: z.number(),
  riskyPackages: z.array(z.string()),
});

const RISKY_PACKAGE_PATTERNS: Array<{ name: RegExp; reason: string }> = [
  { name: /^lodash$/iu, reason: "prototype pollution history (<4.17.21)" },
  { name: /^minimist$/iu, reason: "prototype pollution history (<1.2.6)" },
  { name: /^co$/iu, reason: "prototype pollution history (<4.6.0)" },
  { name: /^debug$/iu, reason: "RCE history (<2.6.9 / <3.1.0)" },
  { name: /^ws$/iu, reason: "DoS history (<6.0.0)" },
  { name: /^express$/iu, reason: "review redirect/qs handling" },
];

export function createVulnSecurityToolRegistry(): {
  tools: Array<ToolDefinition<typeof manifestInput, typeof manifestOutput>>;
} {
  const manifestAudit: ToolDefinition<typeof manifestInput, typeof manifestOutput> = {
    name: "security.vuln.manifest_audit",
    description: "Audit a package manifest (package.json/requirements.txt) for known-risky dependencies.",
    inputSchema: manifestInput,
    outputSchema: manifestOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      return output.riskyPackages.map((pkg) => ({
        summary: `Risky dependency: ${pkg}`,
        kind: "fact" as const,
        confidence: 0.6,
        raw: { manifest: output.manifest },
      }));
    },
    async execute(input, context) {
      const absolute = resolve(context.workspaceRoot, input.manifestPath);
      const content = await readFile(absolute, "utf8");
      const packages = extractPackageNames(content);
      const risky = packages.filter((pkg) =>
        RISKY_PACKAGE_PATTERNS.some((pattern) => pattern.name.test(pkg)),
      );
      return {
        findings:
          risky.length > 0
            ? risky.map((pkg) => `Risky dependency: ${pkg}`)
            : [`No known-risky packages in ${packages.length} dependency(ies).`],
        manifest: absolute,
        packageCount: packages.length,
        riskyPackages: risky,
      };
    },
  };

  const cveLookupInput = z.object({ query: z.string() });
  const cveLookupOutput = z.object({
    findings: z.array(z.string()),
    query: z.string(),
    matches: z.array(z.record(z.string())),
    executionReceipt: z.record(z.unknown()).optional(),
    capabilitySource: z.string(),
  });
  const cveLookup: ToolDefinition<typeof cveLookupInput, typeof cveLookupOutput> = {
    name: "security.vuln.cve_lookup",
    description: "Look up CVE candidates from a query string (offline fixture advisory set).",
    inputSchema: cveLookupInput,
    outputSchema: cveLookupOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 15_000,
    evidenceMapper(output) {
      return output.matches.map((match) => ({
        summary: `${match.id ?? "CVE"}: ${match.description ?? "no description"}`,
        kind: "fact" as const,
        confidence: 0.5,
        raw: match,
      }));
    },
    async execute(input) {
      const { source } = await resolveCapabilityExecution("cve-feed");
      const matches = lookupCve(input.query);
      return {
        findings:
          matches.length > 0
            ? matches.map((match) => `${match.id}: ${match.description}`)
            : [`No offline CVE matches for "${input.query}".`],
        query: input.query,
        matches,
        capabilitySource: source,
      };
    },
  };

  const semgrepInput = z.object({ path: z.string() });
  const semgrepOutput = z.object({
    findings: z.array(z.string()),
    path: z.string(),
    matchCount: z.number(),
    capabilitySource: z.string(),
    matches: z.array(z.record(z.string())),
  });
  const semgrep: ToolDefinition<typeof semgrepInput, typeof semgrepOutput> = {
    name: "security.vuln.semgrep",
    description: "Scan a file for risky code patterns. Uses semgrep when available, builtin heuristic otherwise.",
    inputSchema: semgrepInput,
    outputSchema: semgrepOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      return [
        {
          summary: output.findings[0] ?? `semgrep on ${output.path}`,
          kind: "fact" as const,
          confidence: 0.6,
          raw: { matchCount: output.matchCount, source: output.capabilitySource },
        },
      ];
    },
    async execute(input, context) {
      const absolute = resolve(context.workspaceRoot, input.path);
      const { source, capability } = await resolveCapabilityExecution("semgrep");
      if (source === "external") {
        const { result, receipt } = await executeExternalBinary({
          tool: "security.vuln.semgrep",
          capability: "semgrep",
          program: capability?.binaryPath ?? "semgrep",
          args: ["scan", "--json", "--config", "auto", absolute],
          cwd: context.workspaceRoot,
          timeoutMs: 60_000,
          ...(context.signal ? { signal: context.signal } : {}),
          maxOutputBytes: 4_000_000,
          ...(capability?.version ? { version: capability.version } : {}),
          artifactRefs: [absolute],
        });
        if (result.exitCode !== 0 || result.timedOut || result.cancelled) {
          throw new Error(result.stderr.trim() || "semgrep execution failed");
        }
        const parsed = parseSemgrepJson(result.stdout);
        return {
          findings: parsed.length > 0
            ? parsed.map((match) => `${match.rule}: ${match.path}:${match.line}`)
            : ["Semgrep completed with no findings."],
          path: absolute,
          matchCount: parsed.length,
          capabilitySource: "external",
          matches: parsed,
          executionReceipt: receipt,
        };
      }
      const content = await readFile(absolute, "utf8");
      const matches = builtinSemgrep(content);
      return {
        findings:
          matches.length > 0
            ? matches.map((match) => `${match.rule}: ${match.snippet}`)
            : [`No builtin-pattern matches in ${absolute}; capability=${source}.`],
        path: absolute,
        matchCount: matches.length,
        capabilitySource: source,
        matches,
        executionReceipt: builtinReceipt("security.vuln.semgrep", [absolute]),
      };
    },
  };

  return { tools: [manifestAudit, cveLookup as unknown as ToolDefinition<typeof manifestInput, typeof manifestOutput>, semgrep as unknown as ToolDefinition<typeof manifestInput, typeof manifestOutput>] };
}

function parseSemgrepJson(stdout: string): Array<Record<string, string>> {
  const payload = JSON.parse(stdout) as {
    results?: Array<{
      check_id?: string;
      path?: string;
      start?: { line?: number };
      extra?: { message?: string };
    }>;
  };
  return (payload.results ?? []).map((result) => ({
    rule: result.check_id ?? "semgrep",
    path: result.path ?? "unknown",
    line: String(result.start?.line ?? 0),
    message: result.extra?.message ?? "finding",
  }));
}

function extractPackageNames(content: string): string[] {
  const packages = new Set<string>();
  // package.json dependencies block
  const depsMatch = /"dependencies"\s*:\s*\{([^}]*)\}/u.exec(content);
  if (depsMatch) {
    for (const match of depsMatch[1]!.matchAll(/"([^"]+)"\s*:/gu)) {
      if (match[1]) {
        packages.add(match[1]);
      }
    }
  }
  // requirements.txt / pip: name==version per line
  for (const line of content.split(/\r?\n/u)) {
    const m = /^([A-Za-z0-9_.-]+)\s*(?:==|>=|<=|~=)/u.exec(line.trim());
    if (m?.[1]) {
      packages.add(m[1].toLowerCase());
    }
  }
  return [...packages];
}

const CVE_FIXTURES: Array<{ id: string; keywords: string[]; description: string }> = [
  { id: "CVE-2021-23337", keywords: ["lodash", "template"], description: "lodash command injection via template." },
  { id: "CVE-2020-7598", keywords: ["minimist"], description: "minimist prototype pollution." },
  { id: "CVE-2022-21824", keywords: ["debug", "rce"], description: "debug RCE via format string." },
  { id: "CVE-2017-1000000", keywords: ["express", "redirect"], description: "express open redirect." },
];

function lookupCve(query: string): Array<Record<string, string>> {
  const lower = query.toLowerCase();
  const hits = CVE_FIXTURES.filter((fixture) =>
    fixture.keywords.some((keyword) => lower.includes(keyword)),
  );
  return hits.map((hit) => ({ id: hit.id, description: hit.description }));
}

const SEMGREP_RULES: Array<{ rule: string; pattern: RegExp }> = [
  { rule: "eval-usage", pattern: /\beval\s*\(/u },
  { rule: "child-process-exec", pattern: /\bexec\s*\(/u },
  { rule: "dangerous-innerHTML", pattern: /\.innerHTML\s*=/u },
  { rule: "sql-string-concat", pattern: /`SELECT.*\$\{/iu },
  { rule: "hardcoded-secret", pattern: /(password|secret|token)\s*[:=]\s*["'][^"']{8,}/iu },
];

function builtinSemgrep(content: string): Array<Record<string, string>> {
  const matches: Array<Record<string, string>> = [];
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    for (const { rule, pattern } of SEMGREP_RULES) {
      if (pattern.test(line)) {
        matches.push({ rule, line: String(i + 1), snippet: line.trim().slice(0, 100) });
      }
    }
  }
  return matches.slice(0, 30);
}
