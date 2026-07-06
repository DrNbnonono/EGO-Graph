import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import type { ChatMessage } from "@ego-graph/llm";
import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/agent-loop.js";
import { createEditTool } from "../src/edit-tool.js";
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

  it("lets the model propose a patch via the workspace.edit tool inside the loop", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-loop-edit-"));
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const registry = createTerminalAgentToolRegistry();
    // The edit tool is normally registered by the session; mirror that here.
    registry.register(createEditTool());

    const events = await collect(
      runAgentLoop({
        runId: "run-edit",
        sessionId: "session",
        message: "在 README 末尾加一行",
        intent: "code_change",
        workspaceRoot: root,
        permissionLevel: "read-only",
        toolRegistry: registry,
        modelProvider: {
          name: "fake",
          model: "fake",
          async complete() {
            return "";
          },
          async completeStructured() {
            return {
              content: "I will edit README.",
              toolCalls: [
                {
                  id: "call-edit-1",
                  name: "workspace.edit",
                  arguments: {
                    goal: "append line",
                    operations: [
                      {
                        type: "insert_after",
                        path: "README.md",
                        anchorText: "hello\n",
                        content: "added\n",
                      },
                    ],
                  },
                },
              ],
            };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    // The edit tool must produce a patch.proposed event carrying the diff.
    const proposed = events.find((event) => event.type === "patch.proposed");
    expect(proposed).toBeTruthy();
    expect(String(proposed?.payload.diff)).toContain("added");
    // And the workspace must NOT have been written (approval gate).
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");
  });

  it("uses streamStructured when available and emits assistant.delta for text chunks", async () => {
    const chunks = ["Hel", "lo ", "world"];
    const events = await collect(
      runAgentLoop({
        runId: "run-stream",
        sessionId: "session",
        message: "你好",
        intent: "chat",
        workspaceRoot: process.cwd(),
        permissionLevel: "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        modelProvider: {
          name: "fake",
          model: "fake",
          async complete() {
            return "";
          },
          async completeStructured() {
            throw new Error("completeStructured should not be called when streamStructured exists");
          },
          async *streamStructured() {
            let full = "";
            for (const chunk of chunks) {
              full += chunk;
              yield { type: "text" as const, content: chunk };
            }
            yield { type: "done" as const, content: full, toolCalls: [] };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    const deltas = events.filter((event) => event.type === "assistant.delta");
    expect(deltas.map((event) => event.message)).toEqual(chunks);
    expect(events.some((event) => event.type === "loop.stopped")).toBe(true);
  });

  it("folds pollBtw messages into the model context as new user turns", async () => {
    const btwQueue = ["顺便，只关注 README"];
    const capturedMessages: unknown[][] = [];
    const events = await collect(
      runAgentLoop({
        runId: "run-btw",
        sessionId: "session",
        message: "分析项目",
        intent: "project_analysis",
        workspaceRoot: process.cwd(),
        permissionLevel: "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        pollBtw: () => {
          const drained = [...btwQueue];
          btwQueue.length = 0;
          return drained;
        },
        modelProvider: {
          name: "fake",
          model: "fake",
          async complete() {
            return "";
          },
          async completeStructured(input) {
            capturedMessages.push(input.messages);
            return { content: "done", toolCalls: [] };
          },
        },
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );

    expect(events.some((event) => event.type === "user.btw")).toBe(true);
    const firstTurnJson = JSON.stringify(capturedMessages[0] ?? []);
    expect(firstTurnJson).toContain("只关注 README");
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
