import type { ModelProviderName } from "./config.js";

export type ModelCapability = {
  provider: ModelProviderName;
  openAICompatible: boolean;
  anthropicCompatible: boolean;
  jsonMode: boolean;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsJsonMode: boolean;
  supportsVision: boolean;
  maxContextTokens: number;
  notes: string;
};

export const modelCapabilities: ModelCapability[] = [
  {
    provider: "openai-compatible",
    openAICompatible: true,
    anthropicCompatible: false,
    jsonMode: true,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
    supportsVision: false,
    maxContextTokens: 128_000,
    notes: "Generic OpenAI-compatible gateway, including common API relay services.",
  },
  {
    provider: "deepseek",
    openAICompatible: true,
    anthropicCompatible: false,
    jsonMode: true,
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
    supportsVision: false,
    maxContextTokens: 64_000,
    notes: "DeepSeek profile using the OpenAI-compatible chat completions surface.",
  },
  {
    provider: "minimax",
    openAICompatible: false,
    anthropicCompatible: true,
    jsonMode: true,
    supportsStreaming: true,
    supportsToolCalls: false,
    supportsJsonMode: true,
    supportsVision: false,
    maxContextTokens: 1_000_000,
    notes: "MiniMax-M3 profile using the domestic Anthropic Messages endpoint by default.",
  },
  {
    provider: "disabled",
    openAICompatible: false,
    anthropicCompatible: false,
    jsonMode: false,
    supportsStreaming: false,
    supportsToolCalls: false,
    supportsJsonMode: false,
    supportsVision: false,
    maxContextTokens: 0,
    notes: "No model provider configured; EGO-Graph uses deterministic planning.",
  },
];

export function getModelCapability(provider: ModelProviderName): ModelCapability {
  return (
    modelCapabilities.find((capability) => capability.provider === provider) ??
    modelCapabilities.find((capability) => capability.provider === "disabled")!
  );
}
