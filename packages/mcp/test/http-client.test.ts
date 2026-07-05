import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createMcpClientPool,
  createMcpHttpClient,
  listMcpRuntimeTools,
  type McpServerDescriptor,
} from "../src/index.js";

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(
  response: ServerResponse,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(200, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

describe("MCP Streamable HTTP client", () => {
  it("lists and calls tools over HTTP JSON-RPC with bearer auth and session reuse", async () => {
    const requests: Array<{
      method: string | undefined;
      path: string | undefined;
      authorization: string | undefined;
      session: string | undefined;
      protocol: string | undefined;
      body: Record<string, unknown>;
    }> = [];
    const server = createServer(async (request, response) => {
      const body = JSON.parse(await readBody(request)) as Record<string, unknown>;
      requests.push({
        method: request.method,
        path: request.url,
        authorization: request.headers.authorization,
        session: request.headers["mcp-session-id"] as string | undefined,
        protocol: request.headers["mcp-protocol-version"] as string | undefined,
        body,
      });

      if (body.method === "initialize") {
        writeJson(
          response,
          {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "http-fixture", version: "1.0.0" },
            },
          },
          { "mcp-session-id": "session-123" },
        );
        return;
      }

      if (body.method === "tools/list") {
        writeJson(response, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "search.public",
                description: "Search public documentation",
                inputSchema: { type: "object" },
              },
            ],
          },
        });
        return;
      }

      writeJson(response, {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [
            { type: "text", text: `echo:${String((body.params as { name?: string }).name)}` },
          ],
          isError: false,
        },
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP fixture did not expose a TCP address");
    }

    const client = createMcpHttpClient({
      name: "remote",
      transport: "http",
      url: `http://127.0.0.1:${address.port}/mcp`,
      enabled: true,
      oauth: { accessToken: "token-abc" },
    });

    try {
      const tools = await client.listTools();
      const result = await client.callTool("search.public", { query: "mcp" });

      expect(tools.map((tool) => tool.name)).toEqual(["search.public"]);
      expect(result.content[0]?.text).toBe("echo:search.public");
      expect(requests.map((request) => request.body.method)).toEqual([
        "initialize",
        "tools/list",
        "tools/call",
      ]);
      expect(requests.every((request) => request.method === "POST")).toBe(true);
      expect(requests.every((request) => request.path === "/mcp")).toBe(true);
      expect(requests.every((request) => request.authorization === "Bearer token-abc")).toBe(true);
      expect(requests[1]?.session).toBe("session-123");
      expect(requests[2]?.session).toBe("session-123");
      expect(requests[2]?.protocol).toBe("2025-11-25");
    } finally {
      await client.close();
      server.close();
    }
  });

  it("discovers protected resource metadata from HTTP 401 challenges", async () => {
    const server = createServer(async (request, response) => {
      if (request.url === "/.well-known/oauth-protected-resource") {
        writeJson(response, {
          resource: "http://resource.example/mcp",
          authorization_servers: ["https://auth.example"],
        });
        return;
      }
      response.writeHead(401, {
        "www-authenticate":
          'Bearer resource_metadata="http://127.0.0.1:0/.well-known/oauth-protected-resource"',
      });
      response.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP fixture did not expose a TCP address");
    }
    const base = `http://127.0.0.1:${address.port}`;
    const client = createMcpHttpClient({
      name: "remote",
      transport: "http",
      url: `${base}/mcp`,
      enabled: true,
    });

    try {
      const metadata = await client.discoverOAuthMetadata({
        resourceMetadataUrl: `${base}/.well-known/oauth-protected-resource`,
      });

      expect(metadata.authorization_servers).toEqual(["https://auth.example"]);
    } finally {
      await client.close();
      server.close();
    }
  });
});

describe("MCP client pool", () => {
  it("reuses a long-lived client per server until disposed", async () => {
    let initializeCount = 0;
    const server = createServer(async (request, response) => {
      const body = JSON.parse(await readBody(request)) as Record<string, unknown>;
      if (body.method === "initialize") {
        initializeCount += 1;
      }
      writeJson(response, {
        jsonrpc: "2.0",
        id: body.id,
        result:
          body.method === "tools/list"
            ? {
                tools: [{ name: "cached", description: "Cached", inputSchema: { type: "object" } }],
              }
            : {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "cached" },
              },
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP fixture did not expose a TCP address");
    }
    const descriptor: McpServerDescriptor = {
      name: "cached",
      transport: "http",
      url: `http://127.0.0.1:${address.port}/mcp`,
      enabled: true,
    };
    const pool = createMcpClientPool();

    try {
      await listMcpRuntimeTools(
        {
          source: "test",
          servers: [descriptor],
          manifest: { status: "configured", capabilities: [], servers: [descriptor], notes: [] },
        },
        { pool },
      );
      await listMcpRuntimeTools(
        {
          source: "test",
          servers: [descriptor],
          manifest: { status: "configured", capabilities: [], servers: [descriptor], notes: [] },
        },
        { pool },
      );

      expect(initializeCount).toBe(1);
      expect(pool.stats().activeClients).toBe(1);
    } finally {
      await pool.closeAll();
      server.close();
    }
  });
});
