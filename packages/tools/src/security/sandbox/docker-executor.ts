/**
 * Docker sandbox executor.
 *
 * Runs shell commands inside an isolated Docker container with:
 * - No network access (--network=none)
 * - Memory/CPU limits
 * - Read-only root filesystem (--read-only + --tmpfs /tmp)
 * - Workspace mounted as a volume
 *
 * Falls back gracefully when Docker is not available.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────────

export type DockerAvailability = {
  available: boolean;
  version?: string;
  reason?: string;
};

export type DockerSandboxOptions = {
  /** Docker image to use. Default: "node:22-bookworm-slim". */
  image?: string;
  /** Network mode. Default: "none" (no network). */
  networkMode?: "none" | "bridge";
  /** Memory limit. Default: "512m". */
  memoryLimit?: string;
  /** CPU limit (number of cores). Default: 1. */
  cpuLimit?: number;
  /** Execution timeout in ms. Default: 60000. */
  timeoutMs?: number;
  /** Workspace root to mount. */
  workspaceRoot: string;
  /** Mount mode for workspace. Default: "rw". */
  mountMode?: "ro" | "rw";
};

export type DockerSandboxResult = {
  command: string;
  status: "passed" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when the command ran inside Docker. False when fell back to process. */
  sandboxed: boolean;
};

// ── Detection ──────────────────────────────────────────────────────────────

let cachedAvailability: DockerAvailability | undefined;

/**
 * Check if Docker is available on the system.
 * Result is cached after the first call.
 */
export async function detectDocker(): Promise<DockerAvailability> {
  if (cachedAvailability) return cachedAvailability;

  try {
    const { stdout } = await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"], {
      timeout: 5_000,
    });
    cachedAvailability = { available: true, version: stdout.trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachedAvailability = { available: false, reason: message };
  }
  return cachedAvailability;
}

/**
 * Reset the cached Docker availability (useful for testing).
 */
export function resetDockerCache(): void {
  cachedAvailability = undefined;
}

// ── Execution ──────────────────────────────────────────────────────────────

/**
 * Execute a command inside a Docker sandbox container.
 *
 * @param command - The command to run (e.g. "node", "pnpm", "git").
 * @param args - Command arguments.
 * @param options - Sandbox configuration options.
 */
export async function executeInDocker(
  command: string,
  args: string[],
  options: DockerSandboxOptions,
): Promise<DockerSandboxResult> {
  const availability = await detectDocker();
  if (!availability.available) {
    return {
      command: `${command} ${args.join(" ")}`,
      status: "failed",
      exitCode: -1,
      stdout: "",
      stderr: `Docker not available: ${availability.reason ?? "unknown"}`,
      sandboxed: false,
    };
  }

  const image = options.image ?? "node:22-bookworm-slim";
  const networkMode = options.networkMode ?? "none";
  const memoryLimit = options.memoryLimit ?? "512m";
  const cpuLimit = options.cpuLimit ?? 1;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const mountMode = options.mountMode ?? "rw";

  const dockerArgs = [
    "run",
    "--rm",
    `--network=${networkMode}`,
    `--memory=${memoryLimit}`,
    `--cpus=${cpuLimit}`,
    "--read-only",
    "--tmpfs", "/tmp",
    "-v", `${options.workspaceRoot}:/workspace:${mountMode}`,
    "-w", "/workspace",
    image,
    command,
    ...args,
  ];

  const rendered = `${command} ${args.join(" ")}`;

  try {
    const { stdout, stderr } = await execFileAsync("docker", dockerArgs, {
      maxBuffer: 4_000_000,
      timeout: timeoutMs,
    });
    return {
      command: rendered,
      status: "passed",
      exitCode: 0,
      stdout,
      stderr,
      sandboxed: true,
    };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; exitCode?: number; code?: number };
    return {
      command: rendered,
      status: "failed",
      exitCode: failed.exitCode ?? failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? String(error),
      sandboxed: true,
    };
  }
}
