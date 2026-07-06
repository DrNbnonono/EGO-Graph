import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("apps/ego-cli/src/tui/theme.tsx", "utf8");

describe("opencode-style TUI theme source", () => {
  it("defines opencode-compatible semantic tokens without loading the native renderer", () => {
    for (const token of [
      "backgroundPanel",
      "backgroundElement",
      "textMuted",
      "borderActive",
      "diffAddedBg",
      "markdownCodeBlock",
      "syntaxKeyword",
      "thinkingOpacity",
    ]) {
      expect(source).toContain(token);
    }
  });

  it("keeps compatibility aliases pointed at semantic tokens", () => {
    expect(source).toContain("panel: theme.backgroundPanel");
    expect(source).toContain("panelAlt: theme.backgroundElement");
    expect(source).toContain("muted: theme.textMuted");
    expect(source).toContain("danger: theme.error");
  });
});
