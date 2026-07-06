import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Security tool capability registry.
 *
 * User requirement: "探测机器已装工具→用，否则用内置解析器；UI 上展示状态；
 * 可扩展性务必做好". This module is the single extensibility seam for that.
 *
 * Every external security tool (tshark, file, binwalk, strings, semgrep,
 * ghidra headless, ...) is represented by a {@link CapabilityDetector}. The
 * registry:
 *
 * - Runs detection once per process (cached) and reports whether each tool is
 *   `external` (binary present), `builtin` (no binary, fall back to the pure
 *   TS parser), or `unavailable` (neither, the tool degrades to a no-op with
 *   a residual-risk note).
 * - Exposes `registerCapabilityDetector` so MCP/plugin tools can add their
 *   own detectors at runtime without modifying this package.
 * - Surfaces a one-line summary for the TUI/Web footer.
 *
 * Detection is best-effort and never throws: a failed `--version` probe is
 * reported as `unavailable`, not an error, so CI environments without the
 * binary simply run the builtin parser path.
 */

const execFileAsync = promisify(execFile);

export type CapabilitySource = "external" | "builtin" | "unavailable";

export type ToolCapability = {
  /** Stable capability id, e.g. "tshark", "file", "binwalk". */
  name: string;
  /** Human-readable label for UI display. */
  label: string;
  /** Whether the capability is usable right now. */
  available: boolean;
  /** How the capability is being satisfied. */
  source: CapabilitySource;
  /** Path to the external binary, when source === "external". */
  binaryPath?: string;
  /** Detected version string, when known. */
  version?: string;
  /** ISO timestamp of detection. */
  detectedAt: string;
};

export type CapabilityDetector = {
  name: string;
  label: string;
  /**
   * Probe the host for this capability. Resolve with the detected state; never
   * reject (on failure resolve with `source: "builtin"` or `"unavailable"`).
   */
  detect(): Promise<ToolCapability>;
};

export type CapabilitySummary = {
  total: number;
  available: number;
  external: number;
  builtin: number;
  unavailable: number;
};

const registry = new Map<string, CapabilityDetector>();
const detectionCache = new Map<string, ToolCapability>();

/**
 * Register an additional capability detector. Plugins and MCP tool packs call
 * this at load time to advertise their backing tools. Re-registering the same
 * name replaces the previous detector and clears its cached detection.
 */
export function registerCapabilityDetector(detector: CapabilityDetector): void {
  registry.set(detector.name, detector);
  detectionCache.delete(detector.name);
}

/**
 * Remove a registered detector (mainly for tests).
 */
export function unregisterCapabilityDetector(name: string): void {
  registry.delete(name);
  detectionCache.delete(name);
}

/**
 * List currently-registered detector names.
 */
export function listCapabilityDetectors(): string[] {
  return [...registry.keys()];
}

/**
 * Detect a single capability, using the cache when available.
 */
export async function detectCapability(name: string, now: string = new Date().toISOString()): Promise<ToolCapability | undefined> {
  const detector = registry.get(name);
  if (!detector) {
    return undefined;
  }
  const cached = detectionCache.get(name);
  if (cached) {
    return cached;
  }
  const result = await detector.detect().catch(() => unavailableCapability(detector, now));
  detectionCache.set(name, result);
  return result;
}

/**
 * Detect all registered capabilities. Returns a fresh snapshot each call
 * (results are cached per-capability, so this is cheap after the first run).
 */
export async function detectAllCapabilities(now: string = new Date().toISOString()): Promise<ToolCapability[]> {
  const names = [...registry.keys()];
  const results = await Promise.all(
    names.map((name) => detectCapability(name, now)),
  );
  return results.filter((capability): capability is ToolCapability => capability !== undefined);
}

/**
 * Clear the detection cache, forcing the next `detectCapability`/`detectAll`
 * call to re-probe. Used by `ego doctor` and tests.
 */
