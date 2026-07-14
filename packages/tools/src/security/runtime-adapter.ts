import { createHash } from "node:crypto";
import type { ToolEvidenceCandidate } from "../tool-definition.js";
import { runControlledProcess, type ControlledProcessResult } from "../process-runner.js";

export type ToolCapabilityStatus =
  | "unavailable"
  | "degraded"
  | "ready"
  | "verified"
  | "failed";

export type ToolRuntimeProbe = {
  status: ToolCapabilityStatus;
  source: "external" | "builtin" | "container";
  binaryPath?: string;
  version?: string;
  imageDigest?: string;
  reason?: string;
  checkedAt: string;
};

export type ToolExecutionReceipt = {
  tool: string;
  source: "external" | "builtin" | "container";
  version?: string;
  imageDigest?: string;
  argvDigest: string;
  exitCode: number;
  stdoutDigest: string;
  stderrDigest: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  artifactRefs: string[];
};

export type ToolHealthRecord = {
  tool: string;
  status: ToolCapabilityStatus;
  source: ToolRuntimeProbe["source"];
  lastProbeAt?: string;
  lastExecutedAt?: string;
  successCount: number;
  failureCount: number;
  lastReceipt?: ToolExecutionReceipt;
  reason?: string;
};

export type ToolRecovery = {
  retryable: boolean;
  fallback?: "builtin" | "alternate_tool" | "none";
  residualRisk: string;
};

export type ToolRuntimeAdapter<Input, Parsed> = {
  readonly name: string;
  probe(): Promise<ToolRuntimeProbe>;
  execute(input: Input, signal?: AbortSignal): Promise<{ parsed: Parsed; receipt: ToolExecutionReceipt }>;
  parse(result: ControlledProcessResult, input: Input): Parsed;
  mapEvidence(parsed: Parsed, receipt: ToolExecutionReceipt): ToolEvidenceCandidate[];
  recover(error: unknown): ToolRecovery;
};

const healthRecords = new Map<string, ToolHealthRecord>();

export function listToolHealthRecords(): ToolHealthRecord[] {
  return [...healthRecords.values()].sort((left, right) => left.tool.localeCompare(right.tool));
}

export function getToolHealthRecord(tool: string): ToolHealthRecord | undefined {
  return healthRecords.get(tool);
}

export function recordToolProbe(tool: string, probe: ToolRuntimeProbe): void {
  const previous = healthRecords.get(tool);
  const status = previous?.status === "verified" && probe.status === "ready"
    ? "verified"
    : probe.status;
  healthRecords.set(tool, {
    tool,
    status,
    source: probe.source,
    lastProbeAt: probe.checkedAt,
    successCount: previous?.successCount ?? 0,
    failureCount: previous?.failureCount ?? 0,
    ...(previous?.lastExecutedAt ? { lastExecutedAt: previous.lastExecutedAt } : {}),
    ...(previous?.lastReceipt ? { lastReceipt: previous.lastReceipt } : {}),
    ...(probe.reason ? { reason: probe.reason } : {}),
  });
}

export function recordToolExecution(
  tool: string,
  source: ToolRuntimeProbe["source"],
  receipt: ToolExecutionReceipt,
  success: boolean,
  reason?: string,
): void {
  const previous = healthRecords.get(tool);
  healthRecords.set(tool, {
    tool,
    status: success ? "verified" : "failed",
    source,
    ...(previous?.lastProbeAt ? { lastProbeAt: previous.lastProbeAt } : {}),
    lastExecutedAt: receipt.completedAt,
    successCount: (previous?.successCount ?? 0) + (success ? 1 : 0),
    failureCount: (previous?.failureCount ?? 0) + (success ? 0 : 1),
    lastReceipt: receipt,
    ...(reason ? { reason } : {}),
  });
}

export async function executeExternalBinary(input: {
  tool: string;
  capability?: string;
  program: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
  version?: string;
  artifactRefs?: string[];
}): Promise<{ result: ControlledProcessResult; receipt: ToolExecutionReceipt }> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const result = await runControlledProcess(input.program, input.args, {
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.maxOutputBytes ? { maxOutputBytes: input.maxOutputBytes } : {}),
  });
  const completed = Date.now();
  const receipt: ToolExecutionReceipt = {
    tool: input.tool,
    source: "external",
    ...(input.version ? { version: input.version } : {}),
    argvDigest: digest(JSON.stringify([input.program, ...input.args])),
    exitCode: result.exitCode,
    stdoutDigest: digest(result.stdout),
    stderrDigest: digest(result.stderr),
    startedAt,
    completedAt: new Date(completed).toISOString(),
    durationMs: Math.max(0, completed - started),
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    truncated: result.truncated,
    artifactRefs: input.artifactRefs ?? [],
  };
  const success = result.exitCode === 0 && !result.timedOut && !result.cancelled;
  recordToolExecution(
    input.tool,
    "external",
    receipt,
    success,
    success ? undefined : result.stderr.trim().slice(0, 240) || `exit code ${result.exitCode}`,
  );
  if (input.capability && input.capability !== input.tool) {
    recordToolExecution(
      input.capability,
      "external",
      { ...receipt, tool: input.capability },
      success,
      success ? undefined : result.stderr.trim().slice(0, 240) || `exit code ${result.exitCode}`,
    );
  }
  return { result, receipt };
}

export function builtinReceipt(tool: string, artifactRefs: string[] = []): ToolExecutionReceipt {
  const now = new Date().toISOString();
  return {
    tool,
    source: "builtin",
    argvDigest: digest("builtin"),
    exitCode: 0,
    stdoutDigest: digest(""),
    stderrDigest: digest(""),
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    timedOut: false,
    cancelled: false,
    truncated: false,
    artifactRefs,
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
