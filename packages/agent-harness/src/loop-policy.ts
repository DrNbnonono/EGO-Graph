export type LoopPolicy = {
  maxSteps: number;
  maxToolCalls: number;
  maxRepairAttempts: number;
  maxDurationMs: number;
  /**
   * Reserved for a future parallel tool-call planner (the loop currently
   * executes one tool call per step). Exposed now so persisted policy files
   * and CLI/TUI settings are forward-compatible without a schema migration.
   */
  maxConcurrentToolCalls: number;
  /**
   * Token budget for the conversation history recalled into a single model
   * turn (see ConversationStore.recallForPrompt). Larger budgets let the
   * model see more history per turn at the cost of latency/spend.
   */
  tokenBudgetPerTurn: number;
};

export const defaultLoopPolicy: LoopPolicy = {
  maxSteps: 8,
  maxToolCalls: 5,
  maxRepairAttempts: 2,
  maxDurationMs: 10 * 60 * 1000,
  maxConcurrentToolCalls: 1,
  tokenBudgetPerTurn: 16_000,
};

export function mergeLoopPolicy(policy?: Partial<LoopPolicy>): LoopPolicy {
  return {
    ...defaultLoopPolicy,
    ...policy,
  };
}
