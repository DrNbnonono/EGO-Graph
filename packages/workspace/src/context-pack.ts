import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createWorkspaceService, type ProjectSummary } from "./workspace-service.js";

export type RepoMapEntry = {
  path: string;
  kind: "app" | "package" | "doc" | "config" | "source" | "test" | "other";
  score: number;
  reason: string;
};

export type PackedContextFile = {
  path: string;
  score: number;
  reason: string;
  content: string;
  truncated: boolean;
  originalChars: number;
};

export type WorkspaceContextPack = {
  summary: ProjectSummary;
  query: string;
  repoMap: RepoMapEntry[];
  selectedFiles: PackedContextFile[];
  recentEventsSummary: string[];
  budget: {
    maxFiles: number;
    maxCharsPerFile: number;
    totalChars: number;
  };
};

export type CreateContextPackInput = {
  workspaceRoot: string;
  query: string;
  recentEvents?: string[];
  maxFiles?: number;
  maxCharsPerFile?: number;
};

export async function createWorkspaceContextPack(
  input: CreateContextPackInput,
): Promise<WorkspaceContextPack> {
  const workspace = createWorkspaceService(input.workspaceRoot);
  const [summary, files] = await Promise.all([
    workspace.summarizeProject(),
    workspace.listFiles({ limit: 500, maxDepth: 6 }),
  ]);
  const repoMap = rankRepoFiles(files, input.query, summary).slice(0, 80);
  const maxFiles = input.maxFiles ?? 8;
  const maxCharsPerFile = input.maxCharsPerFile ?? 8_000;
  const selectedFiles: PackedContextFile[] = [];

  for (const entry of repoMap) {
    if (selectedFiles.length >= maxFiles || !isPackableTextFile(entry.path)) {
      continue;
    }
    try {
      const absolute = resolve(input.workspaceRoot, entry.path);
      const info = await stat(absolute);
      if (!info.isFile() || info.size > 512_000) {
        continue;
      }
      const content = await readFile(absolute, "utf8");
      selectedFiles.push({
        path: entry.path,
        score: entry.score,
        reason: entry.reason,
        content: compressText(content, maxCharsPerFile),
        truncated: content.length > maxCharsPerFile,
        originalChars: content.length,
      });
    } catch {
      // Ignore unreadable/binary files; the context pack is best-effort.
    }
  }

  return {
    summary,
    query: input.query,
    repoMap,
    selectedFiles,
    recentEventsSummary: compactRecentEvents(input.recentEvents ?? []),
    budget: {
      maxFiles,
      maxCharsPerFile,
      totalChars: selectedFiles.reduce((total, file) => total + file.content.length, 0),
    },
  };
}

export function rankRepoFiles(
  files: string[],
  query: string,
  summary?: ProjectSummary,
): RepoMapEntry[] {
  const tokens = tokenize(query);
  return files
    .map((path) => {
      const kind = classifyRepoPath(path);
      const lower = path.toLowerCase();
      let score = kindScore(kind);
      const reasons: string[] = [kind];
      for (const token of tokens) {
        if (lower.includes(token)) {
          score += 5;
          reasons.push(`matches:${token}`);
        }
      }
      if (summary?.importantFiles.includes(path)) {
        score += 10;
        reasons.push("important");
      }
      if (basename(path).toLowerCase() === "readme.md" && tokens.includes("readme")) {
        score += 8;
        reasons.push("readme");
      }
      return { path, kind, score, reason: reasons.join(", ") };
    })
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

export function compressText(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  const tail = Math.max(20, Math.floor(maxChars * 0.25));
  const marker = `\n[...compressed ${content.length} chars...]\n`;
  const head = Math.max(20, maxChars - tail - marker.length);
  return [
    content.slice(0, head).trimEnd(),
    "",
    `[...compressed ${content.length - head - tail} chars...]`,
    "",
    content.slice(Math.max(head, content.length - tail)).trimStart(),
  ].join("\n");
}

function compactRecentEvents(events: string[]): string[] {
  return events
    .map((event) => event.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .slice(-12);
}

function classifyRepoPath(path: string): RepoMapEntry["kind"] {
  if (path.startsWith("apps/")) return "app";
  if (path.startsWith("packages/")) return "package";
  if (path.startsWith("docs/") || path.endsWith(".md")) return "doc";
  if (/(^|\/)(package\.json|tsconfig\.json|pnpm-workspace\.yaml|vitest\.config\.ts)$/u.test(path)) {
    return "config";
  }
  if (/(\.test\.|\/test\/|\.spec\.)/u.test(path)) return "test";
  if ([".ts", ".tsx", ".js", ".mjs", ".cjs"].includes(extname(path))) return "source";
  return "other";
}

function kindScore(kind: RepoMapEntry["kind"]): number {
  return {
    app: 6,
    package: 7,
    doc: 5,
    config: 8,
    source: 6,
    test: 4,
    other: 1,
  }[kind];
}

function isPackableTextFile(path: string): boolean {
  return [".md", ".json", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".yaml", ".yml", ".txt"].includes(
    extname(path),
  );
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((token) => token.length > 1)
    .slice(0, 12);
}
