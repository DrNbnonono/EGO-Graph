import type { LoopPolicy } from "./loop-policy.js";
import type { LoopState } from "./loop-state.js";

export type StopDecision =
  { shouldStop: false } | { shouldStop: true; status: "stopped" | "blocked"; reason: string };

export function evaluateStopCondition(
  state: LoopState,
  policy: LoopPolicy,
  now = Date.now(),
): StopDecision {
  if (state.stepCount >= policy.maxSteps) {
    return {
      shouldStop: true,
      status: "blocked",
      reason: `Loop step limit reached (${policy.maxSteps}).`,
    };
  }
  if (state.toolCallCount >= policy.maxToolCalls) {
    return {
      shouldStop: true,
      status: "blocked",
      reason: `Tool call limit reached (${policy.maxToolCalls}).`,
    };
  }
  if (state.repairAttempts >= policy.maxRepairAttempts) {
    return {
      shouldStop: true,
      status: "blocked",
      reason: `Repair limit reached (${policy.maxRepairAttempts}).`,
    };
  }
  if (now - state.startedAt >= policy.maxDurationMs) {
    return {
      shouldStop: true,
      status: "blocked",
      reason: `Loop duration limit reached (${policy.maxDurationMs}ms).`,
    };
  }
  return { shouldStop: false };
}
