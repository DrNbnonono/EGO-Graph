import type {ModelProviderName} from "./config.js";

export type ModelCapability = {
  provider: ModelProviderName;
  openAICompatible: boolean;
  jsonMode: boolean;
  notes: string;
};

export const modelCapabilities: ModelCapability[] = [
  {
    provider: "openai-compatible",
    openAICompatible: true,
    jsonMode: true,
    notes: "Generic OpenAI-compatible gateway, including common API relay services.",
  },
  {
    provider: "deepseek",
    openAICompatible: true,
    jsonMode: true,
    notes: "DeepSeek profile using the OpenAI-compatible chat completions surface.",
  },
  {
    provider: "minimax",
    openAICompatible: true,
    jsonMode: true,
    notes: "MiniMax-compatible profile for gateways that expose chat completions.",
  },
  {
    provider: "disabled",
    openAICompatible: false,
    jsonMode: false,
    notes: "No model provider configured; EGO-Graph uses deterministic planning.",
  },
];
