import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./tool-definition.js";
import { ToolRegistry } from "./tool-registry.js";
import {
  createLspDefinitionTool,
  createLspDiagnosticsTool,
  createLspReferencesTool,
} from "./lsp-tools.js";

const execFileAsync = promisify(execFile);

const listInputSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  maxDepth: z.number().int().min(0).max(8).optional(),
});

const listOutputSchema = z.object({
  files: z.array(z.string()),
  findings: z.array(z.string()),
});

const readInputSchema = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().min(256).max(128_000).optional(),
});

const readOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  truncated: z.boolean(),
  findings: z.array(z.string()),
});

const grepInputSchema = z.object({
  query: z.string().min(1),
  regex: z.boolean().optional().describe("Treat the query as a regular expression."),
  ignoreCase: z.boolean().optional().describe("Case-insensitive matching."),
  contextBefore: z.number().int().min(0).max(5).optional().describe("Lines of context before each match."),
  contextAfter: z.number().int().min(0).max(5).optional().describe("Lines of context after each match."),
  limit: z.number().int().min(1).max(100).optional(),
});

const grepOutputSchema = z.object({
  query: z.string(),
  regex: z.boolean(),
  matches: z.array(
    z.object({
      path: z.string(),
      line: z.number().int().positive(),
      text: z.string(),
      context: z.string().optional().describe("Snippet spanning before+match+after lines, if contextBefore or contextAfter was requested."),
    }),
  ),
  findings: z.array(z.string()),
});

const shellReadonlyInputSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(250).max(120_000).optional(),
});

const shellReadonlyOutputSchema = z.object({
  command: z.string(),
  status: z.enum(["passed", "failed"]),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  findings: z.array(z.string()),
});

const evidenceWriteInputSchema = z.object({
  summary: z.string().min(1),
  source: z.string().min(1).default("terminal-agent"),
  raw: z.record(z.unknown()).optional(),
});

const evidenceWriteOutputSchema = z.object({
  summary: z.string(),
  source: z.string(),
  findings: z.array(z.string()),
  raw: z.record(z.unknown()),
});

const manifestAuditInputSchema = z.object({
  manifestPath: z.string().min(1).default("package.json"),
  includeDevDependencies: z.boolean().default(true),
});

const manifestAuditOutputSchema = z.object({
  manifestPath: z.string(),
  dependencyCount: z.number().int().nonnegative(),
  findings: z.array(z.string()),
  dependencies: z.array(
    z.object({
      name: z.string(),
      version: z.string(),
      section: z.string(),
      risk: z.enum(["info", "low", "medium", "high"]),
      reason: z.string(),
    }),
  ),
});

const semgrepInputSchema = z.object({
  path: z.string().min(1).default("."),
  config: z.string().min(1).default("p/typescript"),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(60_000),
});

const semgrepOutputSchema = z.object({
  command: z.string(),
  status: z.enum(["passed", "failed", "unavailable"]),
  exitCode: z.number().int(),
  findings: z.array(z.string()),
  results: z.array(z.record(z.unknown())),
  stdout: z.string(),
  stderr: z.string(),
});

export type TerminalAgentToolRegistry = ToolRegistry;

export function createTerminalAgentToolRegistry(): TerminalAgentToolRegistry {
  const registry = new ToolRegistry();
  registry.register(createWorkspaceListTool());
  registry.register(createWorkspaceReadTool());
  registry.register(createWorkspaceGrepTool());
  registry.register(createShellReadonlyTool());
  registry.register(createCheckTool("check.typecheck", "pnpm typecheck", ["typecheck"]));
  registry.register(createCheckTool("check.test", "pnpm test", ["test"]));
  registry.register(createEvidenceWriteTool());
  registry.register(createSecurityManifestAuditTool());
  registry.register(createSecuritySemgrepTool());
  registry.register(createWorkspaceGlobTool());
  registry.register(createShellWriteTool());
  registry.register(createLspDiagnosticsTool());
  registry.register(createLspDefinitionTool());
  registry.register(createLspReferencesTool());
  return registry;
}

export function createWorkspaceListTool(): ToolDefinition<
  typeof listInputSchema,
  typeof listOutputSchema
