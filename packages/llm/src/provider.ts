import type { z, ZodTypeAny } from "zod";
import { isModelConfigured, type ModelConfig } from "./config.js";
import { ModelRequestError, parseRetryAfter } from "./model-request-error.js";

/**
 * Content-block model. Messages may carry either a plain string (backwards
 * compatible with every existing caller) or a structured array of blocks.
 *
 * Tool calls and tool results are first-class so a multi-turn tool
 * conversation (assistant tool_use -> tool result -> assistant reply) can be
 * fed back to the model verbatim. Without this the agent loop cannot run a
 * real Plan -> Act -> Observe cycle.
 */
export type ChatToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ChatToolResultBlock = {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
};

export type ChatTextBlock = { type: "text"; text: string };

export type ChatContentBlock = string | ChatTextBlock | ChatToolUseBlock | ChatToolResultBlock;

export type ChatContentBlockArray = ChatContentBlock[];

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: ChatContentBlock | ChatContentBlockArray;
  /**
   * Present on `role: "tool"` messages and on assistant messages that carry a
   * tool_use block referenced by a following tool message. OpenAI expects
   * `tool_call_id`, Anthropic uses content-block `tool_use_id`.
   */
  toolCallId?: string;
  /** Tool name for `role: "tool"` messages. */
  name?: string;
};

export type ChatCompletionInput = {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "text" | "json";
  maxTokens?: number;
  tools?: ChatToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  /** Optional abort signal propagated to the underlying fetch. */
  signal?: AbortSignal;
};

export type ChatToolDefinition = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type StructuredChatCompletion = {
  content: string;
  toolCalls: ChatToolCall[];
};

/**
 * Structured streaming event. Tool-call arguments arrive incrementally; we
 * surface per-tool deltas plus a final `tool_call_complete` carrying the
 * fully-assembled call so consumers do not have to reassemble themselves.
 */
export type ChatStreamEvent =
  | { type: "text"; content: string }
  | {
      type: "tool_call_delta";
      toolCallId: string;
      toolName?: string;
      argumentsDelta: string;
    }
  | { type: "tool_call_complete"; toolCall: ChatToolCall }
  | { type: "done"; content: string; toolCalls: ChatToolCall[] };

export type ChatModelProvider = {
  name: string;
  model: string;
  complete(input: ChatCompletionInput): Promise<string>;
  streamComplete?(input: ChatCompletionInput): AsyncIterable<string>;
  completeStructured?(input: ChatCompletionInput): Promise<StructuredChatCompletion>;
  /**
   * Structured streaming: text deltas plus tool-call assembly. Falls back to
   * text-only streaming when the underlying wire does not surface tool deltas.
   */
  streamStructured?(input: ChatCompletionInput): AsyncIterable<ChatStreamEvent>;
};

export class ModelConfigurationError extends Error {}

export function createChatModelProvider(config: ModelConfig): ChatModelProvider | undefined {
  if (!isModelConfigured(config)) {
    return undefined;
  }

  if (config.wireApi === "anthropic-messages") {
    return createAnthropicMessagesProvider(config);
  }

  return createOpenAICompatibleProvider(config);
}

