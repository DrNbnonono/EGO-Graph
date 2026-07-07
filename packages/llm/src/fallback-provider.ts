/**
 * Fallback provider chain for ChatModelProvider.
 *
 * Wraps a primary provider with an ordered list of fallback providers.
 * When the primary provider fails (after its own retry logic), the chain
 * tries each fallback in order until one succeeds.
 *
 * For streaming: once a provider starts producing chunks, it is NOT
 * switched mid-stream (to avoid partial output).
 *
 * Usage:
 *   const provider = withFallback(primary, [fallbackA, fallbackB]);
 *
 * Set `EGO_LLM_FALLBACK=false` to disable fallback (returns primary as-is).
 */
import type {
  ChatCompletionInput,
  ChatModelProvider,
  ChatStreamEvent,
  StructuredChatCompletion,
} from "./provider.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type FallbackOptions = {
  /** Callback when the primary fails and a fallback is tried. */
  onFallback?: (index: number, error: unknown, providerName: string) => void;
};

// ── Core fallback logic ────────────────────────────────────────────────────

async function tryProviders<T>(
  providers: ChatModelProvider[],
  fn: (provider: ChatModelProvider) => Promise<T>,
  onFallback?: FallbackOptions["onFallback"],
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]!;
    try {
      return await fn(provider);
    } catch (error) {
      lastError = error;
      const next = providers[i + 1];
      if (next) {
        onFallback?.(i + 1, error, next.name);
      }
    }
  }
  throw lastError;
}

// ── Provider wrapper ───────────────────────────────────────────────────────

/**
 * Create a fallback chain of ChatModelProviders.
 *
 * The returned provider uses the primary's `name` and `model` fields.
 * When a fallback is used, the actual provider name is logged via onFallback.
 */
export function withFallback(
  primary: ChatModelProvider,
  fallbacks: ChatModelProvider[],
  options?: FallbackOptions,
): ChatModelProvider {
  if (process.env.EGO_LLM_FALLBACK === "false" || fallbacks.length === 0) {
    return primary;
  }

  const all = [primary, ...fallbacks];

  return {
    name: primary.name,
    model: primary.model,

    async complete(input: ChatCompletionInput): Promise<string> {
      return tryProviders(all, (p) => p.complete(input), options?.onFallback);
    },

    async *streamComplete(input: ChatCompletionInput): AsyncIterable<string> {
      // For streaming, try each provider. If one starts yielding chunks,
      // commit to it (don't switch mid-stream).
      let lastError: unknown;
      for (let i = 0; i < all.length; i++) {
        const provider = all[i]!;
        try {
          if (!provider.streamComplete) {
            const text = await provider.complete(input);
            yield text;
            return;
          }
          yield* provider.streamComplete(input);
          return;
        } catch (error) {
          lastError = error;
          const next = all[i + 1];
          if (next) {
            options?.onFallback?.(i + 1, error, next.name);
          }
        }
      }
      throw lastError;
    },

    async completeStructured(input: ChatCompletionInput): Promise<StructuredChatCompletion> {
      return tryProviders(
        all,
        async (p) => {
          if (p.completeStructured) {
            return p.completeStructured(input);
          }
          const content = await p.complete(input);
          return { content, toolCalls: [] };
        },
        options?.onFallback,
      );
    },

    async *streamStructured(input: ChatCompletionInput): AsyncIterable<ChatStreamEvent> {
      let lastError: unknown;
      for (let i = 0; i < all.length; i++) {
        const provider = all[i]!;
        try {
          if (!provider.streamStructured) {
            const result = provider.completeStructured
              ? await provider.completeStructured(input)
              : { content: await provider.complete(input), toolCalls: [] };
            yield { type: "done", content: result.content, toolCalls: result.toolCalls };
            return;
          }
          yield* provider.streamStructured(input);
          return;
        } catch (error) {
          lastError = error;
          const next = all[i + 1];
          if (next) {
            options?.onFallback?.(i + 1, error, next.name);
          }
        }
      }
      throw lastError;
    },
  };
}