> {
  return {
    name: "workspace.list",
    description: "List non-ignored workspace files for context gathering.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const files = await listWorkspaceFiles(
        context.workspaceRoot,
        input.limit ?? 80,
        input.maxDepth ?? 4,
      );
      return {
        files,
        findings: [`Listed ${files.length} workspace file(s) for context.`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "decision_trace",
        confidence: 0.8,
        raw: { files: output.files.slice(0, 20) },
      }));
    },
  };
}

export function createWorkspaceReadTool(): ToolDefinition<
  typeof readInputSchema,
  typeof readOutputSchema
> {
  return {
    name: "workspace.read",
    description: "Read a text file inside the workspace.",
    inputSchema: readInputSchema,
    outputSchema: readOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const target = resolveWorkspacePath(context.workspaceRoot, input.path);
      const maxBytes = input.maxBytes ?? 16_000;
      const content = await readFile(target, "utf8");
      const truncated = Buffer.byteLength(content, "utf8") > maxBytes;
      const visible = truncated ? content.slice(0, maxBytes) : content;
      return {
        path: toWorkspacePath(context.workspaceRoot, target),
        content: visible,
        truncated,
        findings: [
          `Read ${toWorkspacePath(context.workspaceRoot, target)} (${visible.length} chars).`,
        ],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "artifact",
        confidence: 0.9,
        raw: { path: output.path, truncated: output.truncated },
      }));
    },
  };
}

export function createWorkspaceGrepTool(): ToolDefinition<
  typeof grepInputSchema,
  typeof grepOutputSchema
> {
  return {
    name: "workspace.grep",
    description:
      "Search workspace text files. Supports literal or regex queries with optional " +
      "case-insensitive matching and context lines (before/after).",
    inputSchema: grepInputSchema,
    outputSchema: grepOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const matches = await grepWorkspace({
        workspaceRoot: context.workspaceRoot,
        query: input.query,
        regex: input.regex ?? false,
        ignoreCase: input.ignoreCase ?? false,
        contextBefore: input.contextBefore ?? 0,
        contextAfter: input.contextAfter ?? 0,
        limit: input.limit ?? 30,
      });
      return {
        query: input.query,
        regex: input.regex ?? false,
        matches,
        findings:
          matches.length > 0
            ? [`Found ${matches.length} match(es) for "${input.query}".`]
            : [`No matches found for "${input.query}".`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "fact",
        confidence: 0.75,
        raw: { query: output.query, matches: output.matches.slice(0, 10) },
      }));
    },
  };
}

export function createShellReadonlyTool(): ToolDefinition<
  typeof shellReadonlyInputSchema,
  typeof shellReadonlyOutputSchema
> {
  return {
    name: "shell.readonly",
    description: "Run a whitelisted read-only shell command.",
    inputSchema: shellReadonlyInputSchema,
    outputSchema: shellReadonlyOutputSchema,
    permission: { scope: "file", risk: "medium", requiresSandbox: false },
    riskLevel: "medium",
    sandboxProfile: "process",
    timeoutMs: 120_000,
    async execute(input, context) {
      assertReadonlyCommand(input.command, input.args ?? []);
      return runReadonlyCommand(
        context.workspaceRoot,
        input.command,
        input.args ?? [],
        input.timeoutMs,
      );
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "artifact",
        confidence: output.status === "passed" ? 0.85 : 0.55,
        raw: { command: output.command, exitCode: output.exitCode },
      }));
    },
  };
}

export function createCheckTool(
  name: "check.typecheck" | "check.test",
  commandLabel: string,
  args: string[],
): ToolDefinition<typeof listInputSchema, typeof shellReadonlyOutputSchema> {
  return {
    name,
    description: `Run ${commandLabel} as a controlled verification command.`,
    inputSchema: listInputSchema,
    outputSchema: shellReadonlyOutputSchema,
    permission: { scope: "file", risk: "medium", requiresSandbox: false },
    riskLevel: "medium",
    sandboxProfile: "process",
    timeoutMs: 120_000,
    async execute(_input, context) {
      return runReadonlyCommand(context.workspaceRoot, "pnpm", args, 120_000);
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "artifact",
        confidence: output.status === "passed" ? 0.9 : 0.6,
        raw: { command: output.command, exitCode: output.exitCode },
      }));
    },
  };
}

export function createEvidenceWriteTool(): ToolDefinition<
  typeof evidenceWriteInputSchema,
  typeof evidenceWriteOutputSchema
