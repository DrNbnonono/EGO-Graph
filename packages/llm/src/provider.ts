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
};

export type ChatModelProvider = {
  name: string;
  model: string;
  complete(input: ChatCompletionInput): Promise<string>;
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

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const match = trimmed.match(/```(?:json)?\s*(?<json>\{[\s\S]*\})\s*```/);
  if (match?.groups?.json) {
    return match.groups.json;
  }

  throw new Error("Model response did not contain a JSON object");
}
