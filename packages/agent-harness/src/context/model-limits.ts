/**
 * Model context-limit resolution for auto-compaction.
 *
 * The agent loop needs to know the active model's context window so it can
 * trigger compaction before the model rejects the request. This module keeps
 * a conservative catalog keyed by provider wire API (the same axis
 * `@ego-graph/llm` ModelConfig uses) and exposes a resolver that a future P1
 * provider catalog can extend with exact per-model limits.
 *
 * Limits are conservative lower bounds: when in doubt we compact early
 * rather than risk an unrecoverable context-overflow at the model gateway.
 */

export type ModelWireApi =
  | "anthropic-messages"
  | "openai-chat-completions"
  | "openai-responses"
  | "google-gemini"
  | "unknown";

/**
 * Conservative default context limits (in tokens). These are the documented
 * minimums for the relevant model families; specific models may be larger,
 * which only makes compaction trigger later (safe).
 */
export const DEFAULT_MODEL_CONTEXT_LIMITS: Record<ModelWireApi, number> = {
  "anthropic-messages": 200_000,
  "openai-chat-completions": 128_000,
  "openai-responses": 128_000,
  "google-gemini": 128_000,
  unknown: 32_000,
};

/** A least-recently-deployed default used when nothing else is known. */
export const FALLBACK_MODEL_CONTEXT_LIMIT = DEFAULT_MODEL_CONTEXT_LIMITS.unknown;

export type ModelContextLimitInput = {
  wireApi?: string;
  /** Explicit override from config/profile (highest priority). */
  contextLimit?: number;
};

/**
 * Resolve the effective context limit. Priority: explicit override > wireApi
 * catalog > fallback. Always returns a positive integer.
 */
export function resolveModelContextLimit(input: ModelContextLimitInput): number {
  if (typeof input.contextLimit === "number" && Number.isFinite(input.contextLimit) && input.contextLimit > 0) {
    return Math.floor(input.contextLimit);
  }
  const wireApi = normalizeWireApi(input.wireApi);
  return DEFAULT_MODEL_CONTEXT_LIMITS[wireApi] ?? FALLBACK_MODEL_CONTEXT_LIMIT;
}

function normalizeWireApi(wireApi?: string): ModelWireApi {
  if (!wireApi) {
    return "unknown";
  }
  const lower = wireApi.toLowerCase();
  if (lower.includes("anthropic")) return "anthropic-messages";
  if (lower.includes("responses")) return "openai-responses";
  if (lower.includes("openai") || lower.includes("chat-completions")) {
    return "openai-chat-completions";
  }
  if (lower.includes("gemini") || lower.includes("google")) return "google-gemini";
  return "unknown";
}
