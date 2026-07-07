import { mkdtemp, writeFile } from "node:fs/promises";
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

describe("project scoped web sessions", () => {
  it("creates, reads, clears, and deletes shared server-side sessions", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-web-session-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-web-session-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"session-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const projects = await app.request("/api/projects").then((response) => response.json());
    const createResponse = await app.request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ projectId: projects.activeProject.id, title: "安全评估" }),
      headers: { "content-type": "application/json" },
    });
    const created = await createResponse.json();

    await app.request(`/api/sessions/${created.session.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ role: "user", content: "你好" }),
      headers: { "content-type": "application/json" },
    });
    await app.request(`/api/sessions/${created.session.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ role: "assistant", content: "收到" }),
      headers: { "content-type": "application/json" },
    });

    const list = await app
      .request(`/api/sessions?projectId=${encodeURIComponent(projects.activeProject.id)}`)
      .then((response) => response.json());
    const messages = await app
      .request(`/api/sessions/${created.session.id}/messages`)
      .then((response) => response.json());

    expect(createResponse.status).toBe(200);
    expect(list.sessions.map((session: { id: string }) => session.id)).toContain(created.session.id);
    expect(messages.messages.map((message: { content: string }) => message.content)).toEqual([
      "你好",
      "收到",
    ]);

    await app.request(`/api/sessions/${created.session.id}/clear`, { method: "POST" });
    const cleared = await app
      .request(`/api/sessions/${created.session.id}/messages`)
      .then((response) => response.json());
    expect(cleared.messages).toEqual([]);

    const deleteResponse = await app.request(`/api/sessions/${created.session.id}`, {
      method: "DELETE",
    });
    const afterDelete = await app
      .request(`/api/sessions?projectId=${encodeURIComponent(projects.activeProject.id)}`)
      .then((response) => response.json());

    expect(deleteResponse.status).toBe(200);
    expect(afterDelete.sessions.map((session: { id: string }) => session.id)).not.toContain(
      created.session.id,
    );
  });

  it("persists chat turns into the requested session", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-web-chat-session-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-web-chat-session-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"chat-session-fixture"}', "utf8");
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: fakeProvider("模型回复"),
    });
    const projects = await app.request("/api/projects").then((response) => response.json());
    const created = await app
      .request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ projectId: projects.activeProject.id, title: "跨浏览器会话" }),
        headers: { "content-type": "application/json" },
      })
      .then((response) => response.json());

    await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: created.session.id, message: "项目状态？" }),
      headers: { "content-type": "application/json" },
    });
    const messages = await app
      .request(`/api/sessions/${created.session.id}/messages`)
      .then((response) => response.json());

    expect(messages.messages.map((message: { role: string; content: string }) => ({
      role: message.role,
      content: message.content,
    }))).toEqual([
      { role: "user", content: "项目状态？" },
      { role: "assistant", content: "模型回复" },
    ]);
  });
});
