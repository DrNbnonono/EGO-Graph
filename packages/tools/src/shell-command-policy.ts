/**
 * Shell command classification and safety policy.
 *
 * Commands are categorized by risk level and purpose. The readonly whitelist
 * and destructive command blacklist are consumed by the shell tools to
 * gate command execution at the appropriate permission level.
 */

import { resolve, relative } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────

export type ShellCommandCategory =
  | "filesystem_read"
  | "git_read"
  | "git_write"
  | "package_manager"
  | "script_runner"
  | "system_info"
  | "dev_server"
  | "test_runner"
  | "unknown"
  | "destructive";

export type ShellCommandClassification = {
  category: ShellCommandCategory;
  /** True when the command is safe for the readonly shell whitelist. */
  readonlySafe: boolean;
  /** True when the command should be unconditionally blocked. */
  destructive: boolean;
  /** Human-readable reason when the command is blocked. */
  reason?: string;
};

// ── Destructive command blacklist ──────────────────────────────────────────

/**
 * Commands that are unconditionally blocked regardless of permission level.
 * Each entry is either an exact command name or a (command, arg-pattern) pair.
 */
const DESTRUCTIVE_PATTERNS: Array<{
  command: string;
  argPattern?: RegExp;
  reason: string;
}> = [
  { command: "rm", argPattern: /^\s*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/\s*$/, reason: "Recursive force delete on root" },
  { command: "rm", argPattern: /^\s*-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+\/\s*$/, reason: "Force recursive delete on root" },
  { command: "mkfs", reason: "Filesystem format" },
  { command: "dd", argPattern: /of=\/dev\/(sda|nvme|hd[a-z]|xvd[a-z])/i, reason: "Raw disk write" },
  { command: "shutdown", reason: "System shutdown" },
  { command: "reboot", reason: "System reboot" },
  { command: "halt", reason: "System halt" },
  { command: "poweroff", reason: "System power off" },
  { command: "init", argPattern: /^0$/, reason: "System init level 0" },
];

/**
 * Check if a command matches the destructive blacklist.
 */
export function isDestructiveCommand(command: string, args: string[]): { destructive: boolean; reason?: string } {
  const cmd = command.toLowerCase().trim();
  const argString = args.join(" ");

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (cmd !== pattern.command) continue;
    if (!pattern.argPattern) {
      return { destructive: true, reason: pattern.reason };
    }
    if (pattern.argPattern.test(argString)) {
      return { destructive: true, reason: pattern.reason };
    }
  }

  // Block fork-bomb patterns.
  if (argString.includes(":(){ :|:& };:") || argString.includes(":(){:|:&};:")) {
    return { destructive: true, reason: "Fork bomb pattern detected" };
  }

  return { destructive: false };
}

// ── Readonly whitelist ─────────────────────────────────────────────────────

/**
 * Git subcommands safe for readonly access.
 */
const GIT_READONLY_SUBCOMMANDS = new Set([
  "status", "diff", "log", "show", "blame", "shortlog", "stash", "tag",
  "remote", "branch", "rev-parse", "describe", "reflog",
]);

/**
 * Git subcommands that modify state (require shell-readonly with approval).
 */
const GIT_WRITE_SUBCOMMANDS = new Set([
  "add", "commit", "checkout", "switch", "restore", "stash", "branch",
  "merge", "rebase", "cherry-pick", "reset", "clean", "pull", "fetch",
]);

/**
 * pnpm subcommands safe for readonly access.
 */
const PNPM_READONLY_SUBCOMMANDS = new Set([
  "--version", "typecheck", "test", "build", "lint", "format:check",
  "smoke", "list", "outdated", "why", "audit",
]);

/**
 * pnpm subcommands that modify state (require shell-readonly with approval).
 */
const PNPM_WRITE_SUBCOMMANDS = new Set([
  "install", "add", "remove", "update", "dev", "start",
]);

/**
 * Filesystem read-only commands always allowed in readonly mode.
 */
