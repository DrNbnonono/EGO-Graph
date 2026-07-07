import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createFixtureAttackSurfaceTool,
  createFixtureReadTool,
  ToolRegistry,
  type ToolDefinition,
} from "../src/index.js";

describe("ToolRegistry", () => {
  it("registers and retrieves a fixture tool", () => {
    const registry = new ToolRegistry();
    const tool = createFixtureReadTool();

    registry.register(tool);
    registry.register(createFixtureAttackSurfaceTool());

    expect(registry.get("fixture.read").name).toBe("fixture.read");
    expect(registry.list().map((entry) => entry.name)).toEqual([
      "fixture.attack_surface",
      "fixture.read",
    ]);
  });

  it("has() checks tool existence without throwing", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool());
    expect(registry.has("fixture.read")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("registerOrReplace upserts without throwing on duplicates", () => {
    const registry = new ToolRegistry();
    const tool = createFixtureReadTool();
    registry.register(tool);
    // register() throws on duplicate
    expect(() => registry.register(tool)).toThrow();
    // registerOrReplace silently replaces
    registry.registerOrReplace(tool, "mcp");
    expect(registry.has("fixture.read")).toBe(true);
  });

  it("listByScenario filters by scenario tag and includes universal tools", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool());
    registry.register(createFixtureAttackSurfaceTool());

    // Add a scenario-specific tool
    const scenarioTool: ToolDefinition<z.ZodTypeAny, z.ZodTypeAny> = {
      name: "security.scan",
      description: "targeted scanner",
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ findings: z.array(z.string()) }).passthrough(),
      permission: { scope: "network", risk: "high", requiresSandbox: false },
      riskLevel: "high",
      scenarios: ["web_pentest", "vulnerability_research"],
      requiresApproval: true,
      requiresSecurityScope: true,
      async execute() {
        return { findings: [] };
      },
    };
    registry.register(scenarioTool);

    const webPentestTools = registry.listByScenario("web_pentest");
    expect(webPentestTools.map((t) => t.name)).toContain("security.scan");
    expect(webPentestTools.map((t) => t.name)).toContain("fixture.read");

    const incidentTools = registry.listByScenario("incident_response");
    expect(incidentTools.map((t) => t.name)).not.toContain("fixture.read");
    expect(incidentTools.map((t) => t.name)).not.toContain("security.scan");
  });

  it("listByRisk filters by maximum risk level inclusively", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool()); // risk: low
    registry.register(createFixtureAttackSurfaceTool()); // risk: low

    const highRiskTool: ToolDefinition<z.ZodTypeAny, z.ZodTypeAny> = {
      name: "dangerous.tool",
      description: "high risk",
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ findings: z.array(z.string()) }).passthrough(),
      permission: { scope: "network", risk: "high", requiresSandbox: false },
      riskLevel: "high",
      async execute() {
        return { findings: [] };
      },
    };
    registry.register(highRiskTool);

    const lowOnly = registry.listByRisk("low");
    expect(lowOnly.map((t) => t.name)).not.toContain("dangerous.tool");

    const upToHigh = registry.listByRisk("high");
    expect(upToHigh.map((t) => t.name)).toContain("dangerous.tool");
    expect(upToHigh.map((t) => t.name)).toContain("fixture.read");
  });

  it("listByScope filters by permission scope", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool());
    registry.register(createFixtureAttackSurfaceTool());

    const fixtureTools = registry.listByScope("fixture");
    expect(fixtureTools.length).toBeGreaterThan(0);
    expect(fixtureTools.every((t) => t.permission.scope === "fixture")).toBe(true);
  });

  it("listRequiringApproval and listRequiringSecurityScope filter correctly", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool());

    const gatedTool: ToolDefinition<z.ZodTypeAny, z.ZodTypeAny> = {
      name: "gated.tool",
      description: "requires approval",
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ findings: z.array(z.string()) }).passthrough(),
      permission: { scope: "network", risk: "high", requiresSandbox: false },
      riskLevel: "high",
      requiresApproval: true,
      requiresSecurityScope: true,
      async execute() {
        return { findings: [] };
      },
    };
    registry.register(gatedTool);

    const approvalTools = registry.listRequiringApproval();
    expect(approvalTools.map((t) => t.name)).toEqual(["gated.tool"]);

    const scopeTools = registry.listRequiringSecurityScope();
    expect(scopeTools.map((t) => t.name)).toEqual(["gated.tool"]);
  });

  it("discoverCapabilities returns structured capability info", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool(), "builtin");
    registry.registerOrReplace({
      name: "mcp.echo",
      description: "echo from MCP",
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ findings: z.array(z.string()) }).passthrough(),
      permission: { scope: "file", risk: "low", requiresSandbox: false },
      riskLevel: "low",
      async execute() {
        return { findings: ["echo"] };
      },
    }, "mcp");

    const caps = registry.discoverCapabilities();
    expect(caps.length).toBeGreaterThanOrEqual(2);
    const mcpCap = caps.find((c) => c.name === "mcp.echo");
    expect(mcpCap?.source).toBe("mcp");
    expect(mcpCap?.risk).toBe("low");
    expect(mcpCap?.scope).toBe("file");
    const builtinCap = caps.find((c) => c.name === "fixture.read");
    expect(builtinCap?.source).toBe("builtin");
  });

  it("listBySource filters by registration source", () => {
    const registry = new ToolRegistry();
    registry.register(createFixtureReadTool(), "builtin");
    registry.registerOrReplace({
      name: "external.scan",
      description: "external tool",
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ findings: z.array(z.string()) }).passthrough(),
      permission: { scope: "network", risk: "medium", requiresSandbox: false },
      riskLevel: "medium",
      async execute() {
        return { findings: [] };
      },
    }, "external");

    const builtin = registry.listBySource("builtin");
    expect(builtin.map((t) => t.name)).toContain("fixture.read");
    expect(builtin.map((t) => t.name)).not.toContain("external.scan");

    const external = registry.listBySource("external");
    expect(external.map((t) => t.name)).toEqual(["external.scan"]);
  });
});
