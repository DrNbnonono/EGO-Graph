export type CommandManifest = {
  name: string;
  description: string;
  category: "help" | "model" | "agent" | "security" | "memory" | "manage" | "session";
  mode?: "chat" | "plan" | "patch" | "security" | "manage";
  uiAction?: string;
  targetAgent?: "assistant" | "planner" | "patch" | "security";
  requiresApproval: boolean;
  arguments?: string;
};

export type CommandExecutionResult = {
  command: string;
  description: string;
  uiAction?: string;
  mode?: CommandManifest["mode"];
  requiresApproval: boolean;
  message: string;
};

const BUILTIN_COMMANDS: CommandManifest[] = [
  {
    name: "/help",
    description: "显示可用命令和当前 Agent 能力",
    category: "help",
    uiAction: "show-help",
    requiresApproval: false,
  },
  {
    name: "/model",
    description: "打开模型选择器",
    category: "model",
    mode: "manage",
    uiAction: "open-models",
    requiresApproval: false,
  },
  {
    name: "/models",
    description: "管理模型 profile",
    category: "model",
    mode: "manage",
    uiAction: "open-models",
    requiresApproval: false,
  },
  {
    name: "/plan",
    description: "进入计划审批模式",
    category: "agent",
    mode: "plan",
    targetAgent: "planner",
    requiresApproval: false,
  },
  {
    name: "/patch",
    description: "基于已批准计划生成可审批 Patch",
    category: "agent",
    mode: "patch",
    targetAgent: "patch",
    requiresApproval: true,
  },
  {
    name: "/scan",
    description: "创建受控安全扫描任务",
    category: "security",
    mode: "security",
    targetAgent: "security",
    requiresApproval: true,
  },
  {
    name: "/memory",
    description: "查看记忆命中与长期项目记忆",
    category: "memory",
    mode: "manage",
    uiAction: "open-memory",
    requiresApproval: false,
  },
  {
    name: "/skills",
    description: "查看和管理 skills",
    category: "manage",
    mode: "manage",
    uiAction: "open-skills",
    requiresApproval: false,
  },
  {
    name: "/mcp",
    description: "查看和测试 MCP server",
    category: "manage",
    mode: "manage",
    uiAction: "open-mcp",
    requiresApproval: false,
  },
  {
    name: "/prompt",
    description: "编辑项目 System Prompt",
    category: "manage",
    mode: "manage",
    uiAction: "open-prompt",
    requiresApproval: false,
  },
  {
    name: "/compact",
    description: "压缩当前上下文摘要",
    category: "agent",
    mode: "chat",
    uiAction: "run-compact",
    requiresApproval: false,
  },
  {
    name: "/status",
    description: "显示运行指标、模型、审批与内核状态",
    category: "session",
    mode: "chat",
    uiAction: "show-status",
    requiresApproval: false,
  },
  {
    name: "/clear",
    description: "清空当前前端会话视图",
    category: "session",
    mode: "chat",
    uiAction: "clear-thread",
    requiresApproval: false,
  },
];

export function getBuiltinCommands(): CommandManifest[] {
  return BUILTIN_COMMANDS.map((command) => ({ ...command }));
}

export function executeBuiltinCommand(commandName: string): CommandExecutionResult | undefined {
  const command = BUILTIN_COMMANDS.find((candidate) => candidate.name === commandName.trim());
  if (!command) {
    return undefined;
  }

  return {
    command: command.name,
    description: command.description,
    ...(command.uiAction ? { uiAction: command.uiAction } : {}),
    ...(command.mode ? { mode: command.mode } : {}),
    requiresApproval: command.requiresApproval,
    message: command.requiresApproval
      ? `${command.name} 需要进入计划或审批流程。`
      : `${command.name} 已就绪。`,
  };
}
