import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpManifest, createMcpToolRegistry, loadMcpConfig } from "../src/index.js";

describe("mcp manifest", () => {
  it("declares the local MCP capability boundary before external servers are configured", () => {
    const manifest = createMcpManifest();

    expect(manifest.status).toBe("not_configured");
    expect(manifest.capabilities).toContain("workspace.read");
    expect(manifest.capabilities).toContain("workspace.search");
    expect(manifest.capabilities).toContain("shell.run");
    expect(manifest.capabilities).toContain("ctf.tool");
    expect(manifest.servers).toEqual([]);
  });

  it("loads MCP config and maps enabled servers into policy-gated tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-mcp-config-"));
    await writeFile(
      join(root, "ego.config.json"),
      JSON.stringify({
        mcpServers: {
          fixture: {
            command: "node",
            args: ["scripts/mcp-fixture.mjs"],
            enabled: true,
          },
          disabled: {
            command: "node",
            enabled: false,
          },
        },
      }),
      "utf8",
    );

    const config = await loadMcpConfig(root);
    const registry = createMcpToolRegistry(config);

    expect(config.manifest.status).toBe("configured");
    expect(config.servers.map((server) => server.name)).toContain("fixture");
    expect(registry.list().map((tool) => tool.name)).toEqual(["mcp.fixture"]);
    expect(registry.get("mcp.fixture").requiresApproval).toBe(true);
  });
});
