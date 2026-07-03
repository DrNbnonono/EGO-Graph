import type { ModelProviderName } from "./config.js";

export type ModelCapability = {
  provider: ModelProviderName;
  openAICompatible: boolean;
  anthropicCompatible: boolean;
  jsonMode: boolean;
  notes: string;
};

export const modelCapabilities: ModelCapability[] = [
  {
    provider: "openai-compatible",
    openAICompatible: true,
    anthropicCompatible: false,
    jsonMode: true,
    notes: "Generic OpenAI-compatible gateway, including common API relay services.",
  },
  {
    provider: "deepseek",
    openAICompatible: true,
    anthropicCompatible: false,
    jsonMode: true,
    notes: "DeepSeek profile using the OpenAI-compatible chat completions surface.",
  },
  {
    provider: "minimax",
    openAICompatible: false,
    anthropicCompatible: true,
    jsonMode: true,
    notes: "MiniMax-M3 profile using the domestic Anthropic Messages endpoint by default.",
  },
  {
    provider: "disabled",
    openAICompatible: false,
    anthropicCompatible: false,
    jsonMode: false,
    notes: "No model provider configured; EGO-Graph uses deterministic planning.",
  },
];
