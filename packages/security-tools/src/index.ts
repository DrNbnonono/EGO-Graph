import { createHash } from "node:crypto";

export * from "./scope-v2.js";

export type SecurityRiskLevel = "low" | "medium" | "high" | "critical";

export type SecurityTargetType =
  "local_fixture" | "ctf_file" | "owned_web_app" | "api_document" | "unknown";

export type SecurityScope = {
  scopeId: string;
  targetType: SecurityTargetType;
  targets: string[];
  allowedActions: string[];
  forbiddenActions: string[];
  rateLimit: { requestsPerMinute: number };
  riskLevel: SecurityRiskLevel;
  expiresAt: string;
  evidenceRequired: boolean;
};

export type SecurityToolDefinition = {
  name: string;
  description: string;
  requiredAction: string;
  riskLevel: SecurityRiskLevel;
  requiresApproval: boolean;
  sandboxProfile: "none" | "local-fixture" | "docker";
  timeoutMs: number;
};

export function createSecurityScope(input: {
  targetType: SecurityTargetType;
  targets: string[];
  allowedActions?: string[];
  forbiddenActions?: string[];
  riskLevel?: SecurityRiskLevel;
  expiresAt?: string;
  evidenceRequired?: boolean;
}): SecurityScope {
  return {
    scopeId: `scope-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    targetType: input.targetType,
    targets: [...new Set(input.targets)],
    allowedActions: input.allowedActions ?? ["inspect", "fingerprint", "evidence.save"],
    forbiddenActions: input.forbiddenActions ?? [
      "public-network-scan",
      "bruteforce",
      "exploit",
      "credential-access",
      "destructive-payload",
      "ddos",
    ],
    rateLimit: { requestsPerMinute: 30 },
    riskLevel: input.riskLevel ?? "low",
    expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    evidenceRequired: input.evidenceRequired ?? true,
  };
}

export function assertSecurityScopeAllows(
  scope: SecurityScope | undefined,
  tool: SecurityToolDefinition,
): { allowed: true } | { allowed: false; reason: string } {
  if (!scope) {
    return {
      allowed: false,
      reason: "SecurityScope is required before active security tooling can run.",
    };
  }
  if (new Date(scope.expiresAt).getTime() < Date.now()) {
    return { allowed: false, reason: "SecurityScope has expired." };
  }
  if (scope.forbiddenActions.includes(tool.requiredAction)) {
    return { allowed: false, reason: `${tool.requiredAction} is forbidden by scope.` };
  }
  if (!scope.allowedActions.includes(tool.requiredAction)) {
    return { allowed: false, reason: `${tool.requiredAction} is not allowed by scope.` };
  }
  if (riskRank(tool.riskLevel) > riskRank(scope.riskLevel)) {
    return { allowed: false, reason: `${tool.name} risk exceeds scope risk level.` };
  }
  return { allowed: true };
}

export const lowRiskSecurityTools: SecurityToolDefinition[] = [
  tool(
    "local_fixture.http_request",
    "HTTP request against local owned fixtures only.",
    "inspect",
    "low",
    "local-fixture",
  ),
  tool(
    "local_fixture.crawl",
    "Crawl a local fixture within scope.",
    "inspect",
    "low",
    "local-fixture",
  ),
  tool(
    "local_fixture.fingerprint",
    "Fingerprint headers and framework hints for a local fixture.",
    "fingerprint",
    "low",
    "local-fixture",
  ),
  tool(
    "api_doc.parse",
    "Parse API documentation for routes and auth notes.",
    "inspect",
    "low",
    "none",
  ),
  tool(
    "web.form.inspect",
    "Inspect static form metadata from provided HTML.",
    "inspect",
    "low",
    "none",
  ),
  tool(
    "evidence.save",
    "Persist security evidence with source metadata.",
    "evidence.save",
    "low",
    "none",
  ),
  tool(
    "report.vulnerability_draft",
    "Draft a defensive vulnerability report from evidence.",
    "report",
    "low",
    "none",
  ),
  tool("ctf.file.identify", "Identify local CTF file metadata.", "inspect", "low", "none"),
  tool(
    "ctf.strings.extract",
    "Extract printable strings from a local CTF artifact.",
    "inspect",
    "low",
    "none",
  ),
  tool("ctf.hash.identify", "Compute local artifact hashes.", "inspect", "low", "none"),
  tool(
    "ctf.pcap.summary",
    "Summarize local pcap metadata without network activity.",
    "inspect",
    "low",
    "none",
  ),
];

export function identifyHash(input: string | Uint8Array): { sha256: string; md5: string } {
  return {
    sha256: createHash("sha256").update(input).digest("hex"),
    md5: createHash("md5").update(input).digest("hex"),
  };
}

export function extractPrintableStrings(input: string | Uint8Array, minLength = 4): string[] {
  const text = typeof input === "string" ? input : Buffer.from(input).toString("latin1");
  return [...text.matchAll(new RegExp(`[ -~]{${minLength},}`, "g"))]
    .map((match) => match[0])
    .slice(0, 200);
}

export function parseApiDoc(text: string): Array<{ method: string; path: string }> {
  const routes = new Map<string, { method: string; path: string }>();
  for (const match of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+((?:\/[\w.{}:-]+)+)/gi)) {
    const route = { method: (match[1] ?? "").toUpperCase(), path: match[2] ?? "" };
    routes.set(`${route.method} ${route.path}`, route);
  }
  return [...routes.values()];
}

function tool(
  name: string,
  description: string,
  requiredAction: string,
  riskLevel: SecurityRiskLevel,
  sandboxProfile: SecurityToolDefinition["sandboxProfile"],
): SecurityToolDefinition {
  return {
    name,
    description,
    requiredAction,
    riskLevel,
    requiresApproval: riskLevel !== "low",
    sandboxProfile,
    timeoutMs: 30_000,
  };
}

function riskRank(risk: SecurityRiskLevel): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[risk];
}
