import { z } from "zod";

export const modelProviderNameSchema = z.enum([
  "openai-compatible",
  "deepseek",
  "minimax",
  "disabled",
]);

export type ModelProviderName = z.output<typeof modelProviderNameSchema>;

export const modelWireApiSchema = z.enum(["openai-chat-completions", "anthropic-messages"]);

export type ModelWireApi = z.output<typeof modelWireApiSchema>;

export const modelConfigSchema = z.object({
  provider: modelProviderNameSchema.default("disabled"),
  baseUrl: z.string().url().optional(),
  chatPath: z.string().min(1).default("/v1/chat/completions"),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  headers: z.record(z.string()).default({}),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
  maxTokens: z.coerce.number().int().positive().default(4096),
  wireApi: modelWireApiSchema.default("openai-chat-completions"),
});

export type ModelConfig = z.output<typeof modelConfigSchema>;

export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  const provider = env.EGO_MODEL_PROVIDER ?? "disabled";
  const defaults = providerDefaults(provider);

  return modelConfigSchema.parse({
    provider,
    baseUrl: env.EGO_MODEL_BASE_URL ?? defaults.baseUrl,
    chatPath: env.EGO_MODEL_CHAT_PATH ?? defaults.chatPath,
    apiKey: resolveApiKey(provider, env),
    model: env.EGO_MODEL_NAME ?? defaults.model,
    headers: parseHeaders(env.EGO_MODEL_HEADERS),
    timeoutMs: env.EGO_MODEL_TIMEOUT_MS,
    maxTokens: env.EGO_MODEL_MAX_TOKENS ?? defaults.maxTokens,
    wireApi: env.EGO_MODEL_WIRE_API ?? defaults.wireApi,
  });
}

export function isModelConfigured(config: ModelConfig): boolean {
  return config.provider !== "disabled" && Boolean(config.baseUrl && config.apiKey && config.model);
}

function providerDefaults(provider: string): {
  baseUrl?: string;
  chatPath: string;
  model?: string;
  maxTokens: number;
  wireApi: ModelWireApi;
} {
  switch (provider) {
    case "deepseek":
      return {
        baseUrl: "https://api.deepseek.com",
        chatPath: "/v1/chat/completions",
        maxTokens: 4096,
        wireApi: "openai-chat-completions",
      };
    case "minimax":
      return {
        baseUrl: "https://api.minimaxi.com/anthropic",
        chatPath: "/v1/messages",
        model: "MiniMax-M3",
        maxTokens: 4096,
        wireApi: "anthropic-messages",
      };
    case "openai-compatible":
      return {
        chatPath: "/v1/chat/completions",
        maxTokens: 4096,
        wireApi: "openai-chat-completions",
      };
    default:
      return {
        chatPath: "/v1/chat/completions",
        maxTokens: 4096,
        wireApi: "openai-chat-completions",
      };
  }
}

function resolveApiKey(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  if (env.EGO_MODEL_API_KEY) {
    return env.EGO_MODEL_API_KEY;
  }

  if (provider === "minimax") {
    return env.MINIMAX_API_KEY ?? env.ANTHROPIC_API_KEY;
  }

  return undefined;
}

function parseHeaders(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return JSON.parse(value) as Record<string, string>;
}
