import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import { isModelConfigured, listModelProfiles, loadModelConfigWithSource } from "@ego-graph/llm";
import { loadMcpConfig } from "@ego-graph/mcp";
import { createBuiltinSkillRegistry } from "@ego-graph/tools";
import {
  defaultEgoHome,
  sqlitePath,
  SqliteEgoStore,
  trajectoryDir,
  type RunIndexRecord,
} from "@ego-graph/storage";
import { createWorkspaceService } from "@ego-graph/workspace";
import { getBuiltinCommands, type CommandManifest } from "./commands.js";
import {
  createRuntimeMetricsSampler,
  type RuntimeMetrics,
  type RuntimeMetricsSampler,
} from "./runtime-metrics.js";

export { executeBuiltinCommand, getBuiltinCommands } from "./commands.js";
export { createRuntimeMetricsSampler } from "./runtime-metrics.js";
export type { CommandExecutionResult, CommandManifest } from "./commands.js";
export type { RuntimeMetrics, RuntimeMetricsSampler } from "./runtime-metrics.js";

export type WorkbenchSession = {
  id: string;
  title: string;
  timeLabel: string;
  active: boolean;
};

export type WorkbenchTool = {
  name: string;
  command: string;
  status: "ready" | "planned" | "offline";
};

export type WorkbenchFile = {
  path: string;
  label: string;
  sizeLabel: string;
  status: "ready" | "draft" | "missing";
};

export type WorkbenchLog = {
  time: string;
  message: string;
};

export type WorkbenchApprovalItem = {
  label: string;
  count: number;
};

export type WorkbenchPendingEdit = {
  runId: string;
  previewId: string;
  files: string[];
  createdAt: string;
};

export type WorkbenchCheck = {
  runId: string;
  name: string;
  command: string;
  status: "passed" | "failed";
  exitCode: number;
};

export type WorkbenchMemoryItem = {
  id: string;
  scope: string;
  content: string;
  updatedAt: string;
};

export type WorkbenchPlanItem = {
  planId: string;
  mode: string;
  status: string;
  message: string;
  updatedAt: string;
};

export type WorkbenchHermesEvent = {
  id: string;
  type: string;
  sessionId: string;
  runId?: string;
  createdAt: string;
  source: string;
};

export type WorkbenchSkill = {
  name: string;
  version: string;
  capabilities: string[];
  status: "ready" | "planned" | "offline";
  enabled: boolean;
  source: "built-in" | "plugin";
  permissions: string[];
  toolCount: number;
};

export type WorkbenchState = {
  product: "EGO-Graph";
  title: string;
  version: string;
  cwd: string;
  mode: string;
  network: "connected" | "local-only";
  clock: string;
  serverTime: string;
  cpuLabel: string;
  memoryLabel: string;
  runtime: {
    metrics: RuntimeMetrics;
  };
  model: {
    provider: string;
    name: string;
    baseUrl?: string;
    chatPath: string;
    wireApi: string;
    configured: boolean;
    apiKeyConfigured: boolean;
    label: string;
    source: string;
    sourcePath?: string;
    activeProfileId?: string;
    profiles: Array<{
      id: string;
      name: string;
      provider?: string;
      model?: string;
      apiKeyConfigured: boolean;
    }>;
    testStatus?: "idle" | "connected" | "failed" | "needs_model";
  };
  storage: {
    egoHome: string;
    sqlite: string;
    trajectories: string;
  };
  context: {
    target: string;
    type: string;
    scope: string;
    priority: string;
    createdAt: string;
  };
  sessions: WorkbenchSession[];
  tools: WorkbenchTool[];
  files: WorkbenchFile[];
  logs: WorkbenchLog[];
  approvals: WorkbenchApprovalItem[];
  pendingEdits: WorkbenchPendingEdit[];
  pendingApprovalDetail?: WorkbenchPendingEdit;
  changedFiles: string[];
  lastChecks: WorkbenchCheck[];
  quickCommands: string[];
  commands: string[];
  commandsRegistry: CommandManifest[];
  recentRuns: RunIndexRecord[];
  mcp: {
    status: string;
    source: string;
    transport: "stdio" | "http" | "mixed" | "none";
    capabilities: string[];
    servers: unknown[];
    notes: string[];
  };
  memory: {
    total: number;
    recent: WorkbenchMemoryItem[];
  };
  plans: {
    draftCount: number;
    recent: WorkbenchPlanItem[];
  };
  hermes: {
    recentEvents: WorkbenchHermesEvent[];
  };
  skills: WorkbenchSkill[];
  search: {
    status: "ready" | "offline";
    tool: string;
    cached: boolean;
  };
  prompt: {
    summary: string;
    path: string;
  };
  progress: {
    completed: string[];
    active: string[];
    next: string[];
  };
};

