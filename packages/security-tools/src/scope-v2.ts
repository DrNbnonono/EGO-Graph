import { isIP } from "node:net";
import { randomUUID } from "node:crypto";

export type SecurityScopeTargetV2 = {
  scheme: "http" | "https";
  host: string;
  ports: number[];
  pathPrefixes: string[];
  resolvedIps?: string[];
};

export type SecurityScopeV2 = {
  version: 2;
  scopeId: string;
  workspaceId: string;
  targetType: "local_fixture" | "ctf_file" | "owned_web_app" | "api_document" | "unknown";
  targets: SecurityScopeTargetV2[];
  allowedActions: string[];
  forbiddenActions: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  limits: {
    requestsPerMinute: number;
    maxRequests: number;
    maxRedirects: number;
    maxResponseBytes: number;
  };
  network: {
    allowPublic: boolean;
    allowPrivate: boolean;
    allowLoopback: boolean;
  };
  allowPayloadUpload: boolean;
  retention: { persistBodies: boolean; ttlHours: number };
  evidenceRequired: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  usage: { requestCount: number; requestTimestamps: string[] };
};

export function createSecurityScopeV2(input: {
  workspaceId: string;
  targetType: SecurityScopeV2["targetType"];
  targets: SecurityScopeTargetV2[];
  allowedActions?: string[];
  forbiddenActions?: string[];
  riskLevel?: SecurityScopeV2["riskLevel"];
  limits?: Partial<SecurityScopeV2["limits"]>;
  network?: Partial<SecurityScopeV2["network"]>;
  allowPayloadUpload?: boolean;
  retention?: Partial<SecurityScopeV2["retention"]>;
  evidenceRequired?: boolean;
  expiresAt?: string;
  now?: string;
}): SecurityScopeV2 {
  const now = input.now ?? new Date().toISOString();
  if (input.targets.length === 0) throw new Error("SecurityScopeV2 requires at least one target.");
  return {
    version: 2,
    scopeId: randomUUID(),
    workspaceId: input.workspaceId,
    targetType: input.targetType,
    targets: input.targets.map(normalizeTarget),
    allowedActions: input.allowedActions ?? ["inspect", "fingerprint", "evidence.save", "report"],
    forbiddenActions: input.forbiddenActions ?? [
      "public-network-scan", "bruteforce", "exploit", "credential-access", "destructive-payload", "ddos",
    ],
    riskLevel: input.riskLevel ?? "low",
    limits: {
      requestsPerMinute: input.limits?.requestsPerMinute ?? 20,
      maxRequests: input.limits?.maxRequests ?? 20,
      maxRedirects: input.limits?.maxRedirects ?? 0,
      maxResponseBytes: input.limits?.maxResponseBytes ?? 2_000_000,
    },
    network: {
      allowPublic: input.network?.allowPublic ?? false,
      allowPrivate: input.network?.allowPrivate ?? false,
      allowLoopback: input.network?.allowLoopback ?? true,
    },
    allowPayloadUpload: input.allowPayloadUpload ?? false,
    retention: {
      persistBodies: input.retention?.persistBodies ?? false,
      ttlHours: input.retention?.ttlHours ?? 24,
    },
    evidenceRequired: input.evidenceRequired ?? true,
    createdAt: now,
    expiresAt: input.expiresAt ?? new Date(Date.parse(now) + 60 * 60 * 1000).toISOString(),
    usage: { requestCount: 0, requestTimestamps: [] },
  };
}

export function authorizeSecurityRequest(input: {
  scope: SecurityScopeV2 | undefined;
  url: string;
  method?: string;
  bodyBytes?: number;
  now?: string;
}): { allowed: true; target: SecurityScopeTargetV2 } | { allowed: false; reason: string } {
  const scope = input.scope;
  if (!scope) return { allowed: false, reason: "SecurityScopeV2 is required." };
  const now = input.now ?? new Date().toISOString();
  if (scope.revokedAt) return { allowed: false, reason: "SecurityScopeV2 was revoked." };
  if (Date.parse(scope.expiresAt) <= Date.parse(now)) return { allowed: false, reason: "SecurityScopeV2 expired." };
  if (scope.usage.requestCount >= scope.limits.maxRequests) return { allowed: false, reason: "SecurityScopeV2 request budget exhausted." };
  const recent = scope.usage.requestTimestamps.filter((value) => Date.parse(now) - Date.parse(value) < 60_000);
  if (recent.length >= scope.limits.requestsPerMinute) return { allowed: false, reason: "SecurityScopeV2 rate limit exceeded." };
  const method = (input.method ?? "GET").toUpperCase();
  if ((input.bodyBytes ?? 0) > 0 && method !== "GET" && method !== "HEAD" && !scope.allowPayloadUpload) {
    return { allowed: false, reason: "Payload upload is not authorized by SecurityScopeV2." };
  }
  let parsed: URL;
  try { parsed = new URL(input.url); } catch { return { allowed: false, reason: "Malformed target URL." }; }
  const target = scope.targets.find((candidate) => targetMatches(candidate, parsed));
  if (!target) return { allowed: false, reason: "URL is outside the authorized target scheme/host/port/path." };
  const zone = networkZone(parsed.hostname);
  if (zone === "loopback" && !scope.network.allowLoopback) return { allowed: false, reason: "Loopback targets are not allowed." };
  if (zone === "private" && !scope.network.allowPrivate) return { allowed: false, reason: "Private-network targets are not allowed." };
  if (zone === "public" && !scope.network.allowPublic) return { allowed: false, reason: "Public-network targets are not allowed." };
  if (target.resolvedIps && target.resolvedIps.length > 0 && isIP(parsed.hostname) > 0 && !target.resolvedIps.includes(parsed.hostname)) {
    return { allowed: false, reason: "Resolved target address does not match the pinned addresses." };
  }
  return { allowed: true, target };
}

export function consumeSecurityRequest(scope: SecurityScopeV2, now?: string): void {
  const timestamp = now ?? new Date().toISOString();
  scope.usage.requestCount += 1;
  scope.usage.requestTimestamps = scope.usage.requestTimestamps
    .filter((value) => Date.parse(timestamp) - Date.parse(value) < 60_000)
    .concat(timestamp);
}

export function revokeSecurityScope(scope: SecurityScopeV2, now?: string): void {
  scope.revokedAt = now ?? new Date().toISOString();
}

function normalizeTarget(target: SecurityScopeTargetV2): SecurityScopeTargetV2 {
  const host = target.host.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "0.0.0.0") throw new Error("0.0.0.0 is a bind address, not an authorized target.");
  return {
    scheme: target.scheme,
    host,
    ports: [...new Set(target.ports)],
    pathPrefixes: [...new Set(target.pathPrefixes.length > 0 ? target.pathPrefixes : ["/"])],
    ...(target.resolvedIps ? { resolvedIps: [...new Set(target.resolvedIps)] } : {}),
  };
}

function targetMatches(target: SecurityScopeTargetV2, url: URL): boolean {
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return (
    `${target.scheme}:` === url.protocol &&
    target.host === url.hostname.toLowerCase().replace(/^\[|\]$/gu, "") &&
    target.ports.includes(port) &&
    target.pathPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))
  );
}

function networkZone(hostname: string): "loopback" | "private" | "public" {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host === "::1" || host.startsWith("127.")) return "loopback";
  if (
    host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") ||
    /^10\./u.test(host) || /^192\.168\./u.test(host) || /^172\.(1[6-9]|2\d|3[01])\./u.test(host)
  ) return "private";
  return "public";
}
