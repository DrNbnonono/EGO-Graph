import { createHash, randomUUID } from "node:crypto";
import type { ToolCallProtocol } from "../tool-executor.js";

export type PermissionGrantSource = "tui" | "web" | "api" | "policy";

export type PermissionGrantV2 = {
  id: string;
  workspaceId: string;
  toolIdentity: string;
  action: string;
  resource: string;
  effect: "allow" | "deny";
  source: PermissionGrantSource;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  policyVersion: 2;
  revokedAt?: string;
};

export type OperationApproval = {
  id: string;
  toolCallId: string;
  inputDigest: string;
  sessionId: string;
  workspaceId: string;
  source: PermissionGrantSource;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  sandboxBypass: boolean;
  usedAt?: string;
  deniedAt?: string;
};

export function createPermissionGrantsV2(input: {
  workspaceId: string;
  toolIdentity: string;
  action: string;
  resources: string[];
  effect: "allow" | "deny";
  source: PermissionGrantSource;
  createdBy: string;
  ttlMs?: number;
  maxUses?: number;
  now?: string;
}): PermissionGrantV2[] {
  const now = input.now ?? new Date().toISOString();
  const resources = [...new Set(input.resources.filter(Boolean))];
  return resources.map((resource) => ({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    toolIdentity: input.toolIdentity,
    action: input.action,
    resource,
    effect: input.effect,
    source: input.source,
    createdBy: input.createdBy,
    createdAt: now,
    expiresAt: new Date(Date.parse(now) + (input.ttlMs ?? 8 * 60 * 60 * 1000)).toISOString(),
    maxUses: input.maxUses ?? 100,
    useCount: 0,
    policyVersion: 2,
  }));
}

export function createOperationApproval(input: {
  call: ToolCallProtocol;
  sessionId: string;
  workspaceId: string;
  source: PermissionGrantSource;
  createdBy: string;
  ttlMs?: number;
  sandboxBypass?: boolean;
  now?: string;
}): OperationApproval {
  const now = input.now ?? new Date().toISOString();
  return {
    id: randomUUID(),
    toolCallId: input.call.id,
    inputDigest: toolCallInputDigest(input.call),
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    source: input.source,
    createdBy: input.createdBy,
    createdAt: now,
    expiresAt: new Date(Date.parse(now) + (input.ttlMs ?? 5 * 60 * 1000)).toISOString(),
    sandboxBypass: input.sandboxBypass ?? false,
  };
}

export function validateOperationApproval(input: {
  approval: OperationApproval | undefined;
  call: ToolCallProtocol;
  sessionId: string;
  workspaceId: string;
  now?: string;
}): { valid: true } | { valid: false; reason: string } {
  const approval = input.approval;
  if (!approval) return { valid: false, reason: "No operation approval was supplied." };
  if (approval.deniedAt) return { valid: false, reason: "Operation approval was denied." };
  if (approval.usedAt) return { valid: false, reason: "Operation approval has already been consumed." };
  if (approval.toolCallId !== input.call.id) return { valid: false, reason: "Approval is bound to another tool call." };
  if (approval.sessionId !== input.sessionId || approval.workspaceId !== input.workspaceId) {
    return { valid: false, reason: "Approval session or workspace does not match." };
  }
  if (approval.inputDigest !== toolCallInputDigest(input.call)) {
    return { valid: false, reason: "Tool input changed after approval." };
  }
  if (Date.parse(approval.expiresAt) <= Date.parse(input.now ?? new Date().toISOString())) {
    return { valid: false, reason: "Operation approval has expired." };
  }
  return { valid: true };
}

export function consumeOperationApproval(approval: OperationApproval, now?: string): void {
  if (approval.usedAt) throw new Error("Operation approval has already been consumed.");
  approval.usedAt = now ?? new Date().toISOString();
}

export function toolCallInputDigest(call: ToolCallProtocol): string {
  return createHash("sha256")
    .update(stableJson({
      id: call.id,
      name: call.name,
      input: call.input,
      toolIdentity: call.toolIdentity,
      sandboxProfile: call.sandboxProfile,
    }))
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
