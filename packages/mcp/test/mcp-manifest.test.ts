import { describe, expect, it } from "vitest";
import { createMcpManifest } from "../src/index.js";

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
});
