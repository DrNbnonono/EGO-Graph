import type { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import type { AgentRunEvent, PermissionLevel } from "../session.js";
import { createToolCall, executeToolCall, type SecurityScopeGate, type ToolExecutorResult } from "../tool-executor.js";
import type { PermissionRule } from "../permission-rules.js";
import { layerJobs } from "./dag.js";
import type {
  RetryPolicy,
  SchedulerBatchResult,
  SchedulerEmit,
  SchedulerJobResult,
  SchedulerResidualRisk,
  ScheduledToolJob,
} from "./types.js";

export type ExecuteScheduleInput = {
  runId: string;
  sessionId: string;
  workspaceRoot: string;
  toolRegistry: ReturnType<typeof createTerminalAgentToolRegistry>;
  permissionLevel: PermissionLevel;
  jobs: ScheduledToolJob[];
  /** Cap on concurrent jobs per layer. Defaults to 3. */
  maxConcurrent?: number;
  /** When provided, network/high-risk tools are gated against this scope. */
  securityScope?: SecurityScopeGate;
  /** Optional permission rules override; defaults to the level's rule set. */
  permissionRules?: PermissionRule[];
  /** Sleep function (overridable for tests). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  emit: SchedulerEmit;
};

const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, backoffMs: 200 };
const DEFAULT_MAX_CONCURRENT = 3;

/**
 * Execute a batch of scheduled jobs respecting DAG dependencies, parallelism
 * limits, retry policy, and fallback tooling. Yields {@link AgentRunEvent}s
 * for every batch/job lifecycle transition so the loop, TUI, and repro bundle
 * can audit the schedule.
 *
 * Safety: only jobs whose `requiredPermission` is `read-only` (or unset) and
 * that are marked `parallelSafe` (default true) run concurrently within a
 * layer. Side-effecting jobs are serialized within their layer.
 *
 * Implementation note: every event is yielded through this generator (never
 * just awaited-and-dropped), so consumers that iterate `for await` see the
 * full schedule transcript.
 */
export async function* executeSchedule(
  input: ExecuteScheduleInput,
): AsyncIterable<AgentRunEvent> {
  const maxConcurrent = input.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const sleep = input.sleep ?? defaultSleep;
  const layers = layerJobs(input.jobs);

  yield await emit(input, {
    type: "scheduler.batch.started",
    message: `Scheduler batch started: ${input.jobs.length} job(s) across ${layers.length} layer(s).`,
    payload: {
      jobCount: input.jobs.length,
      layerCount: layers.length,
      jobs: input.jobs.map((job) => ({ id: job.id, toolName: job.toolName, dependsOn: job.dependsOn ?? [] })),
    },
  });

  const results: SchedulerJobResult[] = [];
  const residualRisks: SchedulerResidualRisk[] = [];
  const emitted: AgentRunEvent[] = [];

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex];
    if (!layer) {
      continue;
    }
    const { parallel, serialized } = partitionLayer(layer);
    for (const job of serialized) {
      const outcome = await drainJob(input, job, sleep, emitted);
      results.push(outcome.result);
      if (outcome.residualRisk) {
        residualRisks.push(outcome.residualRisk);
      }
    }
    for (const chunk of chunkArray(parallel, maxConcurrent)) {
      const outcomes = await Promise.all(
        chunk.map((job) => drainJob(input, job, sleep, emitted)),
      );
      for (const outcome of outcomes) {
        results.push(outcome.result);
        if (outcome.residualRisk) {
          residualRisks.push(outcome.residualRisk);
        }
      }
    }
  }

  for (const event of emitted) {
    yield event;
  }

  const degraded = results.some((result) => result.degraded);
  yield await emit(input, {
    type: "scheduler.batch.completed",
    message: `Scheduler batch completed: ${results.length} result(s)${degraded ? ", degraded" : ""}${residualRisks.length > 0 ? `, ${residualRisks.length} residual risk(s)` : ""}.`,
    payload: {
      results: results.map((result) => ({
        jobId: result.jobId,
        toolName: result.toolName,
        status: result.result.status,
        attempts: result.attempts,
        degraded: result.degraded,
      })),
      residualRisks,
      degraded,
    },
  });
}

