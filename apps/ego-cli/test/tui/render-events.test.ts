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

    expect(renderEventLines(event, { width: 80, debug: false }).join("\n")).not.toContain(
      "secret detail",
    );
    expect(renderEventLines(event, { width: 80, debug: true }).join("\n")).toContain(
      "secret detail",
    );
  });
});
