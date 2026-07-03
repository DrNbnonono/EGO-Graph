import {describe, expect, it} from "vitest";
import {isModelConfigured, loadModelConfig} from "../src/index.js";

describe("model config", () => {
  it("defaults to deterministic fallback", () => {
    const config = loadModelConfig({});

    expect(config.provider).toBe("disabled");
    expect(isModelConfigured(config)).toBe(false);
  });

  it("loads an OpenAI-compatible provider from env", () => {
    const config = loadModelConfig({
      EGO_MODEL_PROVIDER: "openai-compatible",
      EGO_MODEL_BASE_URL: "https://gateway.example.test",
      EGO_MODEL_API_KEY: "test-key",
      EGO_MODEL_NAME: "test-model",
    });

    expect(config.provider).toBe("openai-compatible");
    expect(isModelConfigured(config)).toBe(true);
  });

  it("defaults MiniMax to the domestic Anthropic-compatible M3 endpoint", () => {
    const config = loadModelConfig({
      EGO_MODEL_PROVIDER: "minimax",
      MINIMAX_API_KEY: "test-key",
    });

    expect(config.provider).toBe("minimax");
    expect(config.baseUrl).toBe("https://api.minimaxi.com/anthropic");
    expect(config.chatPath).toBe("/v1/messages");
    expect(config.model).toBe("MiniMax-M3");
    expect(config.wireApi).toBe("anthropic-messages");
    expect(config.apiKey).toBe("test-key");
    expect(isModelConfigured(config)).toBe(true);
  });
});
