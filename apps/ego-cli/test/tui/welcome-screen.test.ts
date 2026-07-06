import { describe, expect, it } from "vitest";
import { commandPalette } from "../../src/tui/command-palette.js";
import { createWelcomeModel, renderWelcomeLines } from "../../src/tui/welcome-screen.js";

const mojibakePattern = /鈥|鈻|鏆|杩|浼|娲|璇|缃|鍚|瀹|鍙|鎶|�/u;

describe("welcome screen model", () => {
  it("matches the concept screen with real commands and onboarding copy", () => {
    const model = createWelcomeModel({
      modelLabel: "lotus-sec-7b",
      permissionLevel: "read-only",
      cwd: "E:\\BaiduSyncdisk\\项目学习\\挑战杯揭榜挂帅\\EGO-Graph",
      network: "connected",
      memoryLabel: "8KB / 2GB (0%)",
      toolCount: 12,
      startupLabel: "0.8s",
      lastSessionLabel: "2025-05-18 14:32",
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
      model.demoPrompt,
      model.demoLines.join("\n"),
      model.readyLine,
    ].join("\n");

    expect(tips).toEqual(["/init", "/scan", "/analyze", "/report", "/tools", "/help"]);
    expect(tips.every((tip) => commandPalette.some((command) => command.name === tip))).toBe(true);
    expect(allText).not.toMatch(mojibakePattern);
    expect(model.logo.join("\n")).toContain("████");
    expect(model.demoPrompt).toBe("你好你的模型是什么？");
    expect(model.demoLines).toEqual(
      expect.arrayContaining([
        "你好！我是 EGO-Graph，一个面向网络安全场景的智能体（Agent）。",
        "核心能力：任务理解 · 证据分析 · 工具编排 · 报告生成",
      ]),
    );
  });

  it("renders bounded concept lines for a real terminal width", () => {
    const model = createWelcomeModel({
      modelLabel: "lotus-sec-7b",
      permissionLevel: "read-only",
      cwd: "E:\\BaiduSyncdisk\\项目学习\\挑战杯揭榜挂帅\\EGO-Graph",
      network: "connected",
    });
    const lines = renderWelcomeLines(model, 100, 28);

    expect(lines.join("\n")).toContain("Welcome back!");
    expect(lines.join("\n")).toContain("Tips for getting started");
    expect(lines.join("\n")).toContain("PURPLE LOTUS / 紫莲花");
    expect(lines.join("\n")).toContain("你好你的模型是什么？");
    expect(lines.join("\n")).toContain("Runtime ready");
    expect(lines.every((line) => line.length <= 100)).toBe(true);
  });
});
