import {
  loadModelConfigWithSource,
  saveModelConfig,
  toPublicModelConfig,
  type PersistedModelConfig,
} from "@ego-graph/llm";
import { saveMcpServer } from "@ego-graph/mcp";
import { saveLocalSkill } from "@ego-graph/tools";
export type ConfigModelCommandOptions = {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
  chatPath?: string;
  wireApi?: string;
  maxTokens?: string;
  timeoutMs?: string;
  headers?: string;
};

export type ConfigMcpCommandOptions = {
  name: string;
  transport?: "stdio" | "http";
  command?: string;
  args?: string;
  url?: string;
  disabled?: boolean;
};

export type ConfigSkillCommandOptions = {
  name: string;
  version?: string;
  description: string;
  capabilities?: string;
  tools?: string;
  permissions?: string;
  entry: string;
  disabled?: boolean;
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

export async function handleConfigMcpCommand(options: ConfigMcpCommandOptions): Promise<void> {
  const workspaceRoot = process.cwd();
  const transport = options.transport ?? (options.url ? "http" : "stdio");
  const saved = await saveMcpServer({
    workspaceRoot,
    server: {
      name: options.name,
      transport,
      ...(options.command ? { command: options.command } : {}),
      args: splitCsv(options.args),
      env: {},
      ...(options.url ? { url: options.url } : {}),
      headers: {},
      enabled: !options.disabled,
      trustToolAnnotations: false,
      toolPolicies: {},
    },
  });

  console.log(`MCP server ${options.name} saved`);
  console.log(`MCP server count ${saved.servers.length}`);
  console.log(`MCP config source ${saved.source}`);
}

export async function handleConfigSkillCommand(options: ConfigSkillCommandOptions): Promise<void> {
  const workspaceRoot = process.cwd();
  const saved = await saveLocalSkill({
    workspaceRoot,
    skill: {
      name: options.name,
      version: options.version ?? "0.1.0",
      description: options.description,
      capabilities: splitCsv(options.capabilities),
      tools: splitCsv(options.tools),
      permissions: splitCsv(options.permissions),
      entry: options.entry,
      enabled: !options.disabled,
    },
  });

  console.log(`Skill ${options.name} saved`);
  console.log(`Skill count ${saved.skills.length}`);
  console.log(`Skill config source ${saved.source}`);
}

function buildModelConfigUpdate(options: ConfigModelCommandOptions): PersistedModelConfig {
  return removeUndefined({
    provider: options.provider,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    apiKeyEnv: options.apiKeyEnv,
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

function splitCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