export function createOpenAICompatibleProvider(config: ModelConfig): ChatModelProvider {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new ModelConfigurationError("Model provider requires baseUrl, apiKey, and model");
  }

  const endpoint = createEndpointUrl(config.baseUrl, config.chatPath);

  return {
    name: config.provider,
    model: config.model,
    async complete(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      abortOnSignal(controller, input.signal);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: openAiHeaders(config),
          body: JSON.stringify({
            model: config.model,
            messages: toOpenAiMessages(input.messages),
            max_tokens: input.maxTokens ?? config.maxTokens,
            temperature: input.temperature ?? 0,
            response_format: input.responseFormat === "json" ? { type: "json_object" } : undefined,
            ...(input.tools ? { tools: toOpenAiTools(input.tools) } : {}),
            ...(input.toolChoice ? { tool_choice: toOpenAiToolChoice(input.toolChoice) } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new ModelRequestError({
            message: `Model request failed ${response.status}: ${text.slice(0, 500)}`,
            statusCode: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
            providerName: config.provider,
          });
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new ModelRequestError({
            message: "Model response did not include assistant content",
            providerName: config.provider,
          });
        }
        return content;
      } finally {
        clearTimeout(timeout);
      }
    },
    async *streamComplete(input) {
      for await (const event of streamStructuredInternal(input)) {
        if (event.type === "text") {
          yield event.content;
        }
      }
    },
    async completeStructured(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      abortOnSignal(controller, input.signal);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: openAiHeaders(config),
          body: JSON.stringify({
            model: config.model,
            messages: toOpenAiMessages(input.messages),
            max_tokens: input.maxTokens ?? config.maxTokens,
            temperature: input.temperature ?? 0,
            ...(input.tools ? { tools: toOpenAiTools(input.tools) } : {}),
            ...(input.toolChoice ? { tool_choice: toOpenAiToolChoice(input.toolChoice) } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new ModelRequestError({
            message: `Model request failed ${response.status}: ${text.slice(0, 500)}`,
            statusCode: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
            providerName: config.provider,
          });
        }

        const data = (await response.json()) as {
          choices?: {
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }[];
        };
        const message = data.choices?.[0]?.message;
        return {
          content: message?.content ?? "",
          toolCalls: parseOpenAiToolCalls(message?.tool_calls ?? []),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    async *streamStructured(input) {
      yield* streamStructuredInternal(input);
    },
  };

  async function* streamStructuredInternal(
    input: ChatCompletionInput,
  ): AsyncIterable<ChatStreamEvent> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    abortOnSignal(controller, input.signal);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: openAiHeaders(config),
        body: JSON.stringify({
          model: config.model,
          messages: toOpenAiMessages(input.messages),
          max_tokens: input.maxTokens ?? config.maxTokens,
          temperature: input.temperature ?? 0,
          stream: true,
          ...(input.tools ? { tools: toOpenAiTools(input.tools) } : {}),
          ...(input.toolChoice ? { tool_choice: toOpenAiToolChoice(input.toolChoice) } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ModelRequestError({
                  message: `Model stream failed ${response.status}: ${text.slice(0, 500)}`,
                  statusCode: response.status,
                  retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
                  providerName: config.provider,
                });
      }
      if (!response.body) {
        throw new Error("Model stream response did not include a body");
      }

      yield* parseOpenAiSseStructured(response.body);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAnthropicMessagesProvider(config: ModelConfig): ChatModelProvider {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new ModelConfigurationError("Model provider requires baseUrl, apiKey, and model");
  }

  const endpoint = createEndpointUrl(config.baseUrl, config.chatPath);

  return {
    name: config.provider,
    model: config.model,
    async complete(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      abortOnSignal(controller, input.signal);
      const { system, messages } = splitAnthropicMessages(input.messages);

      if (messages.length === 0) {
        throw new ModelConfigurationError("Anthropic Messages requests require a user message");
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: anthropicHeaders(config),
          body: JSON.stringify({
            model: config.model,
            max_tokens: input.maxTokens ?? config.maxTokens,
            messages,
            temperature: input.temperature ?? 0,
            ...(system ? { system } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new ModelRequestError({
                    message: `Model request failed ${response.status}: ${text.slice(0, 500)}`,
                    statusCode: response.status,
                    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
                    providerName: config.provider,
                  });
        }

        const data = (await response.json()) as {
          content?: { type?: string; text?: string }[];
        };
        const content = data.content
          ?.filter((block) => block.type === "text" && typeof block.text === "string")
          .map((block) => block.text)
          .join("\n")
          .trim();
        if (!content) {
          throw new Error("Model response did not include assistant text content");
        }
        return content;
      } finally {
        clearTimeout(timeout);
      }
    },
    async *streamComplete(input) {
      for await (const event of streamStructuredInternal(input)) {
        if (event.type === "text") {
          yield event.content;
        }
      }
    },
    async completeStructured(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      abortOnSignal(controller, input.signal);
      const { system, messages } = splitAnthropicMessages(input.messages);

      if (messages.length === 0) {
        throw new ModelConfigurationError("Anthropic Messages requests require a user message");
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: anthropicHeaders(config),
          body: JSON.stringify({
            model: config.model,
            max_tokens: input.maxTokens ?? config.maxTokens,
            messages,
            temperature: input.temperature ?? 0,
            ...(system ? { system } : {}),
            ...(input.tools ? { tools: toAnthropicTools(input.tools) } : {}),
            ...(input.toolChoice ? { tool_choice: toAnthropicToolChoice(input.toolChoice) } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new ModelRequestError({
                    message: `Model request failed ${response.status}: ${text.slice(0, 500)}`,
                    statusCode: response.status,
                    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
                    providerName: config.provider,
                  });
        }

        const data = (await response.json()) as {
          content?: Array<{
            type?: string;
            text?: string;
            id?: string;
            name?: string;
            input?: unknown;
          }>;
        };
        return parseAnthropicStructuredResponse(data.content ?? []);
      } finally {
        clearTimeout(timeout);
      }
    },
    async *streamStructured(input) {
      yield* streamStructuredInternal(input);
    },
  };

  async function* streamStructuredInternal(
    input: ChatCompletionInput,
  ): AsyncIterable<ChatStreamEvent> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    abortOnSignal(controller, input.signal);
    const { system, messages } = splitAnthropicMessages(input.messages);

    if (messages.length === 0) {
      throw new ModelConfigurationError("Anthropic Messages requests require a user message");
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: anthropicHeaders(config),
        body: JSON.stringify({
          model: config.model,
          max_tokens: input.maxTokens ?? config.maxTokens,
          messages,
          temperature: input.temperature ?? 0,
          stream: true,
          ...(system ? { system } : {}),
          ...(input.tools ? { tools: toAnthropicTools(input.tools) } : {}),
          ...(input.toolChoice ? { tool_choice: toAnthropicToolChoice(input.toolChoice) } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ModelRequestError({
                  message: `Model stream failed ${response.status}: ${text.slice(0, 500)}`,
                  statusCode: response.status,
                  retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
                  providerName: config.provider,
                });
      }
      if (!response.body) {
        throw new Error("Model stream response did not include a body");
      }

      yield* parseAnthropicSseStructured(response.body);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function generateJson<Schema extends ZodTypeAny>(
  provider: ChatModelProvider,
  schema: Schema,
  input: ChatCompletionInput,
): Promise<z.output<Schema>> {
  const content = await provider.complete({ ...input, responseFormat: "json" });
  return schema.parse(JSON.parse(extractJsonObject(content)));
}

function createEndpointUrl(baseUrl: string, path: string): URL {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBaseUrl);
}

function openAiHeaders(config: ModelConfig): Record<string, string> {
  return {
    authorization: `Bearer ${config.apiKey}`,
    "content-type": "application/json",
    ...config.headers,
  };
}

function anthropicHeaders(config: ModelConfig): Record<string, string> {
  return {
    "x-api-key": config.apiKey!,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    ...config.headers,
  };
}

function abortOnSignal(controller: AbortController, signal?: AbortSignal): void {
  if (!signal) {
    return;
  }
  if (signal.aborted) {
    controller.abort(signal.reason);
    return;
  }
  signal.addEventListener(
    "abort",
    () => {
      controller.abort((signal as AbortSignal & { reason?: unknown }).reason);
    },
    { once: true },
  );
}

/**
 * Convert ChatMessage[] to the OpenAI wire format. Plain-string content is
 * passed through verbatim (so existing callers are unaffected). Block-array
 * content is translated into the appropriate OpenAI shape:
 *   - assistant tool_use blocks -> `tool_calls` field
 *   - tool_result blocks -> a `role: "tool"` message with `tool_call_id`
 *   - text blocks -> the message `content` string
 */
export function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  const output: unknown[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const result = firstToolResult(message.content);
      output.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
        content: result?.content ?? flattenContentToString(message.content),
      });
      continue;
    }

    if (message.role === "assistant" && hasToolUseBlock(message.content)) {
      const { text, toolCalls } = flattenAssistantContent(message.content);
      output.push({
        role: "assistant",
        ...(text ? { content: text } : { content: null }),
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.name,
            arguments: safeJsonStringify(call.input),
          },
        })),
      });
      continue;
    }

    output.push({
      role: message.role,
      content: flattenContentToString(message.content),
    });
  }
  return output;
}

/**
 * Convert ChatMessage[] to the Anthropic Messages wire format. System
 * messages are pulled out into the top-level `system` string; tool_use and
 * tool_result become native content blocks. Plain-string content is preserved
 * as a single text block (Anthropic accepts `content: string` natively).
 */
export function splitAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
} {
  const systemParts: string[] = [];
  const conversation: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = flattenContentToString(message.content);
      if (text) {
        systemParts.push(text);
      }
      continue;
    }

    if (message.role === "tool") {
      const result = firstToolResult(message.content);
      // Anthropic expects tool_result blocks inside a user message.
      const last = conversation[conversation.length - 1];
      const block = {
        type: "tool_result" as const,
        tool_use_id: message.toolCallId,
        content: result?.content ?? flattenContentToString(message.content),
        ...(result?.isError ? { is_error: true } : {}),
      };
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        conversation.push({ role: "user", content: [block] });
      }
      continue;
    }

    const blocks = toAnthropicContentBlocks(message.content, message.role);
    conversation.push({ role: message.role, content: blocks });
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    messages: conversation,
  };
}

function toAnthropicContentBlocks(
  content: ChatMessage["content"],
  role: ChatMessage["role"],
): unknown {
  if (typeof content === "string") {
    return content;
  }
  const array = Array.isArray(content) ? content : [content];
  if (array.length === 0) {
    return role === "assistant" ? "" : "";
  }
  // Fast path: a single text-only message keeps the cheaper string form.
  if (array.length === 1 && typeof array[0] === "string") {
    return array[0];
  }
  const blocks: unknown[] = [];
  for (const block of array) {
    if (typeof block === "string") {
      blocks.push({ type: "text", text: block });
    } else if (block.type === "text") {
      blocks.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      });
    } else if (block.type === "tool_result") {
      blocks.push({
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError ? { is_error: true } : {}),
      });
    }
  }
  return blocks;
}

