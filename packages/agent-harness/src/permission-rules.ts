import type { PermissionLevel } from "./safety-policy.js";

export type PermissionEffect = "allow" | "ask" | "deny";

export type PermissionRule = {
  action: string;
  resource: string;
  effect: PermissionEffect;
};

export type PermissionDecision = {
  effect: PermissionEffect;
  matchedRule?: PermissionRule;
};

export type PermissionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  action: string;
  resources: string[];
  createdAt: string;
};

export type PermissionReply = {
  requestId: string;
  effect: PermissionEffect;
  save?: boolean;
  reason?: string;
};

export function evaluatePermissionRules(input: {
  action: string;
  resources: string[];
  rules: PermissionRule[];
}): PermissionDecision {
  let matched: PermissionRule | undefined;
  for (const rule of input.rules) {
    if (!wildcardMatch(input.action, rule.action)) {
      continue;
    }
    const resources = input.resources.length > 0 ? input.resources : [""];
    if (resources.every((resource) => wildcardMatch(resource, rule.resource))) {
      matched = rule;
    }
  }
  return matched ? { effect: matched.effect, matchedRule: matched } : { effect: "ask" };
}

export function permissionRulesForLevel(level: PermissionLevel): PermissionRule[] {
  const readOnly: PermissionRule[] = [
    { action: "*", resource: "*", effect: "deny" },
    { action: "workspace.*", resource: "*", effect: "allow" },
    { action: "evidence.write", resource: "*", effect: "allow" },
  ];
  if (level === "read-only") {
    return readOnly;
  }

  const workspaceWrite: PermissionRule[] = [
    ...readOnly,
    { action: "*", resource: "*", effect: "allow" },
    { action: "workspace.edit", resource: "*", effect: "ask" },
  ];
  if (level === "workspace-write") {
    return workspaceWrite;
  }

  const shellReadonly: PermissionRule[] = [
    ...workspaceWrite,
    { action: "check.*", resource: "*", effect: "allow" },
    { action: "shell.readonly", resource: "*", effect: "ask" },
  ];
  if (level === "shell-readonly") {
    return shellReadonly;
  }

  const networkLow: PermissionRule[] = [
    ...shellReadonly,
    { action: "web.search", resource: "*", effect: "ask" },
    { action: "network.*", resource: "*", effect: "ask" },
  ];
  if (level === "network-low") {
    return networkLow;
  }

  return [
    ...networkLow,
    { action: "security.*", resource: "*", effect: "ask" },
    { action: "shell.write", resource: "*", effect: "ask" },
  ];
}

/**
 * Glob-style match used by the permission rule evaluator. Exported so the
 * tool executor can reuse the exact same semantics when honoring saved
 * permission grants from the lifecycle store.
 */
export function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "u").test(value);
}
