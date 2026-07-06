/**
 * Pure-TS incident-response log parser.
 *
 * The builtin fallback for `security.ir.log_parse`. Parses common log line
 * shapes (syslog, apache/nginx access, auth.log) into structured records with
 * timestamps and severity, without requiring any external tool. Real log
 * correlation tools (goaccess, lnav) plug in via the capability registry.
 */

export type LogLevel = "debug" | "info" | "notice" | "warning" | "error" | "critical" | "unknown";

export type ParsedLogRecord = {
  raw: string;
  timestamp?: string;
  level: LogLevel;
  host?: string;
  /** Free-form fields extracted heuristically (ip, user, path, status...). */
  fields: Record<string, string>;
};

const LEVEL_PATTERNS: Array<{ level: LogLevel; pattern: RegExp }> = [
  { level: "critical", pattern: /\b(EMERG|ALERT|FATAL|panic)\b/iu },
  { level: "error", pattern: /\b(ERROR|ERR|failed|failure|exception)\b/iu },
  { level: "warning", pattern: /\b(WARN(ING)?|deprecated)\b/iu },
  { level: "notice", pattern: /\b(NOTICE)\b/iu },
  { level: "info", pattern: /\b(INFO|INFORMATION)\b/iu },
  { level: "debug", pattern: /\b(DEBUG|TRACE)\b/iu },
];

const TIMESTAMP_PATTERNS: RegExp[] = [
  // ISO 8601: 2026-07-06T12:34:56Z or with timezone offset.
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/u,
  // Syslog: Jul  6 12:34:56
  /[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/u,
  // Apache/nginx common: [06/Jul/2026:12:34:56 +0000]
  /\[\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4}\]/u,
  // Compact: 2026-07-06 12:34:56
  /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/u,
];

const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/u;
const USER_PATTERN = /\buser[= ](["']?)([A-Za-z0-9_.-]+)\1/iu;
const STATUS_PATTERN = /\b(?:status|HTTP\/[\d.]+)[^\d]*(\d{3})\b/iu;

export function parseLogLine(line: string): ParsedLogRecord {
  const trimmed = line.trim();
  const level = detectLevel(trimmed);
  const timestamp = detectTimestamp(trimmed);
  const host = detectHost(trimmed);
  const fields = extractFields(trimmed);
  return {
    raw: line,
    ...(timestamp ? { timestamp } : {}),
    level,
    ...(host ? { host } : {}),
    fields,
  };
}

export function parseLogEntries(input: string, options: { maxLines?: number } = {}): ParsedLogRecord[] {
  const maxLines = options.maxLines ?? 500;
  return input
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .map((line) => parseLogLine(line));
}

/**
 * Build a coarse incident timeline by ordering records with parseable
 * timestamps and grouping consecutive same-host records.
 */
export function buildIncidentTimeline(records: ParsedLogRecord[]): Array<{
  timestamp?: string;
  host?: string;
  level: LogLevel;
  summary: string;
}> {
  const withTime = records.filter((record) => Boolean(record.timestamp));
  const sorted = [...withTime].sort((a, b) => compareTimestamps(a.timestamp, b.timestamp));
  return sorted.map((record) => ({
    ...(record.timestamp ? { timestamp: record.timestamp } : {}),
    ...(record.host ? { host: record.host } : {}),
    level: record.level,
    summary: summarizeRecord(record),
  }));
}

/**
 * Detect anomalous entries: repeated failures, privilege escalations,
 * unexpected accounts, off-hours activity. Conservative heuristics that
 * prioritize precision over recall.
 */
export function detectAnomalies(records: ParsedLogRecord[]): ParsedLogRecord[] {
  const anomalies: ParsedLogRecord[] = [];
  const failureByUser = new Map<string, number>();
  for (const record of records) {
    const text = record.raw.toLowerCase();
    if (/failed password|authentication failure|login incorrect/i.test(record.raw)) {
      const user = record.fields.user ?? "unknown";
      failureByUser.set(user, (failureByUser.get(user) ?? 0) + 1);
      anomalies.push(record);
      continue;
    }
    if (/\bsudo\b.*?\b(root|wheel)\b/iu.test(record.raw) || /privilege escalat/iu.test(record.raw)) {
      anomalies.push(record);
      continue;
    }
    if (/\b(reverse shell|\/tmp\/.*\.sh|nc -e|bash -i)\b/iu.test(record.raw)) {
      anomalies.push(record);
    }
  }
  // Flag accounts with many failures as brute-force candidates.
  for (const [user, count] of failureByUser) {
    if (count >= 5) {
      anomalies.push({
        raw: `[anomaly] brute-force candidate: ${count} failed authentications for user '${user}'`,
        level: "critical",
        fields: { user, failureCount: String(count) },
      });
    }
  }
  return anomalies;
}

function detectLevel(line: string): LogLevel {
  for (const { level, pattern } of LEVEL_PATTERNS) {
    if (pattern.test(line)) {
      return level;
    }
  }
  return "unknown";
}

function detectTimestamp(line: string): string | undefined {
  for (const pattern of TIMESTAMP_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

function detectHost(line: string): string | undefined {
  // syslog: "<month> <day> <time> <hostname> ..."
  const syslogMatch = /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+(\S+)/u.exec(line);
  if (syslogMatch?.[1]) {
    return syslogMatch[1];
  }
  return undefined;
}

function extractFields(line: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const ip = IPV4_PATTERN.exec(line);
  if (ip) {
    fields.ip = ip[0];
  }
  const user = USER_PATTERN.exec(line);
  if (user?.[2]) {
    fields.user = user[2];
  }
  const status = STATUS_PATTERN.exec(line);
  if (status?.[1]) {
    fields.status = status[1];
  }
  return fields;
}

function summarizeRecord(record: ParsedLogRecord): string {
  const parts: string[] = [`[${record.level}]`];
  if (record.host) {
    parts.push(record.host);
  }
  parts.push(record.raw.slice(0, 120));
  return parts.join(" ");
}

function compareTimestamps(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return a.localeCompare(b);
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}
