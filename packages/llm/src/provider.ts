import type {z, ZodTypeAny} from "zod";
import {isModelConfigured, type ModelConfig} from "./config.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionInput = {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "text" | "json";
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

  return createOpenAICompatibleProvider(config);
}

export function createOpenAICompatibleProvider(config: ModelConfig): ChatModelProvider {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new ModelConfigurationError("Model provider requires baseUrl, apiKey, and model");
  }

  const endpoint = new URL(config.chatPath, normalizeBaseUrl(config.baseUrl));

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
            temperature: input.temperature ?? 0,
            response_format:
              input.responseFormat === "json" ? {type: "json_object"} : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Model request failed ${response.status}: ${text.slice(0, 500)}`);
        }

        const data = (await response.json()) as {
          choices?: {message?: {content?: string}}[];
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

export async function generateJson<Schema extends ZodTypeAny>(
  provider: ChatModelProvider,
  schema: Schema,
  input: ChatCompletionInput,
): Promise<z.output<Schema>> {
  const content = await provider.complete({...input, responseFormat: "json"});
  return schema.parse(JSON.parse(extractJsonObject(content)));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
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
