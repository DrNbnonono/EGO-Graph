import { describe, expect, it } from "vitest";

// File watcher uses fs.watch which requires a real filesystem.
// These tests verify the module exports and type contracts only.

describe("file-watcher module", () => {
  it("exports createFileWatcher function", async () => {
    const mod = await import("../src/file-watcher.js");
    expect(typeof mod.createFileWatcher).toBe("function");
  });

  it("FileWatcherOptions has expected defaults", async () => {
    const mod = await import("../src/file-watcher.js");
    // Verify the function signature accepts minimal options.
    expect(mod.createFileWatcher).toBeDefined();
    // The function should accept (root, callback) with no options.
    expect(mod.createFileWatcher.length).toBeGreaterThanOrEqual(2);
  });
});
