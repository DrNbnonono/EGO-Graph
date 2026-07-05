import { describe, expect, it } from "vitest";
import { renderEventLines } from "../../src/tui/tui-events.js";

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
});