type JobOutcome = {
  result: SchedulerJobResult;
  residualRisk?: SchedulerResidualRisk;
};

/**
 * Run a single job with retry and fallback, accumulating emitted events into
 * `sink` so the caller can yield them in deterministic order. Using a sink
 * array (instead of a nested generator) keeps Promise.all parallelism simple
 * while still preserving full event visibility.
 */
async function drainJob(
  input: ExecuteScheduleInput,
  job: ScheduledToolJob,
  sleep: (ms: number) => Promise<void>,
  sink: AgentRunEvent[],
): Promise<JobOutcome> {
  const localEmit: SchedulerEmit = async (event) => {
    const result = await input.emit(event);
    sink.push(result);
    return result;
  };
  const jobInput: ExecuteScheduleInput = { ...input, emit: localEmit };
  return runJobWithRetryAndFallback(jobInput, job, sleep);
}

async function runJobWithRetryAndFallback(
  input: ExecuteScheduleInput,
  job: ScheduledToolJob,
  sleep: (ms: number) => Promise<void>,
): Promise<JobOutcome> {
  const retry = job.retryPolicy ?? DEFAULT_RETRY;
  let attempts = 0;
  let lastError: string | undefined;
  let lastRecoveryHint: string | undefined;
  let lastResult: ToolExecutorResult | undefined;

  while (attempts < retry.maxAttempts) {
    attempts += 1;
    await emit(input, {
      type: "scheduler.job.started",
      message: `Job ${job.id} (${job.toolName}) started (attempt ${attempts}/${retry.maxAttempts}).`,
      payload: {
        jobId: job.id,
        toolName: job.toolName,
        attempt: attempts,
        ...(job.rationale ? { rationale: job.rationale } : {}),
        ...(job.dependsOn ? { dependsOn: job.dependsOn } : {}),
      },
    });
    const outcome = await runTool(input, job);
    lastResult = outcome.result;
    const status = outcome.result.status;
    await emit(input, {
      type: "scheduler.job.completed",
      message: `Job ${job.id} (${job.toolName}) ${status} on attempt ${attempts}.`,
      payload: {
        jobId: job.id,
        toolName: job.toolName,
        status,
        attempts,
        ...(outcome.result.output ? { outputPreview: summarizeOutput(outcome.result.output) } : {}),
      },
    });
    if (outcome.result.status === "completed") {
      return {
        result: {
          jobId: job.id,
          toolName: job.toolName,
          result: outcome.result,
          attempts,
          degraded: false,
        },
      };
    }
    lastError = outcome.result.event.message;
    lastRecoveryHint = extractRecoveryHint(outcome.result);
    // Blocked (permission/scope) is not transient — do not retry.
    if (outcome.result.status === "blocked") {
      break;
    }
    if (attempts < retry.maxAttempts) {
      const backoff = retry.backoffMs * attempts;
      await emit(input, {
        type: "scheduler.job.retried",
        message: `Job ${job.id} retrying in ${backoff}ms (attempt ${attempts + 1}/${retry.maxAttempts}).`,
        payload: { jobId: job.id, toolName: job.toolName, attempt: attempts + 1, backoffMs: backoff },
      });
      await sleep(backoff);
    }
  }

  // Fallback tool, if any.
  if (job.fallbackToolName) {
    await emit(input, {
      type: "scheduler.job.fallback",
      message: `Job ${job.id} falling back to ${job.fallbackToolName}.`,
      payload: {
        jobId: job.id,
        primaryTool: job.toolName,
        fallbackTool: job.fallbackToolName,
        reason: lastError ?? "primary tool failed",
      },
    });
    const fallbackJob: ScheduledToolJob = {
      id: `${job.id}-fallback`,
      toolName: job.fallbackToolName,
      input: job.fallbackInput ?? job.input,
    };
    const fallbackOutcome = await runTool(input, fallbackJob);
    await emit(input, {
      type: "scheduler.job.completed",
      message: `Job ${job.id} fallback (${job.fallbackToolName}) ${fallbackOutcome.result.status}.`,
      payload: {
        jobId: job.id,
        toolName: job.fallbackToolName,
        status: fallbackOutcome.result.status,
        fallback: true,
      },
    });
    if (fallbackOutcome.result.status === "completed") {
      return {
        result: {
          jobId: job.id,
          toolName: job.fallbackToolName,
          result: fallbackOutcome.result,
          attempts,
          degraded: true,
        },
        residualRisk: {
          jobId: job.id,
          toolName: job.toolName,
          reason: `Primary tool ${job.toolName} failed after ${attempts} attempt(s); used fallback ${job.fallbackToolName}.`,
          ...(lastRecoveryHint ? { recoveryHint: lastRecoveryHint } : {}),
        },
      };
    }
    lastResult = fallbackOutcome.result;
  }

  const residualRisk: SchedulerResidualRisk = {
    jobId: job.id,
    toolName: job.toolName,
    reason: `Tool ${job.toolName} failed after ${attempts} attempt(s) with no successful fallback.`,
    ...(lastRecoveryHint ? { recoveryHint: lastRecoveryHint } : {}),
  };
  return {
    result: {
      jobId: job.id,
      toolName: job.toolName,
      result: synthesizeFailureResult(job, lastError),
      attempts,
      degraded: false,
    },
    residualRisk,
  };
}

