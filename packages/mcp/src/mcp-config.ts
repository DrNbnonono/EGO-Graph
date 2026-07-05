import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ToolRegistry,
  type SandboxProfile,
  type ToolDefinition,
  type ToolRiskLevel,
  type ToolScopeKind,
} from "@ego-graph/tools";
import { z } from "zod";
import { createMcpClient, type McpClientPool } from "./client-pool.js";
import {
  createMcpManifest,
  type McpManifest,
  type McpServerDescriptor,
  type McpToolPolicy,
  type McpTransport,
} from "./mcp-manifest.js";
import { type McpToolInfo } from "./stdio-client.js";

const toolScopeSchema = z.enum(["fixture", "network", "file"]);
const toolRiskSchema = z.enum(["low", "medium", "high"]);
const sandboxProfileSchema = z.enum(["none", "process", "docker"]);

const mcpToolPolicySchema = z.object({
  scope: toolScopeSchema.optional(),
  risk: toolRiskSchema.optional(),
  requiresApproval: z.boolean().optional(),
  sandboxProfile: sandboxProfileSchema.optional(),
  timeoutMs: z.number().int().min(250).max(300_000).optional(),
  scenarios: z.array(z.string()).optional(),
});

const mcpOAuthConfigSchema = z.object({
  accessToken: z.string().min(1).optional(),
  tokenType: z.literal("Bearer").default("Bearer"),
  scopes: z.array(z.string()).default([]),
  resourceMetadataUrl: z.string().url().optional(),
});

const mcpServerConfigSchema = z
  .object({
    transport: z.enum(["stdio", "http"]).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).default({}),
    url: z.string().url().optional(),
    headers: z.record(z.string()).default({}),
    oauth: mcpOAuthConfigSchema.optional(),
    trustToolAnnotations: z.boolean().default(false),
    defaultToolPolicy: mcpToolPolicySchema.optional(),
    toolPolicies: z.record(mcpToolPolicySchema).default({}),
    enabled: z.boolean().default(true),
  })
  .transform((server) => ({
    ...server,
    transport: (server.transport ?? (server.url ? "http" : "stdio")) as McpTransport,
  }))
  .superRefine((server, context) => {
    const transport = server.transport ?? (server.url ? "http" : "stdio");
    if (transport === "stdio" && !server.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stdio MCP server requires command",
        path: ["command"],
      });
    }
    if (transport === "http" && !server.url) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "http MCP server requires url",
        path: ["url"],
      });
    }
  });

const mcpConfigSchema = z.object({
  mcpServers: z.record(mcpServerConfigSchema).default({}),
});

export type McpConfig = {
  source: string | "none";
  servers: McpServerDescriptor[];
  manifest: McpManifest;
};

export type PublicMcpServer = Omit<McpServerDescriptor, "env" | "headers" | "oauth"> & {
  envKeys: string[];
  headerKeys: string[];
  oauthConfigured: boolean;
  oauthScopes: string[];
};

export type SaveMcpServerInput = {
  workspaceRoot: string;
  server: McpServerDescriptor;
};

export type McpServerNameInput = {
  workspaceRoot: string;
  name: string;
};

type AnyMcpToolDefinition = ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>;

export async function loadMcpConfig(workspaceRoot: string): Promise<McpConfig> {
  const candidates = [
    join(workspaceRoot, ".ego", "config.json"),
    join(workspaceRoot, "ego.config.json"),
  ];

  for (const candidate of candidates) {
    const parsed = await tryReadConfig(candidate);
    if (parsed) {
      const servers = Object.entries(parsed.mcpServers).map(([name, server]) =>
        normalizeServerDescriptor(name, server),
      );
      return {
        source: candidate,
        servers,
        manifest: createMcpManifest(servers),
      };
    }
  }

  return {
    source: "none",
    servers: [],
    manifest: createMcpManifest(),
  };
}

export async function listMcpServers(workspaceRoot: string): Promise<{
  source: string | "none";
  servers: PublicMcpServer[];
}> {
  const config = await loadMcpConfig(workspaceRoot);
  return {
    source: config.source,
    servers: config.servers.map((server) => sanitizeMcpServer(server)),
  };
}

export async function saveMcpServer(input: SaveMcpServerInput): Promise<{
  source: string;
  servers: PublicMcpServer[];
}> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  await mkdir(join(input.workspaceRoot, ".ego"), { recursive: true });
  const existing = await readJsonObject(path);
  const parsed = mcpConfigSchema.parse(existing);
  const server = mcpServerConfigSchema.parse(input.server);
  const content = {
    ...existing,
    mcpServers: {
      ...parsed.mcpServers,
      [input.server.name]: server,
    },
  };

  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  const listed = await listMcpServers(input.workspaceRoot);
  return { source: path, servers: listed.servers };
}

