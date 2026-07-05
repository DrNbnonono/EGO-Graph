import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import type { ChatMessage } from "@ego-graph/llm";
import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/agent-loop.js";
import type { AgentRunEvent } from "../src/index.js";

describe("agent loop", () => {
  it("routes chat through the bounded loop with read-only tools", async () => {
    // Chat used to short-circuit. It now enters the loop so the model can
    // answer "where is X?" by actually grepping the repo, but with a tight
    // tool budget and only read-only tools exposed to the planner.
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
    // Without a model provider the loop falls back to deterministic planning,
    // which for chat reaches the "enough evidence" stop branch after one step.
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["loop.step.started", "planner.decision", "loop.stopped"]),
    );
    expect(events.some((event) => event.type === "loop.stopped")).toBe(true);
  });

  it("exposes only read-only tools to the planner on chat intent", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-loop-chat-"));
    const capturedTools: unknown[] = [];
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    await collect(
      runAgentLoop({
        runId: "run-chat-tools",
        sessionId: "session",
        message: "README 里有什么",
        intent: "chat",
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
            return { content: "done", toolCalls: [] };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );
    const toolNames = capturedTools.map((tool) => (tool as { name?: string }).name ?? "");
    expect(toolNames).toContain("workspace.read");
    expect(toolNames).toContain("workspace.grep");
    // Write/shell/security tools must NOT be offered to chat.
    expect(toolNames).not.toContain("shell.readonly");
    expect(toolNames).not.toContain("security.package_manifest_audit");
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

  it("feeds native tool result history back into the next planner turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-loop-history-"));
    const capturedMessages: unknown[][] = [];
    await writeFile(join(root, "README.md"), "hello agent\n", "utf8");
    await collect(
      runAgentLoop({
        runId: "run-history",
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
            capturedMessages.push(input.messages);
            if (capturedMessages.length === 1) {
              return {
                content: "Use workspace.list",
                toolCalls: [{ id: "call-1", name: "workspace.list", arguments: { limit: 10 } }],
              };
            }
            return { content: "Enough context", toolCalls: [] };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    const secondTurn = JSON.stringify(capturedMessages[1] ?? []);
    expect(secondTurn).toContain('"type":"tool_use"');
    expect(secondTurn).toContain('"type":"tool_result"');
    expect(secondTurn).toContain("workspace.list");
  });

  it("seeds recalled history and persists each new turn via onMessage", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-loop-seed-"));
    await writeFile(join(root, "README.md"), "seeded\n", "utf8");
    const persisted: { role: string; content: unknown }[] = [];
    const firstTurn: ChatMessage = {
      role: "assistant",
      content: "Previous answer about README.",
    };

    await collect(
      runAgentLoop({
        runId: "run-seed",
        sessionId: "session",
        message: "再分析一次",
        intent: "project_analysis",
        workspaceRoot: root,
        permissionLevel: "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        seedMessages: [firstTurn],
        onMessage: (message) => persisted.push({ role: message.role, content: message.content }),
        modelProvider: {
          name: "fake",
          model: "fake",
          async complete() {
            return "";
          },
          async completeStructured() {
            return { content: "Final answer using prior turn.", toolCalls: [] };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    // The user turn and the final assistant answer must both be persisted.
    const roles = persisted.map((entry) => entry.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
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
