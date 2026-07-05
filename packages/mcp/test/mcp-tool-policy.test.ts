import { describe, expect, it } from "vitest";
import { createMcpRuntimeToolForTest, type McpServerDescriptor } from "../src/index.js";

describe("MCP tool permission mapping", () => {
  it("applies per-tool policy overrides before the server default policy", () => {
    const server: McpServerDescriptor = {
      name: "remote",
      transport: "http",
      url: "https://mcp.example/mcp",
      enabled: true,
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
    };

    const tool = createMcpRuntimeToolForTest(server, {
      name: "docs.search",
      description: "Search docs",
      inputSchema: { type: "object" },
    });

    expect(tool.permission.scope).toBe("network");
    expect(tool.riskLevel).toBe("low");
    expect(tool.requiresApproval).toBe(false);
  });

  it("defaults unknown MCP tools to approval-gated medium risk", () => {
    const server: McpServerDescriptor = {
      name: "remote",
      transport: "http",
      url: "https://mcp.example/mcp",
      enabled: true,
    };

    const tool = createMcpRuntimeToolForTest(server, {
      name: "unknown.write",
      description: "Unknown remote write",
      inputSchema: { type: "object" },
    });

    expect(tool.permission.scope).toBe("network");
    expect(tool.riskLevel).toBe("medium");
    expect(tool.requiresApproval).toBe(true);
  });
});
