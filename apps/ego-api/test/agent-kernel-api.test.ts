import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

const fakeProvider = (content: string) => ({
  name: "fake",
  model: "fake-model",
  async complete(): Promise<string> {
    return content;
  },
});

describe("agent kernel API", () => {
  it("drafts an approvable plan before creating a patch", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-plan-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-plan-home-"));
    await writeFile(
      join(workspaceRoot, "package.json"),
      '{"name":"plan-fixture","packageManager":"pnpm@11.7.0","scripts":{"typecheck":"node --version"}}',
      "utf8",
    );
    await writeFile(join(workspaceRoot, "README.md"), "hello plan\n", "utf8");
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update readme after approved plan",
            operations: [
              {
                type: "replace_text",
                path: "README.md",
                oldText: "hello plan",
                newText: "lotus plan",
              },
            ],
          },
        }),
      ),
    });

    const draftResponse = await app.request("/agent/plans", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "session-plan-1",
        mode: "coding",
        message: "Change README hello plan to lotus plan",
      }),
      headers: { "content-type": "application/json" },
    });
    const draft = await draftResponse.json();

    expect(draftResponse.status).toBe(200);
    expect(draft.status).toBe("draft_plan");
    expect(draft.planId).toMatch(/^plan-/);
    expect(draft.contextSummary).toContain("Goal:");
    expect(draft.memoryHits).toEqual([]);
    expect(await readFile(join(workspaceRoot, "README.md"), "utf8")).toBe("hello plan\n");

    const approveResponse = await app.request(`/agent/plans/${draft.planId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const approved = await approveResponse.json();
    const timeline = await app
      .request("/api/hermes/timeline?sessionId=session-plan-1")
      .then((response) => response.json());
    const workbench = await app.request("/api/workbench").then((response) => response.json());

    expect(approveResponse.status).toBe(200);
    expect(approved.status).toBe("pending_approval");
    expect(approved.diff).toContain("+lotus plan");
    expect(timeline.events.map((event: { type: string }) => event.type)).toContain("plan.updated");
    expect(workbench.workbench.plans.draftCount).toBe(0);
    expect(workbench.workbench.pendingEdits[0].runId).toBe(approved.runId);
    expect(await readFile(join(workspaceRoot, "README.md"), "utf8")).toBe("hello plan\n");

    const repeatedApproveResponse = await app.request(`/agent/plans/${draft.planId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const repeatedApprove = await repeatedApproveResponse.json();

    expect(repeatedApproveResponse.status).toBe(409);
    expect(repeatedApprove.error).toContain("not draft");
  });

  it("exposes memory, skills, MCP tools, and search state APIs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-kernel-state-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-kernel-state-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"state-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Remember MiniMax M3 preference" }),
      headers: { "content-type": "application/json" },
    });

    const memory = await app.request("/api/memory").then((response) => response.json());
    const skills = await app.request("/api/skills").then((response) => response.json());
    const mcpTools = await app.request("/api/mcp/tools").then((response) => response.json());

    expect(memory.memories[0]?.scope).toBe("session");
    expect(skills.skills.map((skill: { name: string }) => skill.name)).toContain("web-search");
    expect(mcpTools.mcp.status).toBe("not_configured");
    expect(mcpTools.tools).toEqual([]);
  });

  it("rejects unsupported plan modes with a client error", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-invalid-plan-mode-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-invalid-plan-mode-home-"));
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const response = await app.request("/agent/plans", {
      method: "POST",
      body: JSON.stringify({ message: "plan something", mode: "shell" }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("mode");
  });

  it("does not persist sensitive chat content into memory", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-sensitive-chat-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-sensitive-chat-home-"));
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "temporary key sk-cp-1234567890abcdef1234567890abcdef" }),
      headers: { "content-type": "application/json" },
    });

    const memory = await app.request("/api/memory").then((response) => response.json());

    expect(memory.memories).toEqual([]);
  });

  it("lists real tools from configured stdio MCP servers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-mcp-api-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-mcp-api-home-"));
    const serverPath = join(workspaceRoot, "mcp-server.mjs");
    await writeFile(
      serverPath,
      `
let buffer = Buffer.alloc(0);
function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(Buffer.concat([
    Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"),
    body,
  ]));
}
function handle(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "api-fixture", version: "0.1.0" } } });
  } else if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "lookup", description: "Lookup evidence", inputSchema: { type: "object" } }] } });
  }
}
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const separator = buffer.indexOf(Buffer.from("\\r\\n\\r\\n"));
    if (separator < 0) break;
    const header = buffer.subarray(0, separator).toString("utf8");
    const match = /Content-Length: (\\d+)/i.exec(header);
    const length = Number(match?.[1] ?? 0);
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
      join(workspaceRoot, "ego.config.json"),
      JSON.stringify({
        mcpServers: {
          fixture: {
            command: process.execPath,
            args: [serverPath],
          },
        },
      }),
      "utf8",
    );
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const response = await app.request("/api/mcp/tools");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tools.map((tool: { name: string }) => tool.name)).toContain("mcp.fixture.lookup");
  });
});
