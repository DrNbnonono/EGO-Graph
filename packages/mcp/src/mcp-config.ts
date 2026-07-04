import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ToolRegistry, type ToolDefinition } from "@ego-graph/tools";
import { z } from "zod";
import { createMcpManifest, type McpManifest, type McpServerDescriptor } from "./mcp-manifest.js";
import { createMcpStdioClient, type McpToolInfo } from "./stdio-client.js";

const mcpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
});

const mcpConfigSchema = z.object({
  mcpServers: z.record(mcpServerConfigSchema).default({}),
});

export type McpConfig = {
  source: string | "none";
  servers: McpServerDescriptor[];
  manifest: McpManifest;
};

export type PublicMcpServer = Omit<McpServerDescriptor, "env"> & {
  envKeys: string[];
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
      const servers = Object.entries(parsed.mcpServers).map(([name, server]) => ({
        name,
        command: server.command,
        args: server.args,
        env: server.env,
        enabled: server.enabled,
      }));
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

  const client = createMcpStdioClient(server);
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

export async function listMcpRuntimeTools(config: McpConfig): Promise<{
  tools: AnyMcpToolDefinition[];
  errors: Array<{ server: string; message: string }>;
}> {
  const tools: AnyMcpToolDefinition[] = [];
  const errors: Array<{ server: string; message: string }> = [];

  for (const server of config.servers.filter((candidate) => candidate.enabled)) {
    const client = createMcpStdioClient(server);
    try {
      const remoteTools = await client.listTools();
      tools.push(...remoteTools.map((tool) => createMcpRuntimeTool(server, tool)));
    } catch (error) {
      errors.push({
        server: server.name,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await client.close();
    }
  }

  return { tools, errors };
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
  const { env, ...publicServer } = server;
  return {
    ...publicServer,
    envKeys: Object.keys(env ?? {}),
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

  return {
    name: `mcp.${server.name}`,
    description:
      `MCP server boundary for ${server.command} ${(server.args ?? []).join(" ")}`.trim(),
    inputSchema,
    outputSchema,
    permission: {
      scope: "file",
      risk: "medium",
      requiresSandbox: true,
    },
    riskLevel: "medium",
    sandboxProfile: "process",
    timeoutMs: 30_000,
    requiresApproval: true,
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

  return {
    name: `mcp.${server.name}.${tool.name}`,
    description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
    inputSchema,
    outputSchema,
    permission: {
      scope: "file",
      risk: "medium",
      requiresSandbox: true,
    },
    riskLevel: "medium",
    sandboxProfile: "process",
    timeoutMs: 30_000,
    requiresApproval: true,
    async execute(input) {
      const client = createMcpStdioClient(server);
      try {
        const result = await client.callTool(tool.name, input.arguments ?? {});
        return {
          server: server.name,
          tool: tool.name,
          result,
        };
      } finally {
        await client.close();
      }
    },
  };
}
