import { createMcpManifest, type McpManifest } from "@ego-graph/mcp";
import { createWorkspaceService, type ProjectSummary } from "@ego-graph/workspace";

export type CodingAgentTurnInput = {
  message: string;
  workspaceRoot: string;
};

export type CodingAgentTurn = {
  mode: "coding-agent";
  assistantMessage: string;
  plan: string[];
  observations: string[];
  suggestedCommands: string[];
  mcp: McpManifest;
  trace: {
    workspace: ProjectSummary;
    inspectedFiles: string[];
  };
};

export async function runCodingAgentTurn(input: CodingAgentTurnInput): Promise<CodingAgentTurn> {
  const workspace = createWorkspaceService(input.workspaceRoot);
  const summary = await workspace.summarizeProject();
  const inspectedFiles = await workspace.listFiles({ limit: 80, maxDepth: 3 });
  const mcp = createMcpManifest();
  const suggestedCommands = workspace.suggestCommands(input.message);
  const observations = buildObservations(summary, inspectedFiles);
  const plan = buildPlan(input.message, summary);

  return {
    mode: "coding-agent",
    assistantMessage: [
      "我已经以 coding agent 模式读取当前项目状态。",
      `当前项目包含 ${summary.apps.length} 个应用包、${summary.packages.length} 个共享包，README.md 状态为 ${summary.hasReadme ? "已存在" : "缺失"}。`,
      "这一回合先给出可执行计划、可验证命令和 MCP 能力边界；涉及真实文件改写时仍需要进入后续实现步骤。",
    ].join("\n"),
    plan,
    observations,
    suggestedCommands,
    mcp,
    trace: {
      workspace: summary,
      inspectedFiles,
    },
  };
}

function buildObservations(summary: ProjectSummary, inspectedFiles: string[]): string[] {
  return [
    `README.md：${summary.hasReadme ? "已建立项目交付说明" : "尚未建立根说明文档"}`,
    `应用目录：${summary.apps.length > 0 ? summary.apps.join(", ") : "未发现 apps 子项目"}`,
    `包目录：${summary.packages.length > 0 ? summary.packages.join(", ") : "未发现 packages 子项目"}`,
    `关键文件：${summary.importantFiles.length > 0 ? summary.importantFiles.join(", ") : "未发现"}`,
    `已扫描文件样本：${inspectedFiles.slice(0, 8).join(", ")}`,
  ];
}

function buildPlan(message: string, summary: ProjectSummary): string[] {
  const plan = [
    "确认自然语言任务目标、授权边界和交付物格式。",
    "读取相关 README、docs、apps 与 packages 文件，形成最小修改方案。",
    "按 Coding Agent 流程执行代码修改、命令运行或受控安全场景调用。",
    "运行 typecheck/test/format 检查，并把结果写回 Web/TUI 状态面板。",
  ];

  if (!summary.hasReadme) {
    plan.unshift("补齐根 README，说明项目定位、启动方式和评分要求映射。");
  }

  if (message.includes("CTF") || message.includes("ctf") || message.includes("安全")) {
    plan.splice(2, 0, "加载安全场景 Overlay 与工具权限策略，确保只在授权靶场内执行。");
  }

  return plan;
}
