import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@ego-graph/llm";
import {
  analyzeChatContextBudget,
  compactModelMessages,
  estimateMessagesCost,
  shouldCompact,
} from "../src/context/auto-compaction.js";
import {
  DEFAULT_MODEL_CONTEXT_LIMITS,
  resolveModelContextLimit,
} from "../src/context/model-limits.js";

function buildLongConversation(turns: number): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: "preamble" }];
  for (let i = 0; i < turns; i += 1) {
    messages.push({ role: "user", content: `第 ${i} 步：分析这段非常长的代码上下文 ${"x".repeat(800)}` });
    messages.push({
      role: "assistant",
      content: [
        { type: "text", text: `第 ${i} 步的中间结论 ${"y".repeat(800)}` },
        {
          type: "tool_use",
          id: `tool-${i}`,
          name: "workspace.grep",
          input: { query: "foo" },
        },
      ],
    });
    messages.push({
      role: "tool",
      toolCallId: `tool-${i}`,
      name: "workspace.grep",
      content: [{ type: "tool_result", toolUseId: `tool-${i}`, content: "result ".repeat(300) }],
    });
  }
  messages.push({ role: "user", content: "现在给出最终结论" });
  return messages;
}

describe("auto-compaction", () => {
  it("keeps messages as-is when under budget", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "preamble" },
      { role: "user", content: "hi" },
    ];
    const result = compactModelMessages({ messages, contextLimit: 10_000 });
    expect(result.droppedCount).toBe(0);
    expect(result.activeMessages).toBe(messages);
  });

  it("compacts when over budget and preserves system preamble + current user + recent tool", () => {
    const messages = buildLongConversation(12);
    const budget = analyzeChatContextBudget({
      messages,
      contextLimit: 2000,
    });
    expect(shouldCompact(budget)).toBe(true);

    const result = compactModelMessages({
      messages,
      contextLimit: 2000,
      keepRecentTools: 2,
    });
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.compactedSummary).toContain("[context compacted]");
    const kinds = result.preserved.map((item) => item.kind);
    expect(kinds).toContain("system_preamble");
    expect(kinds).toContain("user_turn");
    expect(kinds.some((kind) => kind === "recent_tool" || kind === "p0_evidence")).toBe(true);
    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
  });

  it("preserves a P0-tagged tool result even outside the recent window", () => {
    const messages = buildLongConversation(10);
    // Tag an early tool result (tool-1) as P0 evidence.
    const result = compactModelMessages({
      messages,
      contextLimit: 2000,
      keepRecentTools: 2,
      p0ToolUseIds: new Set(["tool-1"]),
    });
    const p0 = result.preserved.find((item) => item.kind === "p0_evidence");
    expect(p0).toBeDefined();
    // The tool-1 result must still be present in the active messages.
    const hasToolOne = result.activeMessages.some(
      (message) =>
        message.role === "tool" && message.toolCallId === "tool-1",
    );
    expect(hasToolOne).toBe(true);
  });

  it("is stable: compacting an already-compacted list does not drop further on a second pass", () => {
    const messages = buildLongConversation(10);
    const first = compactModelMessages({ messages, contextLimit: 2000 });
    const second = compactModelMessages({
      messages: first.activeMessages,
      contextLimit: 2000,
    });
    expect(second.droppedCount).toBeLessThanOrEqual(first.droppedCount);
  });

  it("estimateMessagesCost is monotonic and positive", () => {
    const messages = buildLongConversation(3);
    expect(estimateMessagesCost(messages)).toBeGreaterThan(0);
    expect(estimateMessagesCost(messages.slice(0, 2))).toBeLessThan(
      estimateMessagesCost(messages),
    );
  });

  it("resolveModelContextLimit honors explicit override and wireApi catalog", () => {
    expect(resolveModelContextLimit({ contextLimit: 50_000 })).toBe(50_000);
    expect(
      resolveModelContextLimit({ wireApi: "anthropic-messages" }),
    ).toBe(DEFAULT_MODEL_CONTEXT_LIMITS["anthropic-messages"]);
    expect(resolveModelContextLimit({})).toBe(
      DEFAULT_MODEL_CONTEXT_LIMITS.unknown,
    );
  });

  it("analyzeChatContextBudget transitions healthy -> near_limit -> needs_compaction", () => {
    const small: ChatMessage[] = [{ role: "system", content: "x" }];
    expect(
      analyzeChatContextBudget({ messages: small, contextLimit: 10_000 }).status,
    ).toBe("healthy");
    // Need ~7000 tokens (0.7 utilization) to trip needs_compaction.
    // ASCII heuristic is ~4 chars/token, so ~28000 chars.
    const heavy: ChatMessage[] = [
      { role: "system", content: "x".repeat(28_000) },
    ];
    const decision = analyzeChatContextBudget({
      messages: heavy,
      contextLimit: 10_000,
    });
    expect(decision.status).toBe("needs_compaction");
    expect(decision.utilization).toBeGreaterThan(0.7);
  });
});
