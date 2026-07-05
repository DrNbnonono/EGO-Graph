import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listMcpServers, loadMcpConfig, saveMcpServer } from "../src/index.js";

describe("MCP config HTTP/OAuth support", () => {
  it("loads stdio and HTTP servers without exposing secret values in public config", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-mcp-config-http-"));
    await saveMcpServer({
      workspaceRoot: root,
      server: {
        name: "remote-docs",
        transport: "http",
        url: "https://mcp.example/mcp",
        headers: { "x-client": "ego" },
        oauth: {
          accessToken: "secret-access-token",
          tokenType: "Bearer",
          scopes: ["tools.read"],
        },
        defaultToolPolicy: {
          scope: "network",
          risk: "medium",
          requiresApproval: true,
        },
        toolPolicies: {
          "docs.search": {
            scope: "network",
            risk: "low",
            requiresApproval: false,
          },
        },
        enabled: true,
      },
    });

    const loaded = await loadMcpConfig(root);

    expect(loaded.servers[0]?.transport).toBe("http");
    expect(loaded.servers[0]?.url).toBe("https://mcp.example/mcp");
    expect(loaded.servers[0]?.oauth?.accessToken).toBe("secret-access-token");
    expect(loaded.manifest.capabilities).toContain("mcp.http");
    const configText = await readFile(join(root, ".ego", "config.json"), "utf8");
    expect(configText).toContain("secret-access-token");
    const listed = await listMcpServers(root);
    expect(JSON.stringify(listed.servers)).not.toContain("secret-access-token");
    expect(listed.servers[0]?.oauthConfigured).toBe(true);
  });

  it("keeps legacy stdio config compatible when transport is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-mcp-config-stdio-"));
    await mkdir(join(root, ".ego"), { recursive: true });
    await writeFile(
      join(root, ".ego", "config.json"),
      JSON.stringify({
        mcpServers: {
          legacy: {
            command: "node",
            args: ["server.mjs"],
            env: { SECRET: "value" },
            enabled: true,
          },
        },
      }),
      "utf8",
    );

    const loaded = await loadMcpConfig(root);

    expect(loaded.servers[0]).toMatchObject({
      name: "legacy",
      transport: "stdio",
      command: "node",
      args: ["server.mjs"],
      enabled: true,
    });
    expect(loaded.manifest.capabilities).toContain("mcp.stdio");
  });
});
