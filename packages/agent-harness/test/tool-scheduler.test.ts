import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry, type ToolDefinition } from "@ego-graph/tools";
import {
  detectCycle,
  layerJobs,
  SchedulerCycleError,
  topologicalSort,
} from "../src/scheduler/dag.js";
import { executeSchedule } from "../src/scheduler/tool-scheduler.js";
import type { AgentRunEvent } from "../src/session.js";

const inputSchema = z.object({ value: z.string().optional() });
const outputSchema = z.object({ findings: z.array(z.string()) });

function makeReadonlyTool(
  name: string,
  behavior: "ok" | "fail" | "failOnce" | "slow",
): ToolDefinition<typeof inputSchema, typeof outputSchema> & {
  calls: number;
} {
  const state = { calls: 0 };
  const tool = {
    name,
    description: `mock ${name}`,
    inputSchema,
    outputSchema,
    permission: { scope: "file" as const, risk: "low" as const, requiresSandbox: false },
    riskLevel: "low" as const,
    sandboxProfile: "none" as const,
    timeoutMs: 5_000,
    async execute(input: { value?: string }) {
      state.calls += 1;
      if (behavior === "fail" || (behavior === "failOnce" && state.calls === 1)) {
        throw new Error(`${name} failed on call ${state.calls}`);
      }
      if (behavior === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return { findings: [`${name}:${input.value ?? ""}`] };
    },
    get calls() {
      return state.calls;
    },
  };
  return tool as typeof tool & { calls: number };
}

function makeRegistry(tools: Array<ToolDefinition<typeof inputSchema, typeof outputSchema>>): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

async function collectEvents(
  gen: AsyncIterable<AgentRunEvent>,
): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

const noopEmit = async (event: {
  type: AgentRunEvent["type"];
  runId: string;
  sessionId: string;
  message: string;
  payload: Record<string, unknown>;
}): Promise<AgentRunEvent> => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  type: event.type,
  runId: event.runId,
  sessionId: event.sessionId,
  message: event.message,
  payload: event.payload,
  createdAt: new Date().toISOString(),
});

// Allow-all rule set so mock tools (which are not workspace.*) pass the
// permission gate in tests. The scheduler forwards this to executeToolCall.
const ALLOW_ALL = [{ action: "*", resource: "*", effect: "allow" as const }];

describe("scheduler DAG", () => {
  it("topologicalSort orders dependencies before dependents", () => {
    const sorted = topologicalSort([
      { id: "b", toolName: "t.b", input: {}, dependsOn: ["a"] },
      { id: "a", toolName: "t.a", input: {} },
      { id: "c", toolName: "t.c", input: {}, dependsOn: ["b"] },
    ]);
    const ids = sorted.map((job) => job.id);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });

  it("detectCycle throws on a cycle", () => {
    expect(() =>
      detectCycle([
        { id: "a", toolName: "t.a", input: {}, dependsOn: ["b"] },
        { id: "b", toolName: "t.b", input: {}, dependsOn: ["a"] },
      ]),
    ).toThrow(SchedulerCycleError);
  });

  it("layerJobs groups independent jobs in the same layer", () => {
    const layers = layerJobs([
      { id: "a", toolName: "t.a", input: {} },
      { id: "b", toolName: "t.b", input: {} },
      { id: "c", toolName: "t.c", input: {}, dependsOn: ["a", "b"] },
    ]);
    expect(layers).toHaveLength(2);
    expect(layers[0]?.map((job) => job.id).sort()).toEqual(["a", "b"]);
    expect(layers[1]?.map((job) => job.id)).toEqual(["c"]);
  });
});