async function runTool(
  input: ExecuteScheduleInput,
  job: ScheduledToolJob,
): Promise<{ result: ToolExecutorResult }> {
  const tool = input.toolRegistry.get(job.toolName);
  const call = createToolCall(tool, job.input);
  const result = await executeToolCall({
    tool,
    input: job.input,
    call,
    workspaceRoot: input.workspaceRoot,
    permissionLevel: input.permissionLevel,
    approvalGranted: !call.requiresApproval || input.permissionLevel === "security-active",
    ...(input.securityScope ? { securityScope: input.securityScope } : {}),
    ...(input.permissionRules ? { permissionRules: input.permissionRules } : {}),
    runId: input.runId,
    sessionId: input.sessionId,
  });
  return { result };
}

function partitionLayer(
  layer: ScheduledToolJob[],
): { parallel: ScheduledToolJob[]; serialized: ScheduledToolJob[] } {
  const parallel: ScheduledToolJob[] = [];
  const serialized: ScheduledToolJob[] = [];
  for (const job of layer) {
    const isParallelSafe = job.parallelSafe !== false;
    const isReadOnly = !job.requiredPermission || job.requiredPermission === "read-only";
    if (isParallelSafe && isReadOnly) {
      parallel.push(job);
    } else {
      serialized.push(job);
    }
  }
  return { parallel, serialized };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function summarizeOutput(output: Record<string, unknown>): string {
  const findings = Array.isArray(output.findings) ? output.findings : [];
  if (findings.length > 0) {
    return String(findings[0] ?? "").slice(0, 120);
  }
  try {
    return JSON.stringify(output).slice(0, 120);
  } catch {
    return "(non-serializable output)";
  }
}

function extractRecoveryHint(result: ToolExecutorResult): string | undefined {
  const hint = result.event.payload.recoveryHint;
  return typeof hint === "string" ? hint : undefined;
}

function synthesizeFailureResult(
  job: ScheduledToolJob,
  lastError: string | undefined,
): ToolExecutorResult {
  const call = {
    id: `${job.id}-failed`,
    name: job.toolName,
    input: job.input,
    permissionRequired: (job.requiredPermission ?? "read-only") as PermissionLevel,
    riskLevel: "low" as const,
    requiresApproval: false,
    sandboxProfile: "none" as const,
    timeoutMs: 30_000,
  };
  return {
    status: "failed",
    call,
    event: {
      id: `${job.id}-failed-event`,
      type: "tool.failed",
      runId: "",
      sessionId: "",
      createdAt: new Date().toISOString(),
      phase: "tool_running",
      permissionLevel: "read-only",
      message: lastError ?? `Job ${job.id} failed.`,
      payload: { tool: job.toolName, jobId: job.id, synthesized: true },
    },
  };
}

async function emit(
  input: ExecuteScheduleInput,
  event: {
    type: AgentRunEvent["type"];
    message: string;
    payload: Record<string, unknown>;
  },
): Promise<AgentRunEvent> {
  return input.emit({
    type: event.type,
    runId: input.runId,
    sessionId: input.sessionId,
    message: event.message,
    payload: event.payload,
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { SchedulerBatchResult };
