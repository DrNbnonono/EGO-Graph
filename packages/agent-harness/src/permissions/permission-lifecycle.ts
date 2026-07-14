import type {
  PermissionEffect,
  PermissionReply,
  PermissionRequest,
  PermissionRule,
} from "../permission-rules.js";

export type PermissionRequestStatus = "pending" | "approved" | "rejected" | "expired";

export type PermissionGrantMode = "once" | "always";

export type PermissionLifecycleEntry = PermissionRequest & {
  status: PermissionRequestStatus;
  updatedAt: string;
  expiresAt?: string;
  reply?: PermissionReply;
};

export type PermissionLifecycleState = {
  pending: PermissionLifecycleEntry[];
  history: PermissionLifecycleEntry[];
  savedRules: PermissionRule[];
};

export function createPermissionLifecycleState(): PermissionLifecycleState {
  return { pending: [], history: [], savedRules: [] };
}

export function enqueuePermissionRequest(input: {
  state: PermissionLifecycleState;
  request: PermissionRequest;
  ttlMs?: number;
  now?: string;
}): PermissionLifecycleState {
  const now = input.now ?? new Date().toISOString();
  const existing = input.state.pending.find((entry) => entry.id === input.request.id);
  if (existing) {
    return input.state;
  }
  const entry: PermissionLifecycleEntry = {
    ...input.request,
    status: "pending",
    updatedAt: now,
    ...(input.ttlMs ? { expiresAt: new Date(Date.parse(now) + input.ttlMs).toISOString() } : {}),
  };
  return {
    pending: [...input.state.pending, entry],
    history: input.state.history,
    savedRules: input.state.savedRules,
  };
}

export function replyToPermissionRequest(input: {
  state: PermissionLifecycleState;
  reply: PermissionReply;
  mode?: PermissionGrantMode;
  now?: string;
}): PermissionLifecycleState {
  const now = input.now ?? new Date().toISOString();
  const pending = input.state.pending.filter((entry) => entry.id !== input.reply.requestId);
  const request = input.state.pending.find((entry) => entry.id === input.reply.requestId);
  if (!request) {
    return input.state;
  }
  const status = replyEffectToStatus(input.reply.effect);
  const resolved: PermissionLifecycleEntry = {
    ...request,
    status,
    updatedAt: now,
    reply: input.reply,
  };
  const savedRules =
    input.reply.save || input.mode === "always"
      ? [...input.state.savedRules, ...permissionRulesFromResolved(resolved)]
      : input.state.savedRules;
  return {
    pending,
    history: [resolved, ...input.state.history].slice(0, 200),
    savedRules,
  };
}

export function expirePermissionRequests(input: {
  state: PermissionLifecycleState;
  now?: string;
}): PermissionLifecycleState {
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const stillPending: PermissionLifecycleEntry[] = [];
  const expired: PermissionLifecycleEntry[] = [];
  for (const entry of input.state.pending) {
    if (entry.expiresAt && Date.parse(entry.expiresAt) <= nowMs) {
      expired.push({ ...entry, status: "expired", updatedAt: new Date(nowMs).toISOString() });
    } else {
      stillPending.push(entry);
    }
  }
  if (expired.length === 0) {
    return input.state;
  }
  return {
    pending: stillPending,
    history: [...expired, ...input.state.history].slice(0, 200),
    savedRules: input.state.savedRules,
  };
}

function replyEffectToStatus(effect: PermissionEffect): PermissionRequestStatus {
  return effect === "allow" ? "approved" : "rejected";
}

function permissionRulesFromResolved(entry: PermissionLifecycleEntry): PermissionRule[] {
  return [...new Set(entry.resources.filter(Boolean))].map((resource) => ({
    action: entry.action,
    resource,
    effect: entry.reply?.effect ?? "ask",
  }));
}
