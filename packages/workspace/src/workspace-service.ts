import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export type ProjectSummary = {
  root: string;
  hasReadme: boolean;
  packageManager: string;
  apps: string[];
  packages: string[];
  docs: string[];
  importantFiles: string[];
};

export type ListFilesOptions = {
  limit?: number;
  maxDepth?: number;
};

export type WorkspaceService = {
  summarizeProject(): Promise<ProjectSummary>;
  listFiles(options?: ListFilesOptions): Promise<string[]>;
  readTextFile(relativePath: string): Promise<string>;
  suggestCommands(message: string): string[];
};

const ignoredNames = new Set([
  ".ego",
  ".git",
  ".claude",
  "coverage",
  "dist",
  "node_modules",
  "tsconfig.tsbuildinfo",
]);

export function createWorkspaceService(workspaceRoot: string): WorkspaceService {
  const root = resolve(workspaceRoot);

  return {
    async summarizeProject(): Promise<ProjectSummary> {
      const packageJson = await readJsonObject(resolve(root, "package.json"));
      const importantFiles = await findExisting(root, [
        "README.md",
        "package.json",
        "pnpm-workspace.yaml",
        "docs/XH-202609_具备自主决策能力的通用网络安全智能体.md",
      ]);

      return {
        root,
        hasReadme: importantFiles.includes("README.md"),
        packageManager: readString(packageJson.packageManager, "unknown"),
        apps: await listDirectoryNames(root, "apps"),
        packages: await listDirectoryNames(root, "packages"),
        docs: await listMarkdownFiles(resolve(root, "docs"), 12),
        importantFiles,
      };
    },

    async listFiles(options: ListFilesOptions = {}): Promise<string[]> {
      const limit = options.limit ?? 200;
      const maxDepth = options.maxDepth ?? 5;
      const files: string[] = [];

      await walkFiles(root, 0, maxDepth, files, limit, root);
      return files;
    },

    async readTextFile(relativePath: string): Promise<string> {
      const target = assertInsideWorkspace(root, relativePath);
      const contents = await readFile(target, "utf8");

      return contents.slice(0, 64_000);
    },

    suggestCommands(message: string): string[] {
      const normalized = message.toLowerCase();
      if (
        normalized.includes("构建") ||
        normalized.includes("build") ||
        normalized.includes("编译")
      ) {
        return uniqueCommands(["pnpm typecheck", "pnpm build", "pnpm test"]);
      }
      if (normalized.includes("测试") || normalized.includes("test")) {
        return uniqueCommands(["pnpm test", "pnpm typecheck", "pnpm format:check"]);
      }
      if (
        normalized.includes("格式") ||
        normalized.includes("format") ||
        normalized.includes("lint")
      ) {
        return uniqueCommands(["pnpm lint", "pnpm format:check", "pnpm typecheck"]);
      }

      return ["pnpm typecheck", "pnpm test", "pnpm format:check"];
    },
  };
}

function assertInsideWorkspace(root: string, relativePath: string): string {
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to read a path outside the workspace: ${relativePath}`);
  }

  return target;
}

async function walkFiles(
  directory: string,
  depth: number,
  maxDepth: number,
  files: string[],
  limit: number,
  root: string,
): Promise<void> {
  if (files.length >= limit || depth > maxDepth) {
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    if (files.length >= limit || ignoredNames.has(entry.name)) {
      continue;
    }

    const absolute = resolve(directory, entry.name);
    files.push(toWorkspacePath(root, absolute));
  }

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    if (files.length >= limit || ignoredNames.has(entry.name)) {
      continue;
    }

    await walkFiles(resolve(directory, entry.name), depth + 1, maxDepth, files, limit, root);
  }
}

async function listDirectoryNames(root: string, child: string): Promise<string[]> {
  try {
    const entries = await readdir(resolve(root, child), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !ignoredNames.has(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listMarkdownFiles(directory: string, limit: number): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function findExisting(root: string, candidates: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const candidate of candidates) {
    try {
      await stat(resolve(root, candidate));
      existing.push(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return existing;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function toWorkspacePath(root: string, absolute: string): string {
  return relative(root, absolute).replaceAll("\\", "/");
}

function uniqueCommands(commands: string[]): string[] {
  return [...new Set(commands)];
}
