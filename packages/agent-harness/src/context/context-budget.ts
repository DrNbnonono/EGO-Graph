import type { StoredMessage } from "@ego-graph/storage";

export type ContextBudgetDecision = {
  tokenBudget: number;
  totalTokens: number;
  selectedTokens: number;
  omittedTokens: number;
  selectedCount: number;
  omittedCount: number;
  utilization: number;
  status: "healthy" | "near_limit" | "needs_compaction";
  reason: string;
};

export function analyzeContextBudget(input: {
  allMessages: StoredMessage[];
  selectedMessages: StoredMessage[];
  tokenBudget: number;
  nearLimitRatio?: number;
}): ContextBudgetDecision {
  const nearLimitRatio = input.nearLimitRatio ?? 0.82;
  const totalTokens = sumTokens(input.allMessages);
  const selectedTokens = sumTokens(input.selectedMessages);
  const omittedTokens = Math.max(0, totalTokens - selectedTokens);
  const omittedCount = Math.max(0, input.allMessages.length - input.selectedMessages.length);
  const utilization = input.tokenBudget > 0 ? selectedTokens / input.tokenBudget : 0;
  const status =
    omittedCount > 0 || omittedTokens > input.tokenBudget * 0.25
      ? "needs_compaction"
      : utilization >= nearLimitRatio
        ? "near_limit"
        : "healthy";
  return {
    tokenBudget: input.tokenBudget,
    totalTokens,
    selectedTokens,
    omittedTokens,
    selectedCount: input.selectedMessages.length,
    omittedCount,
    utilization,
    status,
    reason: buildReason({ status, omittedCount, utilization }),
  };
}

export function renderContextBudgetHint(decision: ContextBudgetDecision): string {
  const percent = Math.round(decision.utilization * 100);
  return [
    `context=${decision.status}`,
    `selected=${decision.selectedTokens}/${decision.tokenBudget} tokens (${percent}%)`,
    `omitted=${decision.omittedCount} messages/${decision.omittedTokens} tokens`,
    decision.reason,
  ].join(" | ");
}

function sumTokens(messages: StoredMessage[]): number {
  return messages.reduce((total, message) => total + estimateStoredTokens(message), 0);
}

function estimateStoredTokens(message: StoredMessage): number {
  if (typeof message.tokenCount === "number" && Number.isFinite(message.tokenCount)) {
    return Math.max(0, Math.round(message.tokenCount));
  }
  return Math.ceil(message.contentJson.length / 4);
}

function buildReason(input: {
  status: ContextBudgetDecision["status"];
  omittedCount: number;
  utilization: number;
}): string {
  if (input.status === "needs_compaction") {
    return input.omittedCount > 0
      ? "Some history is outside the active prompt; compact before long-running work."
      : "Context pressure is high; compact soon.";
  }
  if (input.status === "near_limit") {
    return "Active prompt is close to the token budget.";
  }
  return "Active prompt is within the context budget.";
}
