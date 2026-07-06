/**
 * Sandbox and network-boundary enforcement for security tools.
 *
 * Contest requirement (P0-7): "危险 shell/network 工具没有沙箱或
 * SecurityScope 时不能执行". These helpers back the capability-aware tool
 * adapters: they detect available sandboxes, enforce an egress allowlist, and
 * redact secrets before output reaches the evidence graph.
 */

export type SandboxKind = "docker" | "nsjail" | "process" | "none";

export type SandboxCapability = {
  kind: SandboxKind;
  available: boolean;
  binaryPath?: string;
  detectedAt: string;
};

export type EgressPolicy = {
  /** Explicitly allowed hostnames/IPs. Empty list means "deny all network". */
  allowlist: string[];
  /** When true, localhost/127.0.0.1/::1 are always allowed (fixture mode). */
  allowLoopback: boolean;
};

export const DEFAULT_EGRESS_POLICY: EgressPolicy = {
  allowlist: [],
  allowLoopback: true,
};

export type EgressDecision = {
  allowed: boolean;
  reason: string;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * Decide whether a URL may be contacted under the egress policy. Pure
 * function; security tools call this before any `fetch`/`execFile`.
 */
export function enforceEgressAllowlist(url: string, policy: EgressPolicy = DEFAULT_EGRESS_POLICY): EgressDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: `Malformed URL rejected by egress policy: ${url}` };
  }
  const host = parsed.hostname.toLowerCase();
  if (policy.allowLoopback && LOOPBACK_HOSTS.has(host)) {
    return { allowed: true, reason: `Loopback host ${host} permitted by egress policy.` };
  }
  if (policy.allowlist.some((allowed) => matchHost(host, allowed.toLowerCase()))) {
    return { allowed: true, reason: `Host ${host} matched egress allowlist.` };
  }
  return {
    allowed: false,
    reason: `Host ${host} not in egress allowlist; refusing network egress.`,
  };
}

function matchHost(host: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.startsWith("*.")) {
    return host.endsWith(pattern.slice(1));
  }
  return host === pattern;
}

/**
 * Redact common credential shapes from tool output before it is written to
 * evidence. Returns a copy with secrets replaced by a sentinel. The original
 * is never mutated.
 */
export function redactSecrets<T>(value: T): T {
  return deepRedact(value) as T;
}

function deepRedact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    return value.map((item) => deepRedact(item, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value as object)) {
      return value;
    }
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(lowerKey)) && typeof item === "string" && item.length > 0) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = deepRedact(item, seen);
      }
    }
    return out;
  }
  return value;
}

const SECRET_KEY_PATTERNS: RegExp[] = [
  /password/u,
  /secret/u,
  /token/u,
  /api[_-]?key/u,
  /private[_-]?key/u,
  /access[_-]?key/u,
  /authorization/u,
  /cookie/u,
  /credential/u,
];

function redactString(text: string): string {
  let redacted = text;
  redacted = redacted.replace(/(AKIA[0-9A-Z]{16})/gu, "[REDACTED-AWS-KEY]");
  redacted = redacted.replace(/(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/gu, "[REDACTED-JWT]");
  redacted = redacted.replace(
    /(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)/gu,
    "[REDACTED-PRIVATE-KEY]",
  );
  redacted = redacted.replace(/(sk-[A-Za-z0-9]{20,})/gu, "[REDACTED-API-KEY]");
  return redacted;
}
