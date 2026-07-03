import {z} from "zod";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createChatModelProvider, generateJson} from "../src/index.js";

describe("chat model provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls an OpenAI-compatible chat endpoint and parses JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{message: {content: JSON.stringify({decision: "ok"})}}],
        }),
        {status: 200},
      ),
    );
    const provider = createChatModelProvider({
      provider: "openai-compatible",
      baseUrl: "https://gateway.example.test",
      chatPath: "/compatible/chat",
      apiKey: "test-key",
      model: "test-model",
      headers: {"x-extra": "1"},
      timeoutMs: 1000,
    });

    if (!provider) {
      throw new Error("expected configured provider");
    }

    const result = await generateJson(provider, z.object({decision: z.literal("ok")}), {
      messages: [{role: "user", content: "decide"}],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(result.decision).toBe("ok");
    expect(String(url)).toBe("https://gateway.example.test/compatible/chat");
    expect((init?.headers as Record<string, string>)["x-extra"]).toBe("1");
    expect(init?.body).toContain("test-model");
  });
});