export type ReadWorkbenchStateInput = {
  workspaceRoot: string;
  egoHome?: string;
  metricsSampler?: RuntimeMetricsSampler;
};

const defaultMetricsSampler = createRuntimeMetricsSampler();

export async function readWorkbenchState(input: ReadWorkbenchStateInput): Promise<WorkbenchState> {
  const workspaceRoot = input.workspaceRoot;
  const egoHome = input.egoHome ?? defaultEgoHome();
  const workspace = createWorkspaceService(workspaceRoot);
  const [summary, files, mcpConfig, modelProfiles] = await Promise.all([
    workspace.summarizeProject(),
    workspace.listFiles({ limit: 80, maxDepth: 3 }),
    loadMcpConfig(workspaceRoot),
    listModelProfiles({ workspaceRoot }),
  ]);
  const loadedModelConfig = loadModelConfigWithSource({ workspaceRoot });
  const modelConfig = loadedModelConfig.config;
  const configured = isModelConfigured(modelConfig);
  const mcp = mcpConfig.manifest;
  const sqlite = sqlitePath(egoHome);
  mkdirSync(egoHome, { recursive: true });
  const store = new SqliteEgoStore(sqlite);
  const metrics = (input.metricsSampler ?? defaultMetricsSampler).sample();

  try {
    const recentRuns = (await store.listRuns()).slice(0, 8);
    const pendingEdits = (await store.listPendingAgentEdits()).slice(0, 8);
    const pendingApprovals = await store.listApprovals("pending");
    const recentChecks = await store.listRecentAgentChecks(8);
    const memories = await store.listMemories({ limit: 8 });
    const agentPlans = await store.listAgentPlans({ limit: 8 });
    const hermesEvents = await store.listHermesEvents({ limit: 8 });
    const skills = createBuiltinSkillRegistry().listSkills();
    const newestRun = recentRuns[0];
    const clock = new Date();
    const commandsRegistry = getBuiltinCommands();

    return {
      product: "EGO-Graph",
      title: "紫莲花 EGO-Graph Agent Workbench",
      version: "v0.1.0",
      cwd: compactPath(workspaceRoot),
      mode: "智能安全 Agent",
      network: configured ? "connected" : "local-only",
      clock: clock.toLocaleTimeString("zh-CN", { hour12: false }),
      serverTime: clock.toISOString(),
      cpuLabel: metrics.cpuPercent === null ? "EGO CPU sampling" : `EGO CPU ${metrics.cpuPercent}%`,
      memoryLabel: `RSS ${metrics.memoryRssMb} MB / 系统内存 ${metrics.systemMemoryPercent}%`,
      runtime: {
        metrics,
      },
      model: {
        provider: modelConfig.provider,
        name: modelConfig.model ?? "deterministic",
        ...(modelConfig.baseUrl ? { baseUrl: modelConfig.baseUrl } : {}),
        chatPath: modelConfig.chatPath,
        wireApi: modelConfig.wireApi,
        configured,
        apiKeyConfigured: Boolean(modelConfig.apiKey),
        label: configured ? (modelConfig.model ?? modelConfig.provider) : "deterministic fallback",
        source: loadedModelConfig.source,
        ...(loadedModelConfig.path ? { sourcePath: loadedModelConfig.path } : {}),
        ...(modelProfiles.activeProfileId
          ? { activeProfileId: modelProfiles.activeProfileId }
          : {}),
        profiles: modelProfiles.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          ...(profile.config.provider ? { provider: profile.config.provider } : {}),
          ...(profile.config.model ? { model: profile.config.model } : {}),
          apiKeyConfigured: profile.apiKeyConfigured,
        })),
      },
      storage: {
        egoHome,
        sqlite,
        trajectories: trajectoryDir(egoHome),
      },
      context: {
        target: newestRun?.runId ?? "local-workspace",
        type: newestRun?.scenario ?? "Agent Workbench",
        scope: "对话、计划、Patch、MCP、Skills",
        priority: newestRun?.status === "blocked" ? "需要人工确认" : "中",
        createdAt: newestRun?.updatedAt ?? clock.toISOString(),
      },
      sessions: buildSessions(recentRuns),
      tools: buildTools(configured),
      files: buildFiles(files),
      logs: buildLogs(recentRuns),
      approvals: buildApprovals(recentRuns, pendingApprovals.length, pendingEdits.length),
      pendingEdits: pendingEdits.map((edit) => ({
        runId: edit.runId,
        previewId: edit.previewId,
        files: edit.files,
        createdAt: edit.createdAt,
      })),
      ...(pendingEdits[0]
        ? {
            pendingApprovalDetail: {
              runId: pendingEdits[0].runId,
              previewId: pendingEdits[0].previewId,
              files: pendingEdits[0].files,
              createdAt: pendingEdits[0].createdAt,
            },
          }
        : {}),
      changedFiles: [...new Set(pendingEdits.flatMap((edit) => edit.files))],
      lastChecks: recentChecks.map((check) => ({
        runId: check.runId,
        name: check.name,
        command: check.command,
        status: check.status,
        exitCode: check.exitCode,
      })),
      quickCommands: commandsRegistry.map((command) => command.name),
      commands: [
        "ego",
        "ego serve",
        "ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json",
        "ego replay --trajectory-id <run-id>",
        "ego eval --dataset datasets/evals/web_pentest.jsonl",
        "ego config model --provider minimax --model MiniMax-M3",
        "ego doctor",
      ],
      commandsRegistry,
      recentRuns,
      mcp: {
        status: mcp.status,
        source: mcpConfig.source,
        transport: summarizeMcpTransport(mcpConfig.servers),
        capabilities: mcp.capabilities,
        servers: mcp.servers,
        notes: mcp.notes,
      },
      memory: {
        total: memories.length,
        recent: memories.map((memory) => ({
          id: memory.id,
          scope: memory.scope,
          content: memory.content,
          updatedAt: memory.updatedAt,
        })),
      },
      plans: {
        draftCount: agentPlans.filter((plan) => plan.status === "draft").length,
        recent: agentPlans.map((plan) => ({
          planId: plan.planId,
          mode: plan.mode,
          status: plan.status,
          message: plan.message,
          updatedAt: plan.updatedAt,
        })),
      },
      hermes: {
        recentEvents: hermesEvents.map((event) => ({
          id: event.id,
          type: event.type,
          sessionId: event.sessionId,
          ...(event.runId ? { runId: event.runId } : {}),
          createdAt: event.createdAt,
          source: event.source,
        })),
      },
      skills: skills.map((skill) => ({
        name: skill.name,
        version: skill.version,
        capabilities: skill.capabilities,
        status: skill.name === "workspace" || skill.name === "web-search" ? "ready" : "planned",
        enabled: true,
        source: "built-in",
        permissions: skill.capabilities,
        toolCount: skill.tools.length,
      })),
      search: {
        status: "ready",
        tool: "web.search",
        cached: false,
      },
      prompt: {
        summary: "System Prompt: default kernel policy plus optional .ego/system-prompt.md.",
        path: ".ego/system-prompt.md",
      },
      progress: {
        completed: [
          "TypeScript monorepo 与 ego 命令",
          "Agent Runtime 自主决策循环",
          "JSONL + SQLite 审计存储",
          "LLM provider 与 deterministic fallback",
          "Hermes / Memory / Plan Kernel v1",
        ],
        active: [
          `${summary.apps.length} apps / ${summary.packages.length} packages`,
          "Codex-like Agent Workbench",
          "模型、Prompt、Skills、MCP 管理",
        ],
        next: [
          pendingEdits.length > 0 ? "审批待处理的 Agent patch" : "补齐真实编辑工具链",
          mcpConfig.source === "none" ? "配置 MCP stdio server" : "测试 MCP server tools/list",
          "扩展 CTF 场景自动化 runner",
        ],
      },
    };
  } finally {
    store.close();
  }
}