> {
  return {
    name: "evidence.write",
    description: "Record an evidence board item from the terminal agent.",
    inputSchema: evidenceWriteInputSchema,
    outputSchema: evidenceWriteOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input) {
      return {
        summary: input.summary,
        source: input.source,
        raw: input.raw ?? {},
        findings: [input.summary],
      };
    },
    evidenceMapper(output) {
      return [
        {
          summary: output.summary,
          kind: "fact",
          confidence: 0.8,
          raw: { source: output.source, ...output.raw },
        },
      ];
    },
  };
}

export function createSecurityManifestAuditTool(): ToolDefinition<
  typeof manifestAuditInputSchema,
  typeof manifestAuditOutputSchema
> {
  return {
    name: "security.package_manifest_audit",
    description:
      "Inspect local package manifests for risky dependency declarations inside the authorized workspace.",
    inputSchema: manifestAuditInputSchema,
    outputSchema: manifestAuditOutputSchema,
    permission: { scope: "file", risk: "high", requiresSandbox: false },
    riskLevel: "high",
    sandboxProfile: "process",
    timeoutMs: 15_000,
    requiresApproval: true,
    async execute(input, context) {
      const manifestPath = input.manifestPath;
      const target = resolveWorkspacePath(context.workspaceRoot, manifestPath);
      const raw = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
      const dependencies = collectDependencyRisks(raw, input.includeDevDependencies);
      const findings =
        dependencies.length > 0
          ? dependencies.map(
              (dependency) =>
                `${dependency.risk.toUpperCase()}: ${dependency.name}@${dependency.version} (${dependency.section}) - ${dependency.reason}`,
            )
          : ["No risky dependency declarations found in local manifest."];
      return {
        manifestPath,
        dependencyCount: countDependencies(raw, input.includeDevDependencies),
        findings,
        dependencies,
      };
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "fact",
        confidence: 0.7,
        raw: {
          manifestPath: output.manifestPath,
          dependencyCount: output.dependencyCount,
          dependencies: output.dependencies,
        },
      }));
    },
  };
}

export function createSecuritySemgrepTool(): ToolDefinition<
  typeof semgrepInputSchema,
  typeof semgrepOutputSchema
> {
  return {
    name: "security.semgrep_scan",
    description:
      "Run an installed local semgrep binary against authorized workspace files and return JSON findings.",
    inputSchema: semgrepInputSchema,
    outputSchema: semgrepOutputSchema,
    permission: { scope: "file", risk: "high", requiresSandbox: false },
    riskLevel: "high",
    sandboxProfile: "process",
    timeoutMs: 120_000,
    requiresApproval: true,
    async execute(input, context) {
      const target = resolveWorkspacePath(context.workspaceRoot, input.path);
      const rendered = `semgrep --config ${input.config} --json ${toWorkspacePath(
        context.workspaceRoot,
        target,
      )}`;
      try {
        const result = await execFileAsync(
          "semgrep",
          ["--config", input.config, "--json", toWorkspacePath(context.workspaceRoot, target)],
          {
            cwd: context.workspaceRoot,
            maxBuffer: 4_000_000,
            timeout: input.timeoutMs,
            shell: process.platform === "win32",
          },
        );
        const parsed = parseSemgrepJson(result.stdout);
        return {
          command: rendered,
          status: "passed",
          exitCode: 0,
          stdout: result.stdout,
          stderr: result.stderr,
          results: parsed.results,
          findings: summarizeSemgrepResults(parsed.results),
        };
      } catch (error) {
        const failed = error as {
          code?: string | number;
          exitCode?: number;
          stdout?: string;
          stderr?: string;
        };
        if (failed.code === "ENOENT") {
          return {
            command: rendered,
            status: "unavailable",
            exitCode: 127,
            stdout: "",
            stderr: "semgrep is not installed or not available on PATH",
            results: [],
            findings: ["semgrep unavailable; install semgrep to enable local static scanning."],
          };
        }
        const parsed = parseSemgrepJson(failed.stdout ?? "");
        return {
          command: rendered,
          status: "failed",
          exitCode: failed.exitCode ?? (typeof failed.code === "number" ? failed.code : 1),
          stdout: failed.stdout ?? "",
          stderr: failed.stderr ?? String(error),
          results: parsed.results,
          findings:
            parsed.results.length > 0
              ? summarizeSemgrepResults(parsed.results)
              : [`semgrep failed: ${failed.stderr ?? String(error)}`],
        };
      }
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "fact",
        confidence: output.status === "passed" ? 0.75 : 0.45,
        raw: { command: output.command, status: output.status, results: output.results },
      }));
    },
  };
}

