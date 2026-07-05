export type LoopPolicy = {
  maxSteps: number;
  maxToolCalls: number;
  maxRepairAttempts: number;
  maxDurationMs: number;
};

export const defaultLoopPolicy: LoopPolicy = {
  maxSteps: 8,
  maxToolCalls: 5,
  maxRepairAttempts: 2,
  maxDurationMs: 10 * 60 * 1000,
};

export function mergeLoopPolicy(policy?: Partial<LoopPolicy>): LoopPolicy {
  return {
    ...defaultLoopPolicy,
    ...policy,
  };
}
