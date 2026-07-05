import type { PermissionLevel } from "./safety-policy.js";

export type LoopIntent =
  | "chat"
  | "project_analysis"
  | "code_change"
  | "security_task"
  | "ctf_task"
  | "maintenance"
  | "unknown";

export type PlannerNextAction =
  "answer" | "call_tool" | "propose_plan" | "propose_patch" | "ask_user" | "stop";

export type PlannerAction = {
  thoughtSummary: string;
  intent: LoopIntent;
  nextAction: PlannerNextAction;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  riskLevel: "low" | "medium" | "high";
  requiredPermission: PermissionLevel;
  userVisibleMessage: string;
  expectedObservation: string;
  stopCondition: string;
};

export type LoopState = {
  runId: string;
  sessionId: string;
  message: string;
  intent: LoopIntent;
  startedAt: number;
  stepCount: number;
  toolCallCount: number;
  repairAttempts: number;
  observations: string[];
  reflections: string[];
  status: "running" | "stopped" | "blocked";
  stopReason?: string;
};

export function createLoopState(input: {
  runId: string;
  sessionId: string;
  message: string;
  intent: LoopIntent;
  now?: number;
}): LoopState {
  return {
    runId: input.runId,
    sessionId: input.sessionId,
    message: input.message,
    intent: input.intent,
    startedAt: input.now ?? Date.now(),
    stepCount: 0,
    toolCallCount: 0,
    repairAttempts: 0,
    observations: [],
    reflections: [],
    status: "running",
  };
}
