/**
 * Git service: typed wrappers around common git CLI operations.
 *
 * All methods execute `git` via `execFile` in the workspace directory.
 * Outputs are parsed into structured TypeScript types.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────────

export type GitFileStatus = {
  /** Porcelain v2 XY status code, e.g. "M.", "??", "A." */
  statusCode: string;
  /** File path relative to workspace root. */
  path: string;
  /** Human-readable label. */
  label: string;
};

export type GitLogEntry = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
};

export type GitBranchInfo = {
  name: string;
  isCurrent: boolean;
};

export type GitCommitResult = {
  commitHash: string;
  summary: string;
};

export type GitDiffOptions = {
  staged?: boolean;
  files?: string[];
  contextLines?: number;
};

export type GitLogOptions = {
  limit?: number;
};

// ── Service ────────────────────────────────────────────────────────────────

export type GitService = {
  status(): Promise<GitFileStatus[]>;
  diff(options?: GitDiffOptions): Promise<string>;
  log(options?: GitLogOptions): Promise<GitLogEntry[]>;
  stage(files: string[]): Promise<void>;
  commit(message: string): Promise<GitCommitResult>;
  listBranches(): Promise<GitBranchInfo[]>;
  currentBranch(): Promise<string>;
  createBranch(name: string): Promise<void>;
  suggestCommitMessage(diff: string): string;
};

export function createGitService(workspaceRoot: string): GitService {
  async function git(args: string[], maxBuffer = 4_000_000): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: workspaceRoot,
      maxBuffer,
      timeout: 30_000,
    });
    return stdout;
  }

  return {
    async status(): Promise<GitFileStatus[]> {
      const output = await git(["status", "--porcelain=v1"]);
      const lines = output.split("\n").filter((line) => line.length > 0);
      return lines.map((line) => {
        const statusCode = line.slice(0, 2).trim();
        const path = line.slice(3).trim();
        return { statusCode, path, label: statusLabel(statusCode) };
      });
    },

    async diff(options?: GitDiffOptions): Promise<string> {
      const args = ["diff", "--no-color"];
      if (options?.staged) args.push("--cached");
      if (options?.contextLines !== undefined) args.push(`-U${options.contextLines}`);
      if (options?.files?.length) {
        args.push("--", ...options.files);
      }
      return git(args);
    },

    async log(options?: GitLogOptions): Promise<GitLogEntry[]> {
      const limit = options?.limit ?? 20;
      const output = await git([
        "log",
        `--max-count=${limit}`,
        "--format=%H|%h|%s|%an|%aI",
      ]);
      return output
        .split("\n")
        .filter((line) => line.includes("|"))
        .map((line) => {
          const parts = line.split("|");
          return {
            hash: parts[0] ?? "",
            shortHash: parts[1] ?? "",
            subject: parts[2] ?? "",
            author: parts[3] ?? "",
            date: parts[4] ?? "",
          };
        });
    },

    async stage(files: string[]): Promise<void> {
      await git(["add", "--", ...files]);
    },

    async commit(message: string): Promise<GitCommitResult> {
      const output = await git(["commit", "-m", message]);
      const hashMatch = output.match(/\[.*\s+([a-f0-9]+)\]/);
      return {
        commitHash: hashMatch?.[1] ?? "unknown",
        summary: output.split("\n")[0] ?? message,
      };
    },

    async listBranches(): Promise<GitBranchInfo[]> {
      const output = await git(["branch", "--list", "--no-color"]);
      return output
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const isCurrent = line.startsWith("*");
          const name = line.replace(/^\*?\s+/, "").trim();
          return { name, isCurrent };
        });
    },

    async currentBranch(): Promise<string> {
      const output = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
      return output.trim();
    },

    async createBranch(name: string): Promise<void> {
      await git(["checkout", "-b", name]);
    },

    suggestCommitMessage(diff: string): string {
      return generateCommitSuggestion(diff);
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusLabel(code: string): string {
  switch (code) {
    case "M": return "modified";
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    case "??": return "untracked";
    case "!!": return "ignored";
    case "U": return "unmerged";
    default: return code || "unknown";
  }
}

/**
 * Generate a simple commit message suggestion from diff content.
 * This is a pure string analysis — no LLM call.
 */
function generateCommitSuggestion(diff: string): string {
  const lines = diff.split("\n");
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/") || line.startsWith("--- a/")) {
      const file = line.slice(6);
      if (file !== "/dev/null") files.add(file);
    }
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }

  const fileCount = files.size;
  const fileList = [...files].slice(0, 3).join(", ");

  if (fileCount === 0) return "update: minor changes";
  if (fileCount === 1) {
    const file = fileList;
    if (additions > deletions * 3) return `feat: update ${file}`;
    if (deletions > additions * 3) return `refactor: simplify ${file}`;
    return `update: modify ${file}`;
  }

  return `update: modify ${fileCount} files (${fileList}${fileCount > 3 ? ", ..." : ""})`;
}