const globInputSchema = z.object({
  pattern: z.string().min(1).describe("Glob pattern, e.g. '**/*.ts' or 'src/*.test.ts'."),
  limit: z.number().int().min(1).max(500).optional(),
});

const globOutputSchema = z.object({
  pattern: z.string(),
  files: z.array(z.string()),
  findings: z.array(z.string()),
});

export function createWorkspaceGlobTool(): ToolDefinition<
  typeof globInputSchema,
  typeof globOutputSchema
> {
  return {
    name: "workspace.glob",
    description:
      "Find workspace files matching a glob pattern (supports **, *, ?). Fast file discovery for targeted context gathering.",
    inputSchema: globInputSchema,
    outputSchema: globOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const root = resolve(context.workspaceRoot);
      const candidates = await listWorkspaceFiles(root, 800, 8);
      const files = candidates.filter((file) => matchGlob(file, input.pattern));
      const result = files.slice(0, input.limit ?? 80);
      return {
        pattern: input.pattern,
        files: result,
        findings:
          result.length > 0
            ? [`Found ${result.length} file(s) matching "${input.pattern}".`]
            : [`No files matched "${input.pattern}".`],
      };
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "artifact",
        confidence: 0.8,
        raw: { pattern: output.pattern, files: output.files.slice(0, 20) },
      }));
    },
  };
}

const shellWriteInputSchema = z.object({
  command: z.string().min(1).describe("Shell command with arguments, e.g. 'pnpm build' or 'git status'."),
  timeoutMs: z.number().int().min(250).max(120_000).optional(),
});

const shellWriteOutputSchema = z.object({
  command: z.string(),
  status: z.enum(["passed", "failed"]),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  findings: z.array(z.string()),
});

export function createShellWriteTool(): ToolDefinition<
  typeof shellWriteInputSchema,
  typeof shellWriteOutputSchema
> {
  return {
    name: "shell.write",
    description:
      "Run an arbitrary shell command inside the workspace. Gated behind security-active permission and approval.",
    inputSchema: shellWriteInputSchema,
    outputSchema: shellWriteOutputSchema,
    permission: { scope: "file", risk: "high", requiresSandbox: false },
    riskLevel: "high",
    sandboxProfile: "process",
    timeoutMs: 120_000,
    requiresApproval: true,
    async execute(input, context) {
      const rendered = input.command;
      try {
        const result = await execFileAsync(
          process.platform === "win32" ? "cmd.exe" : "/bin/sh",
          process.platform === "win32" ? ["/c", input.command] : ["-c", input.command],
          {
            cwd: context.workspaceRoot,
            maxBuffer: 4_000_000,
            timeout: input.timeoutMs ?? 30_000,
          },
        );
        return {
          command: rendered,
          status: "passed",
          exitCode: 0,
          stdout: result.stdout,
          stderr: result.stderr,
          findings: [`Command passed: ${rendered}`],
        };
      } catch (error) {
        const failed = error as { stdout?: string; stderr?: string; exitCode?: number; code?: number };
        return {
          command: rendered,
          status: "failed",
          exitCode: failed.exitCode ?? failed.code ?? 1,
          stdout: failed.stdout ?? "",
          stderr: failed.stderr ?? String(error),
          findings: [`Command failed: ${rendered}`],
        };
      }
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "artifact",
        confidence: output.status === "passed" ? 0.85 : 0.5,
        raw: { command: output.command, exitCode: output.exitCode },
      }));
    },
  };
}

const ignoredNames = new Set([
  ".ego",
  ".git",
  ".claude",
  "coverage",
  "dist",
  "node_modules",
  "tsconfig.tsbuildinfo",
]);

async function listWorkspaceFiles(
  workspaceRoot: string,
  limit: number,
  maxDepth: number,
): Promise<string[]> {
  const root = resolve(workspaceRoot);
  const files: string[] = [];
  await walk(root, root, 0, maxDepth, limit, files);
  return files;
}

