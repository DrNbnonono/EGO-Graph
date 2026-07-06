import type { LoopPolicy } from "./loop-policy.js";
import type { LoopState } from "./loop-state.js";

export type StopDecision =
  { shouldStop: false } | { shouldStop: true; status: "stopped" | "blocked"; reason: string };

export type BudgetWarning = {
  reason: string;
  remainingSteps: number;
  remainingToolCalls: number;
};

/**
 * Detect when the loop is one step/tool-call away from a hard stop, so the
 * caller can emit a loop.budget.warning event (with a hint to /continue or
 * /btw a correction) instead of the run just going silent until it blocks.
 * Returns undefined when there is nothing to warn about.
 */
export function evaluateBudgetWarning(
  state: LoopState,
  policy: LoopPolicy,
): BudgetWarning | undefined {
  const remainingSteps = policy.maxSteps - state.stepCount;
  const remainingToolCalls = policy.maxToolCalls - state.toolCallCount;
  if (remainingSteps > 1 && remainingToolCalls > 1) {
    return undefined;
  }
  const reasons: string[] = [];
  if (remainingSteps <= 1) {
    reasons.push(`${Math.max(0, remainingSteps)} step(s) remaining`);
  }
  if (remainingToolCalls <= 1) {
    reasons.push(`${Math.max(0, remainingToolCalls)} tool call(s) remaining`);
  }
  return {
    reason: `Approaching loop budget: ${reasons.join(", ")}.`,
    remainingSteps: Math.max(0, remainingSteps),
    remainingToolCalls: Math.max(0, remainingToolCalls),
  };
}

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
