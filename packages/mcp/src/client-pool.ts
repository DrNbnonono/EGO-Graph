import { createMcpHttpClient } from "./http-client.js";
import type { McpServerDescriptor } from "./mcp-manifest.js";
import { createMcpStdioClient, type McpClient } from "./stdio-client.js";

export type McpClientPool = {
  get(server: McpServerDescriptor): McpClient;
  close(server: McpServerDescriptor): Promise<void>;
  closeAll(): Promise<void>;
  stats(): { activeClients: number; keys: string[] };
};

export function createMcpClient(server: McpServerDescriptor): McpClient {
  return server.transport === "http" ? createMcpHttpClient(server) : createMcpStdioClient(server);
}

export function createMcpClientPool(): McpClientPool {
  const clients = new Map<string, McpClient>();

  return {
    get(server) {
      const key = poolKey(server);
      const existing = clients.get(key);
      if (existing) {
        return existing;
      }
      const client = createMcpClient(server);
      clients.set(key, client);
      return client;
    },
    async close(server) {
      const key = poolKey(server);
      const client = clients.get(key);
      if (!client) {
        return;
      }
      clients.delete(key);
      await client.close();
    },
    async closeAll() {
      const active = [...clients.values()];
      clients.clear();
      await Promise.all(active.map((client) => client.close()));
    },
    stats() {
      return { activeClients: clients.size, keys: [...clients.keys()] };
    },
  };
}

function poolKey(server: McpServerDescriptor): string {
  if (server.transport === "http") {
    return `http:${server.name}:${server.url ?? ""}`;
  }
  return `stdio:${server.name}:${server.command ?? ""}:${(server.args ?? []).join("\u0000")}`;
}