async function walk(
  root: string,
  directory: string,
  depth: number,
  maxDepth: number,
  limit: number,
  files: string[],
): Promise<void> {
  if (files.length >= limit || depth > maxDepth) {
    return;
  }
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (files.length >= limit || ignoredNames.has(entry.name)) {
      continue;
    }
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, depth + 1, maxDepth, limit, files);
    } else if (entry.isFile()) {
      files.push(toWorkspacePath(root, absolute));
    }
  }
}

type GrepMatch = { path: string; line: number; text: string; context?: string };

async function grepWorkspace(input: {
  workspaceRoot: string;
  query: string;
  regex: boolean;
  ignoreCase: boolean;
  contextBefore: number;
  contextAfter: number;
  limit: number;
}): Promise<GrepMatch[]> {
  const root = resolve(input.workspaceRoot);
  const files = await listWorkspaceFiles(root, 400, 6);
  const matches: GrepMatch[] = [];
  let pattern: RegExp | string = input.query;
  if (input.regex) {
    pattern = new RegExp(input.query, input.ignoreCase ? "gi" : "g");
  } else if (input.ignoreCase) {
    pattern = input.query.toLowerCase();
  }
  const hasContext = input.contextBefore > 0 || input.contextAfter > 0;
  for (const file of files) {
    if (matches.length >= input.limit || !isLikelyTextFile(file)) {
      continue;
    }
    try {
      const content = await readFile(resolveWorkspacePath(root, file), "utf8");
      const lines = content.split(/\r?\n/u);
      for (const [index, line] of lines.entries()) {
        const matched = isMatch(line, pattern, input.ignoreCase, input.regex);
        if (!matched) {
          continue;
        }
        const entry: GrepMatch = { path: file, line: index + 1, text: line.slice(0, 300) };
        if (hasContext) {
          const start = Math.max(0, index - input.contextBefore);
          const end = Math.min(lines.length, index + 1 + input.contextAfter);
          entry.context = lines.slice(start, end).join("\n").slice(0, 600);
        }
        matches.push(entry);
        if (matches.length >= input.limit) {
          break;
        }
      }
    } catch {
      // Binary or unreadable files are ignored by the grep helper.
    }
  }
  return matches;
}

function isMatch(line: string, pattern: RegExp | string, ignoreCase: boolean, isRegex: boolean): boolean {
  if (isRegex) {
    (pattern as RegExp).lastIndex = 0;
    return (pattern as RegExp).test(line);
  }
  return ignoreCase
    ? line.toLowerCase().includes(pattern as string)
    : line.includes(pattern as string);
}

function assertReadonlyCommand(command: string, args: string[]): void {
  if (command === "pnpm") {
    const script = args[0] ?? "";
    if (
      script === "--version" ||
      ["typecheck", "test", "build", "lint", "format:check", "smoke"].includes(script)
    ) {
      return;
    }
  }
  if (command === "node" && args[0] === "--version") {
    return;
  }
  if (command === "git") {
    const subcommand = args[0] ?? "";
    if (["status", "diff", "log", "show"].includes(subcommand)) {
      return;
    }
  }
  if (["ls", "pwd", "cat", "head", "tail", "grep", "rg", "find"].includes(command)) {
    return;
  }
  throw new Error(`Command is not allowed in shell-readonly mode: ${command} ${args.join(" ")}`);
}

