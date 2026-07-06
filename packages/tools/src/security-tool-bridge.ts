import {
  extractPrintableStrings,
  identifyHash,
  parseApiDoc,
  lowRiskSecurityTools,
  type SecurityToolDefinition,
} from "@ego-graph/security-tools";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./tool-definition.js";
import { ToolRegistry } from "./tool-registry.js";

const execFileAsync = promisify(execFile);
const genericInput = z.object({ value: z.string().optional().default("") });
const genericOutput = z.object({ result: z.record(z.unknown()), findings: z.array(z.string()) });

/**
 * Create a tool registry populated with the security tools declared in
 * @ego-graph/security-tools as executable ToolDefinitions. CTF/file tools
 * use the existing helper functions; local fixture/web inspection tools
 * report their requiredAction/risk metadata and leave execution to the
 * runtime harness.
 */
export function createSecurityToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const def of lowRiskSecurityTools) {
    const tool = securityToolToToolDefinition(def);
    registry.register(tool);
  }
  return registry;
}

function securityToolToToolDefinition(
  def: SecurityToolDefinition,
): ToolDefinition<typeof genericInput, typeof genericOutput> {
  return {
    name: def.name,
    version: "1",
    description: def.description,
    inputSchema: genericInput,
    outputSchema: genericOutput,
    permission: {
      scope: isLocalOnlyTool(def.name) ? "file" : "network",
      risk: mapSecurityRisk(def.riskLevel),
      requiresSandbox: def.sandboxProfile !== "none",
    },
    permissionAction: def.name,
    permissionResources(input) {
      return [input.value || "*"];
    },
    riskLevel: mapSecurityRisk(def.riskLevel),
    sandboxProfile: mapSandboxProfile(def.sandboxProfile),
    timeoutMs: def.timeoutMs,
    requiresApproval: def.requiresApproval,
    ...(def.sandboxProfile === "local-fixture" ? { requiresSecurityScope: true } : {}),
    async execute(input, context) {
      return executeSecurityTool(def, input, context);
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "fact" as const,
        confidence: 0.7,
        raw: output.result,
      }));
    },
  };
}