function summarizeMcpTransport(
  servers: Array<{ enabled: boolean; transport: "stdio" | "http" }>,
): "stdio" | "http" | "mixed" | "none" {
  const transports = new Set(
    servers.filter((server) => server.enabled).map((server) => server.transport),
  );
  if (transports.size === 0) {
    return "none";
  }
  if (transports.size > 1) {
    return "mixed";
  }
  return transports.has("http") ? "http" : "stdio";
}

function buildSessions(runs: RunIndexRecord[]): WorkbenchSession[] {
  const recent = runs.slice(0, 3).map((run, index) => ({
    id: run.runId,
    title: run.scenario === "web_pentest" ? "Web 漏洞排查" : run.scenario,
    timeLabel: relativeTime(run.updatedAt),
    active: index === 0,
  }));

  return [
    { id: "new", title: "新会话", timeLabel: "刚刚", active: recent.length === 0 },
    ...recent,
  ];
}

function buildTools(modelConfigured: boolean): WorkbenchTool[] {
  return [
    { name: "Workspace", command: "workspace.read", status: "ready" },
    { name: "Shell Readonly", command: "shell.readonly", status: "ready" },
    { name: "Web Search", command: "web.search", status: modelConfigured ? "ready" : "planned" },
    { name: "CTF Basic", command: "ctf.basic", status: "planned" },
    { name: "MCP Bridge", command: "tools/list", status: "planned" },
  ];
}

