/**
 * File watcher: monitors workspace for file changes.
 *
 * Uses Node.js built-in `fs.watch` with `{ recursive: true }` on supported
 * platforms (Windows, macOS). Falls back to polling on Linux where recursive
 * watch may not be available.
 */
import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export type FileChangeEvent = {
  type: "created" | "modified" | "deleted";
  /** Path relative to workspace root. */
  path: string;
  timestamp: string;
};

export type FileWatcher = {
  close(): Promise<void>;
};

export type FileWatcherOptions = {
  /** Debounce window in ms. Default: 300. */
  debounceMs?: number;
  /** Directories to ignore (relative names). */
  ignoredDirs?: string[];
  /** Polling interval in ms when recursive watch is unavailable. Default: 2000. */
  pollIntervalMs?: number;
};

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", ".ego", "coverage", ".playwright-cli",
  ".qoder", ".zread", ".agents", ".claude", ".codex", "output",
]);

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Create a file watcher for the given workspace root.
 * The `onChange` callback is invoked for each debounced file change event.
 */
export function createFileWatcher(
  workspaceRoot: string,
  onChange: (event: FileChangeEvent) => void,
  options?: FileWatcherOptions,
): FileWatcher {
  const root = resolve(workspaceRoot);
  const debounceMs = options?.debounceMs ?? 300;
  const ignoredDirs = new Set(options?.ignoredDirs ?? DEFAULT_IGNORED_DIRS);

  let pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;
  let watcher: FSWatcher | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function shouldIgnore(relativePath: string): boolean {
    const parts = relativePath.split(/[/\\]/);
    return parts.some((part) => ignoredDirs.has(part));
  }

  function emitChange(type: FileChangeEvent["type"], absolutePath: string): void {
    const relPath = relative(root, absolutePath).replace(/\\/g, "/");
    if (shouldIgnore(relPath)) return;

    // Debounce: clear any pending timer for this path.
    const existing = pendingTimers.get(relPath);
    if (existing) clearTimeout(existing);

    pendingTimers.set(
      relPath,
      setTimeout(() => {
        pendingTimers.delete(relPath);
        if (!closed) {
          onChange({ type, path: relPath, timestamp: new Date().toISOString() });
        }
      }, debounceMs),
    );
  }

  // Try native recursive watch first.
  try {
    watcher = watch(root, { recursive: true }, (eventType: string, filename: string | null) => {
      if (!filename || closed) return;
      const absolutePath = join(root, filename);
      const type: FileChangeEvent["type"] =
        eventType === "rename" ? "created" : "modified";
      emitChange(type, absolutePath);
    });

    watcher.on("error", () => {
      // If native watch fails, fall back to polling.
      startPolling();
    });
  } catch {
    // Recursive watch not supported (e.g. older Linux kernels).
    startPolling();
  }

  // Polling fallback: compare mtimes periodically.
  let lastSnapshot = new Map<string, number>();

  async function buildSnapshot(): Promise<Map<string, number>> {
    const snapshot = new Map<string, number>();
    await walkForSnapshot(root, snapshot);
    return snapshot;
  }

  async function walkForSnapshot(dir: string, snapshot: Map<string, number>): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoredDirs.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          try {
            const s = await stat(fullPath);
            snapshot.set(relative(root, fullPath).replace(/\\/g, "/"), s.mtimeMs);
          } catch { /* ignore */ }
        } else if (entry.isDirectory()) {
          await walkForSnapshot(fullPath, snapshot);
        }
      }
    } catch { /* ignore */ }
  }

  function startPolling(): void {
    const interval = options?.pollIntervalMs ?? 2000;
    // Build initial snapshot.
    void buildSnapshot().then((snap) => {
      lastSnapshot = snap;
    });

    pollTimer = setInterval(() => {
      void buildSnapshot().then((newSnap) => {
        // Detect created/modified.
        for (const [path, mtime] of newSnap) {
          const prev = lastSnapshot.get(path);
          if (prev === undefined) {
            emitChange("created", join(root, path));
          } else if (mtime > prev) {
            emitChange("modified", join(root, path));
          }
        }
        // Detect deleted.
        for (const [path] of lastSnapshot) {
          if (!newSnap.has(path)) {
            emitChange("deleted", join(root, path));
          }
        }
        lastSnapshot = newSnap;
      });
    }, interval);
  }

  return {
    async close(): Promise<void> {
      closed = true;
      if (watcher) {
        watcher.close();
        watcher = undefined;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      for (const timer of pendingTimers.values()) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
    },
  };
}
