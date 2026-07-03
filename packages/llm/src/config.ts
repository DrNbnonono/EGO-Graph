import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

const persistedModelConfigSchema = modelConfigSchema.partial();
const egoConfigFileSchema = z.object({
  model: persistedModelConfigSchema.optional(),
});

export type PersistedModelConfig = z.output<typeof persistedModelConfigSchema>;

export type ModelConfigSource = "environment" | "workspace-local" | "workspace" | "none";

export type LoadedModelConfig = {
  config: ModelConfig;
  source: ModelConfigSource;
  path?: string;
};

export type LoadModelConfigOptions = {
  workspaceRoot?: string;
  env?: NodeJS.ProcessEnv;
};

export type SaveModelConfigInput = PersistedModelConfig & {
  workspaceRoot: string;
};

export type PublicModelConfig = Omit<ModelConfig, "apiKey"> & {
  apiKeyConfigured: boolean;
  apiKeyPreview?: string;
  source: ModelConfigSource;
  sourcePath?: string;
};

export function loadModelConfig(
  input: NodeJS.ProcessEnv | LoadModelConfigOptions = process.env,
): ModelConfig {
  return loadModelConfigWithSource(input).config;
}

export function loadModelConfigWithSource(
  input: NodeJS.ProcessEnv | LoadModelConfigOptions = process.env,
): LoadedModelConfig {
  const options = normalizeLoadOptions(input);
  const env = options.env ?? process.env;
  const fileConfig = options.workspaceRoot
    ? readPersistedModelConfig(options.workspaceRoot)
    : undefined;
  const provider = env.EGO_MODEL_PROVIDER ?? fileConfig?.config.provider ?? "disabled";
  const canUseFileConfig =
    env.EGO_MODEL_PROVIDER === undefined || env.EGO_MODEL_PROVIDER === fileConfig?.config.provider;
  const persisted = canUseFileConfig ? fileConfig?.config : undefined;
  const defaults = providerDefaults(provider);

  const config = modelConfigSchema.parse({
    provider,
    baseUrl: env.EGO_MODEL_BASE_URL ?? persisted?.baseUrl ?? defaults.baseUrl,
    chatPath: env.EGO_MODEL_CHAT_PATH ?? persisted?.chatPath ?? defaults.chatPath,
    apiKey: resolveApiKey(provider, env) ?? persisted?.apiKey,
    model: env.EGO_MODEL_NAME ?? persisted?.model ?? defaults.model,
    headers:
      env.EGO_MODEL_HEADERS !== undefined
        ? parseHeaders(env.EGO_MODEL_HEADERS)
        : (persisted?.headers ?? {}),
    timeoutMs: env.EGO_MODEL_TIMEOUT_MS ?? persisted?.timeoutMs,
    maxTokens: env.EGO_MODEL_MAX_TOKENS ?? persisted?.maxTokens ?? defaults.maxTokens,
    wireApi: env.EGO_MODEL_WIRE_API ?? persisted?.wireApi ?? defaults.wireApi,
  });

  return {
    config,
    source: envHasModelConfig(env) ? "environment" : (fileConfig?.source ?? "none"),
    ...(fileConfig?.path ? { path: fileConfig.path } : {}),
  };
}

export function isModelConfigured(config: ModelConfig): boolean {
  return config.provider !== "disabled" && Boolean(config.baseUrl && config.apiKey && config.model);
}

export async function saveModelConfig(input: SaveModelConfigInput): Promise<LoadedModelConfig> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  await mkdir(join(input.workspaceRoot, ".ego"), { recursive: true });

  const existing = await readJsonObject(path);
  const model = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "workspaceRoot"),
  ) as PersistedModelConfig;
  const normalized = normalizePersistedModelConfig(model);
  const content = {
    ...existing,
    model: removeUndefined({
      ...(isObject(existing.model) ? existing.model : {}),
      ...normalized,
    }),
  };

  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return loadModelConfigWithSource({ workspaceRoot: input.workspaceRoot, env: {} });
}

export function toPublicModelConfig(loaded: LoadedModelConfig): PublicModelConfig {
  const { apiKey, ...config } = loaded.config;
  return {
    ...config,
    apiKeyConfigured: Boolean(apiKey),
    ...(apiKey ? { apiKeyPreview: maskSecret(apiKey) } : {}),
    source: loaded.source,
    ...(loaded.path ? { sourcePath: loaded.path } : {}),
  };
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

function normalizePersistedModelConfig(input: PersistedModelConfig): PersistedModelConfig {
  return persistedModelConfigSchema.parse(
    Object.fromEntries(
      Object.entries(input).filter(([, value]) => {
        return value !== undefined && value !== "";
      }),
    ),
  );
}

function normalizeLoadOptions(
  input: NodeJS.ProcessEnv | LoadModelConfigOptions,
): LoadModelConfigOptions {
  const candidate = input as LoadModelConfigOptions;
  if (candidate.workspaceRoot !== undefined || candidate.env !== undefined) {
    return candidate;
  }
  return { env: input as NodeJS.ProcessEnv };
}

function readPersistedModelConfig(
  workspaceRoot: string,
): { source: ModelConfigSource; path: string; config: PersistedModelConfig } | undefined {
  const candidates: Array<{ source: ModelConfigSource; path: string }> = [
    { source: "workspace-local", path: join(workspaceRoot, ".ego", "config.json") },
    { source: "workspace", path: join(workspaceRoot, "ego.config.json") },
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) {
      continue;
    }

    const parsed = egoConfigFileSchema.parse(JSON.parse(readFileSync(candidate.path, "utf8")));
    return {
      source: candidate.source,
      path: candidate.path,
      config: parsed.model ?? {},
    };
  }

  return undefined;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function envHasModelConfig(env: NodeJS.ProcessEnv): boolean {
  return [
    "EGO_MODEL_PROVIDER",
    "EGO_MODEL_BASE_URL",
    "EGO_MODEL_CHAT_PATH",
    "EGO_MODEL_API_KEY",
    "EGO_MODEL_NAME",
    "EGO_MODEL_HEADERS",
    "EGO_MODEL_TIMEOUT_MS",
    "EGO_MODEL_MAX_TOKENS",
    "EGO_MODEL_WIRE_API",
    "MINIMAX_API_KEY",
    "ANTHROPIC_API_KEY",
  ].some((key) => env[key] !== undefined);
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
