/**
 * Git tools: agent-callable wrappers around the GitService.
 *
 * Each tool follows the `ToolDefinition` contract so it can be registered
 * in the terminal-agent tool registry alongside workspace, shell, and
 * security tools.
 */
import { z } from "zod";
import { createGitService, type GitFileStatus, type GitLogEntry } from "@ego-graph/workspace";
import type { ToolDefinition } from "./tool-definition.js";

// ── Schemas ────────────────────────────────────────────────────────────────

const gitStatusInputSchema = z.object({});

const gitStatusOutputSchema = z.object({
  files: z.array(
    z.object({
      statusCode: z.string(),
      path: z.string(),
      label: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

const gitDiffInputSchema = z.object({
  staged: z.boolean().optional().describe("Show staged (cached) diff instead of unstaged."),
  files: z.array(z.string()).optional().describe("Limit diff to specific files."),
  contextLines: z.number().int().min(0).max(10).optional().describe("Context lines around changes."),
});

const gitDiffOutputSchema = z.object({
  diff: z.string(),
  findings: z.array(z.string()),
});

const gitLogInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("Max number of commits."),
});

const gitLogOutputSchema = z.object({
  entries: z.array(
    z.object({
      hash: z.string(),
      shortHash: z.string(),
      subject: z.string(),
      author: z.string(),
      date: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

const gitBranchInputSchema = z.object({
  action: z.enum(["list", "create"]).describe("'list' to show branches, 'create' to create one."),
  name: z.string().optional().describe("Branch name (required for 'create' action)."),
});

const gitBranchOutputSchema = z.object({
  branches: z.array(
    z.object({
      name: z.string(),
      isCurrent: z.boolean(),
    }),
  ),
  currentBranch: z.string(),
  findings: z.array(z.string()),
});

const gitCommitInputSchema = z.object({
  message: z.string().min(1).describe("Commit message."),
  files: z.array(z.string()).optional().describe("Files to stage before commit. If omitted, uses current index."),
});

const gitCommitOutputSchema = z.object({
  commitHash: z.string(),
  summary: z.string(),
  findings: z.array(z.string()),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export function createGitStatusTool(): ToolDefinition<typeof gitStatusInputSchema, typeof gitStatusOutputSchema> {
  return {
    name: "git.status",
    description: "Show the working tree status (git status --porcelain).",
    inputSchema: gitStatusInputSchema,
    outputSchema: gitStatusOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(_input, context) {
      const git = createGitService(context.workspaceRoot);
      const files: GitFileStatus[] = await git.status();
      const summary = files.length === 0
        ? "Working tree clean."
        : `${files.length} file(s) changed: ${files.map((f: GitFileStatus) => `${f.label} ${f.path}`).join(", ")}`;
      return { files, findings: [summary] };
    },
    evidenceMapper(output) {
      return output.findings.map((s) => ({ summary: s, kind: "artifact", confidence: 0.9 }));
    },
  };
}

export function createGitDiffTool(): ToolDefinition<typeof gitDiffInputSchema, typeof gitDiffOutputSchema> {
  return {
    name: "git.diff",
    description: "Show git diff. Supports staged/unstaged and file filtering.",
    inputSchema: gitDiffInputSchema,
    outputSchema: gitDiffOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const git = createGitService(context.workspaceRoot);
      const options: Parameters<typeof git.diff>[0] = {};
      if (input.staged !== undefined) options.staged = input.staged;
      if (input.files !== undefined) options.files = input.files;
      if (input.contextLines !== undefined) options.contextLines = input.contextLines;
      const diff = await git.diff(options);
      const lineCount = diff.split("\n").length;
      return {
        diff: diff.slice(0, 32_000),
        findings: [`Diff: ${lineCount} line(s)${input.staged ? " (staged)" : ""}`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((s) => ({ summary: s, kind: "artifact", confidence: 0.9 }));
    },
  };
}

export function createGitLogTool(): ToolDefinition<typeof gitLogInputSchema, typeof gitLogOutputSchema> {
  return {
    name: "git.log",
    description: "Show recent git commit log.",
    inputSchema: gitLogInputSchema,
    outputSchema: gitLogOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const git = createGitService(context.workspaceRoot);
      const entries: GitLogEntry[] = await git.log({ limit: input.limit ?? 20 });
      return {
        entries,
        findings: [`Recent ${entries.length} commit(s): ${entries.slice(0, 3).map((e: GitLogEntry) => e.shortHash).join(", ")}`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((s) => ({ summary: s, kind: "artifact", confidence: 0.9 }));
    },
  };
}

export function createGitBranchTool(): ToolDefinition<typeof gitBranchInputSchema, typeof gitBranchOutputSchema> {
  return {
    name: "git.branch",
    description: "List branches or create a new branch.",
    inputSchema: gitBranchInputSchema,
    outputSchema: gitBranchOutputSchema,
    permission: { scope: "file", risk: "medium", requiresSandbox: false },
    riskLevel: "medium",
    sandboxProfile: "process",
    timeoutMs: 15_000,
    async execute(input, context) {
      const git = createGitService(context.workspaceRoot);
      if (input.action === "create") {
        if (!input.name) throw new Error("Branch name is required for 'create' action.");
        await git.createBranch(input.name);
        const branches = await git.listBranches();
        const currentBranch = await git.currentBranch();
        return {
          branches,
          currentBranch,
          findings: [`Created and switched to branch: ${input.name}`],
        };
      }
      const branches = await git.listBranches();
      const currentBranch = await git.currentBranch();
      return {
        branches,
        currentBranch,
        findings: [`Current branch: ${currentBranch}, ${branches.length} branch(es)`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((s) => ({ summary: s, kind: "artifact", confidence: 0.85 }));
    },
  };
}

export function createGitCommitTool(): ToolDefinition<typeof gitCommitInputSchema, typeof gitCommitOutputSchema> {
  return {
    name: "git.commit",
    description: "Stage files and create a git commit. Requires approval.",
    inputSchema: gitCommitInputSchema,
    outputSchema: gitCommitOutputSchema,
    permission: { scope: "file", risk: "medium", requiresSandbox: false },
    riskLevel: "medium",
    sandboxProfile: "process",
    timeoutMs: 30_000,
    requiresApproval: true,
    async execute(input, context) {
      const git = createGitService(context.workspaceRoot);
      if (input.files?.length) {
        await git.stage(input.files);
      }
      const result = await git.commit(input.message);
      return {
        commitHash: result.commitHash,
        summary: result.summary,
        findings: [`Committed: ${result.commitHash} — ${result.summary}`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((s) => ({
        summary: s,
        kind: "decision_trace",
        confidence: 0.95,
        raw: { commitHash: output.commitHash },
      }));
    },
  };
}
