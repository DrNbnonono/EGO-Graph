import type {
  AgentRunEvent,
  PermissionLevel,
  TerminalAgentRunState,
} from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import type { HistoryItem } from "./history-browser.js";

export type OverlayMode = "none" | "status" | "plan" | "diff" | "checks" | "debug" | "history";

export type TuiRunSession = {
  runId: string;
  title: string;
  events: AgentRunEvent[];
  updatedAt: string;
};

export type TuiAppModel = {
  workbench?: WorkbenchState;
  activeRun?: TerminalAgentRunState;
  activeRunId?: string;
  permissionLevel: PermissionLevel;
  events: AgentRunEvent[];
  history: HistoryItem[];
  runSessions: TuiRunSession[];
  overlayMode: OverlayMode;
  busy: boolean;
  replayMode: boolean;
};