function toOpenAiTools(tools: ChatToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema,
    },
  }));
}

function toOpenAiToolChoice(choice: NonNullable<ChatCompletionInput["toolChoice"]>): unknown {
  if (typeof choice === "string") {
    return choice;
  }
  return { type: "function", function: { name: choice.name } };
}

function toAnthropicTools(tools: ChatToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema,
  }));
}

function toAnthropicToolChoice(choice: NonNullable<ChatCompletionInput["toolChoice"]>): unknown {
  if (choice === "auto") {
    return { type: "auto" };
  }
  if (choice === "none") {
    // Anthropic has no explicit "none"; passing auto is the closest safe
    // behaviour and lets the model decide. Callers that need hard "no tools"
    // should omit the tools array instead.
    return { type: "auto" };
  }
  if (choice === "required") {
    return { type: "any" };
  }
  return { type: "tool", name: choice.name };
}

function parseOpenAiToolCalls(
  toolCalls: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>,
): ChatToolCall[] {
  return toolCalls
    .filter((call) => call.type === "function" && call.function?.name)
    .map((call, index) => ({
      id: call.id ?? `tool-call-${index + 1}`,
      name: call.function?.name ?? "",
      arguments: parseToolArguments(call.function?.arguments ?? "{}"),
    }));
}

