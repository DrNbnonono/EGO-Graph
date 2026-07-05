import { describe, expect, it } from "vitest";
import { displayWidth, truncateDisplay } from "../../src/tui/cjk.js";
import { wrapDisplay } from "../../src/tui/text-wrap.js";

describe("CJK display helpers", () => {
  it("counts mixed Chinese, ASCII, emoji, and Windows paths by display width", () => {
    expect(displayWidth("你好ab")).toBe(6);
    expect(displayWidth("E:\\项目\\README.md")).toBeGreaterThan("E:\\README.md".length);
    expect(displayWidth("ok ✓")).toBeGreaterThanOrEqual(4);
  });

  it("truncates without splitting wide characters", () => {
    expect(truncateDisplay("你好世界abc", 5)).toBe("你好…");
    expect(displayWidth(truncateDisplay("你好世界abc", 5))).toBeLessThanOrEqual(5);
  });

  it("wraps markdown bullets and code lines within display width", () => {
    const lines = wrapDisplay("- 修复 TUI command palette 和 README.md", 12);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => displayWidth(line) <= 12)).toBe(true);
  });

  it("keeps ASCII product names together when wrapping mixed CJK text", () => {
    const lines = wrapDisplay("当前 EGO-Graph 项目的模型是 MiniMax-M3", 10);
    const transcript = lines.join("\n");

    expect(transcript).toContain("EGO-Graph");
    expect(transcript).toContain("MiniMax-M3");
    expect(transcript).not.toContain("EGO\n-Graph");
    expect(lines.every((line) => displayWidth(line) <= 10)).toBe(true);
  });
});