const FILESYSTEM_READ_COMMANDS = new Set([
  "ls", "pwd", "cat", "head", "tail", "grep", "rg", "find", "wc",
  "file", "stat", "du", "df", "which", "where", "echo", "env",
  "tree", "sort", "uniq", "cut", "awk", "sed", "less", "more",
]);

/**
 * System info commands always allowed.
 */
const SYSTEM_INFO_COMMANDS = new Set([
  "uname", "hostname", "whoami", "date", "uptime", "free", "top",
  "ps", "node", "npm", "npx", "python", "python3", "pip", "pip3",
]);

/**
 * Classify a shell command into a category and determine its safety level.
 */
export function classifyShellCommand(command: string, args: string[]): ShellCommandClassification {
  const cmd = command.toLowerCase().trim();
  const subcommand = args[0] ?? "";

  // Check destructive first.
  const destructive = isDestructiveCommand(command, args);
  if (destructive.destructive) {
    const result: ShellCommandClassification = {
      category: "destructive",
      readonlySafe: false,
      destructive: true,
    };
    if (destructive.reason) {
      result.reason = destructive.reason;
    }
    return result;
  }

  // Git commands.
  if (cmd === "git") {
    if (GIT_READONLY_SUBCOMMANDS.has(subcommand)) {
      return { category: "git_read", readonlySafe: true, destructive: false };
    }
    if (GIT_WRITE_SUBCOMMANDS.has(subcommand)) {
      return { category: "git_write", readonlySafe: false, destructive: false };
    }
    return { category: "git_write", readonlySafe: false, destructive: false };
  }

  // Package manager commands.
  if (cmd === "pnpm" || cmd === "npm" || cmd === "yarn") {
    if (cmd === "pnpm") {
      if (PNPM_READONLY_SUBCOMMANDS.has(subcommand)) {
        return { category: "test_runner", readonlySafe: true, destructive: false };
      }
      if (PNPM_WRITE_SUBCOMMANDS.has(subcommand)) {
        return { category: "package_manager", readonlySafe: false, destructive: false };
      }
    }
    // npm/yarn: only version is readonly safe.
    if (subcommand === "--version" || subcommand === "version") {
      return { category: "system_info", readonlySafe: true, destructive: false };
    }
    return { category: "package_manager", readonlySafe: false, destructive: false };
  }

  // Script runners.
  if (cmd === "node" || cmd === "tsx" || cmd === "ts-node" || cmd === "npx" || cmd === "deno" || cmd === "bun") {
    if (cmd === "node" && subcommand === "--version") {
      return { category: "system_info", readonlySafe: true, destructive: false };
    }
    return { category: "script_runner", readonlySafe: false, destructive: false };
  }

  // Filesystem read commands.
  if (FILESYSTEM_READ_COMMANDS.has(cmd)) {
    return { category: "filesystem_read", readonlySafe: true, destructive: false };
  }

  // System info commands.
  if (SYSTEM_INFO_COMMANDS.has(cmd)) {
    return { category: "system_info", readonlySafe: true, destructive: false };
  }

  // Unknown commands are not readonly-safe.
  return { category: "unknown", readonlySafe: false, destructive: false };
}

/**
 * Assert that a command is safe for readonly shell execution.
 * Throws an error if the command is not in the readonly whitelist.
 */
export function assertReadonlySafe(command: string, args: string[]): void {
  const classification = classifyShellCommand(command, args);
  if (classification.destructive) {
    throw new Error(`Destructive command blocked: ${classification.reason}`);
  }
  if (!classification.readonlySafe) {
    throw new Error(
      `Command is not allowed in shell-readonly mode: ${command} ${args.join(" ")}`,
    );
  }
}

/**
 * Assert that a path stays within the workspace root.
 * Prevents shell commands from writing outside the project directory.
 */
export function assertWorkspacePath(targetPath: string, workspaceRoot: string): void {
  const resolved = resolve(workspaceRoot, targetPath);
  const rel = relative(workspaceRoot, resolved);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path escapes workspace root: ${targetPath}`);
  }
}
