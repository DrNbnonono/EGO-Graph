/**
 * IOC (Indicator of Compromise) extraction patterns.
 *
 * Conservative, high-precision regexes used by `security.ir.ioc_extract` and
 * the reverse/vuln tooling to flag candidate indicators in tool output. Each
 * pattern deliberately trades recall for precision to avoid drowning the
 * evidence graph in false positives.
 */

export type IocKind =
  | "ipv4"
  | "ipv6"
  | "domain"
  | "url"
  | "email"
  | "md5"
  | "sha1"
  | "sha256"
  | "cve"
  | "jwt"
  | "aws_key"
  | "private_key";

export type IocMatch = {
  kind: IocKind;
  value: string;
};

export const IOC_PATTERNS: Array<{ kind: IocKind; pattern: RegExp }> = [
  // SHA-256 (64 hex) before SHA-1 (40) before MD5 (32) to avoid partial matches.
  { kind: "sha256", pattern: /\b[0-9a-f]{64}\b/giu },
  { kind: "sha1", pattern: /\b[0-9a-f]{40}\b/giu },
  { kind: "md5", pattern: /\b[0-9a-f]{32}\b/giu },
  { kind: "cve", pattern: /\bCVE-\d{4}-\d{4,7}\b/giu },
  { kind: "ipv4", pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/gu },
  { kind: "ipv6", pattern: /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/giu },
  {
    kind: "url",
    pattern: /\bhttps?:\/\/[^\s"'<>]+/giu,
  },
  {
    kind: "domain",
    pattern: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|cn|ru|top|xyz|info|biz|edu|gov)\b/giu,
  },
  { kind: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu },
  { kind: "aws_key", pattern: /\bAKIA[0-9A-Z]{16}\b/gu },
  {
    kind: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu,
  },
];

export function extractIocs(text: string, options: { maxPerKind?: number } = {}): IocMatch[] {
  const maxPerKind = options.maxPerKind ?? 50;
  const matches: IocMatch[] = [];
  const seen = new Set<string>();
  for (const { kind, pattern } of IOC_PATTERNS) {
    let count = 0;
    pattern.lastIndex = 0;
    let result: RegExpExecArray | null;
    while (count < maxPerKind && (result = pattern.exec(text)) !== null) {
      const value = result[0];
      const key = `${kind}:${value}`;
      if (seen.has(key)) {
        if (pattern.lastIndex === result.index) {
          pattern.lastIndex += 1;
        }
        continue;
      }
      seen.add(key);
      matches.push({ kind, value });
      count += 1;
      if (pattern.lastIndex === result.index) {
        pattern.lastIndex += 1;
      }
    }
  }
  return matches;
}

export function summarizeIocs(matches: IocMatch[]): Record<IocKind, number> {
  const summary = {
    ipv4: 0,
    ipv6: 0,
    domain: 0,
    url: 0,
    email: 0,
    md5: 0,
    sha1: 0,
    sha256: 0,
    cve: 0,
    jwt: 0,
    aws_key: 0,
    private_key: 0,
  } as Record<IocKind, number>;
  for (const match of matches) {
    summary[match.kind] += 1;
  }
  return summary;
}