describe("scheduler executeSchedule", () => {
  it("runs independent read-only jobs concurrently within a layer", async () => {
    const a = makeReadonlyTool("mock.a", "slow");
    const b = makeReadonlyTool("mock.b", "slow");
    const c = makeReadonlyTool("mock.c", "slow");
    const registry = makeRegistry([a, b, c]);
    const start = Date.now();
    const events = await collectEvents(
      executeSchedule({
        runId: "r",
        sessionId: "s",
        workspaceRoot: ".",
        toolRegistry: registry,
        permissionLevel: "read-only",
        jobs: [
          { id: "a", toolName: "mock.a", input: {} },
          { id: "b", toolName: "mock.b", input: {} },
          { id: "c", toolName: "mock.c", input: {} },
        ],
        maxConcurrent: 3,
        permissionRules: ALLOW_ALL,
        sleep: async () => undefined,
        emit: noopEmit,
      }),
    );
    const elapsed = Date.now() - start;
    // Each tool sleeps 60ms; concurrent execution should be well under 3*60.
    expect(elapsed).toBeLessThan(150);
    const batchCompleted = events.find((event) => event.type === "scheduler.batch.completed");
    expect(batchCompleted).toBeDefined();
    expect((batchCompleted?.payload as { results: { status: string }[] }).results).toHaveLength(3);
    expect(
      (batchCompleted?.payload as { results: { status: string }[] }).results.every(
        (result) => result.status === "completed",
      ),
    ).toBe(true);
  });

  it("respects DAG dependencies: dependent job runs only after dependency completes", async () => {
    const order: string[] = [];
    const a: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
      name: "mock.a",
      description: "a",
      inputSchema,
      outputSchema,
      permission: { scope: "file", risk: "low", requiresSandbox: false },
      async execute() {
        order.push("a");
        return { findings: ["a"] };
      },
    };
    const b: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
      name: "mock.b",
      description: "b",
      inputSchema,
      outputSchema,
      permission: { scope: "file", risk: "low", requiresSandbox: false },
      async execute() {
        order.push("b");
        return { findings: ["b"] };
      },
    };
    const registry = makeRegistry([a, b]);
    await collectEvents(
      executeSchedule({
        runId: "r",
        sessionId: "s",
        workspaceRoot: ".",
        toolRegistry: registry,
        permissionLevel: "read-only",
        jobs: [
          { id: "b", toolName: "mock.b", input: {}, dependsOn: ["a"] },
          { id: "a", toolName: "mock.a", input: {} },
        ],
        permissionRules: ALLOW_ALL,
        sleep: async () => undefined,
        emit: noopEmit,
      }),
    );
    expect(order).toEqual(["a", "b"]);
  });

  it("retries a transiently failing job then succeeds", async () => {
    const a = makeReadonlyTool("mock.a", "failOnce");
    const registry = makeRegistry([a]);
    const events = await collectEvents(
      executeSchedule({
        runId: "r",
        sessionId: "s",
        workspaceRoot: ".",
        toolRegistry: registry,
        permissionLevel: "read-only",
        jobs: [
          {
            id: "a",
            toolName: "mock.a",
            input: {},
            retryPolicy: { maxAttempts: 3, backoffMs: 1 },
          },
        ],
        permissionRules: ALLOW_ALL,
        sleep: async () => undefined,
        emit: noopEmit,
      }),
    );
    const retried = events.filter((event) => event.type === "scheduler.job.retried");
    expect(retried.length).toBeGreaterThanOrEqual(1);
    const completed = events.find((event) => event.type === "scheduler.batch.completed");
    const results = (completed?.payload as { results: { status: string; attempts: number }[] }).results;
    expect(results[0]?.status).toBe("completed");
    expect(results[0]?.attempts).toBe(2);
  });

  it("falls back to a fallback tool when the primary ultimately fails", async () => {
    const a = makeReadonlyTool("mock.a", "fail");
    const fallback = makeReadonlyTool("mock.fallback", "ok");
    const registry = makeRegistry([a, fallback]);
    const events = await collectEvents(
      executeSchedule({
        runId: "r",
        sessionId: "s",
        workspaceRoot: ".",
        toolRegistry: registry,
        permissionLevel: "read-only",
        jobs: [
          {
            id: "a",
            toolName: "mock.a",
            input: {},
            retryPolicy: { maxAttempts: 2, backoffMs: 1 },
            fallbackToolName: "mock.fallback",
            fallbackInput: {},
          },
        ],
        permissionRules: ALLOW_ALL,
        sleep: async () => undefined,
        emit: noopEmit,
      }),
    );
    const fallbackEvent = events.find((event) => event.type === "scheduler.job.fallback");
    expect(fallbackEvent).toBeDefined();
    const completed = events.find((event) => event.type === "scheduler.batch.completed");
    const payload = completed?.payload as {
      results: { status: string; degraded: boolean }[];
      residualRisks: { jobId: string }[];
      degraded: boolean;
    };
    expect(payload.results[0]?.status).toBe("completed");
    expect(payload.results[0]?.degraded).toBe(true);
    expect(payload.degraded).toBe(true);
    expect(payload.residualRisks).toHaveLength(1);
  });

  it("surfaces a residual risk when a job fails with no fallback", async () => {
    const a = makeReadonlyTool("mock.a", "fail");
    const registry = makeRegistry([a]);
    const events = await collectEvents(
      executeSchedule({
        runId: "r",
        sessionId: "s",
        workspaceRoot: ".",
        toolRegistry: registry,
        permissionLevel: "read-only",
        jobs: [
          {
            id: "a",
            toolName: "mock.a",
            input: {},
            retryPolicy: { maxAttempts: 2, backoffMs: 1 },
          },
        ],
        permissionRules: ALLOW_ALL,
        sleep: async () => undefined,
        emit: noopEmit,
      }),
    );
    const completed = events.find((event) => event.type === "scheduler.batch.completed");
    const payload = completed?.payload as {
      residualRisks: { reason: string }[];
    };
    expect(payload.residualRisks).toHaveLength(1);
    expect(payload.residualRisks[0]?.reason).toContain("failed");
  });
});
