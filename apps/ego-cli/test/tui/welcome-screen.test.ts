import { describe, expect, it } from "vitest";
import { commandPalette } from "../../src/tui/command-palette.js";
import { createWelcomeModel } from "../../src/tui/welcome-screen.js";

const mojibakePattern = /鈥|鈻|鏆|杩|浼|娲|璇|缃|鍚|瀹|鍙|鎶|�/u;

describe("welcome screen model", () => {
  it("uses real commands, clean copy, and a recognizable lotus mark", () => {
    const model = createWelcomeModel({
      modelLabel: "lotus-sec-7b",
      permissionLevel: "read-only",
      cwd: "E:\\BaiduSyncdisk\\项目学习\\挑战杯揭榜挂帅\\EGO-Graph",
      network: "connected",
      memoryLabel: "8KB / 2GB (0%)",
      toolCount: 12,
      startupLabel: "0.8s",
      lastSessionLabel: "2026-07-06 14:32",
    });
    const tips = model.tips.map((tip) => tip.command);
    const allText = [
      model.title,
      model.identityLine,
      model.workspaceLine,
      model.logo.join("\n"),
      model.statusRows.flat().join("\n"),
      model.tips.map((tip) => `${tip.command} ${tip.description}`).join("\n"),
      model.whatsNew.join("\n"),
    ].join("\n");

    expect(tips).toEqual(["/history", "/model", "/permissions", "/mcp", "/memory", "/help"]);
    expect(tips.every((tip) => commandPalette.some((command) => command.name === tip))).toBe(true);
    expect(allText).not.toMatch(mojibakePattern);
    expect(model.identityLine).toBe("lotus-sec-7b | API Usage Billing | EGO-Graph Organization");
    expect(model.logo).toHaveLength(8);
    expect(model.logo.join("\n")).toContain("PURPLE LOTUS");
    expect(model.logo.join("\n")).toContain("EGO-Graph v0.1.0 TUI");
    expect(model.logo.join("\n")).toContain("████");
    expect(model.statusRows.flat()).toEqual(
      expect.arrayContaining([
        "Mode: agent",
        "Memory: 8KB / 2GB (0%)",
        "Config: default",
        "Policy: read-only",
        "Evidence: grounded",
        "Network: connected",
        "Startup: 0.8s",
      ]),
    );
    expect(model.whatsNew).toEqual([
      "Safe approval shortcuts",
      "Focusable diff review",
      "Restorable prompt drafts",
    ]);
  });
});
