import {runMission, type MissionRunInput, type MissionRunResult} from "./agent-runner.js";

export type AgentRuntimeStage =
  | "ingest"
  | "plan"
  | "tool_select"
  | "policy_check"
  | "execute"
  | "observe"
  | "update_evidence"
  | "evaluate"
  | "replan"
  | "done";

export type AgentRuntime = {
  run(input: MissionRunInput): Promise<MissionRunResult>;
};

export function createAgentRuntime(): AgentRuntime {
  return {
    async run(input) {
      return runMission(input);
    },
  };
}
