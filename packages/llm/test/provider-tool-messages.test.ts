import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createChatModelProvider,
  splitAnthropicMessages,
  toOpenAiMessages,
  type ChatMessage,
} from "../src/provider.js";

describe("openai tool message translation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits an assistant tool_calls message followed by a role:tool result message", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "read README" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I will read it." },
          { type: "tool_use", id: "call-1", name: "workspace.read", input: { path: "README.md" } },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        name: "workspace.read",
        content: [{ type: "tool_result", toolUseId: "call-1", content: "README body" }],
      },
    ];

    const wire = toOpenAiMessages(messages) as Array<Record<string, unknown>>;
    expect(wire).toHaveLength(3);
    expect(wire[1].role).toBe("assistant");
    expect(wire[1].tool_calls).toEqual([
      {
        id: "call-1",
        type: "function",
        function: { name: "workspace.read", arguments: '{"path":"README.md"}' },
      },
    ]);
    expect(wire[1].content).toBe("I will read it.");
    expect(wire[2].role).toBe("tool");
    expect(wire[2].tool_call_id).toBe("call-1");
    expect(wire[2].content).toBe("README body");
  });

  it("keeps plain-string messages on the wire verbatim", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "hi" },
    ];
    const wire = toOpenAiMessages(messages);
    expect(wire).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "hi" },
    ]);
  });
});

describe("anthropic tool message translation", () => {
  it("moves system messages out and turns tool_use/tool_result into native blocks", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "be safe" },
      { role: "user", content: "read README" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "calling tool" },
          { type: "tool_use", id: "call-1", name: "workspace.read", input: { path: "README.md" } },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        content: [{ type: "tool_result", toolUseId: "call-1", content: "README body" }],
      },
    ];

    const { system, messages: wire } = splitAnthropicMessages(messages);
    expect(system).toBe("be safe");
    expect(wire).toHaveLength(3);
    const assistant = wire[1] as { role: string; content: Array<{ type: string }> };
    expect(assistant.role).toBe("assistant");
    expect(assistant.content.map((block) => block.type)).toEqual(["text", "tool_use"]);
    const toolResult = wire[2] as {
      role: string;
      content: Array<{ type: string; tool_use_id?: string; content?: string }>;
    };
    expect(toolResult.role).toBe("user");
    expect(toolResult.content[0].type).toBe("tool_result");
    expect(toolResult.content[0].tool_use_id).toBe("call-1");
    expect(toolResult.content[0].content).toBe("README body");
  });

  it("preserves plain-string content as native anthropic string content", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
    const { messages: wire } = splitAnthropicMessages(messages);
    expect(wire).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("anthropic tool_choice translation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards tool_choice to the anthropic wire format", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
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
    if (!provider?.completeStructured) {
      throw new Error("expected structured provider");
    }

    await provider.completeStructured({
      messages: [{ role: "user", content: "use the tool" }],
      tools: [{ name: "workspace.read", inputSchema: { type: "object" } }],
      toolChoice: "required",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      tool_choice?: { type: string };
    };
    expect(body.tool_choice).toEqual({ type: "any" });
  });
});

describe("structured streaming assembles incremental tool calls", () => {
  it("parses OpenAI streaming tool_call fragments into a complete call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        createSseStream([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"workspace.read","arguments":""}}]}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"README.md\\"}"}}]}}]}',
          'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"tool_calls"}]}',
          "data: [DONE]",
        ]),
        { status: 200 },
      ),
    );
    const provider = createChatModelProvider({
      provider: "openai-compatible",
      baseUrl: "https://gateway.example.test",
      chatPath: "/v1/chat/completions",
      apiKey: "test-key",
      model: "test-model",
      headers: {},
      timeoutMs: 1000,
      maxTokens: 4096,
      wireApi: "openai-chat-completions",
    });
    if (!provider?.streamStructured) {
      throw new Error("expected streamStructured provider");
    }

    const events = [];
    for await (const event of provider.streamStructured({
      messages: [{ role: "user", content: "read README" }],
      tools: [{ name: "workspace.read", inputSchema: { type: "object" } }],
    })) {
      events.push(event);
    }

    const complete = events.find(
      (event) => event.type === "tool_call_complete",
    ) as { type: "tool_call_complete"; toolCall: { id: string; name: string; arguments: unknown } };
    expect(complete).toBeTruthy();
    expect(complete.toolCall.id).toBe("call-1");
    expect(complete.toolCall.name).toBe("workspace.read");
    expect(complete.toolCall.arguments).toEqual({ path: "README.md" });

    const text = events.filter((event) => event.type === "text");
    expect(text).toHaveLength(1);
  });

  it("parses Anthropic streaming tool_use input_json_delta into a complete call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        createSseStream([
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu-1","name":"workspace.read"}}',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"README.md\\"}"}}',
          'data: {"type":"content_block_stop","index":0}',
          'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"done"}}',
        ]),
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
    if (!provider?.streamStructured) {
      throw new Error("expected streamStructured provider");
    }

    const events = [];
    for await (const event of provider.streamStructured({
      messages: [{ role: "user", content: "read README" }],
      tools: [{ name: "workspace.read", inputSchema: { type: "object" } }],
    })) {
      events.push(event);
    }

    const complete = events.find(
      (event) => event.type === "tool_call_complete",
    ) as { type: "tool_call_complete"; toolCall: { id: string; name: string; arguments: unknown } };
    expect(complete).toBeTruthy();
    expect(complete.toolCall.id).toBe("toolu-1");
    expect(complete.toolCall.name).toBe("workspace.read");
    expect(complete.toolCall.arguments).toEqual({ path: "README.md" });
  });
});

function createSseStream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`${lines.join("\n\n")}\n\n`));
      controller.close();
    },
  });
}