async function executeSecurityTool(
  def: SecurityToolDefinition,
  input: z.infer<typeof genericInput>,
  context: { workspaceRoot: string },
): Promise<z.infer<typeof genericOutput>> {
  switch (def.name) {
    case "ctf.file.identify": {
      const path = resolve(context.workspaceRoot, input.value || ".");
      const content = await tryReadFile(path);
      if (!content) {
        return { result: { error: "File not found" }, findings: ["CTF file not found"] };
      }
      const hashes = identifyHash(content);
      return {
        result: { file: path, ...hashes },
        findings: [
          `CTF file identified: ${path} sha256=${hashes.sha256.slice(0, 16)} md5=${hashes.md5.slice(0, 16)}`,
        ],
      };
    }
    case "ctf.strings.extract": {
      const path = resolve(context.workspaceRoot, input.value || ".");
      const content = await tryReadFile(path);
      if (!content) {
        return { result: { error: "File not found" }, findings: ["CTF file not found"] };
      }
      const strings = extractPrintableStrings(content);
      return {
        result: { file: path, strings: strings.slice(0, 100) },
        findings: [`Extracted ${strings.length} printable string(s) from ${path}`],
      };
    }
    case "ctf.hash.identify": {
      const path = resolve(context.workspaceRoot, input.value || ".");
      const content = await tryReadFile(path);
      if (!content) {
        return { result: { error: "File not found" }, findings: ["CTF file not found"] };
      }
      return {
        result: identifyHash(content),
        findings: [`Hash computed for ${path}`],
      };
    }
    case "ctf.pcap.summary": {
      const path = resolve(context.workspaceRoot, input.value || ".");
      const exists = await tryReadFile(path);
      return {
        result: { file: path, readable: Boolean(exists), tool: "ctf.pcap.summary" },
        findings: exists
          ? [`PCAP file found: ${path}. Use external tools for detailed analysis.`]
          : [`PCAP file not found: ${path}`],
      };
    }
    case "api_doc.parse": {
      const text = input.value || "";
      const routes = parseApiDoc(text);
      return {
        result: { routes },
        findings:
          routes.length > 0
            ? [`Parsed ${routes.length} API route(s).`]
            : ["No API routes found in provided text."],
      };
    }
    case "web.form.inspect": {
      const html = input.value || "";
      const forms = [...html.matchAll(/<form\b[^>]*>/giu)].map((match) => match[0]);
      const inputs = [...html.matchAll(/<input\b[^>]*name=["']?([^"'\s>]+)/giu)].map(
        (match) => match[1] ?? "",
      );
      return {
        result: { formCount: forms.length, inputs, htmlSnippet: html.slice(0, 2000) },
        findings: [`Inspected ${forms.length} form(s) and ${inputs.length} input field(s).`],
      };
    }
    case "local_fixture.http_request": {
      const url = assertLocalFixtureUrl(input.value || "");
      const response = await fetch(url);
      const body = await response.text();
      return {
        result: {
          url,
          status: response.status,
          headers: headersToObject(response.headers),
          body: body.slice(0, 8_000),
        },
        findings: [`HTTP ${response.status} from ${url}`],
      };
    }
    case "local_fixture.crawl": {
      const url = assertLocalFixtureUrl(input.value || "");
      const response = await fetch(url);
      const body = await response.text();
      const links = extractFixtureLinks(url, body);
      return {
        result: { url, status: response.status, links, title: extractTitle(body) },
        findings: [`Crawled ${url} and found ${links.length} link(s).`],
      };
    }
    case "local_fixture.fingerprint": {
      const url = assertLocalFixtureUrl(input.value || "");
      const response = await fetch(url);
      const body = await response.text();
      const headers = headersToObject(response.headers);
      const hints = fingerprintHints(headers, body);
      return {
        result: { url, status: response.status, headers, title: extractTitle(body), hints },
        findings: [`Fingerprint for ${url}: ${hints.join(", ") || "no framework hints"}.`],
      };
    }
    case "report.vulnerability_draft": {
      const evidence = (input.value || "").split(/\r?\n/u).filter(Boolean);
      const title = evidence[0] ?? "Security finding";
      return {
        result: {
          title,
          severity: inferReportSeverity(input.value || ""),
          evidence,
          sections: {
            summary: title,
            impact: evidence.find((line) => /^impact:/iu.test(line)) ?? "Impact requires analyst review.",
            recommendation: "Validate authorization, reproduce on the owned fixture, and document remediation.",
          },
        },
        findings: [`Draft vulnerability report: ${title}`],
      };
    }
    case "evidence.save":
    default: {
      const content = input.value || "";
      return {
        result: { tool: def.name, requiredAction: def.requiredAction, input: content },
        findings: [`Security tool '${def.name}' (action: ${def.requiredAction}) invoked.`],
      };
    }
  }
}

function isLocalOnlyTool(name: string): boolean {
  return (
    name.startsWith("ctf.") ||
    name.startsWith("evidence.") ||
    name.startsWith("api_doc.") ||
    name.startsWith("web.form.") ||
    name.startsWith("report.")
  );
}

function headersToObject(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function assertLocalFixtureUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported fixture URL protocol: ${url.protocol}`);
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing non-local fixture URL: ${value}`);
  }
  return url.toString();
}

function extractFixtureLinks(baseUrl: string, html: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/\bhref=["']([^"']+)["']/giu)) {
    const href = match[1];
    if (!href) {
      continue;
    }
    try {
      const url = new URL(href, baseUrl);
      links.add(`${url.pathname}${url.search}`);
    } catch {
      // Ignore malformed fixture links.
    }
  }
  return [...links].slice(0, 50);
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([^<]+)<\/title>/iu.exec(html);
  return match?.[1]?.trim();
}

function fingerprintHints(headers: Record<string, string>, body: string): string[] {
  const hints: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (["server", "x-powered-by"].includes(name.toLowerCase())) {
      hints.push(`${name}: ${value}`);
    }
  }
  if (/react|vue|svelte|next\.js|express/iu.test(body)) {
    hints.push("framework marker in body");
  }
  return hints.slice(0, 20);
}

function inferReportSeverity(text: string): "low" | "medium" | "high" {
  if (/critical|rce|credential|admin|unauthorized/iu.test(text)) {
    return "high";
  }
  if (/xss|csrf|leak|exposed/iu.test(text)) {
    return "medium";
  }
  return "low";
}

async function tryReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function mapSecurityRisk(risk: "low" | "medium" | "high" | "critical"): "low" | "medium" | "high" {
  return risk === "critical" ? "high" : risk;
}

function mapSandboxProfile(profile: "none" | "local-fixture" | "docker"): "none" | "process" | "docker" {
  return profile === "local-fixture" ? "process" : profile;
}
