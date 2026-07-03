import type { ZodTypeAny } from "zod";
import type { ToolDefinition, ToolRiskLevel, ToolScopeKind } from "./tool-definition.js";

export type AllowedScope = { kind: ToolScopeKind; values: string[] };
export type PolicyGateContext = {
  allowedScope: AllowedScope;
  scenario?: string;
  approvedTools?: string[];
  allowedRiskLevels?: ToolRiskLevel[];
  sandboxAvailable?: boolean;
};

export type PermissionDecision =
  { allowed: true; reason: string } | { allowed: false; reason: string };

export function checkToolPermission(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  allowedScope: AllowedScope,
): PermissionDecision {
  return checkPolicyGate(tool, { allowedScope });
}

export function checkPolicyGate(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  context: PolicyGateContext,
): PermissionDecision {
  if (tool.permission.scope !== context.allowedScope.kind) {
    return {
      allowed: false,
      reason: `Tool ${tool.name} requires ${tool.permission.scope} scope but task allows ${context.allowedScope.kind}`,
    };
  }

  if (context.allowedScope.values.length === 0) {
    return { allowed: false, reason: "Task scope is empty" };
  }

  if (context.scenario && tool.scenarios && !tool.scenarios.includes(context.scenario)) {
    return {
      allowed: false,
      reason: `Tool ${tool.name} is not registered for scenario ${context.scenario}`,
    };
  }

  const riskLevel = tool.riskLevel ?? tool.permission.risk;
  const allowedRiskLevels = context.allowedRiskLevels ?? ["low", "medium"];
  if (!allowedRiskLevels.includes(riskLevel)) {
    return { allowed: false, reason: `Tool ${tool.name} risk ${riskLevel} is not allowed` };
  }

  const sandboxProfile =
    tool.sandboxProfile ?? (tool.permission.requiresSandbox ? "docker" : "none");
  if (sandboxProfile !== "none" && context.sandboxAvailable === false) {
    return { allowed: false, reason: `Tool ${tool.name} requires ${sandboxProfile} sandbox` };
  }

  if (tool.requiresApproval && !(context.approvedTools ?? []).includes(tool.name)) {
    return { allowed: false, reason: `Tool ${tool.name} requires human approval` };
  }

  return {
    allowed: true,
    reason: `Tool ${tool.name} is allowed for ${context.allowedScope.kind} scope with ${riskLevel} risk`,
  };
}
