export type MemoryScope = "session" | "project" | "task";

export type MemoryRecord = {
  id: string;
  scope: MemoryScope;
  content: string;
  source: string;
  tags: string[];
  references: string[];
  createdAt: string;
  updatedAt: string;
};

export type RememberInput = {
  scope: MemoryScope;
  content: string;
  source: string;
  tags?: string[];
  references?: string[];
};

export type RememberResult =
  { status: "stored"; memory: MemoryRecord } | { status: "rejected"; message: string };

export type RecallInput = {
  query: string;
  scope?: MemoryScope;
  limit?: number;
};

export type MemoryService = {
  remember(input: RememberInput): Promise<RememberResult>;
  recall(input: RecallInput): Promise<MemoryRecord[]>;
  listMemories(scope?: MemoryScope): Promise<MemoryRecord[]>;
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
  const memories = [...initialMemories];

  return {
    async remember(input) {
      const sensitive = findSensitiveReference(input.references ?? [input.source]);
      if (sensitive) {
        return {
          status: "rejected",
          message: `Refusing to store memory from sensitive reference: ${sensitive}`,
        };
      }
      if (isSensitiveContent(input.content)) {
        return {
          status: "rejected",
          message: "Refusing to store memory containing credential-like content.",
        };
      }

      const now = new Date().toISOString();
      const memory: MemoryRecord = {
        id: `memory-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
        scope: input.scope,
        content: input.content.trim(),
        source: input.source,
        tags: input.tags ?? [],
        references: input.references ?? [],
        createdAt: now,
        updatedAt: now,
      };
      memories.push(memory);
      return { status: "stored", memory };
    },
    async recall(input) {
      const tokens = tokenize(input.query);
      const scored = memories
        .filter((memory) => !input.scope || memory.scope === input.scope)
        .map((memory) => ({ memory, score: scoreMemory(memory, tokens) }))
        .filter((item) => item.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || right.memory.updatedAt.localeCompare(left.memory.updatedAt),
        );
      return scored.slice(0, input.limit ?? 6).map((item) => item.memory);
    },
    async listMemories(scope) {
      return memories
        .filter((memory) => !scope || memory.scope === scope)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
  };
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
    `${memory.content} ${memory.tags.join(" ")} ${memory.references.join(" ")}`.toLowerCase();
  return queryTokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
}

function formatSection(label: string, items?: string[]): string {
  if (!items || items.length === 0) {
    return "";
  }
  return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}
