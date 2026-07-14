import { spawn } from "node:child_process";

export type ControlledProcessOptions = {
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
};

export type ControlledProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
};

export async function runControlledProcess(
  program: string,
  args: string[],
  options: ControlledProcessOptions,
): Promise<ControlledProcessResult> {
  const maxOutputBytes = options.maxOutputBytes ?? 2_000_000;
  return await new Promise<ControlledProcessResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    const child = spawn(program, args, {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      env: allowlistedEnvironment(process.env),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      const current = target === "stdout" ? stdout : stderr;
      const remaining = Math.max(0, maxOutputBytes - Buffer.byteLength(current, "utf8"));
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      const visible = Buffer.from(text, "utf8").subarray(0, remaining).toString("utf8");
      if (target === "stdout") stdout += visible;
      else stderr += visible;
      if (Buffer.byteLength(text, "utf8") > remaining) truncated = true;
    };
    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onExternalAbort);
      resolvePromise({ exitCode, stdout, stderr, timedOut, cancelled, truncated });
    };
    const terminate = (reason: "timeout" | "cancelled"): void => {
      if (settled) return;
      timedOut = reason === "timeout";
      cancelled = reason === "cancelled";
      terminateProcessTree(child.pid);
    };
    const onExternalAbort = (): void => terminate("cancelled");
    const timeout = setTimeout(() => terminate("timeout"), options.timeoutMs);
    timeout.unref?.();
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (options.signal?.aborted) onExternalAbort();

    child.on("error", (error: NodeJS.ErrnoException) => {
      stderr += error.message;
      finish(error.code === "ENOENT" ? 127 : 1);
    });
    child.on("close", (code, signal) => {
      if (signal && !stderr) stderr = `Process terminated by ${signal}`;
      finish(code ?? (timedOut || cancelled ? 130 : 1));
    });
  });
}

export function allowlistedEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = [
    "PATH", "PATHEXT", "HOME", "USERPROFILE", "TMP", "TEMP", "TMPDIR",
    "SYSTEMROOT", "WINDIR", "COMSPEC", "LANG", "LC_ALL", "TERM", "CI",
  ];
  return Object.fromEntries(
    allowed.flatMap((key) => (env[key] === undefined ? [] : [[key, env[key]]])),
  );
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ }
  }
  const force = setTimeout(() => {
    try { process.kill(-pid, "SIGKILL"); } catch { /* already exited */ }
  }, 750);
  force.unref();
}
