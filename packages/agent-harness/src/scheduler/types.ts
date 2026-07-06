import type { AgentRunEvent } from "../session.js";
import type { ToolExecutorResult } from "../tool-executor.js";

/**
 * Multi-tool scheduling primitives.
 *
 * The agent loop historically executes one tool per step. Real security
 * missions (incident response, web pentest, reverse engineering) need
 * parallel evidence collection, DAG dependencies between tools, retry on
 * transient failure, and graceful degradation to a fallback tool. This
 * module provides the data model and scheduler; the loop wires it in when
 * the planner proposes more than one tool call.
 *
 * Design notes:
 * - The scheduler is a pure async generator yielding {@link AgentRunEvent}s,
 *   so it slots into the existing loop's `for await` consumption pattern.
 * - Parallelism is restricted to `parallelSafe` jobs whose inferred
 *   permission is read-only, matching the safety rule that side-effecting
 *   tools must never run concurrently against the same target.
 * - Failure handling follows the contest requirement: "工具失败会转入替代
 *   工具或说明残余风险" — a failed job either retries, falls back, or
 *   surfaces a residual risk the report must cite.
 */

export type RetryPolicy = {
  maxAttempts: number;
  /** Base delay in ms; exponential backoff multiplies by attempt index. */
  backoffMs: number;
};

export type ScheduledToolJob = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Other job ids that must complete before this job starts. */
  dependsOn?: string[];
  /** When true (default), the job may run in parallel with other parallelSafe jobs in the same layer. */
  parallelSafe?: boolean;
  /** Inferred permission level; only read-only jobs participate in parallel batches. */
  requiredPermission?: "read-only" | "workspace-write" | "shell-readonly" | "network-low" | "security-active";
  retryPolicy?: RetryPolicy;
  /** Fallback tool to invoke if this job ultimately fails. */
  fallbackToolName?: string;
  fallbackInput?: Record<string, unknown>;
  /** Free-form rationale surfaced in events for auditability. */
  rationale?: string;
};

export type SchedulerJobResult = {
  jobId: string;
  toolName: string;
  result: ToolExecutorResult;
  attempts: number;
  /** True if the fallback tool was used. */
  degraded: boolean;
};

export type SchedulerResidualRisk = {
  jobId: string;
  toolName: string;
  reason: string;
  /** Last error/recovery hint captured before the job gave up. */
  recoveryHint?: string;
};

export type SchedulerBatchResult = {
  results: SchedulerJobResult[];
  residualRisks: SchedulerResidualRisk[];
  degraded: boolean;
};

/** Minimal event input the scheduler emits, same shape as the loop's emit. */
export type SchedulerEmit = (event: {
  type: AgentRunEvent["type"];
  runId: string;
  sessionId: string;
  message: string;
  payload: Record<string, unknown>;
}) => Promise<AgentRunEvent>;
