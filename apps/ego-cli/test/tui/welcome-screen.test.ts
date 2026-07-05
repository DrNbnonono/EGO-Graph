import { describe, expect, it } from "vitest";
import { createWelcomeModel } from "../../src/tui/welcome-screen.js";

describe("welcome screen model", () => {
  it("matches the concept startup panel content", () => {
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

    expect(model.title).toBe("EGO-Graph v0.1.0");
    expect(model.logo.join("\n")).toContain("紫莲花");
    expect(model.identityLine).toBe("lotus-sec-7b • API Usage Billing • EGO-Graph Organization");
    expect(model.workspaceLine).toContain("Workspace:");
    expect(model.tips.map((tip) => tip.command)).toEqual([
      "/init",
      "/scan",
      "/analyze",
      "/report",
      "/tools",
      "/help",
    ]);
    expect(model.statusRows.flat()).toEqual(
      expect.arrayContaining([
        "运行模式: agent",
        "内存使用: 8KB / 2GB (0%)",
        "会话配置: default",
        "活动策略: policy v1.0",
        "证据模式: evidence-grounded",
        "网络状态: connected",
        "启动时间: 0.8s",
      ]),
    );
    expect(model.whatsNew).toContain("报告生成流程优化");
  });
});
