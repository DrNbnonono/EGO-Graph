/** @jsxImportSource @opentui/solid */
import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import type { JSX } from "solid-js";
import { displayWidth, truncateDisplay } from "./cjk.js";

export type WelcomeTip = {
  command: string;
  description: string;
};

export type WelcomeModel = {
  title: string;
  logo: string[];
  identityLine: string;
  workspaceLine: string;
  statusRows: string[][];
  tips: WelcomeTip[];
  whatsNew: string[];
  releaseNotes: string;
  demoPrompt: string;
  demoLines: string[];
  readyLine: string;
};

export function createWelcomeModel({
  modelLabel,
  permissionLevel,
  cwd,
  network = "connected",
  memoryLabel = "8KB / 2GB (0%)",
  toolCount = 12,
  startupLabel = "0.8s",
  lastSessionLabel = "none",
}: {
  modelLabel: string;
  permissionLevel: PermissionLevel;
  cwd: string;
  network?: "connected" | "local-only" | string;
  memoryLabel?: string;
  toolCount?: number;
  startupLabel?: string;
  lastSessionLabel?: string;
}): WelcomeModel {
  return {
    title: "EGO-Graph v0.1.0",
    logo: [
      "              ▄██▄",
      "           ▄███████▄",
      "        ▄████████████▄",
      "   ▄██▄ ▐████████████▌ ▄██▄",
      " ▄██████▄▀██████████▀▄██████▄",
      "▐█████████▄▀██████▀▄█████████▌",
      " ▀████████▀ ▐████▌ ▀████████▀",
      "    ▀██▀  ▄████████▄  ▀██▀",
    ],
    identityLine: `${modelLabel} • API Usage Billing • EGO-Graph Organization`,
    workspaceLine: `Workspace: ${cwd}`,
    statusRows: [
      ["▻ 运行模式: agent", `▣ 内存使用: ${memoryLabel}`, "♙ 会话配置: default"],
      [
        permissionLevel === "read-only"
          ? "◇ 活动策略: policy v1.0"
          : `◇ 活动策略: ${permissionLevel}`,
        "□ 证据模式: evidence-grounded",
        `◷ 上次会话: ${lastSessionLabel}`,
      ],
      [`⌘ 工具数量: ${toolCount}`, `◎ 网络状态: ${network}`, `✦ 启动时间: ${startupLabel}`],
    ],
    tips: [
      { command: "/init", description: "初始化工作区" },
      { command: "/scan", description: "启动安全扫描" },
      { command: "/analyze", description: "进行证据分析" },
      { command: "/report", description: "生成清晰报告" },
      { command: "/tools", description: "查看可用工具" },
      { command: "/help", description: "查看更多帮助" },
    ],
    whatsNew: ["策略驱动的工具执行", "证据驱动的推理与结论", "报告生成流程优化"],
    releaseNotes: "/release-notes for more",
    demoPrompt: "你好你的模型是什么？",
    demoLines: [
      "你好！我是 EGO-Graph，一个面向网络安全场景的智能体（Agent）。",
      "我专注于帮助你理解任务目标、分析证据、调度合适的工具并生成清晰可靠的报告。",
      "核心能力：任务理解 · 证据分析 · 工具编排 · 报告生成",
      "如需开始，请尝试 /init 初始化工作区，或 /scan 启动安全扫描。",
      "ⓘ hook output: UserPromptSubmit · completed in 182ms",
    ],
    readyLine: `✓ Runtime ready · ${modelLabel} · tools: ${toolCount} · memory: ${memoryLabel.replace(
      " / 2GB (0%)",
      "",
    )} · network: ${network}`,
  };
}

export function renderWelcomeLines(model: WelcomeModel, width: number, height = 999): string[] {
  const outerWidth = Math.max(60, Math.min(width, 150));
  const innerWidth = outerWidth - 4;
  const panelLines =
    outerWidth >= 118 ? renderWidePanel(model, outerWidth) : renderNarrowPanel(model, outerWidth);
  const contentLines = [
    ...panelLines,
    "",
    promptBar(model.demoPrompt, outerWidth),
    "",
    ...model.demoLines.map((line) => fit(`  ${line}`, outerWidth)),
    rule(Math.min(92, innerWidth)),
    fit(`  ${model.readyLine}`, outerWidth),
    rule(outerWidth - 2),
  ];
  const limit = Math.max(1, height);
  if (contentLines.length <= limit) {
    return contentLines;
  }
  const lines = contentLines.slice(0, limit);
  if (limit >= 2 && !lines.some((line) => line.includes("Runtime ready"))) {
    lines.splice(limit - 2, 2, fit(`  ${model.readyLine}`, outerWidth), rule(outerWidth - 2));
  }
  return lines;
}

export function WelcomeScreen({
  workbench,
  permissionLevel,
  width,
  height,
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
  width: number;
  height?: number;
}): JSX.Element {
  const model = createWelcomeModel({
    modelLabel: workbench.model.label,
    permissionLevel,
    cwd: workbench.cwd,
    network: workbench.network,
    memoryLabel: formatConceptMemory(workbench.memory.total),
    toolCount: countTools(workbench),
    startupLabel: "0.8s",
    lastSessionLabel: formatLastSession(workbench),
  });

  return (
    <box flexDirection="column">
      {renderWelcomeLines(model, width, height).map((line, index) => (
        <WelcomeLine line={line} />
      ))}
    </box>
  );
}

