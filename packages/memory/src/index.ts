export type MemoryScope = "session" | "project" | "task";
export type MemoryKind =
  | "project_fact"
  | "user_preference"
  | "decision"
  | "failure"
  | "tool_result"
  | "security_scope"
  | "run_summary";

export type MemoryStatus = "active" | "archived" | "forgotten";

export type MemoryRecord = {
  id: string;
  scope: MemoryScope;
  kind?: MemoryKind;
  content: string;
  summary: string;
  rawContent?: string;
  source: string;
  sourceRunId?: string;
  evidenceRefs: string[];
  tags: string[];
  references: string[];
  importance: number;
  confidence: number;
  expiresAt?: string;
  status?: MemoryStatus;
  lastAccessedAt?: string;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RememberInput = {
  scope: MemoryScope;
  kind?: MemoryKind;
  content: string;
  summary?: string;
  rawContent?: string;
  source: string;
  sourceRunId?: string;
  evidenceRefs?: string[];
  tags?: string[];
  references?: string[];
  importance?: number;
  confidence?: number;
  expiresAt?: string;
};

export type RememberResult =
  { status: "stored"; memory: MemoryRecord } | { status: "rejected"; message: string };

export type RecallInput = {
  query: string;
  scope?: MemoryScope;
  kind?: MemoryKind;
  minImportance?: number;
  limit?: number;
};

export type RememberTypedInput = {
  scope: MemoryScope;
  summary: string;
  rawContent?: string;
  source: string;
  sourceRunId?: string;
  evidenceRefs?: string[];
  tags?: string[];
  references?: string[];
  importance?: number;
  confidence?: number;
  expiresAt?: string;
};

export type CompactMemoryInput = {
  scope?: MemoryScope;
  query?: string;
  maxChars?: number;
};

export type MemoryService = {
  remember(input: RememberInput): Promise<RememberResult>;
  recall(input: RecallInput): Promise<MemoryRecord[]>;
  listMemories(scope?: MemoryScope): Promise<MemoryRecord[]>;
  compact(input?: CompactMemoryInput): Promise<string>;
  archive(id: string): Promise<boolean>;
  forget(id: string): Promise<boolean>;
};

export type ContextSummaryInput = {
  goal: string;
  constraints?: string[];
  inspectedFiles?: string[];
  decisions?: string[];
  todos?: string[];
  risks?: string[];
  maxChars?: number;
};

export function createMemoryService(initialMemories: MemoryRecord[] = []): MemoryService {
  const memories = initialMemories.map(normalizeMemoryRecord);

  return {
    async remember(input) {
      const sensitive = findSensitiveReference(input.references ?? [input.source]);
      if (sensitive) {
        return {
          status: "rejected",
          message: `Refusing to store memory from sensitive reference: ${sensitive}`,
        };
      }
      if (
        isSensitiveContent(input.content) ||
        isSensitiveContent(input.summary ?? "") ||
        isSensitiveContent(input.rawContent ?? "")
      ) {
        return {
          status: "rejected",
          message: "Refusing to store memory containing credential-like content.",
        };
      }

      const now = new Date().toISOString();
      const summary = (input.summary ?? input.content).trim();
      const memory: MemoryRecord = {
        id: `memory-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
        scope: input.scope,
        ...(input.kind ? { kind: input.kind } : {}),
        content: input.content.trim(),
        summary,
        ...(input.rawContent ? { rawContent: input.rawContent.trim() } : {}),
        source: input.source,
        ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
        evidenceRefs: input.evidenceRefs ?? [],
        tags: normalizeTags(input.tags, input.kind),
        references: input.references ?? [],
        importance: clampNumber(input.importance ?? 3, 1, 5),
        confidence: clampNumber(input.confidence ?? 0.7, 0, 1),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        status: "active",
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      memories.push(memory);
      return { status: "stored", memory };
    },
    async recall(input) {
      const tokens = tokenize(input.query);
      const scored = memories
        .filter((memory) => (memory.status ?? "active") === "active")
        .filter((memory) => !memory.expiresAt || memory.expiresAt > new Date().toISOString())
        .filter((memory) => !input.scope || memory.scope === input.scope)
        .filter((memory) => !input.kind || memory.kind === input.kind)
        .filter((memory) => !input.minImportance || memory.importance >= input.minImportance)
        .map((memory) => ({ memory, score: scoreMemory(memory, tokens) }))
        .filter((item) => item.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || right.memory.updatedAt.localeCompare(left.memory.updatedAt),
        );
      const hits = scored.slice(0, input.limit ?? 6).map((item) => item.memory);
      const now = new Date().toISOString();
      for (const memory of hits) {
        memory.accessCount += 1;
        memory.lastAccessedAt = now;
        memory.updatedAt = now;
      }
      return hits;
    },
    async listMemories(scope) {
      return memories
        .filter((memory) => (memory.status ?? "active") === "active")
        .filter((memory) => !scope || memory.scope === scope)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async compact(input = {}) {
      const selected = memories
        .filter((memory) => (memory.status ?? "active") === "active")
        .filter((memory) => !input.scope || memory.scope === input.scope)
        .filter((memory) => !input.query || scoreMemory(memory, tokenize(input.query)) > 0)
        .slice(0, 20);
      const lines = selected.map((memory) =>
        [
          `[${memory.scope}${memory.kind ? `/${memory.kind}` : ""}]`,
          memory.summary,
          memory.tags.length ? `tags=${memory.tags.join(",")}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      const summary = lines.length > 0 ? lines.join("\n") : "No relevant memory.";
      const maxChars = input.maxChars ?? 2_000;
      return summary.length <= maxChars ? summary : `${summary.slice(0, maxChars - 3)}...`;
    },
    async archive(id) {
      const memory = memories.find((candidate) => candidate.id === id);
      if (!memory) {
        return false;
      }
      memory.status = "archived";
      memory.updatedAt = new Date().toISOString();
      return true;
    },
    async forget(id) {
      const memory = memories.find((candidate) => candidate.id === id);
      if (!memory) {
        return false;
      }
      memory.status = "forgotten";
      memory.content = "";
      memory.summary = "Memory forgotten by user request.";
      memory.rawContent = "";
      memory.updatedAt = new Date().toISOString();
      return true;
    },
  };
}

export async function rememberDecision(
  memory: Pick<MemoryService, "remember">,
  input: RememberTypedInput,
): Promise<RememberResult> {
  return rememberTyped(memory, "decision", input);
}

export async function rememberFailure(
  memory: Pick<MemoryService, "remember">,
  input: RememberTypedInput,
): Promise<RememberResult> {
  return rememberTyped(memory, "failure", { importance: 4, confidence: 0.8, ...input });
}

export async function rememberToolResult(
  memory: Pick<MemoryService, "remember">,
  input: RememberTypedInput,
): Promise<RememberResult> {
  return rememberTyped(memory, "tool_result", input);
}

export async function rememberSecurityScope(
  memory: Pick<MemoryService, "remember">,
  input: RememberTypedInput,
): Promise<RememberResult> {
  return rememberTyped(memory, "security_scope", { importance: 5, confidence: 0.9, ...input });
}

export async function rememberRunSummary(
  memory: Pick<MemoryService, "remember">,
  input: RememberTypedInput,
): Promise<RememberResult> {
  return rememberTyped(memory, "run_summary", input);
}

export async function recallForTask(
  memory: Pick<MemoryService, "recall">,
  input: RecallInput,
): Promise<MemoryRecord[]> {
  return memory.recall(input);
}

export async function compactSessionMemory(
  memory: Pick<MemoryService, "compact">,
  query?: string,
): Promise<string> {
  return memory.compact({ scope: "session", ...(query ? { query } : {}), maxChars: 2_400 });
}

export function summarizeContext(input: ContextSummaryInput): string {
  const sections = [
    `Goal: ${input.goal}`,
    formatSection("Constraints", input.constraints),
    formatSection("Inspected Files", input.inspectedFiles),
    formatSection("Decisions", input.decisions),
    formatSection("Todos", input.todos),
    formatSection("Risks", input.risks),
  ].filter(Boolean);
  const summary = sections.join("\n");
  const maxChars = input.maxChars ?? 2_400;
  return summary.length <= maxChars ? summary : `${summary.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function isSensitiveReference(reference: string): boolean {
  const normalized = reference.replaceAll("\\", "/").toLowerCase();
  return (
    normalized === ".env" ||
    normalized.includes("/.env") ||
    normalized.includes(".git/") ||
    normalized.includes("id_rsa") ||
    normalized.includes("secret") ||
    normalized.includes("api_key")
  );
}

export function isSensitiveContent(content: string): boolean {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\bsk-cp-[A-Za-z0-9_-]{16,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i,
  ].some((pattern) => pattern.test(content));
}

function findSensitiveReference(references: string[]): string | undefined {
  return references.find((reference) => isSensitiveReference(reference));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((token) => token.length > 1);
}

function scoreMemory(memory: MemoryRecord, queryTokens: string[]): number {
  const searchable =
    `${memory.summary} ${memory.content} ${memory.kind ?? ""} ${memory.tags.join(" ")} ${memory.references.join(" ")} ${memory.evidenceRefs.join(" ")}`.toLowerCase();
  const lexical = queryTokens.reduce(
    (score, token) => score + (searchable.includes(token) ? 1 : 0),
    0,
  );
  const importance = memory.importance / 5;
  const confidence = memory.confidence;
  const access = Math.min(memory.accessCount, 10) / 10;
  const recency = Math.max(0, Date.parse(memory.updatedAt) || 0) / 10_000_000_000_000;
  return lexical * 10 + importance * 2 + confidence + access + recency;
}

function normalizeTags(tags: string[] | undefined, kind: MemoryKind | undefined): string[] {
  return [...new Set([...(tags ?? []), ...(kind ? [`kind:${kind}`] : [])])];
}

function formatSection(label: string, items?: string[]): string {
  if (!items || items.length === 0) {
    return "";
  }
  return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function rememberTyped(
  memory: Pick<MemoryService, "remember">,
  kind: MemoryKind,
  input: RememberTypedInput,
): Promise<RememberResult> {
  return memory.remember({
    ...input,
    kind,
    content: input.summary,
    ...(input.rawContent ? { rawContent: input.rawContent } : {}),
    tags: [...(input.tags ?? []), `kind:${kind}`],
  });
}

function normalizeMemoryRecord(memory: MemoryRecord): MemoryRecord {
  return {
    ...memory,
    summary: memory.summary ?? memory.content,
    evidenceRefs: memory.evidenceRefs ?? [],
    importance: clampNumber(memory.importance ?? 3, 1, 5),
    confidence: clampNumber(memory.confidence ?? 0.7, 0, 1),
    status: memory.status ?? "active",
    accessCount: memory.accessCount ?? 0,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
