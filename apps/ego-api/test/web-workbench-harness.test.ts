import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

describe("web workbench harness integration", () => {
  it("streams harness events with the requested session and permission level", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-web-harness-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-web-harness-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"harness-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });
    const projects = await app.request("/api/projects").then((response) => response.json());
    const created = await app
      .request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ projectId: projects.activeProject.id, title: "权限测试" }),
        headers: { "content-type": "application/json" },
      })
      .then((response) => response.json());

    const response = await app.request("/agent/harness/runs/stream", {
      method: "POST",
      body: JSON.stringify({
        sessionId: created.session.id,
        message: "跑 git status 看看当前仓库状态",
        mode: "chat",
        permissionLevel: "security-active",
      }),
      headers: { "content-type": "application/json" },
    });
    const text = await response.text();
    const messages = await app
      .request(`/api/sessions/${created.session.id}/messages`)
      .then((result) => result.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(text).toContain('"type":"agent.event"');
    expect(text).toContain('"permissionLevel":"security-active"');
    expect(messages.messages.map((message: { role: string }) => message.role)).toContain("user");
    expect(messages.messages.map((message: { role: string }) => message.role)).toContain(
      "assistant",
    );
  });

  it("runs terminal commands from the active project directory", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-web-terminal-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-web-terminal-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"terminal-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const response = await app.request("/api/terminal/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "node --version",
        cwd: workspaceRoot,
        permissionLevel: "security-active",
      }),
      headers: { "content-type": "application/json" },
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(text).toContain('"type":"terminal.started"');
    expect(text).toContain('"type":"terminal.completed"');
    expect(text).toContain('"exitCode":0');
  });
});