export function clearCapabilityCache(): void {
  detectionCache.clear();
}

/**
 * Produce a one-line UI summary like "8 tools: 3 external, 4 builtin, 1 unavailable".
 */
export function summarizeCapabilityStatus(capabilities: ToolCapability[]): CapabilitySummary {
  const summary: CapabilitySummary = {
    total: capabilities.length,
    available: 0,
    external: 0,
    builtin: 0,
    unavailable: 0,
  };
  for (const capability of capabilities) {
    if (capability.source === "external") {
      summary.external += 1;
    } else if (capability.source === "builtin") {
      summary.builtin += 1;
    } else {
      summary.unavailable += 1;
    }
    if (capability.available) {
      summary.available += 1;
    }
  }
  return summary;
}

/**
 * Render the summary as a single UI line.
 */
export function renderCapabilityStatusLine(summary: CapabilitySummary): string {
  return [
    `${summary.total} tool(s)`,
    `${summary.external} external`,
    `${summary.builtin} builtin`,
    `${summary.unavailable} unavailable`,
  ].join(" | ");
}

// ---------------------------------------------------------------------------
// Builtin detectors for common external security tools.
// Each detector tries the real binary first and falls back to builtin.
// ---------------------------------------------------------------------------

export function createBinaryCapabilityDetector(input: {
  name: string;
  label: string;
  binary: string;
  /** Version args, e.g. ["--version"]. */
  versionArgs?: string[];
  /** Regex to extract a version substring from stdout. */
  versionPattern?: RegExp;
  /** Whether a builtin parser covers this capability when the binary is missing. */
  builtinFallback?: boolean;
}): CapabilityDetector {
  const versionArgs = input.versionArgs ?? ["--version"];
  return {
    name: input.name,
    label: input.label,
    async detect(): Promise<ToolCapability> {
      const now = new Date().toISOString();
      try {
        const { stdout } = await execFileAsync(input.binary, versionArgs, {
          timeout: 4_000,
          windowsHide: true,
        });
        const version = input.versionPattern
          ? extractVersion(stdout, input.versionPattern)
          : stdout.trim().split(/\r?\n/u)[0]?.slice(0, 64);
        return {
          name: input.name,
          label: input.label,
          available: true,
          source: "external",
          binaryPath: input.binary,
          ...(version ? { version } : {}),
          detectedAt: now,
        };
      } catch {
        // Binary not present or failed; fall back to builtin parser if one
        // exists, otherwise mark unavailable.
        return input.builtinFallback
          ? builtinCapability(input.name, input.label, now)
          : unavailableCapability({ name: input.name, label: input.label }, now);
      }
    },
  };
}

export function createBuiltinOnlyCapability(input: { name: string; label: string }): CapabilityDetector {
  return {
    name: input.name,
    label: input.label,
    async detect(): Promise<ToolCapability> {
      return builtinCapability(input.name, input.label, new Date().toISOString());
    },
  };
}

export function builtinCapability(name: string, label: string, detectedAt: string): ToolCapability {
  return {
    name,
    label,
    available: true,
    source: "builtin",
    detectedAt,
  };
}

export function unavailableCapability(
  detector: { name: string; label?: string },
  detectedAt: string,
): ToolCapability {
  return {
    name: detector.name,
    label: detector.label ?? detector.name,
    available: false,
    source: "unavailable",
    detectedAt,
  };
}

function extractVersion(stdout: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(stdout);
  return match?.[0]?.trim().slice(0, 64);
}

/**
 * Convenience: detect a capability by name, returning a normalized "use which
 * source" decision that tool adapters consult at execution time.
 */
export async function resolveCapabilityExecution(
  name: string,
): Promise<{ source: CapabilitySource; capability?: ToolCapability }> {
  const capability = await detectCapability(name);
  if (!capability) {
    return { source: "unavailable" };
  }
  return { source: capability.source, capability };
}
