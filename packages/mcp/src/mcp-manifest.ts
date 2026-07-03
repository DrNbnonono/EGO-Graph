export type McpCapability = "workspace.read" | "workspace.search" | "shell.run" | "ctf.tool";

export type McpServerDescriptor = {
  name: string;
  command: string;
  args?: string[];
  enabled: boolean;
};

export type McpManifest = {
  status: "not_configured" | "configured";
  capabilities: McpCapability[];
  servers: McpServerDescriptor[];
  notes: string[];
};

// 中文注释：当前先声明 MCP 边界，后续再接入真实 stdio/http MCP server，避免把工具协议混进业务层。
export function createMcpManifest(servers: McpServerDescriptor[] = []): McpManifest {
  return {
    status: servers.some((server) => server.enabled) ? "configured" : "not_configured",
    capabilities: ["workspace.read", "workspace.search", "shell.run", "ctf.tool"],
    servers,
    notes: [
      "MCP 传输层尚未启用，当前通过内部 ToolRegistry 与 WorkspaceService 提供等价的本地能力。",
      "后续 CTF 工具、知识库检索和沙箱命令执行会挂载到 MCP server 描述中。",
    ],
  };
}
