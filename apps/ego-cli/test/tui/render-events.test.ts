import { describe, expect, it } from "vitest";
import { isUserPromptLine } from "../../src/tui/conversation-view.js";
import { renderConversationLines, renderEventLines } from "../../src/tui/tui-events.js";

describe("TUI event rendering", () => {
  it("folds tool events by default and expands debug payload only in debug mode", () => {
    const event = {
      type: "tool.completed" as const,
      runId: "run-1",
      sessionId: "session-1",
      message: "Completed workspace.read",
      createdAt: "2026-07-05T10:00:00.000Z",
      payload: { debug: { fullOutput: { content: "secret detail" } } },
    };

    expect(
      renderEventLines(event, { width: 80, debug: false, thinkingExpanded: false }).join("\n"),
    ).not.toContain("secret detail");
    expect(
      renderEventLines(event, { width: 80, debug: true, thinkingExpanded: false }).join("\n"),
    ).toContain("secret detail");
  });

  it("expands folded thinking and tool summaries when requested", () => {
    const event = {
      type: "tool.completed" as const,
      runId: "run-1",
      sessionId: "session-1",
      message: "Read package.json",
      createdAt: "2026-07-05T10:00:00.000Z",
      payload: { debug: { command: "workspace.read", path: "package.json" } },
    };

    const folded = renderEventLines(event, {
      width: 80,
      debug: false,
      thinkingExpanded: false,
    }).join("\n");
    const expanded = renderEventLines(event, {
      width: 80,
      debug: false,
      thinkingExpanded: true,
    }).join("\n");

    expect(folded).toContain("Ctrl+O");
    expect(folded).not.toContain("package.json");
    expect(expanded).toContain("package.json");
  });

  it("renders user prompts as concept-style prompt lines", () => {
    const event = {
      type: "user.message" as const,
      runId: "run-1",
      sessionId: "session-1",
      message: "你好你的模型是什么？",
      createdAt: "2026-07-05T10:00:00.000Z",
      payload: {},
    };

    const lines = renderEventLines(event, {
      width: 80,
      debug: false,
      thinkingExpanded: false,
    });

    expect(lines[0]).toBe("❯ 你好你的模型是什么？");
    expect(isUserPromptLine(lines[0] ?? "")).toBe(true);
  });

  it("coalesces streaming assistant deltas into one readable assistant block", () => {
    const base = {
      runId: "run-1",
      sessionId: "session-1",
      createdAt: "2026-07-05T10:00:00.000Z",
      payload: {},
    };
    const lines = renderConversationLines(
      [
        { ...base, type: "user.message" as const, message: "你的模型是什么？" },
        { ...base, type: "assistant.delta" as const, message: "我是 **" },
        { ...base, type: "assistant.delta" as const, message: "MiniMax-M3**，" },
        { ...base, type: "assistant.delta" as const, message: "由 MiniMax 开发。" },
      ],
      { width: 80, debug: false, thinkingExpanded: false },
    );

    expect(lines.join("\n")).toContain("我是 MiniMax-M3，由 MiniMax 开发。");
    expect(lines.filter((line) => line.startsWith("✻"))).toHaveLength(0);
  });
});