function parseAnthropicStructuredResponse(
  blocks: Array<{
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>,
): StructuredChatCompletion {
  return {
    content: blocks
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n")
      .trim(),
    toolCalls: blocks
      .filter((block) => block.type === "tool_use" && block.name)
      .map((block, index) => ({
        id: block.id ?? `tool-call-${index + 1}`,
        name: block.name ?? "",
        arguments:
          typeof block.input === "object" && block.input !== null && !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {},
      })),
  };
}

function parseToolArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Parse OpenAI SSE stream into structured events: text deltas plus
 * incremental tool-call argument fragments. Tool-call argument JSON is
 * accumulated per tool_call_id and emitted as `tool_call_complete` once the
 * choice signals `finish_reason: "tool_calls"` (or when the stream ends).
 */
async function* parseOpenAiSseStructured(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<ChatStreamEvent> {
  const assembler = new OpenAiToolCallAssembler();
  let textBuffer = "";

  for await (const event of parseSseEvents(body)) {
    if (event === "[DONE]") {
      break;
    }
    const parsed = JSON.parse(event) as {
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
    };
    const choice = parsed.choices?.[0];
    const delta = choice?.delta;
    if (delta?.content) {
      textBuffer += delta.content;
      yield { type: "text", content: delta.content };
    }
    if (delta?.tool_calls) {
      for (const fragment of delta.tool_calls) {
        const assembled = assembler.ingest(fragment);
        if (assembled) {
          yield { type: "tool_call_complete", toolCall: assembled.call };
        } else if (assembled === null) {
          // Ingest returns null when only a delta was recorded; emit delta event.
          const toolName = fragment.function?.name;
          yield {
            type: "tool_call_delta",
            toolCallId: assembler.lastSeenId(fragment),
            ...(toolName ? { toolName } : {}),
            argumentsDelta: fragment.function?.arguments ?? "",
          };
        }
      }
    }
  }

  const flushed = assembler.flush();
  for (const call of flushed) {
    yield { type: "tool_call_complete", toolCall: call };
  }
  yield { type: "done", content: textBuffer, toolCalls: flushed };
}

/**
 * Parse Anthropic SSE stream into structured events: text deltas plus
 * tool_use input_json_delta fragments. Tool input is accumulated per block
 * index and emitted as `tool_call_complete` on `content_block_stop`.
 */
async function* parseAnthropicSseStructured(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<ChatStreamEvent> {
  const assembler = new AnthropicToolCallAssembler();
  let textBuffer = "";
  const completedCalls: ChatToolCall[] = [];

  for await (const event of parseSseEvents(body)) {
    const parsed = JSON.parse(event) as {
      type?: string;
      index?: number;
      content_block?: { type?: string; id?: string; name?: string; text?: string };
      delta?: {
        type?: string;
        text?: string;
        partial_json?: string;
      };
      message?: { stop_reason?: string };
    };

    if (parsed.type === "content_block_start" && parsed.content_block) {
      const block = parsed.content_block;
      if (block.type === "tool_use") {
        assembler.startBlock({
          index: parsed.index ?? 0,
          id: block.id ?? "",
          name: block.name ?? "",
        });
      }
      continue;
    }

    if (parsed.type === "content_block_delta" && parsed.delta) {
      if (parsed.delta.type === "text_delta" && parsed.delta.text) {
        textBuffer += parsed.delta.text;
        yield { type: "text", content: parsed.delta.text };
      } else if (parsed.delta.type === "input_json_delta" && parsed.delta.partial_json) {
        const delta = parsed.delta.partial_json;
        const id = assembler.ingestJson(parsed.index ?? 0, delta);
        if (id) {
          yield { type: "tool_call_delta", toolCallId: id, argumentsDelta: delta };
        }
      }
      continue;
    }

    if (parsed.type === "content_block_stop") {
      const completed = assembler.completeBlock(parsed.index ?? 0);
      if (completed) {
        completedCalls.push(completed);
        yield { type: "tool_call_complete", toolCall: completed };
      }
    }
  }

  const flushed = assembler.flush();
  for (const call of flushed) {
    completedCalls.push(call);
    yield { type: "tool_call_complete", toolCall: call };
  }
  yield { type: "done", content: textBuffer, toolCalls: completedCalls };
}

class OpenAiToolCallAssembler {
  private readonly calls = new Map<
    number,
    { id: string; name: string; argumentsBuffer: string }
  >();
  private order: number[] = [];

  ingest(fragment: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }): { call: ChatToolCall } | null | undefined {
    const index = fragment.index ?? 0;
    let entry = this.calls.get(index);
    if (!entry) {
      entry = {
        id: fragment.id ?? `tool-call-${index + 1}`,
        name: fragment.function?.name ?? "",
        argumentsBuffer: "",
      };
      this.calls.set(index, entry);
      this.order.push(index);
    }
    if (fragment.id && entry.id.startsWith("tool-call-")) {
      entry.id = fragment.id;
    }
    if (fragment.function?.name && !entry.name) {
      entry.name = fragment.function.name;
    }
    if (fragment.function?.arguments) {
      entry.argumentsBuffer += fragment.function.arguments;
      return null;
    }
    return undefined;
  }

  lastSeenId(fragment: { index?: number; id?: string }): string {
    if (fragment.id) {
      return fragment.id;
    }
    const index = fragment.index ?? 0;
    return this.calls.get(index)?.id ?? `tool-call-${index + 1}`;
  }

  flush(): ChatToolCall[] {
    return this.order
      .map((index) => {
        const entry = this.calls.get(index);
        if (!entry) {
          return undefined;
        }
        return {
          id: entry.id,
          name: entry.name,
          arguments: parseToolArguments(entry.argumentsBuffer || "{}"),
        };
      })
      .filter((call): call is ChatToolCall => call !== undefined);
  }
}

class AnthropicToolCallAssembler {
  private readonly blocks = new Map<
    number,
    { id: string; name: string; jsonBuffer: string }
  >();
  private order: number[] = [];

  startBlock(input: { index: number; id: string; name: string }): void {
    this.blocks.set(input.index, { id: input.id, name: input.name, jsonBuffer: "" });
    if (!this.order.includes(input.index)) {
      this.order.push(input.index);
    }
  }

  ingestJson(index: number, delta: string): string | undefined {
    const entry = this.blocks.get(index);
    if (!entry) {
      return undefined;
    }
    entry.jsonBuffer += delta;
    return entry.id;
  }

  completeBlock(index: number): ChatToolCall | undefined {
    const entry = this.blocks.get(index);
    if (!entry) {
      return undefined;
    }
    const call: ChatToolCall = {
      id: entry.id,
      name: entry.name,
      arguments: parseToolArguments(entry.jsonBuffer || "{}"),
    };
    this.blocks.delete(index);
    this.order = this.order.filter((value) => value !== index);
    return call;
  }

  flush(): ChatToolCall[] {
    return this.order
      .map((index) => this.completeBlock(index))
      .filter((call): call is ChatToolCall => call !== undefined);
  }
}

async function* parseSseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/u);
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const data = part
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");
      if (data) {
        yield data;
      }
    }
  }

  buffer += decoder.decode();
  const data = buffer
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (data) {
    yield data;
  }
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const match = trimmed.match(/```(?:json)?\s*(?<json>(?:\{[\s\S]*\}|\[[\s\S]*]))\s*```/);
  if (match?.groups?.json) {
    return match.groups.json;
  }

  throw new Error("Model response did not contain a JSON object or array");
}