export async function deleteMcpServer(input: McpServerNameInput): Promise<{
  source: string;
  servers: PublicMcpServer[];
}> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  const existing = await readJsonObject(path);
  const parsed = mcpConfigSchema.parse(existing);
  const remaining = { ...parsed.mcpServers };
  delete remaining[input.name];
  const content = {
    ...existing,
    mcpServers: remaining,
  };

  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  const listed = await listMcpServers(input.workspaceRoot);
  return { source: path, servers: listed.servers };
}

export async function testMcpServer(input: McpServerNameInput): Promise<{
  server: PublicMcpServer;
  tools: McpToolInfo[];
  ok: boolean;
  error?: string;
}> {
  const config = await loadMcpConfig(input.workspaceRoot);
  const server = config.servers.find((candidate) => candidate.name === input.name);
  if (!server) {
    throw new Error(`MCP server not found: ${input.name}`);
  }

  const client = createMcpClient(server);
  try {
    const tools = await client.listTools();
    return { server: sanitizeMcpServer(server), tools, ok: true };
  } catch (error) {
    return {
      server: sanitizeMcpServer(server),
      tools: [],
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.close();
  }
}

export function createMcpToolRegistry(config: McpConfig): ToolRegistry {
  const registry = new ToolRegistry();
  for (const server of config.servers.filter((candidate) => candidate.enabled)) {
    registry.register(createMcpPlaceholderTool(server));
  }
  return registry;
}

export async function listMcpRuntimeTools(
  config: McpConfig,
  options: { pool?: McpClientPool } = {},
): Promise<{
  tools: AnyMcpToolDefinition[];
  errors: Array<{ server: string; message: string }>;
}> {
  const tools: AnyMcpToolDefinition[] = [];
  const errors: Array<{ server: string; message: string }> = [];

  for (const server of config.servers.filter((candidate) => candidate.enabled)) {
    const client = options.pool?.get(server) ?? createMcpClient(server);
    try {
      const remoteTools = await client.listTools();
      tools.push(
        ...remoteTools.map((tool) =>
          createMcpRuntimeTool(server, tool, options.pool ? { pool: options.pool } : {}),
        ),
      );
    } catch (error) {
      errors.push({
        server: server.name,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (!options.pool) {
        await client.close();
      }
    }
  }

  return { tools, errors };
}

export function createMcpRuntimeToolForTest(
  server: McpServerDescriptor,
  tool: McpToolInfo,
): AnyMcpToolDefinition {
  return createMcpRuntimeTool(server, tool);
}

async function tryReadConfig(path: string): Promise<z.output<typeof mcpConfigSchema> | undefined> {
  try {
    return mcpConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function normalizeServerDescriptor(
  name: string,
  server: z.output<typeof mcpServerConfigSchema>,
): McpServerDescriptor {
  return {
    name,
    transport: server.transport,
    ...(server.command ? { command: server.command } : {}),
    args: server.args,
    env: server.env,
    ...(server.url ? { url: server.url } : {}),
    headers: server.headers,
    ...(server.oauth ? { oauth: compactOAuthConfig(server.oauth) } : {}),
    trustToolAnnotations: server.trustToolAnnotations,
    ...(server.defaultToolPolicy
      ? { defaultToolPolicy: compactToolPolicy(server.defaultToolPolicy) }
      : {}),
    toolPolicies: compactToolPolicyRecord(server.toolPolicies),
    enabled: server.enabled,
  };
}

function compactToolPolicyRecord(
  policies: Record<string, z.output<typeof mcpToolPolicySchema>>,
): Record<string, McpToolPolicy> {
  return Object.fromEntries(
    Object.entries(policies).map(([name, policy]) => [name, compactToolPolicy(policy)]),
  );
}

function compactToolPolicy(policy: z.output<typeof mcpToolPolicySchema>): McpToolPolicy {
  return {
    ...(policy.scope ? { scope: policy.scope } : {}),
    ...(policy.risk ? { risk: policy.risk } : {}),
    ...(policy.requiresApproval !== undefined ? { requiresApproval: policy.requiresApproval } : {}),
    ...(policy.sandboxProfile ? { sandboxProfile: policy.sandboxProfile } : {}),
    ...(policy.timeoutMs !== undefined ? { timeoutMs: policy.timeoutMs } : {}),
    ...(policy.scenarios ? { scenarios: policy.scenarios } : {}),
  };
}

function compactOAuthConfig(
  oauth: z.output<typeof mcpOAuthConfigSchema>,
): NonNullable<McpServerDescriptor["oauth"]> {
  return {
    ...(oauth.accessToken ? { accessToken: oauth.accessToken } : {}),
    tokenType: oauth.tokenType,
    scopes: oauth.scopes,
    ...(oauth.resourceMetadataUrl ? { resourceMetadataUrl: oauth.resourceMetadataUrl } : {}),
  };
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function sanitizeMcpServer(server: McpServerDescriptor): PublicMcpServer {
  const { env, headers, oauth, ...publicServer } = server;
  return {
    ...publicServer,
    envKeys: Object.keys(env ?? {}),
    headerKeys: Object.keys(headers ?? {}),
    oauthConfigured: Boolean(oauth?.accessToken || oauth?.resourceMetadataUrl),
    oauthScopes: oauth?.scopes ?? [],
  };
}

function createMcpPlaceholderTool(server: McpServerDescriptor): ToolDefinition<
  z.ZodObject<{ request: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>> }>,
  z.ZodObject<{
    server: z.ZodString;
    status: z.ZodLiteral<"transport_not_started">;
    request: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }>
> {
  const inputSchema = z.object({
    request: z.record(z.unknown()).optional(),
  });
  const outputSchema = z.object({
    server: z.string(),
    status: z.literal("transport_not_started"),
    request: z.record(z.unknown()).optional(),
  });
  const policy = resolveMcpToolPolicy(server, { name: server.name });

  return {
    name: `mcp.${server.name}`,
    description: renderServerDescription(server),
    inputSchema,
    outputSchema,
    permission: {
      scope: policy.scope,
      risk: policy.risk,
      requiresSandbox: policy.sandboxProfile !== "none",
    },
    riskLevel: policy.risk,
    sandboxProfile: policy.sandboxProfile,
    timeoutMs: policy.timeoutMs,
    requiresApproval: policy.requiresApproval,
    ...(policy.scenarios ? { scenarios: policy.scenarios } : {}),
    async execute(input) {
      return {
        server: server.name,
        status: "transport_not_started",
        ...(input.request ? { request: input.request } : {}),
      };
    },
  };
}

function createMcpRuntimeTool(
  server: McpServerDescriptor,
  tool: McpToolInfo,
  options: { pool?: McpClientPool } = {},
): ToolDefinition<
  z.ZodObject<{ arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>> }>,
  z.ZodObject<{
    server: z.ZodString;
    tool: z.ZodString;
    result: z.ZodUnknown;
  }>
> {
  const inputSchema = z.object({
    arguments: z.record(z.unknown()).optional(),
  });
  const outputSchema = z.object({
    server: z.string(),
    tool: z.string(),
    result: z.unknown(),
  });
  const policy = resolveMcpToolPolicy(server, tool);

  return {
    name: `mcp.${server.name}.${tool.name}`,
    description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
    inputSchema,
    outputSchema,
    permission: {
      scope: policy.scope,
      risk: policy.risk,
      requiresSandbox: policy.sandboxProfile !== "none",
    },
    riskLevel: policy.risk,
    sandboxProfile: policy.sandboxProfile,
    timeoutMs: policy.timeoutMs,
    requiresApproval: policy.requiresApproval,
    ...(policy.scenarios ? { scenarios: policy.scenarios } : {}),
    async execute(input) {
      const client = options.pool?.get(server) ?? createMcpClient(server);
      try {
        const result = await client.callTool(tool.name, input.arguments ?? {});
        return {
          server: server.name,
          tool: tool.name,
          result,
        };
      } finally {
        if (!options.pool) {
          await client.close();
        }
      }
    },
  };
}

function resolveMcpToolPolicy(
  server: McpServerDescriptor,
  tool: Pick<McpToolInfo, "name" | "annotations">,
): Required<Omit<McpToolPolicy, "scenarios">> & { scenarios?: string[] } {
  const base: Required<Omit<McpToolPolicy, "scenarios">> & { scenarios?: string[] } = {
    scope: server.transport === "http" ? "network" : "file",
    risk: "medium",
    requiresApproval: true,
    sandboxProfile: "none",
    timeoutMs: 30_000,
  };
  const annotationPolicy = server.trustToolAnnotations
    ? policyFromTrustedAnnotations(tool.annotations)
    : {};
  const finalPolicy = {
    ...base,
    ...normalizeToolPolicy(server.defaultToolPolicy),
    ...annotationPolicy,
    ...normalizeToolPolicy(server.toolPolicies?.[tool.name]),
  };
  return {
    ...finalPolicy,
    scope: finalPolicy.scope as ToolScopeKind,
    risk: finalPolicy.risk as ToolRiskLevel,
    sandboxProfile: finalPolicy.sandboxProfile as SandboxProfile,
  };
}

function normalizeToolPolicy(policy: McpToolPolicy | undefined): Partial<McpToolPolicy> {
  return policy ?? {};
}

function policyFromTrustedAnnotations(
  annotations: McpToolInfo["annotations"] | undefined,
): Partial<McpToolPolicy> {
  if (!annotations) {
    return {};
  }
  if (annotations.destructiveHint) {
    return { risk: "high", requiresApproval: true };
  }
  if (annotations.readOnlyHint) {
    return { risk: annotations.openWorldHint ? "medium" : "low", requiresApproval: false };
  }
  return {};
}

function renderServerDescription(server: McpServerDescriptor): string {
  if (server.transport === "http") {
    return `MCP HTTP server boundary for ${server.url ?? server.name}`;
  }
  return `MCP stdio server boundary for ${server.command ?? server.name} ${(server.args ?? []).join(
    " ",
  )}`.trim();
}
