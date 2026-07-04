import { createChatModelProvider, loadModelConfig, type ChatModelProvider } from "@ego-graph/llm";
import { loadMcpConfig, type McpManifest } from "@ego-graph/mcp";
import { createWorkspaceService, type ProjectSummary } from "@ego-graph/workspace";

export type AssistantChatStatus = "answered" | "needs_model" | "failed";

export type AssistantChatInput = {
  message: string;
  workspaceRoot: string;
  modelProvider?: ChatModelProvider | null;
};

export type AssistantChatTurn = {
  mode: "assistant-chat";
  status: AssistantChatStatus;
  reply: string;
  assistantMessage: string;
  model: {
    provider: string;
    name: string;
    configured: boolean;
  };
  observations: string[];
  suggestedCommands: string[];
  mcp: McpManifest;
  trace: {
    workspace: ProjectSummary;
    inspectedFiles: string[];
  };
};

export async function runAssistantChatTurn(input: AssistantChatInput): Promise<AssistantChatTurn> {
  const workspace = createWorkspaceService(input.workspaceRoot);
  const [summary, files, mcpConfig] = await Promise.all([
    workspace.summarizeProject(),
    workspace.listFiles({ limit: 80, maxDepth: 3 }),
    loadMcpConfig(input.workspaceRoot),
  ]);
  const provider = resolveModelProvider(input);
  const suggestedCommands = workspace.suggestCommands(input.message);
  const observations = buildChatObservations(summary, files);

  if (!provider) {
    const reply = [
      "模型尚未启用，所以这一回合保持只读提示，不伪装成真实模型回复。",
      "请在右侧“模型设置”选择 MiniMax、DeepSeek 或 OpenAI-compatible，填写 Base URL、模型名和 API Key 后保存；也可以用 `ego config model` 写入 `.ego/config.json`。",
      "需要改代码时请切换到“生成 Patch”模式，那里会生成 diff 并等待审批。",
    ].join("\n\n");

    return {
      mode: "assistant-chat",
      status: "needs_model",
      reply,
      assistantMessage: reply,
      model: {
        provider: "disabled",
        name: "deterministic",
        configured: false,
      },
      observations,
      suggestedCommands,
      mcp: mcpConfig.manifest,
      trace: { workspace: summary, inspectedFiles: files },
    };
  }

  try {
    const reply = await provider.complete({
      temperature: 0.2,
      maxTokens: 1600,
      messages: [
        {
          role: "system",
          content: [
            "You are Lotus, the read-only assistant inside EGO-Graph.",
            "Answer in Chinese unless the user asks otherwise.",
            "Be concise, practical, and grounded in the local workspace context.",
            "Do not claim files were modified. Direct code changes must use the Patch approval flow.",
            "For cybersecurity actions, remind the user that active operations must stay inside authorized scope.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `User message:\n${input.message}`,
            "",
            "Workspace summary:",
            `apps=${summary.apps.join(", ") || "(none)"}`,
            `packages=${summary.packages.join(", ") || "(none)"}`,
            `readme=${summary.hasReadme ? "present" : "missing"}`,
            `importantFiles=${summary.importantFiles.join(", ") || "(none)"}`,
            "",
            "Visible files:",
            files.slice(0, 60).join("\n") || "(none)",
          ].join("\n"),
        },
      ],
    });

    return {
      mode: "assistant-chat",
      status: "answered",
      reply,
      assistantMessage: reply,
      model: {
        provider: provider.name,
        name: provider.model,
        configured: true,
      },
      observations,
      suggestedCommands,
      mcp: mcpConfig.manifest,
      trace: { workspace: summary, inspectedFiles: files },
    };
  } catch (error) {
    const reply = `模型调用失败：${error instanceof Error ? error.message : String(error)}`;
    return {
      mode: "assistant-chat",
      status: "failed",
      reply,
      assistantMessage: reply,
      model: {
        provider: provider.name,
        name: provider.model,
        configured: true,
      },
      observations,
      suggestedCommands,
      mcp: mcpConfig.manifest,
      trace: { workspace: summary, inspectedFiles: files },
    };
  }
}

function resolveModelProvider(input: AssistantChatInput): ChatModelProvider | undefined {
  if (input.modelProvider === null) {
    return undefined;
  }
  if (input.modelProvider) {
    return input.modelProvider;
  }

  try {
    return createChatModelProvider(loadModelConfig({ workspaceRoot: input.workspaceRoot }));
  } catch {
    return undefined;
  }
}

function buildChatObservations(summary: ProjectSummary, files: string[]): string[] {
  return [
    `当前工作区包含 ${summary.apps.length} 个 apps 和 ${summary.packages.length} 个 packages。`,
    `README.md：${summary.hasReadme ? "存在" : "缺失"}`,
    `关键文件：${summary.importantFiles.slice(0, 6).join(", ") || "未发现"}`,
    `文件样本：${files.slice(0, 8).join(", ") || "未发现"}`,
  ];
}
