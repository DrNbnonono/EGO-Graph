import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatModelProvider, generateJson } from "../src/index.js";

describe("chat model provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls an OpenAI-compatible chat endpoint and parses JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ decision: "ok" }) } }],
        }),
        { status: 200 },
      ),
    );
    const provider = createChatModelProvider({
      provider: "openai-compatible",
      baseUrl: "https://gateway.example.test",
      chatPath: "/compatible/chat",
      apiKey: "test-key",
      model: "test-model",
      headers: { "x-extra": "1" },
      timeoutMs: 1000,
      maxTokens: 4096,
      wireApi: "openai-chat-completions",
    });

    if (!provider) {
      throw new Error("expected configured provider");
    }

    const result = await generateJson(provider, z.object({ decision: z.literal("ok") }), {
      messages: [{ role: "user", content: "decide" }],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(result.decision).toBe("ok");
    expect(String(url)).toBe("https://gateway.example.test/compatible/chat");
    expect((init?.headers as Record<string, string>)["x-extra"]).toBe("1");
    expect(init?.body).toContain("test-model");
  });

  it("calls the MiniMax Anthropic Messages endpoint and parses text blocks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg-test",
          type: "message",
          role: "assistant",
          model: "MiniMax-M3",
          content: [
            { type: "thinking", thinking: "Select the allowed fixture tool." },
            { type: "text", text: JSON.stringify({ decision: "ok" }) },
          ],
          stop_reason: "end_turn",
        }),
        { status: 200 },
      ),
    );
    const provider = createChatModelProvider({
      provider: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic",
      chatPath: "/v1/messages",
      apiKey: "test-key",
      model: "MiniMax-M3",
      headers: {},
      timeoutMs: 1000,
      wireApi: "anthropic-messages",
      maxTokens: 4096,
    });

    if (!provider) {
      throw new Error("expected configured provider");
    }

    const result = await generateJson(provider, z.object({ decision: z.literal("ok") }), {
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: "decide" },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: string; content: string }[];
    };

    expect(result.decision).toBe("ok");
    expect(String(url)).toBe("https://api.minimaxi.com/anthropic/v1/messages");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(body.model).toBe("MiniMax-M3");
    expect(body.max_tokens).toBe(4096);
    expect(body.system).toBe("Return JSON only.");
    expect(body.messages).toEqual([{ role: "user", content: "decide" }]);
  });
});
