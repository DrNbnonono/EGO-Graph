import type { SandboxProfile, ToolRiskLevel, ToolScopeKind } from "@ego-graph/tools";

export type McpCapability =
  | "workspace.read"
  | "workspace.search"
  | "shell.run"
  | "ctf.tool"
  | "mcp.stdio"
  | "mcp.http"
  | "mcp.oauth";

export type McpTransport = "stdio" | "http";

export type McpOAuthConfig = {
  accessToken?: string;
  tokenType?: "Bearer";
  scopes?: string[];
  resourceMetadataUrl?: string;
};

export type McpToolPolicy = {
  scope?: ToolScopeKind;
  risk?: ToolRiskLevel;
  requiresApproval?: boolean;
  sandboxProfile?: SandboxProfile;
  timeoutMs?: number;
  scenarios?: string[];
};

export type McpServerDescriptor = {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
  trustToolAnnotations?: boolean;
  defaultToolPolicy?: McpToolPolicy;
  toolPolicies?: Record<string, McpToolPolicy>;
  enabled: boolean;
};

export type McpManifest = {
  status: "not_configured" | "configured";
  capabilities: McpCapability[];
  servers: McpServerDescriptor[];
  notes: string[];
};

export function createMcpManifest(servers: McpServerDescriptor[] = []): McpManifest {
  const enabledServers = servers.filter((server) => server.enabled);
  const capabilities = new Set<McpCapability>([
    "workspace.read",
    "workspace.search",
    "shell.run",
    "ctf.tool",
  ]);

  if (enabledServers.some((server) => server.transport === "stdio")) {
    capabilities.add("mcp.stdio");
  }
  if (enabledServers.some((server) => server.transport === "http")) {
    capabilities.add("mcp.http");
  }
  if (
    enabledServers.some((server) => server.oauth?.accessToken || server.oauth?.resourceMetadataUrl)
  ) {
    capabilities.add("mcp.oauth");
  }

  return {
    status: enabledServers.length > 0 ? "configured" : "not_configured",
    capabilities: [...capabilities],
    servers,
    notes: [
      "MCP stdio and Streamable HTTP servers are discovered through tools/list.",
      "MCP tools are exposed only through EGO-Graph permission policy, approval, and audit.",
      "HTTP OAuth tokens stay in local config; public APIs only expose whether OAuth is configured.",
    ],
  };
}
