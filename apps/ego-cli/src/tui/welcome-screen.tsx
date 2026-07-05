import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
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
};

export function createWelcomeModel({
  modelLabel,
  permissionLevel,
  cwd,
  network = "connected",
  memoryLabel = "8KB / 2GB (0%)",
  toolCount = 12,
  startupLabel = "0.8s",
  lastSessionLabel = "暂无",
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
      "             ▄",
      "           ▄███▄",
      "         ▄███████▄",
      "     ▄█▄  █████  ▄█▄",
      "   ▄████▄ █████ ▄████▄",
      " ▄███████▄█████▄███████▄",
      "  ▀███████████████████▀",
      "    ▀███████████████▀",
      "      ▀███████████▀",
      "         ▀█████▀",
      "           ▀█▀",
    ],
    identityLine: `${modelLabel} • API Usage Billing • EGO-Graph Organization`,
    workspaceLine: `Workspace: ${cwd}`,
    statusRows: [
      ["运行模式: agent", `内存使用: ${memoryLabel}`, "会话配置: default"],
      [
        permissionLevel === "read-only"
          ? "活动策略: policy v1.0"
          : `活动策略: policy v1.0 · ${permissionLevel}`,
        "证据模式: evidence-grounded",
        `上次会话: ${lastSessionLabel}`,
      ],
      [`工具数量: ${toolCount}`, `网络状态: ${network}`, `启动时间: ${startupLabel}`],
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
  };
}

export function WelcomeScreen({
  workbench,
  permissionLevel,
  width,
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
  width: number;
}): ReactElement {
  const innerWidth = Math.max(42, Math.min(Math.max(42, width - 2), 140));
  const wide = innerWidth >= 92;
  const leftWidth = wide ? Math.max(44, Math.floor(innerWidth * 0.63)) : innerWidth - 4;
  const rightWidth = wide ? Math.max(28, innerWidth - leftWidth - 5) : innerWidth - 4;
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
    <Box flexDirection="column" paddingX={1}>
      <Box
        borderStyle="round"
        borderColor="magenta"
        flexDirection="column"
        paddingX={1}
        width={innerWidth}
      >
        <Text color="magentaBright"> {model.title} </Text>
        <Box flexDirection={wide ? "row" : "column"}>
          <Box flexDirection="column" width={leftWidth} paddingRight={2}>
            <Text color="white">{"Welcome back!".padStart(Math.floor(leftWidth / 2) + 6)}</Text>
            {model.logo.map((line) => (
              <Text key={line} color="magentaBright">
                {centerLine(line, leftWidth - 2)}
              </Text>
            ))}
            <Text color="gray">{centerLine(model.identityLine, leftWidth - 2)}</Text>
            <Text color="gray">{truncateDisplay(model.workspaceLine, leftWidth - 2)}</Text>
            <Text color="magentaBright">{"─".repeat(Math.max(8, leftWidth - 2))}</Text>
            {model.statusRows.map((row, rowIndex) =>
              wide ? (
                <Box key={rowIndex} flexDirection="row">
                  {row.map((item, itemIndex) => (
                    <Box key={item} width={Math.floor((leftWidth - 2) / 3)}>
                      <Text color="gray">
                        {statusIcon(rowIndex, itemIndex)}{" "}
                        {truncateDisplay(item, Math.floor((leftWidth - 8) / 3))}
                      </Text>
                    </Box>
                  ))}
                </Box>
              ) : (
                row.map((item, itemIndex) => (
                  <Text key={item} color="gray">
                    {statusIcon(rowIndex, itemIndex)} {truncateDisplay(item, leftWidth - 4)}
                  </Text>
                ))
              ),
            )}
          </Box>
          {wide ? (
            <Box flexDirection="column" width={1}>
              {Array.from({ length: 16 }).map((_, index) => (
                <Text key={index} color="magenta">
                  │
                </Text>
              ))}
            </Box>
          ) : null}
          <Box
            flexDirection="column"
            width={rightWidth}
            paddingLeft={wide ? 2 : 0}
            paddingTop={wide ? 0 : 1}
          >
            <Text color="magentaBright">Tips for getting started</Text>
            <Text color="magentaBright">{"─".repeat(Math.max(8, rightWidth - 2))}</Text>
            {model.tips.map((tip) => (
              <Text key={tip.command}>
                <Text color="white">{tip.command.padEnd(10)}</Text>
                <Text color="gray">{truncateDisplay(tip.description, rightWidth - 14)}</Text>
              </Text>
            ))}
            <Text> </Text>
            <Text color="magentaBright">What's new</Text>
            <Text color="magentaBright">{"─".repeat(Math.max(8, rightWidth - 2))}</Text>
            {model.whatsNew.map((item) => (
              <Text key={item} color="gray">
                • {truncateDisplay(item, rightWidth - 4)}
              </Text>
            ))}
            <Text> </Text>
            <Text color="magenta">
              /{truncateDisplay(model.releaseNotes.replace(/^\//u, ""), rightWidth - 2)}
            </Text>
          </Box>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text backgroundColor="black" color="white">
          ❯ 你好你的模型是什么？
        </Text>
        <Text> </Text>
        <Text>你好！我是 EGO-Graph，一个面向网络安全场景的智能体（Agent）。</Text>
        <Text>我专注于帮助你理解任务目标、分析证据、调度合适的工具并生成清晰可靠的报告。</Text>
        <Text>核心能力： 任务理解 · 证据分析 · 工具编排 · 报告生成</Text>
        <Text>如需开始，请尝试 /init 初始化工作区，或 /scan 启动安全扫描。</Text>
        <Text color="gray">ⓘ hook output: UserPromptSubmit · completed in 182ms</Text>
        <Text color="gray">{"─".repeat(Math.min(92, Math.max(20, width - 4)))}</Text>
        <Text color="green">
          ✓ Runtime ready • {workbench.model.label} • tools: {countTools(workbench)} • memory: 8KB •
          network: {workbench.network}
        </Text>
      </Box>
    </Box>
  );
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
    return "暂无";
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

function centerLine(value: string, width: number): string {
  const visible = truncateDisplay(value, width);
  const padding = Math.max(0, Math.floor((width - displayWidth(visible)) / 2));
  return `${" ".repeat(padding)}${visible}`;
}

function statusIcon(rowIndex: number, itemIndex: number): string {
  const icons = [
    [">", "#", "@"],
    ["+", "=", "~"],
    ["*", "o", "-"],
  ];
  return icons[rowIndex]?.[itemIndex] ?? "•";
}
