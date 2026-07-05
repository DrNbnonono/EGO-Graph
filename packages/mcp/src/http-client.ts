import type { McpOAuthConfig, McpServerDescriptor } from "./mcp-manifest.js";
import type { McpCallToolResult, McpClient, McpToolInfo } from "./stdio-client.js";

const defaultProtocolVersion = "2025-11-25";

export type McpOAuthProtectedResourceMetadata = {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  [key: string]: unknown;
};

export type McpHttpClient = McpClient & {
  discoverOAuthMetadata(input?: {
    resourceMetadataUrl?: string;
    challenge?: string;
  }): Promise<McpOAuthProtectedResourceMetadata>;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: number;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

export function createMcpHttpClient(server: McpServerDescriptor): McpHttpClient {
  if (!server.url) {
    throw new Error(`MCP HTTP server ${server.name} is missing url`);
  }

  let initialized = false;
  let nextId = 1;
  let sessionId: string | undefined;
  let protocolVersion = defaultProtocolVersion;

  async function ensureInitialized(): Promise<void> {
    if (initialized) {
      return;
    }
    const result = (await request("initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "EGO-Graph", version: "0.1.0" },
    })) as { protocolVersion?: string };
    protocolVersion = result.protocolVersion ?? protocolVersion;
    initialized = true;
  }

  async function request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = nextId++;
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    };
    const toolName = readToolName(method, params);
    const headerInput: {
      method: string;
      protocolVersion: string;
      sessionId?: string;
      toolName?: string;
    } = { method, protocolVersion };
    if (sessionId) {
      headerInput.sessionId = sessionId;
    }
    if (toolName) {
      headerInput.toolName = toolName;
    }
    const response = await fetch(server.url!, {
      method: "POST",
      headers: buildHeaders(server, headerInput),
      body: JSON.stringify(body),
    });
    const receivedSession = response.headers.get("mcp-session-id");
    if (receivedSession) {
      sessionId = receivedSession;
    }
    if (response.status === 401) {
      const challenge = response.headers.get("www-authenticate") ?? "";
      throw new Error(
        `MCP HTTP authorization required for ${server.name}: ${challenge || "missing WWW-Authenticate"}`,
      );
    }
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("text/event-stream")
      ? parseSseResponse(await response.text(), id)
      : ((await response.json()) as JsonRpcResponse);
    if (payload.error) {
      throw new Error(payload.error.message ?? `MCP error ${payload.error.code ?? ""}`);
    }
    return payload.result;
  }

  return {
    async listTools() {
      await ensureInitialized();
      const result = (await request("tools/list")) as { tools?: McpToolInfo[] };
      return result.tools ?? [];
    },
    async callTool(name, args = {}) {
      await ensureInitialized();
      return (await request("tools/call", { name, arguments: args })) as McpCallToolResult;
    },
    async discoverOAuthMetadata(input = {}) {
      const metadataUrl =
        input.resourceMetadataUrl ??
        extractResourceMetadataUrl(input.challenge ?? "") ??
        server.oauth?.resourceMetadataUrl;
      if (!metadataUrl) {
        throw new Error(`No OAuth protected resource metadata URL configured for ${server.name}`);
      }
      const response = await fetch(metadataUrl, {
        headers: buildOAuthDiscoveryHeaders(server.oauth),
      });
      if (!response.ok) {
        throw new Error(
          `OAuth protected resource metadata request failed: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as McpOAuthProtectedResourceMetadata;
    },
    async close() {
      initialized = false;
      sessionId = undefined;
    },
  };
}

function buildHeaders(
  server: McpServerDescriptor,
  input: {
    method: string;
    protocolVersion: string;
    sessionId?: string;
    toolName?: string;
  },
): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": input.protocolVersion,
    "mcp-method": input.method,
    ...sanitizeHeaders(server.headers ?? {}),
  };
  if (input.sessionId) {
    headers["mcp-session-id"] = input.sessionId;
  }
  if (input.toolName) {
    headers["mcp-name"] = input.toolName;
  }
  const token = server.oauth?.accessToken;
  if (token) {
    headers.authorization = `${server.oauth?.tokenType ?? "Bearer"} ${token}`;
  }
  return headers;
}

function buildOAuthDiscoveryHeaders(oauth: McpOAuthConfig | undefined): HeadersInit {
  return oauth?.accessToken
    ? { authorization: `${oauth.tokenType ?? "Bearer"} ${oauth.accessToken}` }
    : {};
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !/^authorization$/i.test(key)),
  );
}

function readToolName(
  method: string,
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (method !== "tools/call") {
    return undefined;
  }
  const name = params?.name;
  return typeof name === "string" ? name : undefined;
}

function parseSseResponse(body: string, expectedId: number): JsonRpcResponse {
  const events = body.split(/\r?\n\r?\n/u);
  for (const event of events) {
    const data = event
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
      .trim();
    if (!data) {
      continue;
    }
    const parsed = JSON.parse(data) as JsonRpcResponse;
    if (parsed.id === expectedId) {
      return parsed;
    }
  }
  throw new Error("MCP SSE stream did not include a JSON-RPC response");
}

function extractResourceMetadataUrl(challenge: string): string | undefined {
  const match = /resource_metadata="([^"]+)"/i.exec(challenge);
  return match?.[1];
}
