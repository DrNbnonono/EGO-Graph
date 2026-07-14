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
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: {
        name: "fake",
        model: "fake-model",
        async complete(): Promise<string> {
          return "git status 已检查";
        },
      },
    });
    const projects = await app.request("/api/projects").then((response) => response.json());
    const created = await app
      .request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ projectId: projects.activeProject.id, title: "权限测试" }),
        headers: { "content-type": "application/json" },
      })
      .then((response) => response.json());
    await app.request(`/api/sessions/${created.session.id}/policy`, {
      method: "PATCH",
      body: JSON.stringify({ preset: "security-active" }),
      headers: { "content-type": "application/json" },
    });

    const response = await app.request("/agent/harness/runs/stream", {
      method: "POST",
      body: JSON.stringify({
        sessionId: created.session.id,
        message: "跑 git status 看看当前仓库状态",
        mode: "chat",
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
    const projects = await app.request("/api/projects").then((response) => response.json());
    const created = await app
      .request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ projectId: projects.activeProject.id, title: "终端测试" }),
        headers: { "content-type": "application/json" },
      })
      .then((response) => response.json());
    await app.request(`/api/sessions/${created.session.id}/policy`, {
      method: "PATCH",
      body: JSON.stringify({ preset: "shell-readonly" }),
      headers: { "content-type": "application/json" },
    });

    const response = await app.request("/api/tool-calls", {
      method: "POST",
      body: JSON.stringify({
        sessionId: created.session.id,
        tool: "shell.readonly",
        input: { program: "pwd", args: [] },
      }),
      headers: { "content-type": "application/json" },
    });
    const pending = await response.json();
    const approvedResponse = await app.request(`/api/tool-calls/${pending.call.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ savePermission: false }),
      headers: { "content-type": "application/json" },
    });
    const approved = await approvedResponse.json();

    expect(response.status).toBe(202);
    expect(pending.status).toBe("blocked");
    expect(approvedResponse.status).toBe(200);
    expect(approved.status).toBe("completed");
    expect(approved.result.event.type).toBe("tool.completed");
    expect(approved.result.output.exitCode).toBe(0);
  });

  it("builds a sanitized repro bundle from stored run replay events", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-repro-bundle-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-repro-bundle-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"repro-fixture"}', "utf8");
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: {
        name: "fake",
        model: "fake-model",
        async complete(): Promise<string> {
          return "已完成只读态势总结";
        },
      },
    });

    const runResponse = await app.request("/agent/harness/runs", {
      method: "POST",
      body: JSON.stringify({ message: "总结当前项目安全状态" }),
      headers: { "content-type": "application/json" },
    });
    const runPayload = await runResponse.json();
    const response = await app.request(`/api/runs/${runPayload.runId}/repro-bundle`);
    const text = await response.text();
    const payload = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.bundle.runId).toBe(runPayload.runId);
    expect(payload.bundle.evidenceGraph).toBeDefined();
    expect(payload.bundle.decisionTrace).toBeDefined();
    expect(payload.bundle.toolInvocations).toBeDefined();
    expect(payload.bundle.approvals).toBeDefined();
    expect(payload.bundle.residualRisks).toBeDefined();
    expect(text).not.toMatch(/apiKey|Bearer\s+\S+|cookie|capability/i);
  });

  it("returns a 404 for missing repro bundle runs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-repro-missing-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-repro-missing-home-"));
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const response = await app.request("/api/runs/missing-run/repro-bundle");
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.ok).toBe(false);
  });

  it("summarizes eval artifacts without requiring generated files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-eval-artifacts-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-eval-artifacts-home-"));
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const response = await app.request("/api/eval-artifacts");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.artifacts).toHaveProperty("contract");
    expect(payload.artifacts).toHaveProperty("model");
  });
});
