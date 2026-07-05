import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export type TuiLayout = {
  terminalWidth: number;
  mode: "single" | "wide";
  showSidePanel: boolean;
  conversationWidth: number;
  sidePanelWidth: number;
};

export function chooseTuiLayout(width: number, sidePanelRequested = false): TuiLayout {
  const terminalWidth = Math.max(60, width);
  const showSidePanel = terminalWidth > 140 && sidePanelRequested;
  const sidePanelWidth = showSidePanel ? 38 : 0;
  return {
    terminalWidth,
    mode: showSidePanel ? "wide" : "single",
    showSidePanel,
    conversationWidth: terminalWidth - sidePanelWidth - (showSidePanel ? 2 : 0),
    sidePanelWidth,
  };
}

export function StatusLine({
  workbench,
  permissionLevel,
  busy,
  thinkingExpanded,
  width,
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
  busy: boolean;
  thinkingExpanded: boolean;
  width: number;
}): ReactElement {
  const label = [
    "EGO-Graph",
    workbench.model.label,
    permissionLevel,
    workbench.cwd,
    `Memory ${workbench.memory.total}`,
    `MCP ${workbench.mcp.status}`,
    busy ? "Thinking" : "Ready",
    thinkingExpanded ? "thinking expanded" : "thinking folded",
  ].join(" · ");

  return (
    <Box paddingX={1}>
      <Text color={busy ? "yellow" : "gray"}>
        {truncateDisplay(label, Math.max(20, width - 2))}
      </Text>
    </Box>
  );
}
