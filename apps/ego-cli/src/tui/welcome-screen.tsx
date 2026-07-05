import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { Box, Text } from "ink";
import React from "react";
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
      "              ▄██▄              ",
      "        ▄█▄  ██████  ▄█▄        ",
      "       ████▌ ██████ ▐████       ",
      "   ▄█▄ █████▌ ████ ▐█████ ▄█▄   ",
      "  █████ █████      █████ █████  ",
      "    ▀███████      ███████▀      ",
      "        PURPLE LOTUS / 紫莲花    ",
      "       EGO-Graph v0.1.0 TUI     ",
    ],
    identityLine: `${modelLabel} | API Usage Billing | EGO-Graph Organization`,
    workspaceLine: `Workspace: ${cwd}`,
    statusRows: [
      ["Mode: agent", `Memory: ${memoryLabel}`, "Config: default"],
      [
        permissionLevel === "read-only" ? "Policy: read-only" : `Policy: ${permissionLevel}`,
        "Evidence: grounded",
        `Last run: ${lastSessionLabel}`,
      ],
      [`Tools: ${toolCount}`, `Network: ${network}`, `Startup: ${startupLabel}`],
    ],
    tips: [
      { command: "/history", description: "browse previous runs" },
      { command: "/model", description: "inspect model routing" },
      { command: "/permissions", description: "review write boundaries" },
      { command: "/mcp", description: "discover MCP tools" },
      { command: "/memory", description: "recall project memory" },
      { command: "/help", description: "show command help" },
    ],
    whatsNew: ["Safe approval shortcuts", "Focusable diff review", "Restorable prompt drafts"],
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
  const innerWidth = Math.max(52, Math.min(Math.max(52, width - 2), 104));
  const contentWidth = Math.max(40, innerWidth - 4);
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
        {model.logo.map((line) => (
          <Text key={line} color="magentaBright">
            {centerLine(line, contentWidth)}
          </Text>
        ))}
        <Text color="gray">{centerLine(model.identityLine, contentWidth)}</Text>
        <Text color="gray">{truncateDisplay(model.workspaceLine, contentWidth)}</Text>
        <Text color="magenta">{rule(contentWidth)}</Text>
        <Text color="gray">
          {truncateDisplay(
            `> ${model.statusRows[0]?.[0] ?? "Mode: agent"} | + ${
              model.statusRows[1]?.[0] ?? "Policy: read-only"
            } | @ Model: ${workbench.model.label}`,
            contentWidth,
          )}
        </Text>
        <Text color="gray">
          {truncateDisplay(
            `# ${model.statusRows[0]?.[1] ?? "Memory: 8KB"} | * ${
              model.statusRows[2]?.[0] ?? "Tools: 12"
            } | o ${model.statusRows[2]?.[1] ?? "Network: connected"}`,
            contentWidth,
          )}
        </Text>
        <Text color="magenta">{rule(contentWidth)}</Text>
        <Text color="magentaBright">Commands</Text>
        <Text color="gray">
          {truncateDisplay(model.tips.map((tip) => tip.command).join("  "), contentWidth)}
        </Text>
        <Text color="magenta">{rule(contentWidth)}</Text>
        <Text color="magentaBright">Workflow</Text>
        <Text color="gray">{truncateDisplay(model.whatsNew.join(" | "), contentWidth)}</Text>
        <Text color="gray">{truncateDisplay(model.releaseNotes, contentWidth)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="magentaBright">Quick start</Text>
        <Text color="gray">Ask in natural language for read-only analysis.</Text>
        <Text color="gray">Use /allow workspace-write before approving edits.</Text>
        <Text color="gray">Review /plan, inspect /diff, then approve or reject the patch.</Text>
        <Text color="green">
          {truncateDisplay(
            `Ready | ${workbench.model.label} | tools: ${countTools(workbench)} | memory: ${formatConceptMemory(
              workbench.memory.total,
            )} | network: ${workbench.network}`,
            Math.max(20, width - 8),
          )}
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

function centerLine(value: string, width: number): string {
  const visible = truncateDisplay(value, width);
  const padding = Math.max(0, Math.floor((width - displayWidth(visible)) / 2));
  return `${" ".repeat(padding)}${visible}`;
}

function rule(width: number): string {
  return "-".repeat(Math.max(8, width));
}
