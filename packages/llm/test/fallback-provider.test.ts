import { describe, expect, it, vi } from "vitest";
import { withFallback } from "../src/fallback-provider.js";
import type { ChatModelProvider } from "../src/provider.js";

function createMockProvider(name: string, response: string | Error): ChatModelProvider {
  return {
    name,
    model: `${name}-model`,
    complete: typeof response === "string"
      ? vi.fn().mockResolvedValue(response)
      : vi.fn().mockRejectedValue(response),
  };
}

describe("withFallback", () => {
  it("returns primary when no fallbacks", () => {
    const primary = createMockProvider("primary", "ok");
    const wrapped = withFallback(primary, []);
    expect(wrapped).toBe(primary);
  });

  it("returns primary when EGO_LLM_FALLBACK=false", () => {
    const original = globalThis.process?.env?.EGO_LLM_FALLBACK;
    if (globalThis.process?.env) {
      globalThis.process.env.EGO_LLM_FALLBACK = "false";
    }
    const primary = createMockProvider("primary", "ok");
    const fallback = createMockProvider("fallback", "fb");
    const wrapped = withFallback(primary, [fallback]);
    expect(wrapped).toBe(primary);
    if (globalThis.process?.env && original === undefined) {
      delete globalThis.process.env.EGO_LLM_FALLBACK;
    } else if (globalThis.process?.env) {
      globalThis.process.env.EGO_LLM_FALLBACK = original;
    }
  });

  it("uses primary on success", async () => {
    const primary = createMockProvider("primary", "from-primary");
    const fallback = createMockProvider("fallback", "from-fallback");
    const wrapped = withFallback(primary, [fallback]);
    const result = await wrapped.complete({ messages: [] });
    expect(result).toBe("from-primary");
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it("falls back when primary fails", async () => {
    const primary = createMockProvider("primary", new Error("primary down"));
    const fallback = createMockProvider("fallback", "from-fallback");
    const wrapped = withFallback(primary, [fallback]);
    const result = await wrapped.complete({ messages: [] });
    expect(result).toBe("from-fallback");
  });

  it("tries multiple fallbacks in order", async () => {
    const primary = createMockProvider("primary", new Error("fail"));
    const fb1 = createMockProvider("fb1", new Error("also fail"));
    const fb2 = createMockProvider("fb2", "success");
    const wrapped = withFallback(primary, [fb1, fb2]);
    const result = await wrapped.complete({ messages: [] });
    expect(result).toBe("success");
  });

  it("throws when all providers fail", async () => {
    const primary = createMockProvider("primary", new Error("fail1"));
    const fallback = createMockProvider("fallback", new Error("fail2"));
    const wrapped = withFallback(primary, [fallback]);
    await expect(wrapped.complete({ messages: [] })).rejects.toThrow("fail2");
  });

  it("calls onFallback callback", async () => {
    const onFallback = vi.fn();
    const primary = createMockProvider("primary", new Error("down"));
    const fallback = createMockProvider("fallback", "ok");
    const wrapped = withFallback(primary, [fallback], { onFallback });
    await wrapped.complete({ messages: [] });
    expect(onFallback).toHaveBeenCalledWith(1, expect.any(Error), "fallback");
  });

  it("preserves primary name and model", () => {
    const primary = createMockProvider("my-provider", "ok");
    const fallback = createMockProvider("fallback", "ok");
    const wrapped = withFallback(primary, [fallback]);
    expect(wrapped.name).toBe("my-provider");
    expect(wrapped.model).toBe("my-provider-model");
  });
});
