import { describe, expect, it } from "vitest";
import {
  getCommandPaletteMatches,
  resolveDiffFileIndex,
  resolvePaletteInput,
  splitDiffByFile,
} from "../src/tui.js";

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
      category: "model",
    });
    expect(getCommandPaletteMatches("/model")[0]?.description).toContain("model");
  });

  it("resolves a bare slash to the first palette command but keeps exact input otherwise", () => {
    const matches = getCommandPaletteMatches("/");

    expect(
      resolvePaletteInput(
        "/",
        matches.map((command) => command.name),
      ),
    ).toBe("/help");
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
});
