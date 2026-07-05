import { describe, expect, it } from "vitest";
import {
  createConversationWindow,
  preserveScrollOffsetOnAppend,
} from "../../src/tui/conversation-view.js";

describe("conversation window", () => {
  const events = Array.from({ length: 30 }, (_, index) => ({
    type: "assistant.message" as const,
    runId: "run-1",
    sessionId: "session-1",
    message: `line ${index + 1}`,
    createdAt: "2026-07-05T10:00:00.000Z",
    payload: {},
  }));

  it("clamps scroll offset so long output remains reachable without blank windows", () => {
    const window = createConversationWindow({
      events,
      width: 80,
      height: 8,
      scrollOffset: 999,
      debug: false,
      thinkingExpanded: false,
      replayMode: false,
    });

    expect(window.maxScroll).toBeGreaterThan(0);
    expect(window.scrollOffset).toBe(window.maxScroll);
    expect(window.visibleLines.length).toBeGreaterThan(0);
  });

  it("preserves a reviewed viewport when new output arrives", () => {
    expect(
      preserveScrollOffsetOnAppend({ currentOffset: 12, previousTotal: 40, nextTotal: 45 }),
    ).toBe(17);
    expect(
      preserveScrollOffsetOnAppend({ currentOffset: 0, previousTotal: 40, nextTotal: 45 }),
    ).toBe(0);
  });
});
