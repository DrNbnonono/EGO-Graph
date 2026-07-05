import type { AgentHarnessPhase, TerminalAgentRunState } from "./session.js";

export type RunState = TerminalAgentRunState;
export type { AgentHarnessPhase };

export const agentHarnessPhases = [
  "idle",
  "chat",
  "context_loading",
  "planning",
  "waiting_plan_approval",
  "tool_running",
  "patch_generating",
  "waiting_patch_approval",
  "patch_applying",
  "checking",
  "repairing",
  "completed",
  "blocked",
  "cancelled",
] as const satisfies readonly AgentHarnessPhase[];

export function isPendingRun(state: Pick<TerminalAgentRunState, "status">): boolean {
  return state.status === "plan_pending" || state.status === "patch_pending";
}
