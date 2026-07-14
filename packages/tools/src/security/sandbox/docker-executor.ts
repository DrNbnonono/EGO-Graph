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
import { randomBytes } from "node:crypto";
import { runControlledProcess } from "../../process-runner.js";

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
  /** Abort the docker client and remove the named container. */
  signal?: AbortSignal;
  /** Maximum processes in the container. Default: 128. */
  pidsLimit?: number;
  /** Container UID:GID. Default: 65532:65532. */
  user?: string;
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
  const mountMode = options.mountMode ?? "ro";
  const pidsLimit = options.pidsLimit ?? 128;
  const user = options.user ?? "65532:65532";
  const containerName = `ego-sandbox-${randomBytes(8).toString("hex")}`;

  const dockerArgs = [
    "run",
    "--rm",
    `--name=${containerName}`,
    `--network=${networkMode}`,
    `--memory=${memoryLimit}`,
    `--cpus=${cpuLimit}`,
    `--pids-limit=${pidsLimit}`,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    `--user=${user}`,
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m",
    "-v", `${options.workspaceRoot}:/workspace:${mountMode}`,
    "-w", "/workspace",
    image,
    command,
    ...args,
  ];

  const rendered = `${command} ${args.join(" ")}`;

  const result = await runControlledProcess("docker", dockerArgs, {
    cwd: options.workspaceRoot,
    timeoutMs,
    maxOutputBytes: 4_000_000,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (result.timedOut || result.cancelled) {
    await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 5_000 }).catch(() => undefined);
  }
  return {
    command: rendered,
    status: result.exitCode === 0 && !result.timedOut && !result.cancelled ? "passed" : "failed",
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    sandboxed: true,
  };
}
