import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTerminalAgentSession, type AgentRunEvent } from "../src/index.js";

const fakeProvider = (content: string) => ({
  name: "fake",
  model: "fake-model",
  async complete(): Promise<string> {
    return content;
  },
});

const queuedProvider = (contents: string[]) => {
  const queue = [...contents];
  return {
    name: "fake",
    model: "fake-model",
    async complete(): Promise<string> {
      return queue.shift() ?? contents.at(-1) ?? "{}";
    },
  };
};

async function collect(iterable: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

describe("terminal agent session", () => {
  it("answers normal chat turns without forcing plan approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-chat-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      modelProvider: fakeProvider(
        "你好，我是 EGO-Graph 终端 Agent，可以先对话再决定是否需要工具。",
      ),
    });

    const events = await collect(session.submitMessage("你好"));

    expect(events.map((event) => event.type)).toContain("assistant.message");
    expect(events.map((event) => event.type)).not.toContain("plan.proposed");
    expect(events.at(-1)?.message).toContain("你好");
    expect(session.getRunState(events[0]!.runId)?.status).toBe("answered");
  });

  it("answers project analysis with workspace context before any patch flow", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-project-analysis-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    const calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello lotus\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      modelProvider: {
        name: "fake",
        model: "fake-model",
        async complete(input: { messages: Array<{ role: string; content: string }> }) {
          calls.push({ messages: input.messages });
          return "这个项目包含 CLI、Web 和 Agent 包，当前应先改善 TUI 对话体验。";
        },
      },
    });

    const events = await collect(session.submitMessage("帮我分析这个项目的结构"));

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["context.loaded", "assistant.message"]),
    );
    expect(events.map((event) => event.type)).not.toContain("plan.proposed");
    expect(events.at(-1)?.message).toContain("项目");
    expect(calls[0]?.messages[0]?.content).toContain("EGO-Graph");
  });

  it("routes code modification requests to an approvable plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-code-intent-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello lotus\n", "utf8");
    const session = createTerminalAgentSession({ workspaceRoot: root, egoHome });

    const events = await collect(session.submitMessage("帮我修改 README"));

    expect(events.map((event) => event.type)).toContain("plan.proposed");
    expect(session.getRunState(events[0]!.runId)?.status).toBe("plan_pending");
  });

  it("hides evidence-gap planner schema details from the main event message", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-planner-fallback-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      modelProvider: fakeProvider(JSON.stringify({})),
    });

    const events = await collect(session.startTask("更新 README"));
    const modelFailed = events.find((event) => event.type === "model.failed");

    expect(modelFailed?.message).toBe("模型计划生成失败，已切换到本地 fallback plan。");
    expect(modelFailed?.message).not.toContain("expected");
    expect(modelFailed?.payload.debug).toContain("expected");
    expect(events.map((event) => event.type)).toContain("planner.fallback");
  });

  it("streams context, tools, evidence, reflection, and a pending plan in read-only mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-readonly-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello lotus\n", "utf8");
    const session = createTerminalAgentSession({ workspaceRoot: root, egoHome });

    const events = await collect(session.startTask("阅读 README 并提出计划"));

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "run.started",
        "context.loaded",
        "tool.started",
        "tool.completed",
        "evidence.created",
        "reflection.created",
        "plan.proposed",
      ]),
    );
    const state = session.getRunState(events[0]!.runId);
    expect(state?.status).toBe("plan_pending");
    expect(state?.plan?.[0]?.knownEvidence.length).toBeGreaterThan(0);
  });

  it("blocks plan approval without workspace-write permission", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-block-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({ workspaceRoot: root, egoHome });
    const started = await collect(session.startTask("把 README hello 改成 lotus"));

    const approved = await collect(session.approvePlan(started[0]!.runId));

    expect(approved.at(-1)?.type).toBe("run.blocked");
    expect(approved.at(-1)?.message).toContain("workspace-write");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");
  });

  it("generates a diff after plan approval and applies it only after patch approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-patch-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update readme",
            operations: [
              {
                type: "replace_text",
                path: "README.md",
                oldText: "hello",
                newText: "lotus",
              },
            ],
          },
        }),
      ),
      checkCommands: [{ name: "node-version", command: "node", args: ["--version"] }],
    });
    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;

    const planned = await collect(session.approvePlan(runId));
    expect(planned.at(-1)?.type).toBe("patch.proposed");
    expect(session.getRunState(runId)?.diff).toContain("+lotus");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");

    const applied = await collect(session.approvePatch(runId));
    expect(applied.map((event) => event.type)).toContain("check.completed");
    expect(applied.at(-1)?.type).toBe("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });

  it("uses a model-backed evidence-gap planner when a provider is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-model-plan-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      modelProvider: fakeProvider(
        JSON.stringify({
          plan: [
            {
              id: "model-context",
              title: "模型生成上下文计划",
              knownEvidence: ["README exists"],
              missingEvidence: ["Need exact requested change"],
              toolChoiceRationale: "Use workspace.read before proposing edits",
              expectedResult: "Relevant context is available",
              stopCondition: "Context is sufficient",
              riskNote: "Read-only",
            },
            {
              id: "model-patch",
              title: "模型生成 Patch 计划",
              knownEvidence: ["Context is available"],
              missingEvidence: ["Need approval"],
              toolChoiceRationale: "Use WorkspaceEditPlan after approval",
              expectedResult: "Diff preview",
              stopCondition: "Patch approved or rejected",
              riskNote: "Requires workspace-write",
            },
          ],
        }),
      ),
    });

    const events = await collect(session.startTask("更新 README"));

    expect(events.map((event) => event.type)).toContain("planner.model.used");
    expect(session.getRunState(events[0]!.runId)?.plan?.[0]?.title).toBe("模型生成上下文计划");
  });

  it("blocks local security research tools until security-active is granted", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-security-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"dependencies":{"floating":"*"}}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const blocked = createTerminalAgentSession({ workspaceRoot: root, egoHome });
    const blockedEvents = await collect(blocked.startTask("做一次依赖漏洞审计"));

    expect(blockedEvents.some((event) => event.type === "tool.blocked")).toBe(true);

    const allowed = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "security-active",
    });
    const allowedEvents = await collect(allowed.startTask("做一次依赖漏洞审计"));

    expect(
      allowedEvents.some(
        (event) =>
          event.type === "tool.completed" &&
          typeof event.payload.tool === "string" &&
          event.payload.tool === "security.package_manifest_audit",
      ),
    ).toBe(true);
  });

  it("proposes a repair patch when checks fail after apply", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-repair-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: queuedProvider([
        JSON.stringify({
          plan: [
            {
              id: "context",
              title: "Read README",
              knownEvidence: ["README exists"],
              missingEvidence: ["Requested edit"],
              toolChoiceRationale: "Use workspace.read",
              expectedResult: "Context",
              stopCondition: "Ready",
              riskNote: "Read-only",
            },
            {
              id: "patch",
              title: "Patch README",
              knownEvidence: ["README has hello"],
              missingEvidence: ["Approval"],
              toolChoiceRationale: "Use WorkspaceEditPlan",
              expectedResult: "Diff",
              stopCondition: "Approved",
              riskNote: "Workspace write",
            },
          ],
        }),
        JSON.stringify({
          rationale: "Initial requested edit.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
        JSON.stringify({
          rationale: "Repair failed check with a clearer README value.",
          editPlan: {
            goal: "repair readme",
            operations: [
              {
                type: "replace_text",
                path: "README.md",
                oldText: "lotus",
                newText: "lotus fixed",
              },
            ],
          },
        }),
      ]),
      checkCommands: [
        {
          name: "forced-fail",
          command: "node",
          args: ["-e", "console.error('broken check'); process.exit(1)"],
        },
      ],
    });
    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    await collect(session.approvePlan(runId));

    const events = await collect(session.approvePatch(runId));

    expect(events.map((event) => event.type)).toContain("repair.proposed");
    expect(session.getRunState(runId)?.status).toBe("patch_pending");
    expect(session.getRunState(runId)?.repairAttempts).toBe(1);
    expect(session.getRunState(runId)?.diff).toContain("+lotus fixed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });

  it("recalls, compacts, archives, and forgets memory through the harness", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-agent-memory-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-terminal-agent-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    const session = createTerminalAgentSession({ workspaceRoot: root, egoHome });
    const completed = await collect(session.submitMessage("你好"));
    const runId = completed[0]!.runId;
    await session.replayRun(runId);

    const compacted = await session.compactMemory();
    expect(compacted[0]?.type).toBe("memory.compacted");

    const recalled = await session.recallMemory("fixture");
    expect(recalled[0]?.type).toBe("memory.recalled");
  });

  it("hydrates pending patch state from SQLite after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-harness-hydrate-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-agent-harness-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const first = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "workspace-write",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
      ),
    });
    const started = await collect(first.startTask("把 README hello 改成 lotus"));
    const runId = started[0]!.runId;
    await collect(first.approvePlan(runId));

    const restarted = createTerminalAgentSession({ workspaceRoot: root, egoHome });
    const hydrated = await restarted.hydratePendingRuns();

    expect(hydrated.map((run) => run.runId)).toContain(runId);
    expect(restarted.getRunState(runId)?.status).toBe("patch_pending");
    expect(restarted.getRunState(runId)?.diff).toContain("+lotus");
  });

  it("discovers and executes approved stdio MCP tool calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-harness-mcp-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-agent-harness-home-"));
    const serverPath = join(root, "mcp-server.mjs");
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(
      serverPath,
      `
let buffer = Buffer.alloc(0);
function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(Buffer.concat([Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"), body]));
}
function handle(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } } });
  } else if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", description: "Echo input", inputSchema: { type: "object" } }] } });
  } else if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "echo:" + message.params.arguments.value }] } });
  }
}
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const separator = buffer.indexOf(Buffer.from("\\r\\n\\r\\n"));
    if (separator < 0) break;
    const header = buffer.subarray(0, separator).toString("utf8");
    const length = Number(/Content-Length: (\\d+)/i.exec(header)?.[1] ?? 0);
    const bodyStart = separator + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
    buffer = buffer.subarray(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`,
      "utf8",
    );
    await writeFile(
      join(root, "ego.config.json"),
      JSON.stringify({
        mcpServers: {
          fixture: { command: process.execPath, args: [serverPath], enabled: true },
        },
      }),
      "utf8",
    );
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "security-active",
    });

    const discovered = await session.discoverMcpTools();
    const called = await collect(session.callMcpTool("mcp.fixture.echo", { value: "ok" }));

    expect(discovered[0]?.message).toContain("1 MCP tool");
    expect(called.map((event) => event.type)).toContain("tool.completed");
    expect(JSON.stringify(called.map((event) => event.payload))).toContain("echo:ok");
  });
});
