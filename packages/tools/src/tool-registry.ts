import type { ZodTypeAny } from "zod";
import type { ToolDefinition, ToolRiskLevel, ToolScopeKind } from "./tool-definition.js";

/** Risk ordering for comparisons (low < medium < high). */
const RISK_ORDER: Record<ToolRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export type ToolCapabilityInfo = {
  name: string;
  description: string;
  scope: ToolScopeKind;
  risk: ToolRiskLevel;
  scenarios: string[];
  requiresApproval: boolean;
  requiresSecurityScope: boolean;
  hasEvidenceMapper: boolean;
  source: "builtin" | "mcp" | "external";
};

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<ZodTypeAny, ZodTypeAny>>();
  private readonly sourceMap = new Map<string, "builtin" | "mcp" | "external">();

  register(tool: ToolDefinition<ZodTypeAny, ZodTypeAny>, source: "builtin" | "mcp" | "external" = "builtin"): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.sourceMap.set(tool.name, source);
  }

  /**
   * Register or replace a tool. MCP and external tools may re-register
   * as their lifecycle changes (server restart, config update). The
   * previous definition is silently replaced.
   */
  registerOrReplace(
    tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
    source: "builtin" | "mcp" | "external" = "mcp",
  ): void {
    this.tools.set(tool.name, tool);
    this.sourceMap.set(tool.name, source);
  }

  get(name: string): ToolDefinition<ZodTypeAny, ZodTypeAny> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Filter tools by scenario tag. Returns tools whose `scenarios` array
   * includes the given scenario, or all tools with no `scenarios` filter
   * (universal tools). */
  listByScenario(scenario: string): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return this.list().filter((tool) => {
      if (!tool.scenarios || tool.scenarios.length === 0) {
        return true;
      }
      return tool.scenarios.includes(scenario);
    });
  }

  /** Filter tools by maximum risk level (inclusive). */
  listByRisk(maxRisk: ToolRiskLevel): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    const max = RISK_ORDER[maxRisk];
    return this.list().filter((tool) => {
      const risk = RISK_ORDER[tool.riskLevel ?? tool.permission.risk];
      return risk <= max;
    });
  }

  /** Filter tools by scope kind (file, network, fixture). */
  listByScope(scope: ToolScopeKind): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return this.list().filter((tool) => tool.permission.scope === scope);
  }

  /** Filter tools that require approval vs. those that don't. */
  listRequiringApproval(): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return this.list().filter((tool) => tool.requiresApproval === true);
  }

  /** Filter tools that require a security scope. */
  listRequiringSecurityScope(): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return this.list().filter((tool) => tool.requiresSecurityScope === true);
  }

  /**
   * Capability discovery: return a structured summary of every registered
   * tool's capabilities. Used by the agent loop to decide which tools to
   * present to the model and by the TUI to render the tool panel.
   */
  discoverCapabilities(): ToolCapabilityInfo[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      scope: tool.permission.scope,
      risk: tool.riskLevel ?? tool.permission.risk,
      scenarios: tool.scenarios ?? [],
      requiresApproval: tool.requiresApproval === true,
      requiresSecurityScope: tool.requiresSecurityScope === true,
      hasEvidenceMapper: typeof tool.evidenceMapper === "function",
      source: this.sourceMap.get(tool.name) ?? "builtin",
    }));
  }

  /** List tools by source (builtin, mcp, external). */
  listBySource(source: "builtin" | "mcp" | "external"): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return this.list().filter((tool) => (this.sourceMap.get(tool.name) ?? "builtin") === source);
  }
}
