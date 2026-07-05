import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildDependencyGraph, type DependencyGraph } from "./dependency-graph.js";
import {
  buildRepoIndex,
  looksSecretLike,
  type RepoFileIndex,
  type RepoIndex,
} from "./repo-index.js";
import { buildSymbolIndex, type SymbolIndexEntry } from "./symbol-index.js";
import { buildTestMapping, type TestMapping } from "./test-mapping.js";

export type TaskContextInput = {
  workspaceRoot: string;
  goal: string;
  intent: string;
  recentEvents?: string[];
  memoryHits?: string[];
  changedFiles?: string[];
  tokenBudget?: number;
};

export type TaskContext = {
  repoIndex: RepoIndex;
  selectedFiles: RepoFileIndex[];
  selectedSymbols: SymbolIndexEntry[];
  relevantTests: string[];
  snippets: Array<{
    path: string;
    startLine: number;
    endLine: number;
    content: string;
    reason: string;
  }>;
  dependencyGraph: DependencyGraph;
  testMapping: TestMapping;
  explanation: string[];
  budget: { requestedTokens: number; estimatedTokens: number };
};

export async function createContextForTask(input: TaskContextInput): Promise<TaskContext> {
  const budget = input.tokenBudget ?? 8_000;
  const repoIndex = await buildRepoIndex(input.workspaceRoot);
  const symbols = await buildSymbolIndex(input.workspaceRoot, repoIndex);
  const dependencyGraph = await buildDependencyGraph(input.workspaceRoot, repoIndex);
  const testMapping = buildTestMapping(repoIndex);
  const terms = tokenize(
    [input.goal, input.intent, ...(input.memoryHits ?? []), ...(input.recentEvents ?? [])].join(
      " ",
    ),
  );
  const selectedFiles = rankFiles(repoIndex.files, terms, input.changedFiles ?? []).slice(0, 12);
  const selectedSymbols = symbols
    .filter((symbol) => selectedFiles.some((file) => file.path === symbol.file))
    .slice(0, 80);
  const relevantTests = [
    ...new Set(
      selectedFiles.flatMap(
        (file) =>
          testMapping.sourceToTests.find((mapping) => mapping.source === file.path)?.tests ?? [],
      ),
    ),
  ].slice(0, 10);
  const snippets: TaskContext["snippets"] = [];
  let estimatedTokens = 0;
  for (const file of selectedFiles) {
    if (estimatedTokens >= budget) {
      break;
    }
    const raw = await readFile(resolve(input.workspaceRoot, file.path), "utf8").catch(() => "");
    if (!raw || looksSecretLike(file.path, raw)) {
      continue;
    }
    const snippet = compressContent(raw, Math.max(800, Math.floor((budget - estimatedTokens) * 3)));
    estimatedTokens += estimateTokens(snippet);
    snippets.push({
      path: file.path,
      startLine: 1,
      endLine: snippet.split(/\r?\n/).length,
      content: snippet,
      reason: file.summary,
    });
  }
  return {
    repoIndex,
    selectedFiles,
    selectedSymbols,
    relevantTests,
    snippets,
    dependencyGraph,
    testMapping,
    explanation: [
      `Selected ${selectedFiles.length} files by task terms, changed-file boost, and test proximity.`,
      `Filtered secret-like files and ignored .git/node_modules/dist/.ego.`,
      `Packed ${snippets.length} snippets within an estimated ${estimatedTokens}/${budget} token budget.`,
    ],
    budget: { requestedTokens: budget, estimatedTokens },
  };
}

function rankFiles(
  files: RepoFileIndex[],
  terms: string[],
  changedFiles: string[],
): RepoFileIndex[] {
  return files
    .map((file) => ({
      file,
      score:
        terms.reduce((total, term) => total + (file.path.toLowerCase().includes(term) ? 6 : 0), 0) +
        terms.reduce(
          (total, term) => total + (file.summary.toLowerCase().includes(term) ? 2 : 0),
          0,
        ) +
        (changedFiles.includes(file.path) ? 10 : 0) +
        (file.kind === "source" ? 3 : 0) +
        (file.kind === "test" ? 2 : 0) +
        (file.path === "README.md" ? 2 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .map((item) => item.file);
}

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fa5_-]+/u)
        .filter((term) => term.length > 1),
    ),
  ];
}

function compressContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  const head = content.slice(0, Math.floor(maxChars * 0.65));
  const tail = content.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n\n/* ... compressed long file ... */\n\n${tail}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
