/** @jsxImportSource @opentui/solid */
import type { PermissionLevel, TerminalAgentRunState } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import type { JSX } from "solid-js";
import type { HistoryItem } from "./history-browser.js";

export function SidePanelView({
  workbench,
  activeRun,
  permissionLevel,
  history,
  width,
}: {
  workbench: WorkbenchState;
  activeRun?: TerminalAgentRunState;
  permissionLevel: PermissionLevel;
  history: HistoryItem[];
  width: number;
}): JSX.Element {
  return (
    <box width={width} flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text>Workspace</text>
      <text>{workbench.model.label}</text>
      <text>{permissionLevel}</text>
      <text>{activeRun?.status ?? "no active run"}</text>
      <text>Recent</text>
      {history.slice(0, 6).map((item) => (
        <text>
          {item.index}. {item.title}
        </text>
      ))}
    </box>
  );
}
