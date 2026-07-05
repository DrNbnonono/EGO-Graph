import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/agent-loop.js";
import type { AgentRunEvent } from "../src/index.js";

describe("agent loop", () => {
  it("keeps chat outside the autonomous tool loop", async () => {
    const events = await collect(
      runAgentLoop({
        runId: "run-chat",
        sessionId: "session",
        message: "你好",
        intent: "chat",
        workspaceRoot: process.cwd(),
        permissionLevel: "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );
    expect(events.map((event) => event.type)).toEqual(["loop.stopped"]);
  });

  it("runs bounded read-only context tools before code change approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-loop-"));
    await writeFile(join(root, "README.md"), "hello agent\n", "utf8");
    const events = await collect(
      runAgentLoop({
        runId: "run-code",
        sessionId: "session",
        message: "修改 README",
        intent: "code_change",
        workspaceRoot: root,
        permissionLevel: "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["planner.decision", "tool.completed", "loop.stopped"]),
    );
    expect(events.filter((event) => event.type === "tool.started").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(events.at(-1)?.message).toContain("Plan 审批");
  });

  it("passes real tool schema and policy metadata to structured model planners", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-loop-schema-"));
    const capturedTools: unknown[] = [];
    await writeFile(join(root, "README.md"), "hello agent\n", "utf8");
    await collect(
      runAgentLoop({
        runId: "run-schema",
        sessionId: "session",
        message: "分析 README",
        intent: "project_analysis",
        workspaceRoot: root,
        permissionLevel: "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        modelProvider: {
          name: "fake",
          model: "fake",
          async complete() {
            return "";
          },
          async completeStructured(input) {
            capturedTools.push(...(input.tools ?? []));
            return {
              content: "Use workspace.list",
              toolCalls: [{ id: "call-1", name: "workspace.list", arguments: { limit: 10 } }],
            };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    const rendered = JSON.stringify(capturedTools);
    expect(rendered).toContain("properties");
    expect(rendered).toContain("permission=read-only");
    expect(rendered).toContain("approval=false");
  });
});

async function collect(iterable: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

async function emitEvent(event: Omit<AgentRunEvent, "timestamp">): Promise<AgentRunEvent> {
  return { ...event, timestamp: new Date().toISOString() };
}

async function emitEvidence(input: {
  runId: string;
  sessionId: string;
  toolName: string;
  candidate: { summary: string; raw?: unknown };
}): Promise<AgentRunEvent> {
  return {
    type: "evidence.created",
    runId: input.runId,
    sessionId: input.sessionId,
    timestamp: new Date().toISOString(),
    message: input.candidate.summary,
    payload: { tool: input.toolName, raw: input.candidate.raw },
  };
}
