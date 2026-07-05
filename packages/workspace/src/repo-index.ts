import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const DEFAULT_IGNORES = new Set([
  ".ego",
  ".git",
  ".zread",
  "coverage",
  "dist",
  "node_modules",
  "reports",
]);

const SECRET_FILE_PATTERNS = [/^\.env($|\.)/, /private[-_]?key/i, /id_rsa/i, /\.pem$/i, /\.key$/i];

export type RepoFileKind = "source" | "test" | "config" | "doc" | "data" | "asset" | "unknown";

export type RepoFileIndex = {
  path: string;
  kind: RepoFileKind;
  language: string;
  size: number;
  mtimeMs: number;
  hash: string;
  summary: string;
};

export type RepoIndex = {
  workspaceRoot: string;
  generatedAt: string;
  files: RepoFileIndex[];
};

export type BuildRepoIndexOptions = {
  cache?: boolean;
  maxFiles?: number;
  maxBytesPerFile?: number;
};

export async function buildRepoIndex(
  workspaceRoot: string,
  options: BuildRepoIndexOptions = {},
): Promise<RepoIndex> {
  const root = resolve(workspaceRoot);
  const maxFiles = options.maxFiles ?? 2_000;
  const maxBytesPerFile = options.maxBytesPerFile ?? 96_000;
  const cached =
    options.cache !== false ? await readCachedIndex(root).catch(() => undefined) : undefined;
  const entries = await walkRepo(root, maxFiles);
  const files: RepoFileIndex[] = [];

  for (const absolutePath of entries) {
    const info = await stat(absolutePath).catch(() => undefined);
    if (!info?.isFile() || info.size > maxBytesPerFile) {
      continue;
    }
    const path = toWorkspacePath(root, absolutePath);
    const previous = cached?.files.find(
      (file) => file.path === path && file.size === info.size && file.mtimeMs === info.mtimeMs,
    );
    if (previous) {
      files.push(previous);
      continue;
    }
    const content = await readFile(absolutePath, "utf8").catch(() => "");
    if (looksSecretLike(path, content)) {
      continue;
    }
    files.push({
      path,
      kind: classifyFile(path),
      language: detectLanguage(path),
      size: info.size,
      mtimeMs: info.mtimeMs,
      hash: createHash("sha256").update(content).digest("hex").slice(0, 16),
      summary: summarizeFile(path, content),
    });
  }

  const index: RepoIndex = {
    workspaceRoot: root,
    generatedAt: new Date().toISOString(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };

  if (options.cache !== false) {
    await writeCachedIndex(root, index).catch(() => undefined);
  }
  return index;
}

export function classifyFile(path: string): RepoFileKind {
  const lower = path.toLowerCase();
  if (/(^|\/)(test|tests|__tests__)\//.test(lower) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(lower)) {
    return "test";
  }
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php)$/.test(lower)) {
    return "source";
  }
  if (
    /^(package|tsconfig|eslint|vite|vitest|pnpm|ego\.config)|\.(json|ya?ml|toml|ini)$/.test(lower)
  ) {
    return "config";
  }
  if (/\.(md|mdx|txt|rst)$/.test(lower)) {
    return "doc";
  }
  if (/\.(jsonl|csv|xml|pcap|har)$/.test(lower)) {
    return "data";
  }
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(lower)) {
    return "asset";
  }
  return "unknown";
}

export function detectLanguage(path: string): string {
  const ext = extname(path).replace(/^\./, "");
  const map: Record<string, string> = {
    cjs: "javascript",
    js: "javascript",
    jsx: "javascript-react",
    json: "json",
    jsonl: "jsonl",
    md: "markdown",
    mjs: "javascript",
    ts: "typescript",
    tsx: "typescript-react",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? (ext || "unknown");
}

export function looksSecretLike(path: string, content: string): boolean {
  if (SECRET_FILE_PATTERNS.some((pattern) => pattern.test(path))) {
    return true;
  }
  return /(api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i.test(content);
}

async function walkRepo(root: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (DEFAULT_IGNORES.has(entry.name)) {
        continue;
      }
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
      if (files.length >= maxFiles) {
        break;
      }
    }
  }
  await visit(root);
  return files;
}

function summarizeFile(path: string, content: string): string {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const firstMeaningful = lines.find((line) => !line.trim().startsWith("//"))?.trim() ?? "";
  return `${classifyFile(path)} ${detectLanguage(path)} file; ${lines.length} non-empty line(s); ${firstMeaningful.slice(0, 160)}`;
}

async function readCachedIndex(root: string): Promise<RepoIndex> {
  const raw = await readFile(resolve(root, ".ego/cache/repo-index.json"), "utf8");
  return JSON.parse(raw) as RepoIndex;
}

async function writeCachedIndex(root: string, index: RepoIndex): Promise<void> {
  const path = resolve(root, ".ego/cache/repo-index.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(index, null, 2), "utf8");
}

function toWorkspacePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}
