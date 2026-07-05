import { describe, expect, it } from "vitest";
import {
  approximateStringTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateTokens,
} from "../src/tokens.js";
import type { ChatMessage } from "../src/provider.js";

describe("approximateStringTokens", () => {
  it("returns 0 for empty input", () => {
    expect(approximateStringTokens("")).toBe(0);
  });

  it("counts ASCII as roughly 4 chars per token", () => {
    // 8 ASCII chars -> 2 tokens by /4 heuristic.
    expect(approximateStringTokens("abcdefgh")).toBe(2);
  });

  it("counts each CJK character as roughly 1 token", () => {
    // 4 CJK characters -> 4 tokens (one per char).
    expect(approximateStringTokens("你好世界")).toBe(4);
  });

  it("mixes CJK and ASCII", () => {
    // 你好 = 2 CJK (2 tokens), abc = 3 ASCII (ceil(3/4) = 1 token) => 3.
    expect(approximateStringTokens("你好abc")).toBe(3);
  });
});

describe("estimateTokens", () => {
  it("estimates a plain string block", () => {
    expect(estimateTokens("hello world")).toBe(approximateStringTokens("hello world"));
  });

  it("estimates a tool_use block including name and serialized input", () => {
    const tokens = estimateTokens({
      type: "tool_use",
      id: "call-1",
      name: "workspace.read",
      input: { path: "README.md" },
    });
    expect(tokens).toBeGreaterThan(0);
  });

  it("estimates a tool_result block", () => {
    const tokens = estimateTokens({
      type: "tool_result",
      toolUseId: "call-1",
      content: "file content here",
    });
    expect(tokens).toBe(approximateStringTokens("file content here") + 6);
  });
});

describe("estimateMessageTokens", () => {
  it("adds role overhead to string content", () => {
    const message: ChatMessage = { role: "user", content: "hello" };
    expect(estimateMessageTokens(message)).toBe(approximateStringTokens("hello") + 4);
  });

  it("estimates an array of mixed blocks", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Reading file." },
        { type: "tool_use", id: "call-1", name: "read", input: { path: "a" } },
      ],
    };
    expect(estimateMessageTokens(message)).toBeGreaterThan(4);
  });
});

describe("estimateMessagesTokens", () => {
  it("sums across messages and adds trailing priming", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "be helpful" },
      { role: "user", content: "hi" },
    ];
    const sum = messages.reduce(
      (acc, message) => acc + estimateMessageTokens(message),
      0,
    );
    expect(estimateMessagesTokens(messages)).toBe(sum + 3);
  });
});
