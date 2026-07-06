import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import {
  getCommandPaletteMatches,
  resolvePaletteInput,
} from "../src/tui/command-palette.js";
import {
  resolveDiffFileIndex,
  splitDiffByFile,
} from "../src/tui/diff-view.js";
import { resolveWorkspaceRoot } from "../src/workspace-root.js";

describe("TUI helpers", () => {
  it("splits a unified diff into independent file pages", () => {
    const files = splitDiffByFile(
      [
        "--- a/README.md",
        "+++ b/README.md",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "--- a/docs/guide.md",
        "+++ b/docs/guide.md",
        "@@ -1 +1 @@",
        "-before",
        "+after",
      ].join("\n"),
    );

    expect(files).toHaveLength(2);
    expect(files[0]?.header).toBe("README.md");
    expect(files[1]?.header).toBe("docs/guide.md");
    expect(files[1]?.lines.join("\n")).toContain("+after");
  });

  it("matches slash commands by prefix and aliases", () => {
    expect(getCommandPaletteMatches("/m").map((command) => command.name)).toEqual(
      expect.arrayContaining(["/memory", "/mcp", "/models"]),
    );
    expect(getCommandPaletteMatches("/pa").map((command) => command.name)).toContain(
      "/patch approve",
    );
    expect(getCommandPaletteMatches("/model")[0]).toMatchObject({
      name: "/model",
      category: "Model",
    });
    expect(getCommandPaletteMatches("/model")[0]?.description).toContain("model");
  });

  it("keeps a bare slash as palette input instead of auto executing a command", () => {
    const matches = getCommandPaletteMatches("/");

    expect(
      resolvePaletteInput(
        "/",
        matches.map((command) => command.name),
      ),
    ).toBe("/");
    expect(resolvePaletteInput("/allow shell-readonly", [])).toBe("/allow shell-readonly");
  });

  it("resolves diff navigation commands without overflowing file bounds", () => {
    expect(resolveDiffFileIndex("/diff next", 0, 3)).toBe(1);
    expect(resolveDiffFileIndex("/diff next", 2, 3)).toBe(2);
    expect(resolveDiffFileIndex("/diff prev", 0, 3)).toBe(0);
    expect(resolveDiffFileIndex("/diff prev", 2, 3)).toBe(1);
    expect(resolveDiffFileIndex("/diff first", 2, 3)).toBe(0);
    expect(resolveDiffFileIndex("/diff last", 0, 3)).toBe(2);
    expect(resolveDiffFileIndex("/diff 2", 0, 3)).toBe(1);
  });

  it("resolves the workspace root from nested package directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "ego-cli-root-"));
    const nested = join(root, "apps", "ego-cli");
    await mkdir(join(root, ".ego"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, ".ego", "config.json"), JSON.stringify({ model: { provider: "disabled" } }), "utf8");

    expect(resolveWorkspaceRoot(nested)).toBe(root);
  });
});
