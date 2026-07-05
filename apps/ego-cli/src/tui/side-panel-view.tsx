import type { PermissionLevel, TerminalAgentRunState } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { Box, Text } from "ink";
import React from "react";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";
import type { HistoryItem } from "./history-browser.js";

export function SidePanelView({
  workbench,
  activeRun,
  permissionLevel,
  history,
  width,
}: {
  workbench: WorkbenchState;
  activeRun?: TerminalAgentRunState | undefined;
  permissionLevel: PermissionLevel;
  history: HistoryItem[];
  width: number;
}): ReactElement {
  const inner = Math.max(16, width - 2);
  return (
    <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} width={width}>
      <Text color="magentaBright">Focus</Text>
      <Text color="gray">Run: {truncateDisplay(activeRun?.runId ?? "none", inner)}</Text>
      <Text color="gray">State: {truncateDisplay(activeRun?.status ?? "idle", inner)}</Text>
      <Text color="gray">Perm: {truncateDisplay(permissionLevel, inner)}</Text>
      <Text> </Text>
      <Text color="magentaBright">Runtime</Text>
      <Text color="gray">Model: {truncateDisplay(workbench.model.label, inner)}</Text>
      <Text color="gray">MCP: {truncateDisplay(workbench.mcp.status, inner)}</Text>
      <Text color="gray">Memory: {workbench.memory.total}</Text>
      <Text> </Text>
      <Text color="magentaBright">Recent</Text>
      {history.slice(0, 4).map((item) => (
        <Text key={item.runId} color="gray">
          {item.index}. {truncateDisplay(item.title, Math.max(8, inner - 4))}
        </Text>
      ))}
      {history.length === 0 ? <Text color="gray">No history yet.</Text> : null}
      <Text> </Text>
      <Text color="magentaBright">Keys</Text>
      <Text color="gray">Ctrl+R side panel</Text>
      <Text color="gray">Ctrl+O thinking</Text>
      <Text color="gray">Esc close overlay</Text>
    </Box>
  );
}