async function runReadonlyCommand(
  workspaceRoot: string,
  command: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<z.output<typeof shellReadonlyOutputSchema>> {
  const rendered = [command, ...args].join(" ");
  try {
    const result = await execFileAsync(command, args, {
      cwd: workspaceRoot,
      maxBuffer: 2_000_000,
      timeout: timeoutMs,
      shell: process.platform === "win32",
    });
    return {
      command: rendered,
      status: "passed",
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      findings: [`Command passed: ${rendered}`],
    };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; exitCode?: number; code?: number };
    return {
      command: rendered,
      status: "failed",
      exitCode: failed.exitCode ?? failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? String(error),
      findings: [`Command failed: ${rendered}`],
    };
  }
}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (relativePath.includes("\0") || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error(`Refusing unsafe workspace path: ${relativePath}`);
  }
  const root = resolve(workspaceRoot);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing path outside workspace: ${relativePath}`);
  }
  return target;
}

function toWorkspacePath(root: string, absolute: string): string {
  return relative(resolve(root), absolute).replaceAll("\\", "/");
}

function isLikelyTextFile(path: string): boolean {
  return [
    ".md",
    ".json",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".html",
    ".css",
    ".txt",
    ".yaml",
    ".yml",
  ].some((extension) => path.endsWith(extension));
}

function collectDependencyRisks(
  manifest: Record<string, unknown>,
  includeDevDependencies: boolean,
): Array<{
  name: string;
  version: string;
  section: string;
  risk: "info" | "low" | "medium" | "high";
  reason: string;
}> {
  const sections = ["dependencies", "optionalDependencies", "peerDependencies"];
  if (includeDevDependencies) {
    sections.push("devDependencies");
  }
  const risks: Array<{
    name: string;
    version: string;
    section: string;
    risk: "info" | "low" | "medium" | "high";
    reason: string;
  }> = [];
  for (const section of sections) {
    const dependencies = readDependencySection(manifest[section]);
    for (const [name, version] of Object.entries(dependencies)) {
      const risk = scoreDependency(name, version, section);
      if (risk) {
        risks.push({ name, version, section, ...risk });
      }
    }
  }
  return risks.sort((left, right) => riskWeight(right.risk) - riskWeight(left.risk));
}

function countDependencies(
  manifest: Record<string, unknown>,
  includeDevDependencies: boolean,
): number {
  return Object.keys(
    [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      ...(includeDevDependencies ? ["devDependencies"] : []),
    ].reduce<Record<string, string>>((all, section) => {
      return { ...all, ...readDependencySection(manifest[section]) };
    }, {}),
  ).length;
}

function readDependencySection(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function scoreDependency(
  name: string,
  version: string,
  section: string,
): { risk: "info" | "low" | "medium" | "high"; reason: string } | undefined {
  if (/^(https?:|git\+|git:|ssh:)/i.test(version)) {
    return { risk: "high", reason: "remote dependency spec should be reviewed and pinned" };
  }
  if (/^(file:|link:)/i.test(version)) {
    return { risk: "medium", reason: "local linked dependency affects reproducibility" };
  }
  if (version === "*" || version.toLowerCase() === "latest") {
    return { risk: "medium", reason: "unbounded dependency version" };
  }
  if (/^[~^]/u.test(version)) {
    return { risk: "low", reason: "floating semver range should be covered by lockfile review" };
  }
  if (section === "optionalDependencies") {
    return {
      risk: "info",
      reason: "optional dependency should be included in supply-chain review",
    };
  }
  if (/eslint|prettier|typescript|vitest/.test(name)) {
    return undefined;
  }
  return undefined;
}

function riskWeight(risk: "info" | "low" | "medium" | "high"): number {
  return { info: 0, low: 1, medium: 2, high: 3 }[risk];
}

function parseSemgrepJson(stdout: string): { results: Array<Record<string, unknown>> } {
  try {
    const parsed = JSON.parse(stdout) as { results?: Array<Record<string, unknown>> };
    return { results: Array.isArray(parsed.results) ? parsed.results : [] };
  } catch {
    return { results: [] };
  }
}

function summarizeSemgrepResults(results: Array<Record<string, unknown>>): string[] {
  if (results.length === 0) {
    return ["semgrep completed with no findings."];
  }
  return results.slice(0, 20).map((result) => {
    const checkId = typeof result.check_id === "string" ? result.check_id : "semgrep.finding";
    const path =
      result.path && typeof result.path === "string"
        ? result.path
        : typeof result.extra === "object" && result.extra && "path" in result.extra
          ? String(result.extra.path)
          : "unknown";
    return `${checkId} in ${path}`;
  });
}

/**
 * Simple glob pattern matching for workspace.glob. Supports:
 * - **  for multi-directory match
 * - *   for single-segment match
 * - ?   for single-character match
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Normalize to forward slashes
  const normalizedPath = filePath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");

  // Convert glob pattern to regex
  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape except glob chars
    .replace(/\*\*\/?/g, "___GLOBSTAR___") // Temporary placeholder for **
    .replace(/\*/g, "[^/]*") // * -> match anything except /
    .replace(/\?/g, "[^/]") // ? -> match single non-slash char
    .replace(/___GLOBSTAR___/g, ".*") // ** -> match anything including /
    .replace(/\//g, "\\/"); // Literal / in path

  return new RegExp(`^${regexStr}$`).test(normalizedPath);
}