function buildFiles(files: string[]): WorkbenchFile[] {
  const preferred = files.filter((file) =>
    /README|docs\/|package\.json|task\.json|report|trajectory|scenario/.test(file),
  );
  const selected = (preferred.length > 0 ? preferred : files).slice(0, 6);

  return selected.map((path) => ({
    path,
    label: basename(path),
    sizeLabel: path.endsWith(".md") ? "md" : path.endsWith(".json") ? "json" : "file",
    status: "ready",
  }));
}

function buildLogs(runs: RunIndexRecord[]): WorkbenchLog[] {
  const now = new Date();
  const base = ["Workbench 已加载", "Policy Gate 已就绪", "Hermes timeline 已同步"];
  const runLogs = runs
    .slice(0, 3)
    .map((run) => `${run.runId} · ${run.status} · ${run.eventCount} events`);

  return [...base, ...runLogs].slice(0, 6).map((message, index) => ({
    time: new Date(now.getTime() - (5 - index) * 7000).toLocaleTimeString("zh-CN", {
      hour12: false,
    }),
    message,
  }));
}

function buildApprovals(
  runs: RunIndexRecord[],
  pendingApprovals: number,
  pendingEdits: number,
): WorkbenchApprovalItem[] {
  const blocked = runs.filter((run) => run.status === "blocked").length;

  return [
    { label: "高风险操作需审批", count: blocked + pendingApprovals },
    { label: "待审批 Patch", count: pendingEdits },
    { label: "待执行命令", count: 0 },
    { label: "已执行操作", count: runs.reduce((sum, run) => sum + run.eventCount, 0) },
  ];
}

function compactPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 3 ? `~/${parts.slice(-3).join("/")}` : normalized;
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`;
}
