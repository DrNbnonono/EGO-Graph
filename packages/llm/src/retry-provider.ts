/**
 * Retry decorator for ChatModelProvider.
 *
 * Wraps an existing provider with exponential backoff retry logic.
 * Retries on 429 (rate limit), 5xx (server errors), and network errors.
 * Non-retryable errors (4xx except 429) are propagated immediately.
 *
 * Usage:
 *   const resilient = withRetry(primaryProvider, { maxAttempts: 3 });
 *   // resilient implements ChatModelProvider transparently
 */
import type {
  ChatCompletionInput,
  ChatModelProvider,
  ChatStreamEvent,
  StructuredChatCompletion,
} from "./provider.js";
import { ModelRequestError, isRetryableStatus } from "./model-request-error.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type RetryConfig = {
  /** Maximum number of attempts (including the initial request). Default: 3. */
  maxAttempts: number;
  /** Base delay in ms for exponential backoff. Default: 1000. */
  baseDelayMs: number;
  /** Maximum delay cap in ms. Default: 30000. */
  maxDelayMs: number;
  /** Callback invoked before each retry. */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
};

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

// ── Core retry logic ───────────────────────────────────────────────────────

function computeDelay(attempt: number, config: RetryConfig, error: unknown): number {
  // Honor Retry-After from ModelRequestError.
  if (error instanceof ModelRequestError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, config.maxDelayMs);
  }
  // Exponential backoff with jitter.
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * config.baseDelayMs * 0.5;
  return Math.min(exponential + jitter, config.maxDelayMs);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ModelRequestError) {
    if (error.statusCode !== undefined) {
      return isRetryableStatus(error.statusCode);
    }
    // Network errors (no status code) are retryable.
    return true;
  }
  // AbortError is not retryable — user explicitly cancelled.
  if (error instanceof Error && error.name === "AbortError") {
    return false;
  }
  // Generic network errors are retryable.
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

async function withRetryAsync<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  onRetry?: RetryConfig["onRetry"],
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxAttempts - 1 || !isRetryable(error)) {
        throw error;
      }
      const delay = computeDelay(attempt, config, error);
      onRetry?.(attempt + 1, error, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Provider wrapper ───────────────────────────────────────────────────────

/**
 * Wrap a ChatModelProvider with automatic retry logic.
 *
 * When `EGO_LLM_RETRY=false` is set in the environment, returns the
 * original provider unchanged (opt-out mechanism).
 */
export function withRetry(
  provider: ChatModelProvider,
  config?: Partial<RetryConfig>,
): ChatModelProvider {
  if (process.env.EGO_LLM_RETRY === "false") {
    return provider;
  }

  const resolved: RetryConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: provider.name,
    model: provider.model,

    async complete(input: ChatCompletionInput): Promise<string> {
      return withRetryAsync(
        () => provider.complete(input),
        resolved,
        resolved.onRetry,
      );
    },

    async *streamComplete(input: ChatCompletionInput): AsyncIterable<string> {
      // Retry the entire stream request if it fails before producing any chunk.
      let attempts = 0;
      let lastError: unknown;

      while (attempts < resolved.maxAttempts) {
        try {
          if (!provider.streamComplete) {
            // Fallback: use complete and yield the result.
            const text = await withRetryAsync(
              () => provider.complete(input),
              resolved,
              resolved.onRetry,
            );
            yield text;
            return;
          }
          yield* provider.streamComplete(input);
          return;
        } catch (error) {
          lastError = error;
          attempts++;
          if (attempts >= resolved.maxAttempts || !isRetryable(error)) {
            throw error;
          }
          const delay = computeDelay(attempts - 1, resolved, error);
          resolved.onRetry?.(attempts, error, delay);
          await sleep(delay);
        }
      }
      throw lastError;
    },

    async completeStructured(input: ChatCompletionInput): Promise<StructuredChatCompletion> {
      if (!provider.completeStructured) {
        const content = await withRetryAsync(
          () => provider.complete(input),
          resolved,
          resolved.onRetry,
        );
        return { content, toolCalls: [] };
      }
      return withRetryAsync(
        () => provider.completeStructured!(input),
        resolved,
        resolved.onRetry,
      );
    },

    async *streamStructured(input: ChatCompletionInput): AsyncIterable<ChatStreamEvent> {
      let attempts = 0;
      let lastError: unknown;

      while (attempts < resolved.maxAttempts) {
        try {
          if (!provider.streamStructured) {
            // Fallback: use completeStructured and emit as a single done event.
            const result = await withRetryAsync(
              () => provider.completeStructured
                ? provider.completeStructured(input)
                : provider.complete(input).then((content) => ({ content, toolCalls: [] })),
              resolved,
              resolved.onRetry,
            );
            yield { type: "done", content: result.content, toolCalls: result.toolCalls };
            return;
          }
          yield* provider.streamStructured(input);
          return;
        } catch (error) {
          lastError = error;
          attempts++;
          if (attempts >= resolved.maxAttempts || !isRetryable(error)) {
            throw error;
          }
          const delay = computeDelay(attempts - 1, resolved, error);
          resolved.onRetry?.(attempts, error, delay);
          await sleep(delay);
        }
      }
      throw lastError;
    },
  };
}
