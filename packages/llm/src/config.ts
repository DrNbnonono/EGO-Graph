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
const modelProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  config: persistedModelConfigSchema,
});
const egoConfigFileSchema = z.object({
  model: persistedModelConfigSchema.optional(),
  modelProfiles: z.array(modelProfileSchema).default([]),
  activeModelProfileId: z.string().min(1).optional(),
});

export type PersistedModelConfig = z.output<typeof persistedModelConfigSchema>;

export type ModelProfile = z.output<typeof modelProfileSchema>;

export type PublicModelProfile = Omit<ModelProfile, "config"> & {
  config: Omit<PersistedModelConfig, "apiKey">;
  apiKeyConfigured: boolean;
  apiKeyPreview?: string;
};

export type ModelProfilesState = {
  profiles: PublicModelProfile[];
  activeProfile?: PublicModelProfile;
  activeProfileId?: string;
  presets: typeof modelProviderProfiles;
};

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

export type ModelProfileInput = {
  workspaceRoot: string;
  profile: ModelProfile;
};

export type ModelProfileIdInput = {
  workspaceRoot: string;
  id: string;
};

export type PublicModelConfig = Omit<ModelConfig, "apiKey"> & {
  apiKeyConfigured: boolean;
  apiKeyPreview?: string;
  source: ModelConfigSource;
  sourcePath?: string;
};

export class ModelConfigValidationError extends Error {}

export const modelProviderProfiles: Record<
  ModelProviderName,
  {
    provider: ModelProviderName;
    baseUrl?: string;
    chatPath: string;
    model?: string;
    maxTokens: number;
    wireApi: ModelWireApi;
  }
> = {
  disabled: {
    provider: "disabled",
    chatPath: "/v1/chat/completions",
    maxTokens: 4096,
    wireApi: "openai-chat-completions",
  },
  "openai-compatible": {
    provider: "openai-compatible",
    chatPath: "/v1/chat/completions",
    maxTokens: 4096,
    wireApi: "openai-chat-completions",
  },
  deepseek: {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    chatPath: "/v1/chat/completions",
    maxTokens: 4096,
    wireApi: "openai-chat-completions",
  },
  minimax: {
    provider: "minimax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    chatPath: "/v1/messages",
    model: "MiniMax-M3",
    maxTokens: 4096,
    wireApi: "anthropic-messages",
  },
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
  const disabled = provider === "disabled";

  const config = modelConfigSchema.parse({
    provider,
    baseUrl: disabled
      ? undefined
      : (env.EGO_MODEL_BASE_URL ?? persisted?.baseUrl ?? defaults.baseUrl),
    chatPath: env.EGO_MODEL_CHAT_PATH ?? persisted?.chatPath ?? defaults.chatPath,
    apiKey: disabled ? undefined : (resolveApiKey(provider, env) ?? persisted?.apiKey),
    model: disabled ? undefined : (env.EGO_MODEL_NAME ?? persisted?.model ?? defaults.model),
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
  validatePersistedModelConfig(normalized);
  const existingModel = isObject(existing.model) ? existing.model : {};
  const content = {
    ...existing,
    model:
      normalized.provider === "disabled"
        ? { provider: "disabled" }
        : removeUndefined({
            ...existingModel,
            ...normalized,
          }),
  };

  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return loadModelConfigWithSource({ workspaceRoot: input.workspaceRoot, env: {} });
}

export async function listModelProfiles(
  input: LoadModelConfigOptions,
): Promise<ModelProfilesState> {
  const options = normalizeLoadOptions(input);
  const workspaceRoot = options.workspaceRoot;
  if (!workspaceRoot) {
    return { profiles: [], presets: modelProviderProfiles };
  }

  const fileConfig = await readEgoConfigObject(workspaceRoot);
  const parsed = egoConfigFileSchema.parse(fileConfig.config);
  const profiles =
    parsed.modelProfiles.length > 0
      ? parsed.modelProfiles
      : parsed.model
        ? [
            {
              id: "legacy-model",
              name: parsed.model.model ?? parsed.model.provider ?? "Legacy model",
              config: parsed.model,
            },
          ]
        : [];
  const activeProfileId =
    parsed.activeModelProfileId ?? (profiles.length === 1 ? profiles[0]?.id : undefined);
  const publicProfiles = profiles.map((profile) => toPublicModelProfile(profile));
  const activeProfile = activeProfileId
    ? publicProfiles.find((profile) => profile.id === activeProfileId)
    : undefined;

  return {
    profiles: publicProfiles,
    ...(activeProfileId ? { activeProfileId } : {}),
    ...(activeProfile ? { activeProfile } : {}),
    presets: modelProviderProfiles,
  };
}

export async function saveModelProfile(input: ModelProfileInput): Promise<ModelProfilesState> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  await mkdir(join(input.workspaceRoot, ".ego"), { recursive: true });
  const existing = await readJsonObject(path);
  const parsed = egoConfigFileSchema.parse(existing);
  const normalized = {
    ...input.profile,
    config: normalizePersistedModelConfig(input.profile.config),
  };
  validatePersistedModelConfig(normalized.config);
  const withoutExisting = parsed.modelProfiles.filter((profile) => profile.id !== normalized.id);
  const modelProfiles = [...withoutExisting, normalized];
  const activeModelProfileId = parsed.activeModelProfileId ?? normalized.id;
  const content = {
    ...existing,
    modelProfiles,
    activeModelProfileId,
    model:
      activeModelProfileId === normalized.id
        ? removeUndefined(normalized.config)
        : isObject(existing.model)
          ? existing.model
          : parsed.model,
  };

  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return listModelProfiles({ workspaceRoot: input.workspaceRoot, env: {} });
}

export async function selectModelProfile(input: ModelProfileIdInput): Promise<LoadedModelConfig> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  const existing = await readJsonObject(path);
  const parsed = egoConfigFileSchema.parse(existing);
  const selected = parsed.modelProfiles.find((profile) => profile.id === input.id);
  if (!selected) {
    throw new ModelConfigValidationError(`model profile not found: ${input.id}`);
  }

  const content = {
    ...existing,
    modelProfiles: parsed.modelProfiles,
    activeModelProfileId: selected.id,
    model: removeUndefined(selected.config),
  };
  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return loadModelConfigWithSource({ workspaceRoot: input.workspaceRoot, env: {} });
}

