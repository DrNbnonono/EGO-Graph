import type { PlannerAction } from "./loop-state.js";

export function buildLoopReflection(input: {
  action: PlannerAction;
  observation?: string;
  remainingToolBudget: number;
}): string {
  const observation = input.observation ?? "No new observation.";
  return [
    `Action: ${input.action.nextAction}`,
    `Evidence: ${observation}`,
    `Reason: ${input.action.thoughtSummary}`,
    `Remaining tool calls: ${input.remainingToolBudget}`,
    `Stop: ${input.action.stopCondition}`,
  ].join(" | ");
}
