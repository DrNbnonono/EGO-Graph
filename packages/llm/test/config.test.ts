import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isModelConfigured,
  loadModelConfig,
  loadModelConfigWithSource,
  saveModelConfig,
  toPublicModelConfig,
} from "../src/index.js";

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

  it("loads persisted model config from .ego/config.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-llm-config-"));
    await writeFile(join(root, ".ego-config-placeholder"), "placeholder", "utf8");
    await saveModelConfig({
      workspaceRoot: root,
      provider: "openai-compatible",
      baseUrl: "https://gateway.example.test",
      apiKey: "persisted-key",
      model: "persisted-model",
    });

    const loaded = loadModelConfigWithSource({ workspaceRoot: root, env: {} });

    expect(loaded.source).toBe("workspace-local");
    expect(loaded.path).toContain(".ego/config.json");
    expect(loaded.config.provider).toBe("openai-compatible");
    expect(loaded.config.model).toBe("persisted-model");
    expect(isModelConfigured(loaded.config)).toBe(true);
  });

  it("lets environment variables override persisted JSON config", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-llm-env-"));
    await saveModelConfig({
      workspaceRoot: root,
      provider: "openai-compatible",
      baseUrl: "https://persisted.example.test",
      apiKey: "persisted-key",
      model: "persisted-model",
    });

    const loaded = loadModelConfigWithSource({
      workspaceRoot: root,
      env: {
        EGO_MODEL_PROVIDER: "deepseek",
        EGO_MODEL_API_KEY: "env-key",
        EGO_MODEL_NAME: "env-model",
      },
    });

    expect(loaded.source).toBe("environment");
    expect(loaded.config.provider).toBe("deepseek");
    expect(loaded.config.baseUrl).toBe("https://api.deepseek.com");
    expect(loaded.config.apiKey).toBe("env-key");
    expect(loaded.config.model).toBe("env-model");
  });

  it("saves model config without overwriting other ego config sections", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-llm-save-"));
    await writeFile(
      join(root, "ego.config.json"),
      JSON.stringify({ model: { provider: "disabled" } }),
      "utf8",
    );
    await saveModelConfig({
      workspaceRoot: root,
      provider: "minimax",
      apiKey: "mini-key",
    });
    await writeFile(
      join(root, ".ego", "config.json"),
      JSON.stringify({
        mcpServers: {
          fixture: { command: "node", args: ["fixture.mjs"], enabled: true },
        },
        model: {
          provider: "minimax",
          apiKey: "mini-key",
        },
      }),
      "utf8",
    );
    await saveModelConfig({
      workspaceRoot: root,
      model: "MiniMax-M3",
    });

    const content = JSON.parse(await readFile(join(root, ".ego", "config.json"), "utf8")) as {
      mcpServers?: unknown;
      model?: { apiKey?: string; model?: string };
    };
    const publicConfig = toPublicModelConfig(
      loadModelConfigWithSource({ workspaceRoot: root, env: {} }),
    );

    expect(content.mcpServers).toBeDefined();
    expect(content.model?.apiKey).toBe("mini-key");
    expect(content.model?.model).toBe("MiniMax-M3");
    expect(publicConfig.apiKeyConfigured).toBe(true);
    expect(publicConfig.apiKeyPreview).toBe("****");
  });
});
