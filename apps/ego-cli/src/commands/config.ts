import {
  loadModelConfigWithSource,
  saveModelConfig,
  toPublicModelConfig,
  type PersistedModelConfig,
} from "@ego-graph/llm";

export type ConfigModelCommandOptions = {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  chatPath?: string;
  wireApi?: string;
  maxTokens?: string;
  timeoutMs?: string;
  headers?: string;
};

export async function handleConfigModelCommand(options: ConfigModelCommandOptions): Promise<void> {
  const workspaceRoot = process.cwd();
  const update = buildModelConfigUpdate(options);

  const loaded =
    Object.keys(update).length > 0
      ? await saveModelConfig({ workspaceRoot, ...update })
      : loadModelConfigWithSource({ workspaceRoot });
  const publicConfig = toPublicModelConfig(loaded);

  console.log(`Model provider ${publicConfig.provider}`);
  console.log(`Model name ${publicConfig.model ?? "deterministic"}`);
  console.log(`Model configured ${publicConfig.apiKeyConfigured ? "yes" : "no"}`);
  console.log(
    `Model config source ${publicConfig.source}${
      publicConfig.sourcePath ? ` (${publicConfig.sourcePath})` : ""
    }`,
  );
}

function buildModelConfigUpdate(options: ConfigModelCommandOptions): PersistedModelConfig {
  return removeUndefined({
    provider: options.provider,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: options.model,
    chatPath: options.chatPath,
    wireApi: options.wireApi,
    maxTokens: options.maxTokens ? Number(options.maxTokens) : undefined,
    timeoutMs: options.timeoutMs ? Number(options.timeoutMs) : undefined,
    headers: options.headers ? (JSON.parse(options.headers) as Record<string, string>) : undefined,
  }) as PersistedModelConfig;
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
}
