import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

function recordingProvider(
  content: string,
  calls: Array<{ messages: Array<{ role: string; content: string }> }>,
) {
  return {
    name: "fake",
    model: "fake-model",
    async complete(input: { messages: Array<{ role: string; content: string }> }): Promise<string> {
      calls.push({ messages: input.messages });
      return content;
    },
  };
}

describe("productized workbench API", () => {
  it("streams chat events as NDJSON without changing the read-only chat contract", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-chat-stream-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-chat-stream-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"chat-stream"}', "utf8");
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: {
        name: "fake",
        model: "fake-model",
        async complete() {
          return "流式最终回答";
        },
      },
    });

    const response = await app.request("/chat/stream", {
      method: "POST",
      body: JSON.stringify({ message: "展示当前状态", sessionId: "stream-session" }),
      headers: { "content-type": "application/json" },
    });
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(lines.map((line) => line.type)).toEqual([
      "agent.event",
      "agent.event",
      "model.delta",
      "assistant.final",
    ]);
    expect(lines.at(-1).message).toContain("流式最终回答");
  });

  it("manages model profiles through API endpoints", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-model-profiles-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-model-profiles-home-"));
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const createResponse = await app.request("/api/config/models", {
      method: "POST",
      body: JSON.stringify({
        id: "minimax-main",
        name: "MiniMax 主力",
        config: { provider: "minimax", apiKey: "mini-secret", model: "MiniMax-M3" },
      }),
      headers: { "content-type": "application/json" },
    });
    await app.request("/api/config/models/minimax-main/select", { method: "POST" });
    const list = await app.request("/api/config/models").then((response) => response.json());
    const config = JSON.parse(
      await readFile(join(workspaceRoot, ".ego", "config.json"), "utf8"),
    ) as {
      activeModelProfileId: string;
    };

    expect(createResponse.status).toBe(200);
    expect(list.activeProfile.id).toBe("minimax-main");
    expect(list.activeProfile.config.apiKey).toBeUndefined();
    expect(list.activeProfile.apiKeyConfigured).toBe(true);
    expect(config.activeModelProfileId).toBe("minimax-main");
  });

  it("saves system prompt and injects it into assistant chat", async () => {
    const calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-system-prompt-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-system-prompt-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"prompt-fixture"}', "utf8");
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: recordingProvider("prompt ok", calls),
    });

    const saveResponse = await app.request("/api/config/system-prompt", {
      method: "PUT",
      body: JSON.stringify({ content: "项目提示：回答时提到 Hermes timeline。" }),
      headers: { "content-type": "application/json" },
    });
    const prompt = await app
      .request("/api/config/system-prompt")
      .then((response) => response.json());
    await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "状态如何" }),
      headers: { "content-type": "application/json" },
    });

    expect(saveResponse.status).toBe(200);
    expect(prompt.projectPrompt).toContain("Hermes timeline");
    expect(calls[0]?.messages[0]?.content).toContain("Hermes timeline");
  });

  it("returns slash commands and executes read-only UI actions", async () => {
    const app = createServer({ modelProvider: null });

    const commands = await app.request("/api/commands").then((response) => response.json());
    const executeResponse = await app.request("/api/commands/execute", {
      method: "POST",
      body: JSON.stringify({ command: "/skills" }),
      headers: { "content-type": "application/json" },
    });
    const executed = await executeResponse.json();
    const invalidResponse = await app.request("/api/commands/execute", {
      method: "POST",
      body: JSON.stringify({ command: "/does-not-exist" }),
      headers: { "content-type": "application/json" },
    });

    expect(commands.commands.map((command: { name: string }) => command.name)).toContain("/model");
    expect(executeResponse.status).toBe(200);
    expect(executed.uiAction).toBe("open-skills");
    expect(invalidResponse.status).toBe(400);
  });

  it("manages and tests stdio MCP servers without leaking secrets", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-mcp-servers-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-mcp-servers-home-"));
    const serverPath = join(workspaceRoot, "mcp-server.mjs");
    await writeFile(serverPath, fakeMcpServerSource(), "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const createResponse = await app.request("/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify({
        name: "fixture",
        command: process.execPath,
        args: [serverPath],
        env: { SECRET_TOKEN: "hidden-value" },
      }),
      headers: { "content-type": "application/json" },
    });
    const servers = await app.request("/api/mcp/servers").then((response) => response.json());
    const test = await app
      .request("/api/mcp/servers/fixture/test", { method: "POST" })
      .then((response) => response.json());
    const file = await readFile(join(workspaceRoot, ".ego", "config.json"), "utf8");

    expect(createResponse.status).toBe(200);
    expect(JSON.stringify(servers)).not.toContain("hidden-value");
    expect(test.tools.map((tool: { name: string }) => tool.name)).toContain("lookup");
    expect(file).toContain("hidden-value");
  });

  it("persists local skill registrations through API endpoints", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-skills-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-skills-home-"));
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const createResponse = await app.request("/api/skills", {
      method: "POST",
      body: JSON.stringify({
        name: "report-writer",
        version: "0.1.0",
        description: "Write structured security reports.",
        capabilities: ["report.write", "markdown.render"],
        tools: [],
        permissions: ["file:write"],
        entry: "local:report-writer",
        enabled: true,
      }),
      headers: { "content-type": "application/json" },
    });
    const skills = await app.request("/api/skills").then((response) => response.json());
    const workbench = await app.request("/api/workbench").then((response) => response.json());
    const file = await readFile(join(workspaceRoot, ".ego", "config.json"), "utf8");

    expect(createResponse.status).toBe(200);
    expect(skills.skills.map((skill: { name: string }) => skill.name)).toContain("report-writer");
    expect(workbench.workbench.skills.map((skill: { name: string }) => skill.name)).toContain(
      "report-writer",
    );
    expect(file).toContain("report-writer");

    const deleteResponse = await app.request("/api/skills/report-writer", { method: "DELETE" });
    const afterDelete = await app.request("/api/skills").then((response) => response.json());
    expect(deleteResponse.status).toBe(200);
    expect(afterDelete.skills.map((skill: { name: string }) => skill.name)).not.toContain(
      "report-writer",
    );
  });
});

function fakeMcpServerSource(): string {
  return `
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
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "0.1.0" } } });
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
`;
}
