export type McpCapability = "workspace.read" | "workspace.search" | "shell.run" | "ctf.tool";

export type McpServerDescriptor = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
};

export type McpManifest = {
  status: "not_configured" | "configured";
  capabilities: McpCapability[];
  servers: McpServerDescriptor[];
  notes: string[];
};

// 中文注释：MCP 边界保持独立，Agent Harness 通过工具注册层接入 stdio v1。
export function createMcpManifest(servers: McpServerDescriptor[] = []): McpManifest {
  return {
    status: servers.some((server) => server.enabled) ? "configured" : "not_configured",
    capabilities: ["workspace.read", "workspace.search", "shell.run", "ctf.tool"],
    servers,
    notes: [
      "stdio MCP server 可通过 tools/list 发现工具，并通过 tools/call 在审批后执行。",
      "HTTP/OAuth MCP、长期连接池和更细粒度工具权限会在后续阶段扩展。",
    ],
  };
}
