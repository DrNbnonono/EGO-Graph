import { describe, expect, it } from "vitest";
import { getCommandPaletteMatches, resolvePaletteInput, splitDiffByFile } from "../src/tui.js";

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
});
