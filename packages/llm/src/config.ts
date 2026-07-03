import {z} from "zod";

export const modelProviderNameSchema = z.enum([
  "openai-compatible",
  "deepseek",
  "minimax",
  "disabled",
]);

export type ModelProviderName = z.output<typeof modelProviderNameSchema>;

export const modelConfigSchema = z.object({
  provider: modelProviderNameSchema.default("disabled"),
  baseUrl: z.string().url().optional(),
  chatPath: z.string().min(1).default("/v1/chat/completions"),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  headers: z.record(z.string()).default({}),
  timeoutMs: z.coerce.number().int().positive().default(30_000),
});

export type ModelConfig = z.output<typeof modelConfigSchema>;

export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  const provider = env.EGO_MODEL_PROVIDER ?? "disabled";
  const defaults = providerDefaults(provider);

  return modelConfigSchema.parse({
    provider,
    baseUrl: env.EGO_MODEL_BASE_URL ?? defaults.baseUrl,
    chatPath: env.EGO_MODEL_CHAT_PATH ?? defaults.chatPath,
    apiKey: env.EGO_MODEL_API_KEY,
    model: env.EGO_MODEL_NAME,
    headers: parseHeaders(env.EGO_MODEL_HEADERS),
    timeoutMs: env.EGO_MODEL_TIMEOUT_MS,
  });
}

export function isModelConfigured(config: ModelConfig): boolean {
  return config.provider !== "disabled" && Boolean(config.baseUrl && config.apiKey && config.model);
}

function providerDefaults(provider: string): {baseUrl?: string; chatPath: string} {
  switch (provider) {
    case "deepseek":
      return {baseUrl: "https://api.deepseek.com", chatPath: "/v1/chat/completions"};
    case "minimax":
      return {baseUrl: "https://api.minimax.chat", chatPath: "/v1/chat/completions"};
    case "openai-compatible":
      return {chatPath: "/v1/chat/completions"};
    default:
      return {chatPath: "/v1/chat/completions"};
  }
}

function parseHeaders(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return JSON.parse(value) as Record<string, string>;
}
