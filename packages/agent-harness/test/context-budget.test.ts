import { describe, expect, it } from "vitest";
import { analyzeContextBudget, renderContextBudgetHint } from "../src/index.js";

describe("context budget", () => {
  it("marks omitted history as needing compaction", () => {
    const selectedMessages = [stored("m2", "user", 400), stored("m3", "assistant", 500)];
    const decision = analyzeContextBudget({
      tokenBudget: 1_000,
      selectedMessages,
      allMessages: [stored("m1", "assistant", 1_200), ...selectedMessages],
    });

    expect(decision.status).toBe("needs_compaction");
    expect(decision.omittedCount).toBe(1);
    expect(renderContextBudgetHint(decision)).toContain("context=needs_compaction");
  });

  it("marks high utilization as near limit", () => {
    const messages = [stored("m1", "user", 830)];
    const decision = analyzeContextBudget({
      tokenBudget: 1_000,
      selectedMessages: messages,
      allMessages: messages,
    });

    expect(decision.status).toBe("near_limit");
    expect(decision.utilization).toBeCloseTo(0.83);
  });
});

function stored(id: string, role: "user" | "assistant", tokenCount: number) {
  return {
    id,
    sessionId: "session",
    role,
    contentJson: JSON.stringify(`${role}-${id}`),
    tokenCount,
    createdAt: "2026-07-06T00:00:00.000Z",
  };
}
