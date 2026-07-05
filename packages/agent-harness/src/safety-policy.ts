import type { ToolDefinition } from "@ego-graph/tools";
import type { ZodTypeAny } from "zod";

export type PermissionLevel =
  "read-only" | "workspace-write" | "shell-readonly" | "network-low" | "security-active";

export const permissionRank: Record<PermissionLevel, number> = {
  "read-only": 0,
  "workspace-write": 1,
  "shell-readonly": 2,
  "network-low": 3,
  "security-active": 4,
};

export function hasPermission(current: PermissionLevel, required: PermissionLevel): boolean {
  return permissionRank[current] >= permissionRank[required];
}

export function requiredPermissionForTool(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
): PermissionLevel {
  if (tool.riskLevel === "high" || tool.permission.risk === "high") {
    return "security-active";
  }
  if (tool.permission.scope === "network") {
    return "network-low";
  }
  if (tool.name.startsWith("workspace.") && tool.permission.risk === "low") {
    return "read-only";
  }
  if (tool.name.startsWith("shell.") || tool.name.startsWith("check.")) {
    return "shell-readonly";
  }
  if (tool.requiresApproval || tool.permission.risk === "medium") {
    return "shell-readonly";
  }
  return "read-only";
}

export function buildPermissionRecoveryHint(required: PermissionLevel): string {
  return `Use /allow ${required} if this tool is appropriate for the current authorized task.`;
}