function hasToolUseBlock(content: ChatMessage["content"]): boolean {
  if (typeof content === "string") {
    return false;
  }
  const array = Array.isArray(content) ? content : [content];
  return array.some((block) => typeof block !== "string" && block.type === "tool_use");
}

function flattenAssistantContent(
  content: ChatMessage["content"],
): { text: string; toolCalls: ChatToolUseBlock[] } {
  const array = Array.isArray(content) ? content : [content];
  const texts: string[] = [];
  const toolCalls: ChatToolUseBlock[] = [];
  for (const block of array) {
    if (typeof block === "string") {
      texts.push(block);
    } else if (block.type === "text") {
      texts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push(block);
    }
  }
  return { text: texts.join(""), toolCalls };
}

function firstToolResult(
  content: ChatMessage["content"],
): { content: string; isError: boolean } | undefined {
  if (typeof content === "string") {
    return undefined;
  }
  const array = Array.isArray(content) ? content : [content];
  for (const block of array) {
    if (typeof block !== "string" && block.type === "tool_result") {
      return { content: block.content, isError: block.isError === true };
    }
  }
  return undefined;
}

function flattenContentToString(content: ChatMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  const array = Array.isArray(content) ? content : [content];
  const parts: string[] = [];
  for (const block of array) {
    if (typeof block === "string") {
      parts.push(block);
    } else if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "tool_result") {
      parts.push(block.content);
    } else if (block.type === "tool_use") {
      parts.push(safeJsonStringify(block.input));
    }
  }
  return parts.join("\n");
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
