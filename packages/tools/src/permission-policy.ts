import type {ZodTypeAny} from "zod";
import type {ToolDefinition, ToolScopeKind} from "./tool-definition.js";

export type AllowedScope = {kind: ToolScopeKind; values: string[]};

export type PermissionDecision =
  | {allowed: true; reason: string}
  | {allowed: false; reason: string};

export function checkToolPermission(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  allowedScope: AllowedScope,
): PermissionDecision {
  if (tool.permission.scope !== allowedScope.kind) {
    return {
      allowed: false,
      reason: `Tool ${tool.name} requires ${tool.permission.scope} scope but task allows ${allowedScope.kind}`,
    };
  }

  if (allowedScope.values.length === 0) {
    return {allowed: false, reason: "Task scope is empty"};
  }

  return {allowed: true, reason: `Tool ${tool.name} is allowed for ${allowedScope.kind} scope`};
}
