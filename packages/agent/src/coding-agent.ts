import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTrajectoryEvent, type TrajectoryEvent } from "@ego-graph/core";
import { createChatModelProvider, loadModelConfig, type ChatModelProvider } from "@ego-graph/llm";
import { loadMcpConfig, type McpManifest } from "@ego-graph/mcp";
import {
  createWorkspaceService,
  createWorkspaceWriteService,
  type ProjectSummary,
  type WorkspaceEditPlan,
  type WorkspaceEditPreview,
  type WorkspaceEditResult,
} from "@ego-graph/workspace";
import {
  generateWorkspaceEditPlan,
  type GenerateWorkspaceEditPlanResult,
} from "./edit-plan-generator.js";

const execFileAsync = promisify(execFile);

export type CodingAgentTurnMode = "inspect" | "propose_edits" | "apply_approved_edits";

export type CodingAgentRunStatus =
  "inspect" | "pending_approval" | "needs_model" | "blocked" | "applied";

export type AgentCheckCommand = {
  name: string;
  command: string;
  args?: string[];
};

export type AgentCheckResult = {
  name: string;
  command: string;
  status: "passed" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CodingAgentTurnInput = {
  message: string;
  workspaceRoot: string;
  mode?: CodingAgentTurnMode;
  runId?: string;
  approvalId?: string;
  editPlan?: WorkspaceEditPlan;
  autoPropose?: boolean;
  modelProvider?: ChatModelProvider | null;
  checkCommands?: AgentCheckCommand[];
  memoryHints?: string[];
};

export type CodingAgentTurn = {
  mode: "coding-agent";
  executionMode: CodingAgentTurnMode;
  status: CodingAgentRunStatus;
  assistantMessage: string;
  plan: string[];
  observations: string[];
  suggestedCommands: string[];
  mcp: McpManifest;
  editPlan?: WorkspaceEditPlan;
  editGeneration?: GenerateWorkspaceEditPlanResult;
  editPreview?: WorkspaceEditPreview;
  editResult?: WorkspaceEditResult;
  diff?: string;
  approvalRequired: boolean;
  checks: AgentCheckResult[];
  trajectoryEvents: TrajectoryEvent[];
  trace: {
    workspace: ProjectSummary;
    inspectedFiles: string[];
  };
};

export async function runCodingAgentTurn(input: CodingAgentTurnInput): Promise<CodingAgentTurn> {
  const executionMode = input.mode ?? "inspect";
  const runId = input.runId ?? `agent-turn-${Date.now()}`;
  const workspace = createWorkspaceService(input.workspaceRoot);
  const writeService = createWorkspaceWriteService(input.workspaceRoot);
  const summary = await workspace.summarizeProject();
  const inspectedFiles = await workspace.listFiles({ limit: 80, maxDepth: 3 });
  const mcp = (await loadMcpConfig(input.workspaceRoot)).manifest;
  const suggestedCommands = workspace.suggestCommands(input.message);
  const observations = buildObservations(summary, inspectedFiles);
  if (input.memoryHints?.length) {
    observations.push(`Memory hints: ${input.memoryHints.slice(0, 5).join(" | ")}`);
  }
  const plan = buildPlan(input.message, summary);
  const trajectoryEvents: TrajectoryEvent[] = [];
  const checks: AgentCheckResult[] = [];
  let status: CodingAgentRunStatus = "inspect";
  let editPlan: WorkspaceEditPlan | undefined = input.editPlan;
  let editGeneration: GenerateWorkspaceEditPlanResult | undefined;
  let editPreview: WorkspaceEditPreview | undefined;
  let editResult: WorkspaceEditResult | undefined;
  let diff: string | undefined;
  let approvalRequired = false;

  const appendEvent = (type: TrajectoryEvent["type"], message: string, data = {}) => {
    trajectoryEvents.push(createTrajectoryEvent(runId, type, message, data));
  };

  if (executionMode === "propose_edits") {
    if (!editPlan && input.autoPropose) {
      const provider = resolveModelProvider(input);
      editGeneration = await generateWorkspaceEditPlan({
        message: input.message,
        workspaceRoot: input.workspaceRoot,
        ...(provider !== undefined ? { provider } : {}),
      });

      if (editGeneration.status === "proposed") {
        editPlan = editGeneration.editPlan;
        plan.push(`模型已生成候选 Patch：${editGeneration.rationale}`);
      } else if (editGeneration.status === "needs_model") {
        status = "needs_model";
        plan.push(editGeneration.message);
        appendEvent("model.failed", "Model provider is required for auto proposal", {
          reason: editGeneration.message,
        });
      } else {
        status = "blocked";
        plan.push(editGeneration.message);
        appendEvent("agent.edit.blocked", "Model could not generate an edit plan", {
          error: editGeneration.message,
        });
      }
    }

    if (editPlan && status !== "blocked" && status !== "needs_model") {
      try {
        editPreview = await writeService.proposeWorkspaceEdit(editPlan);
        diff = editPreview.diff;
        approvalRequired = true;
        status = "pending_approval";
        appendEvent("agent.edit.proposed", "Agent edit proposed", {
          previewId: editPreview.id,
          files: editPreview.files,
        });
      } catch (error) {
        status = "blocked";
        approvalRequired = false;
        appendEvent("agent.edit.blocked", "Agent edit blocked by policy", {
          error: error instanceof Error ? error.message : String(error),
        });
        plan.push(
          `Patch 被工作区策略拒绝：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (!editPlan && !input.autoPropose) {
      plan.push("未提供结构化 editPlan，当前保持只读模式，不生成写入。");
    }
  }

  if (executionMode === "apply_approved_edits") {
    if (!input.editPlan) {
      appendEvent("agent.edit.blocked", "No edit plan supplied for approved apply mode");
      throw new Error("apply_approved_edits requires editPlan");
    }

    editPlan = input.editPlan;
    editPreview = await writeService.proposeWorkspaceEdit(input.editPlan);
    diff = editPreview.diff;
    approvalRequired = false;
    appendEvent("agent.edit.proposed", "Agent edit proposed", {
      previewId: editPreview.id,
      files: editPreview.files,
    });
    appendEvent("agent.edit.approved", "Agent edit approved", {
      approvalId: input.approvalId ?? "inline-approval",
    });
    editResult = await writeService.applyWorkspaceEdit(editPreview, {
      approved: true,
      approvalId: input.approvalId ?? "inline-approval",
    });
    status = "applied";
    appendEvent("agent.edit.applied", "Agent edit applied", {
      previewId: editPreview.id,
      files: editResult.files,
    });

    for (const command of input.checkCommands ?? defaultCheckCommands()) {
      appendEvent("agent.check.started", `Started ${command.name}`, { command });
      const result = await runCheck(input.workspaceRoot, command);
      checks.push(result);
      appendEvent("agent.check.completed", `Completed ${command.name}`, {
        status: result.status,
        exitCode: result.exitCode,
      });
    }
  }

  return {
    mode: "coding-agent",
    executionMode,
    status,
    assistantMessage: buildAssistantMessage(summary, executionMode, status),
    plan,
    observations,
    suggestedCommands,
    mcp,
    ...(editPlan ? { editPlan } : {}),
    ...(editGeneration ? { editGeneration } : {}),
    ...(editPreview ? { editPreview } : {}),
    ...(editResult ? { editResult } : {}),
    ...(diff ? { diff } : {}),
    approvalRequired,
    checks,
    trajectoryEvents,
    trace: {
      workspace: summary,
      inspectedFiles,
    },
  };
}

function resolveModelProvider(input: CodingAgentTurnInput): ChatModelProvider | null | undefined {
  if (input.modelProvider !== undefined) {
    return input.modelProvider;
  }

  try {
    return createChatModelProvider(loadModelConfig({ workspaceRoot: input.workspaceRoot }));
  } catch {
    return undefined;
  }
}

function buildAssistantMessage(
  summary: ProjectSummary,
  executionMode: CodingAgentTurnMode,
  status: CodingAgentRunStatus,
): string {
  const lines = [
    "我已经以 coding agent 模式读取当前项目状态。",
    `当前项目包含 ${summary.apps.length} 个应用包、${summary.packages.length} 个共享包，README.md 状态为 ${
      summary.hasReadme ? "已存在" : "缺失"
    }。`,
  ];

  if (status === "needs_model") {
    lines.push("模型未配置，当前回合已降级为只读模式，没有生成 diff，也没有写入文件。");
  } else if (status === "blocked") {
    lines.push("候选 Patch 已被阻断，请查看计划与审计事件中的原因。");
  } else if (status === "pending_approval") {
    lines.push("已生成候选 diff，等待 Web 审批后才会落盘并运行检查。");
  } else if (status === "applied") {
    lines.push("审批通过后已应用修改，并完成本轮检查。");
  } else if (executionMode === "inspect") {
    lines.push("这一回合保持只读：给出可执行计划、可验证命令和 MCP 能力边界。");
  } else {
    lines.push("这一回合保持受控写入流程，未审批前不会落盘。");
  }

  return lines.join("\n");
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

function defaultCheckCommands(): AgentCheckCommand[] {
  return [{ name: "typecheck", command: "pnpm", args: ["typecheck"] }];
}

async function runCheck(
  workspaceRoot: string,
  command: AgentCheckCommand,
): Promise<AgentCheckResult> {
  const rendered = [command.command, ...(command.args ?? [])].join(" ");
  try {
    const result = await execFileAsync(command.command, command.args ?? [], {
      cwd: workspaceRoot,
      maxBuffer: 2_000_000,
      shell: process.platform === "win32",
    });
    return {
      name: command.name,
      command: rendered,
      status: "passed",
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const failed = error as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      code?: number;
    };
    return {
      name: command.name,
      command: rendered,
      status: "failed",
      exitCode: failed.exitCode ?? failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? String(error),
    };
  }
}