function WelcomeLine({ line }: { line: string }): JSX.Element {
  const color = lineColor(line);
  if (isDimLine(line)) {
    return <text fg="gray">{line}</text>;
  }
  return color ? <text fg={color}>{line}</text> : <text>{line}</text>;
}

function renderWidePanel(model: WelcomeModel, outerWidth: number): string[] {
  const leftWidth = Math.max(56, Math.floor((outerWidth - 7) * 0.64));
  const rightWidth = outerWidth - leftWidth - 7;
  const rows: string[] = [boxTop(model.title, outerWidth)];
  const leftRows = [
    center("Welcome back!", leftWidth),
    ...model.logo.map((line) => center(line, leftWidth)),
    center("PURPLE LOTUS / 紫莲花", leftWidth),
    center(model.identityLine, leftWidth),
    fit(model.workspaceLine, leftWidth),
    "─".repeat(leftWidth),
    ...statusRows(model, leftWidth),
  ];
  const rightRows = [
    "Tips for getting started",
    "─".repeat(rightWidth),
    ...model.tips.map((tip) => `${pad(tip.command, 12)}${fit(tip.description, rightWidth - 12)}`),
    "",
    "What's new",
    "─".repeat(rightWidth),
    ...model.whatsNew.map((item) => `• ${fit(item, rightWidth - 2)}`),
    "",
    model.releaseNotes,
  ];
  const rowCount = Math.max(leftRows.length, rightRows.length);
  for (let index = 0; index < rowCount; index++) {
    rows.push(
      `│ ${pad(leftRows[index] ?? "", leftWidth)} │ ${pad(rightRows[index] ?? "", rightWidth)} │`,
    );
  }
  rows.push(boxBottom(outerWidth));
  return rows;
}

function renderNarrowPanel(model: WelcomeModel, outerWidth: number): string[] {
  const innerWidth = outerWidth - 4;
  return [
    boxTop(model.title, outerWidth),
    ...[
      "Welcome back!",
      ...model.logo,
      "PURPLE LOTUS / 紫莲花",
      model.identityLine,
      model.workspaceLine,
      "─".repeat(innerWidth),
      ...statusRows(model, innerWidth),
      "Tips for getting started",
      model.tips.map((tip) => tip.command).join("  "),
      "What's new: " + model.whatsNew.join(" · "),
    ].map((line) => `│ ${pad(fit(line, innerWidth), innerWidth)} │`),
    boxBottom(outerWidth),
  ];
}

function statusRows(model: WelcomeModel, width: number): string[] {
  const columnWidth = Math.floor((width - 4) / 3);
  return model.statusRows.map((row) =>
    row
      .map((item) => fit(item, columnWidth))
      .map((item) => pad(item, columnWidth))
      .join("  "),
  );
}

function promptBar(value: string, width: number): string {
  return fit(`❯ ${value}`, width);
}

function boxTop(title: string, width: number): string {
  const titleText = `─ ${title} `;
  return `╭${titleText}${"─".repeat(Math.max(0, width - displayWidth(titleText) - 2))}╮`;
}

function boxBottom(width: number): string {
  return `╰${"─".repeat(Math.max(0, width - 2))}╯`;
}

function fit(value: string, width: number): string {
  return truncateDisplay(value, Math.max(0, width));
}

function pad(value: string, width: number): string {
  const fitted = fit(value, width);
  return `${fitted}${" ".repeat(Math.max(0, width - displayWidth(fitted)))}`;
}

function center(value: string, width: number): string {
  const fitted = fit(value, width);
  const padding = Math.max(0, Math.floor((width - displayWidth(fitted)) / 2));
  return `${" ".repeat(padding)}${fitted}`;
}

function rule(width: number): string {
  return "─".repeat(Math.max(8, width));
}

function lineColor(line: string): "green" | "magentaBright" | "cyan" | "gray" | undefined {
  if (line.includes("████") || line.includes("PURPLE LOTUS") || line.includes("EGO-Graph v")) {
    return "magentaBright";
  }
  if (line.startsWith("❯")) {
    return "cyan";
  }
  if (line.includes("Runtime ready")) {
    return "green";
  }
  if (line.includes("hook output")) {
    return "gray";
  }
  return undefined;
}

function isDimLine(line: string): boolean {
  return line.includes("hook output") || line === "";
}

function countTools(workbench: WorkbenchState): number {
  const skillTools = workbench.skills.reduce((sum, skill) => sum + skill.toolCount, 0);
  return Math.max(12, skillTools, workbench.tools.length);
}

function formatConceptMemory(total: number): string {
  return `${Math.max(8, total)}KB / 2GB (0%)`;
}

function formatLastSession(workbench: WorkbenchState): string {
  const newest = workbench.recentRuns[0]?.updatedAt;
  if (!newest) {
    return "none";
  }
  const date = new Date(newest);
  if (Number.isNaN(date.getTime())) {
    return newest;
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
