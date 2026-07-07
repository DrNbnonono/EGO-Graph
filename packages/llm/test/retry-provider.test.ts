import { describe, expect, it, vi } from "vitest";
import { withRetry, type RetryConfig } from "../src/retry-provider.js";
import { ModelRequestError } from "../src/model-request-error.js";
import type { ChatModelProvider } from "../src/provider.js";

function createMockProvider(overrides?: Partial<ChatModelProvider>): ChatModelProvider {
  return {
    name: "mock",
    model: "test-model",
    complete: vi.fn().mockResolvedValue("hello"),
    ...overrides,
  };
}

const fastConfig: Partial<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 10,
};

describe("withRetry", () => {
  it("returns the original provider when EGO_LLM_RETRY=false", () => {
    const original = process.env.EGO_LLM_RETRY;
    process.env.EGO_LLM_RETRY = "false";
    const provider = createMockProvider();
    const wrapped = withRetry(provider);
    expect(wrapped).toBe(provider);
    process.env.EGO_LLM_RETRY = original;
  });

  it("succeeds on first attempt", async () => {
    const provider = createMockProvider();
    const wrapped = withRetry(provider, fastConfig);
    const result = await wrapped.complete({ messages: [] });
    expect(result).toBe("hello");
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("retries on ModelRequestError with 429", async () => {
    const provider = createMockProvider({
      complete: vi.fn()
        .mockRejectedValueOnce(new ModelRequestError({ message: "rate limited", statusCode: 429, providerName: "mock" }))
        .mockResolvedValue("ok"),
    });
    const wrapped = withRetry(provider, fastConfig);
    const result = await wrapped.complete({ messages: [] });
    expect(result).toBe("ok");
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 error", async () => {
    const provider = createMockProvider({
      complete: vi.fn()
        .mockRejectedValueOnce(new ModelRequestError({ message: "server error", statusCode: 500, providerName: "mock" }))
        .mockResolvedValue("recovered"),
    });
    const wrapped = withRetry(provider, fastConfig);
    const result = await wrapped.complete({ messages: [] });
    expect(result).toBe("recovered");
  });

  it("does NOT retry on 400 error", async () => {
    const provider = createMockProvider({
      complete: vi.fn().mockRejectedValue(
        new ModelRequestError({ message: "bad request", statusCode: 400, providerName: "mock" }),
      ),
    });
    const wrapped = withRetry(provider, fastConfig);
    await expect(wrapped.complete({ messages: [] })).rejects.toThrow("bad request");
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("throws after max attempts exhausted", async () => {
    const provider = createMockProvider({
      complete: vi.fn().mockRejectedValue(
        new ModelRequestError({ message: "always fails", statusCode: 503, providerName: "mock" }),
      ),
    });
    const wrapped = withRetry(provider, { ...fastConfig, maxAttempts: 2 });
    await expect(wrapped.complete({ messages: [] })).rejects.toThrow("always fails");
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const provider = createMockProvider({
      complete: vi.fn()
        .mockRejectedValueOnce(new ModelRequestError({ message: "err", statusCode: 500, providerName: "mock" }))
        .mockResolvedValue("ok"),
    });
    const wrapped = withRetry(provider, { ...fastConfig, onRetry });
    await wrapped.complete({ messages: [] });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(ModelRequestError), expect.any(Number));
  });
});
