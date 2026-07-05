import { describe, expect, it } from "vitest";
import {
  createHistoryItems,
  resolveHistoryReference,
  type HistoryRunRecord,
} from "../../src/tui/history-browser.js";

const runs: HistoryRunRecord[] = [
  {
    runId: "run-a",
    scenario: "terminal-chat",
    status: "complete",
    eventCount: 8,
    updatedAt: "2026-07-05T10:00:00.000Z",
  },
  {
    runId: "run-b",
    scenario: "terminal-agent",
    status: "blocked",
    eventCount: 3,
    updatedAt: "2026-07-05T09:00:00.000Z",
  },
];

describe("history browser", () => {
  it("creates indexed persistent history rows", () => {
    const items = createHistoryItems(runs);

    expect(items[0]).toMatchObject({
      index: 1,
      runId: "run-a",
      status: "complete",
      eventCount: 8,
    });
    expect(items[0]?.title).toContain("terminal-chat");
  });

  it("resolves numeric replay references and raw run ids", () => {
    const items = createHistoryItems(runs);

    expect(resolveHistoryReference("1", items)).toBe("run-a");
    expect(resolveHistoryReference("run-b", items)).toBe("run-b");
    expect(resolveHistoryReference("99", items)).toBeUndefined();
  });
});
