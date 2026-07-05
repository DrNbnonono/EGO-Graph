import type { z, ZodTypeAny } from "zod";
import { isModelConfigured, type ModelConfig } from "./config.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionInput = {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "text" | "json";
  maxTokens?: number;
  tools?: ChatToolDefinition[];
  toolChoice?: "auto" | "none" | { name: string };
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

export type ChatModelProvider = {
  name: string;
  model: string;
  complete(input: ChatCompletionInput): Promise<string>;
  streamComplete?(input: ChatCompletionInput): AsyncIterable<string>;
  completeStructured?(input: ChatCompletionInput): Promise<StructuredChatCompletion>;
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

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            messages: input.messages,
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
          throw new Error(`Model request failed ${response.status}: ${text.slice(0, 500)}`);
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("Model response did not include assistant content");
        }
        return content;
      } finally {
        clearTimeout(timeout);
      }
    },
    async *streamComplete(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            messages: input.messages,
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
          throw new Error(`Model stream failed ${response.status}: ${text.slice(0, 500)}`);
        }
        if (!response.body) {
          throw new Error("Model stream response did not include a body");
        }

        yield* parseOpenAiSseTextDeltas(response.body);
      } finally {
        clearTimeout(timeout);
      }
    },
    async completeStructured(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            messages: input.messages,
            max_tokens: input.maxTokens ?? config.maxTokens,
            temperature: input.temperature ?? 0,
            ...(input.tools ? { tools: toOpenAiTools(input.tools) } : {}),
            ...(input.toolChoice ? { tool_choice: toOpenAiToolChoice(input.toolChoice) } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Model request failed ${response.status}: ${text.slice(0, 500)}`);
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
  };
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
      const { system, messages } = splitAnthropicMessages(input.messages);

      if (messages.length === 0) {
        throw new ModelConfigurationError("Anthropic Messages requests require a user message");
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...config.headers,
          },
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
          throw new Error(`Model request failed ${response.status}: ${text.slice(0, 500)}`);
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      const { system, messages } = splitAnthropicMessages(input.messages);

      if (messages.length === 0) {
        throw new ModelConfigurationError("Anthropic Messages requests require a user message");
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: input.maxTokens ?? config.maxTokens,
            messages,
            temperature: input.temperature ?? 0,
            stream: true,
            ...(system ? { system } : {}),
            ...(input.tools ? { tools: toAnthropicTools(input.tools) } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Model stream failed ${response.status}: ${text.slice(0, 500)}`);
        }
        if (!response.body) {
          throw new Error("Model stream response did not include a body");
        }

        yield* parseAnthropicSseTextDeltas(response.body);
      } finally {
        clearTimeout(timeout);
      }
    },
    async completeStructured(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      const { system, messages } = splitAnthropicMessages(input.messages);

      if (messages.length === 0) {
        throw new ModelConfigurationError("Anthropic Messages requests require a user message");
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: input.maxTokens ?? config.maxTokens,
            messages,
            temperature: input.temperature ?? 0,
            ...(system ? { system } : {}),
            ...(input.tools ? { tools: toAnthropicTools(input.tools) } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Model request failed ${response.status}: ${text.slice(0, 500)}`);
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
  };
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

function splitAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const conversation = messages
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } => {
      return message.role !== "system";
    })
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  return {
    ...(system ? { system } : {}),
    messages: conversation,
  };
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
  return typeof choice === "string"
    ? choice
    : { type: "function", function: { name: choice.name } };
}

function toAnthropicTools(tools: ChatToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema,
  }));
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

async function* parseOpenAiSseTextDeltas(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  for await (const event of parseSseEvents(body)) {
    if (event === "[DONE]") {
      return;
    }
    const parsed = JSON.parse(event) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

async function* parseAnthropicSseTextDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  for await (const event of parseSseEvents(body)) {
    const parsed = JSON.parse(event) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      yield parsed.delta.text ?? "";
    }
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
    const parts = buffer.split(/\n\n/);
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
