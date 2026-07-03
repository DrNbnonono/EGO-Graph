import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ToolRegistry, type ToolDefinition } from "@ego-graph/tools";
import { z } from "zod";
import { createMcpManifest, type McpManifest, type McpServerDescriptor } from "./mcp-manifest.js";

const mcpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
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

export async function loadMcpConfig(workspaceRoot: string): Promise<McpConfig> {
  const candidates = [join(workspaceRoot, ".ego", "config.json"), join(workspaceRoot, "ego.config.json")];

  for (const candidate of candidates) {
    const parsed = await tryReadConfig(candidate);
    if (parsed) {
      const servers = Object.entries(parsed.mcpServers).map(([name, server]) => ({
        name,
        command: server.command,
        args: server.args,
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

export function createMcpToolRegistry(config: McpConfig): ToolRegistry {
  const registry = new ToolRegistry();
  for (const server of config.servers.filter((candidate) => candidate.enabled)) {
    registry.register(createMcpPlaceholderTool(server));
  }
  return registry;
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

function createMcpPlaceholderTool(
  server: McpServerDescriptor,
): ToolDefinition<z.ZodObject<{ request: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>> }>, z.ZodObject<{
  server: z.ZodString;
  status: z.ZodLiteral<"transport_not_started">;
  request: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>> {
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
    description: `MCP server boundary for ${server.command} ${(server.args ?? []).join(" ")}`.trim(),
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
