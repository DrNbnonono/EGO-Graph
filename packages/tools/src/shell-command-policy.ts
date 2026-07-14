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
  "status", "diff", "log", "show", "blame", "shortlog",
  "remote", "rev-parse", "describe", "reflog",
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
/**
 * Filesystem read-only commands always allowed in readonly mode.
 */
const FILESYSTEM_READ_COMMANDS = new Set([
  "ls", "pwd", "cat", "head", "tail", "grep", "rg", "find", "wc",
  "file", "stat", "du", "df", "which", "where",
  "tree", "sort", "cut", "sed",
]);

/**
 * System info commands always allowed.
 */
const SYSTEM_INFO_COMMANDS = new Set([
  "uname", "hostname", "whoami", "date", "uptime", "free", "top",
  "ps",
]);

const SHELL_CONTROL_PATTERN = /(?:[|;&<>`]|\$\(|\r|\n)/u;

const FIND_FORBIDDEN_ARGUMENTS = new Set([
  "-delete", "-exec", "-execdir", "-ok", "-okdir", "-fls", "-fprint", "-fprint0", "-fprintf",
]);

const SED_FORBIDDEN_ARGUMENTS = new Set(["-i", "--in-place", "-w", "--sandbox=false"]);

/**
 * Classify a shell command into a category and determine its safety level.
 */
export function classifyShellCommand(command: string, args: string[]): ShellCommandClassification {
  const cmd = command.toLowerCase().trim();
  const subcommand = args[0] ?? "";

  if (containsShellControlSyntax(command, args)) {
    return {
      category: "destructive",
      readonlySafe: false,
      destructive: true,
      reason: "Shell control syntax is not accepted; use structured argv.",
    };
  }

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
      const safe = validateGitReadonlyArguments(subcommand, args.slice(1));
      return {
        category: safe ? "git_read" : "git_write",
        readonlySafe: safe,
        destructive: false,
      };
    }
    if (GIT_WRITE_SUBCOMMANDS.has(subcommand)) {
      return { category: "git_write", readonlySafe: false, destructive: false };
    }
    return { category: "git_write", readonlySafe: false, destructive: false };
  }

  // Package managers run project-controlled lifecycle scripts. They are never
  // part of the generic readonly shell; dedicated check tools gate them.
  if (cmd === "pnpm" || cmd === "npm" || cmd === "yarn") {
    return { category: "package_manager", readonlySafe: false, destructive: false };
  }

  // Script runners.
  if (cmd === "node" || cmd === "tsx" || cmd === "ts-node" || cmd === "npx" || cmd === "deno" || cmd === "bun" || cmd === "python" || cmd === "python3" || cmd === "pip" || cmd === "pip3") {
    return { category: "script_runner", readonlySafe: false, destructive: false };
  }

  // Filesystem read commands.
  if (FILESYSTEM_READ_COMMANDS.has(cmd)) {
    const safe = validateFilesystemReadonlyArguments(cmd, args);
    return { category: "filesystem_read", readonlySafe: safe, destructive: false };
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

export function containsShellControlSyntax(command: string, args: string[]): boolean {
  return [command, ...args].some((part) => SHELL_CONTROL_PATTERN.test(part));
}

export function assertReadonlyWorkspaceSafe(
  command: string,
  args: string[],
  workspaceRoot: string,
): void {
  assertReadonlySafe(command, args);
  for (const argument of args) {
    if (argument.startsWith("-") || argument.length === 0) continue;
    if (/^[A-Za-z]+:\/\//u.test(argument)) {
      throw new Error(`Network URL is not allowed in shell-readonly mode: ${argument}`);
    }
    if (argument.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(argument) || argument.split(/[\\/]/u).includes("..")) {
      assertWorkspacePath(argument, workspaceRoot);
    }
  }
}

function validateGitReadonlyArguments(subcommand: string, args: string[]): boolean {
  if (args.some((arg) => arg === "--output" || arg.startsWith("--output=") || arg === "-o")) {
    return false;
  }
  if (subcommand === "remote") {
    return args.length === 0 || args.every((arg) => arg === "-v" || arg === "--verbose" || arg === "get-url");
  }
  if (subcommand === "reflog") {
    return !args.some((arg) => ["delete", "expire"].includes(arg));
  }
  return true;
}

function validateFilesystemReadonlyArguments(command: string, args: string[]): boolean {
  if (command === "find" && args.some((arg) => FIND_FORBIDDEN_ARGUMENTS.has(arg.toLowerCase()))) {
    return false;
  }
  if (command === "sed") {
    if (args.some((arg) => SED_FORBIDDEN_ARGUMENTS.has(arg.toLowerCase()) || /^-i.+/u.test(arg))) {
      return false;
    }
    const script = args.find((arg) => !arg.startsWith("-"));
    if (script && /(^|[;{\s])(?:e|w)(?:\s|$)/u.test(script)) {
      return false;
    }
  }
  if (command === "sort" && args.some((arg) => arg === "-o" || arg.startsWith("--output="))) {
    return false;
  }
  if ((command === "rg" || command === "grep") && args.some((arg) => arg === "--pre" || arg.startsWith("--pre="))) {
    return false;
  }
  return true;
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
