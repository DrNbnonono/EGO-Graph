import { freemem, loadavg, totalmem } from "node:os";
import { basename } from "node:path";
import { isModelConfigured, loadModelConfig } from "@ego-graph/llm";
import { createMcpManifest } from "@ego-graph/mcp";
import {
  defaultEgoHome,
  sqlitePath,
  SqliteEgoStore,
  trajectoryDir,
  type RunIndexRecord,
} from "@ego-graph/storage";
import { createWorkspaceService } from "@ego-graph/workspace";

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

export type WorkbenchState = {
  product: "EGO-Graph";
  title: string;
  version: string;
  cwd: string;
  mode: string;
  network: "connected" | "local-only";
  clock: string;
  cpuLabel: string;
  memoryLabel: string;
  model: {
    provider: string;
    name: string;
    configured: boolean;
    label: string;
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
  quickCommands: string[];
  commands: string[];
  recentRuns: RunIndexRecord[];
  mcp: {
    status: string;
    capabilities: string[];
    servers: unknown[];
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
};

export async function readWorkbenchState(input: ReadWorkbenchStateInput): Promise<WorkbenchState> {
  const workspaceRoot = input.workspaceRoot;
  const egoHome = input.egoHome ?? defaultEgoHome();
  const workspace = createWorkspaceService(workspaceRoot);
  const [summary, files] = await Promise.all([
    workspace.summarizeProject(),
    workspace.listFiles({ limit: 80, maxDepth: 3 }),
  ]);
  const modelConfig = loadModelConfig();
  const configured = isModelConfigured(modelConfig);
  const mcp = createMcpManifest();
  const sqlite = sqlitePath(egoHome);
  const store = new SqliteEgoStore(sqlite);

  try {
    const recentRuns = (await store.listRuns()).slice(0, 8);
    const newestRun = recentRuns[0];
    const clock = new Date();

    return {
      product: "EGO-Graph",
      title: "紫莲花 Agent Workbench",
      version: "v0.1.0",
      cwd: compactPath(workspaceRoot),
      mode: "智能安全分析",
      network: configured ? "connected" : "local-only",
      clock: clock.toLocaleTimeString("zh-CN", { hour12: false }),
      cpuLabel: `CPU ${Math.max(1, Math.round(loadavg()[0] ?? 1))}%`,
      memoryLabel: `内存 ${Math.round(((totalmem() - freemem()) / totalmem()) * 100)}%`,
      model: {
        provider: modelConfig.provider,
        name: modelConfig.model ?? "deterministic",
        configured,
        label: configured ? (modelConfig.model ?? modelConfig.provider) : "deterministic fallback",
      },
      storage: {
        egoHome,
        sqlite,
        trajectories: trajectoryDir(egoHome),
      },
      context: {
        target: newestRun?.runId ?? "192.168.1.10",
        type: newestRun?.scenario ?? "主机安全评估",
        scope: "全面扫描",
        priority: newestRun?.status === "blocked" ? "需人工确认" : "中",
        createdAt: newestRun?.updatedAt ?? clock.toISOString(),
      },
      sessions: buildSessions(recentRuns),
      tools: buildTools(configured),
      files: buildFiles(files),
      logs: buildLogs(recentRuns),
      approvals: buildApprovals(recentRuns),
      quickCommands: ["/help", "/scan", "/analyze", "/report", "/threat", "/config", "/clear"],
      commands: [
        "ego",
        "ego serve",
        "ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json",
        "ego replay --trajectory-id <run-id>",
        "ego eval --dataset datasets/evals/web_pentest.jsonl",
        "ego doctor",
      ],
      recentRuns,
      mcp: {
        status: mcp.status,
        capabilities: mcp.capabilities,
        servers: mcp.servers,
      },
      progress: {
        completed: [
          "TypeScript monorepo 与 ego 命令",
          "Agent Runtime 自主决策循环",
          "JSONL + SQLite 审计存储",
          "LLM provider 与 deterministic fallback",
          "Runtime Server 与 Web/TUI 入口",
        ],
        active: [
          `${summary.apps.length} apps / ${summary.packages.length} packages`,
          "紫莲花 Workbench 交互层",
          "Evidence Board / Mission Graph 可视化",
        ],
        next: ["真实编辑工具链", "MCP 传输层", "更多安全场景 Overlay"],
      },
    };
  } finally {
    store.close();
  }
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
    { id: "cleared", title: "清除的会话 (3)", timeLabel: "", active: false },
  ];
}

function buildTools(modelConfigured: boolean): WorkbenchTool[] {
  return [
    { name: "端口扫描器", command: "nmap", status: "ready" },
    { name: "漏洞扫描器", command: "nessus", status: "planned" },
    { name: "日志分析器", command: "zeek", status: "ready" },
    { name: "威胁情报", command: "vt / abuseipdb", status: modelConfigured ? "ready" : "planned" },
    { name: "沙箱分析", command: "cuckoo", status: "offline" },
  ];
}

function buildFiles(files: string[]): WorkbenchFile[] {
  const preferred = files.filter((file) =>
    /README|docs\/|package\.json|task\.json|report|trajectory|scenario/.test(file),
  );
  const selected = (preferred.length > 0 ? preferred : files).slice(0, 4);

  return selected.map((path) => ({
    path,
    label: basename(path),
    sizeLabel: path.endsWith(".md") ? "18 KB" : path.endsWith(".json") ? "2.1 KB" : "---",
    status: "ready",
  }));
}

function buildLogs(runs: RunIndexRecord[]): WorkbenchLog[] {
  const now = new Date();
  const base = ["会话已创建", "目标已加载", "Policy Gate 已就绪", "Evidence Board 已同步"];
  const runLogs = runs
    .slice(0, 2)
    .map((run) => `${run.runId} · ${run.status} · ${run.eventCount} events`);

  return [...base, ...runLogs].slice(0, 6).map((message, index) => ({
    time: new Date(now.getTime() - (5 - index) * 7000).toLocaleTimeString("zh-CN", {
      hour12: false,
    }),
    message,
  }));
}

function buildApprovals(runs: RunIndexRecord[]): WorkbenchApprovalItem[] {
  const blocked = runs.filter((run) => run.status === "blocked").length;

  return [
    { label: "高风险操作需审批", count: blocked },
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
    return `${minutes}分钟前`;
  }

  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}小时前` : `${Math.round(hours / 24)}天前`;
}