export async function deleteModelProfile(input: ModelProfileIdInput): Promise<ModelProfilesState> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  const existing = await readJsonObject(path);
  const parsed = egoConfigFileSchema.parse(existing);
  if (parsed.activeModelProfileId === input.id) {
    throw new ModelConfigValidationError("cannot delete active model profile");
  }

  const content = {
    ...existing,
    modelProfiles: parsed.modelProfiles.filter((profile) => profile.id !== input.id),
  };
  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return listModelProfiles({ workspaceRoot: input.workspaceRoot, env: {} });
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

function toPublicModelProfile(profile: ModelProfile): PublicModelProfile {
  const { apiKey, ...config } = profile.config;
  return {
    id: profile.id,
    name: profile.name,
    config,
    apiKeyConfigured: Boolean(apiKey),
    ...(apiKey ? { apiKeyPreview: maskSecret(apiKey) } : {}),
  };
}

function providerDefaults(provider: string): {
  baseUrl?: string;
  chatPath: string;
  model?: string;
  maxTokens: number;
  wireApi: ModelWireApi;
} {
  return modelProviderProfiles[modelProviderNameSchema.catch("disabled").parse(provider)];
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

function validatePersistedModelConfig(input: PersistedModelConfig): void {
  if (input.provider !== "disabled") {
    return;
  }

  const hasModelFields = Boolean(input.baseUrl || input.apiKey || input.model);
  if (hasModelFields) {
    throw new ModelConfigValidationError(
      "provider=disabled cannot be saved together with baseUrl, apiKey, or model",
    );
  }
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
    const activeProfile =
      parsed.activeModelProfileId !== undefined
        ? parsed.modelProfiles.find((profile) => profile.id === parsed.activeModelProfileId)
        : undefined;
    return {
      source: candidate.source,
      path: candidate.path,
      config: activeProfile?.config ?? parsed.model ?? {},
    };
  }

  return undefined;
}

async function readEgoConfigObject(workspaceRoot: string): Promise<{
  path: string;
  config: Record<string, unknown>;
}> {
  const path = join(workspaceRoot, ".ego", "config.json");
  return { path, config: await readJsonObject(path) };
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
