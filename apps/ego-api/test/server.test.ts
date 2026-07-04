import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";

const fakeProvider = (content: string) => ({
  name: "fake",
  model: "fake-model",
  async complete(): Promise<string> {
    return content;
  },
});

describe("ego api server", () => {
  it("responds to health checks", async () => {
    const app = createServer();
    const response = await app.request("/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, service: "ego-api" });
  });

  it("serves the visual dashboard and project status API", async () => {
    const app = createServer();
    const dashboardResponse = await app.request("/");
    const cssResponse = await app.request("/assets/dashboard.css");
    const jsResponse = await app.request("/assets/dashboard.js");
    const logoResponse = await app.request("/assets/brand/ego-lotus.png");
    const faviconResponse = await app.request("/favicon.ico");
    const statusResponse = await app.request("/api/status");
    const workbenchResponse = await app.request("/api/workbench");
    const html = await dashboardResponse.text();
    const css = await cssResponse.text();
    const js = await jsResponse.text();
    const status = await statusResponse.json();
    const workbench = await workbenchResponse.json();

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("EGO-Graph 可视化驾驶舱");
    expect(html).toContain("对话控制台");
    expect(html).toContain("模型设置");
    expect(html).toContain("项目进展");
    expect(html).toContain('id="mission-chat"');
    expect(html).toContain("/assets/brand/ego-lotus.png");
    expect(html).toContain('rel="icon"');
    expect(cssResponse.headers.get("content-type")).toContain("text/css");
    expect(css).toContain(".lotus-mark");
    expect(js).toContain("submitMission");
    expect(js).toContain("/agent/runs");
    expect(js).toContain("/chat");
    expect(js).toContain("/approve");
    expect(js).toContain("/api/config/model");
    expect(js).toContain("/api/config/model/test");
    expect(js).toContain("renderDiffPreview");
    expect(js).toContain("setInterval");
    expect(logoResponse.status).toBe(200);
    expect(logoResponse.headers.get("content-type")).toContain("image/png");
    expect(faviconResponse.status).toBe(200);
    expect(status).toMatchObject({
      ok: true,
      product: "EGO-Graph",
    });
    expect(status.model.provider).toBeDefined();
    expect(status.mcp.status).toBe("not_configured");
    expect(workbench).toMatchObject({
      ok: true,
      workbench: {
        product: "EGO-Graph",
        title: "紫莲花 Agent Workbench",
      },
    });
    expect(workbench.workbench.quickCommands).toContain("/scan");
  });

  it("persists model settings through the config API", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-model-config-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-model-config-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"model-config-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome });

    const beforeResponse = await app.request("/api/config/model");
    const before = await beforeResponse.json();
    const saveResponse = await app.request("/api/config/model", {
      method: "POST",
      body: JSON.stringify({
        provider: "openai-compatible",
        baseUrl: "https://gateway.example.test",
        apiKey: "local-secret-key",
        model: "lotus-test-model",
      }),
      headers: { "content-type": "application/json" },
    });
    const saved = await saveResponse.json();
    const workbench = await app.request("/api/workbench").then((result) => result.json());
    const configFile = JSON.parse(
      await readFile(join(workspaceRoot, ".ego", "config.json"), "utf8"),
    ) as { model: { apiKey: string; model: string } };

    expect(before.model.source).toBe("none");
    expect(saveResponse.status).toBe(200);
    expect(saved.model.source).toBe("workspace-local");
    expect(saved.model.apiKeyConfigured).toBe(true);
    expect(saved.model.apiKey).toBeUndefined();
    expect(configFile.model.apiKey).toBe("local-secret-key");
    expect(configFile.model.model).toBe("lotus-test-model");
    expect(workbench.workbench.model.configured).toBe(true);
    expect(workbench.workbench.model.source).toBe("workspace-local");
  });

  it("rejects contradictory disabled model settings through the config API", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-model-config-conflict-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-model-config-conflict-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"model-config-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome });

    const saveResponse = await app.request("/api/config/model", {
      method: "POST",
      body: JSON.stringify({
        provider: "disabled",
        baseUrl: "https://gateway.example.test",
        apiKey: "local-secret-key",
        model: "lotus-test-model",
      }),
      headers: { "content-type": "application/json" },
    });
    const saved = await saveResponse.json();

    expect(saveResponse.status).toBe(400);
    expect(saved.ok).toBe(false);
    expect(saved.error).toContain("provider=disabled");
  });

  it("tests model connectivity through the config API", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-model-test-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-model-test-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"model-test-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: fakeProvider("ego-ok") });

    const response = await app.request("/api/config/model/test", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("connected");
    expect(body.reply).toBe("ego-ok");
  });

  it("handles natural-language coding agent turns through the chat API", async () => {
    const app = createServer({ modelProvider: fakeProvider("来自模型的只读回复") });
    const response = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "阅读项目状态并说明下一步应该做什么" }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mode: "assistant-chat",
      status: "answered",
    });
    expect(body.reply).toContain("来自模型");
    expect(body.suggestedCommands).toContain("pnpm test");
    expect(body.mcp.status).toBe("not_configured");
  });

  it("keeps chat read-only and explicit when no model is configured", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-chat-needs-model-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-chat-needs-model-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"chat-fixture"}', "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });
    const response = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "你好" }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();
    const workbench = await app.request("/api/workbench").then((result) => result.json());

    expect(response.status).toBe(200);
    expect(body.status).toBe("needs_model");
    expect(body.reply).toContain("模型尚未启用");
    expect(workbench.workbench.pendingEdits).toEqual([]);
  });

  it("auto-proposes natural-language agent edits through the HTTP API", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-auto-propose-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-auto-propose-home-"));
    await writeFile(
      join(workspaceRoot, "package.json"),
      '{"name":"agent-api-fixture","packageManager":"pnpm@11.7.0","scripts":{"typecheck":"node --version"}}',
      "utf8",
    );
    await writeFile(join(workspaceRoot, "README.md"), "hello auto\n", "utf8");
    const app = createServer({
      workspaceRoot,
      egoHome,
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update api fixture through model",
            operations: [
              {
                type: "replace_text",
                path: "README.md",
                oldText: "hello auto",
                newText: "lotus auto",
              },
            ],
          },
        }),
      ),
    });

    const response = await app.request("/agent/runs", {
      method: "POST",
      body: JSON.stringify({
        runId: "agent-api-auto-001",
        message: "把 README 里的 hello auto 改成 lotus auto",
        autoPropose: true,
      }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();
    const workbenchResponse = await app.request("/api/workbench");
    const workbench = await workbenchResponse.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("pending_approval");
    expect(body.approvalRequired).toBe(true);
    expect(body.diff).toContain("+lotus auto");
    expect(body.approvalId).toBeDefined();
    expect(workbench.workbench.pendingEdits[0].runId).toBe("agent-api-auto-001");
    expect(await readFile(join(workspaceRoot, "README.md"), "utf8")).toBe("hello auto\n");

    const approveResponse = await app.request("/agent/runs/agent-api-auto-001/approve", {
      method: "POST",
      body: JSON.stringify({
        approvalId: "approval-api-auto-test",
        checkCommands: [{ name: "node-version", command: "node", args: ["--version"] }],
      }),
      headers: { "content-type": "application/json" },
    });
    const approved = await approveResponse.json();
    const refreshedWorkbench = await app.request("/api/workbench").then((result) => result.json());

    expect(approveResponse.status).toBe(200);
    expect(approved.status).toBe("applied");
    expect(approved.checks[0].status).toBe("passed");
    expect(approved.checks[0].command).toBe("node --version");
    expect(refreshedWorkbench.workbench.pendingEdits).toEqual([]);
    expect(refreshedWorkbench.workbench.lastChecks[0].status).toBe("passed");
    expect(await readFile(join(workspaceRoot, "README.md"), "utf8")).toBe("lotus auto\n");
  });

  it("returns needs_model for auto proposal when model access is disabled", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-needs-model-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-needs-model-home-"));
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"agent-api-fixture"}', "utf8");
    await writeFile(join(workspaceRoot, "README.md"), "hello\n", "utf8");
    const app = createServer({ workspaceRoot, egoHome, modelProvider: null });

    const response = await app.request("/agent/runs", {
      method: "POST",
      body: JSON.stringify({
        runId: "agent-api-needs-model-001",
        message: "修改 README",
        autoPropose: true,
      }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();
    const workbench = await app.request("/api/workbench").then((result) => result.json());

    expect(response.status).toBe(200);
    expect(body.status).toBe("needs_model");
    expect(body.approvalRequired).toBe(false);
    expect(body.editPreview).toBeUndefined();
    expect(workbench.workbench.pendingEdits).toEqual([]);
  });

  it("runs the controlled fixture through the HTTP API", async () => {
    const app = createServer();
    const response = await app.request("/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "api-run-test-001" }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      runId: "api-run-test-001",
      status: "complete",
    });
    expect(body.report).toContain("Decision Trace");
    expect(body.report).toContain("Fixture contains an exposed admin hint");
  });

  it("exposes run events, markdown report, and event stream", async () => {
    const app = createServer();
    await app.request("/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "api-run-test-002" }),
      headers: { "content-type": "application/json" },
    });

    const eventsResponse = await app.request("/runs/api-run-test-002/events");
    const eventsBody = await eventsResponse.json();
    const runsResponse = await app.request("/runs");
    const runsBody = await runsResponse.json();
    const evidenceResponse = await app.request("/runs/api-run-test-002/evidence");
    const evidenceBody = await evidenceResponse.json();
    const reportResponse = await app.request("/runs/api-run-test-002/report");
    const streamResponse = await app.request("/runs/api-run-test-002/stream");

    expect(runsBody.runs.map((run: { runId: string }) => run.runId)).toContain("api-run-test-002");
    expect(eventsBody.events.map((event: { type: string }) => event.type)).toContain(
      "decision.made",
    );
    expect(evidenceBody.evidence[0].summary).toContain("admin hint");
    expect(await reportResponse.text()).toContain("## Policy Decisions");
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
  });

  it("creates, approves, applies, and indexes policy-gated agent edits", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-api-agent-workspace-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-api-agent-home-"));
    await writeFile(
      join(workspaceRoot, "package.json"),
      '{"name":"agent-api-fixture","packageManager":"pnpm@11.7.0"}',
      "utf8",
    );
    await writeFile(join(workspaceRoot, "README.md"), "hello api\n", "utf8");
    const app = createServer({ workspaceRoot, egoHome });

    const createResponse = await app.request("/agent/runs", {
      method: "POST",
      body: JSON.stringify({
        runId: "agent-api-run-001",
        message: "修改 README",
        editPlan: {
          goal: "update api fixture",
          operations: [
            {
              type: "replace_text",
              path: "README.md",
              oldText: "hello api",
              newText: "lotus api",
            },
          ],
        },
      }),
      headers: { "content-type": "application/json" },
    });
    const created = await createResponse.json();
    const diffResponse = await app.request("/agent/runs/agent-api-run-001/diff");
    const workbenchResponse = await app.request("/api/workbench");
    const workbench = await workbenchResponse.json();

    expect(createResponse.status).toBe(200);
    expect(created.approvalRequired).toBe(true);
    expect(await diffResponse.text()).toContain("+lotus api");
    expect(workbench.workbench.pendingEdits[0].runId).toBe("agent-api-run-001");
    expect(await readFile(join(workspaceRoot, "README.md"), "utf8")).toBe("hello api\n");

    const approveResponse = await app.request("/agent/runs/agent-api-run-001/approve", {
      method: "POST",
      body: JSON.stringify({
        approvalId: "approval-api-test",
        checkCommands: [{ name: "node-version", command: "node", args: ["--version"] }],
      }),
      headers: { "content-type": "application/json" },
    });
    const approved = await approveResponse.json();
    const checksResponse = await app.request("/agent/runs/agent-api-run-001/checks");
    const checks = await checksResponse.json();

    expect(approveResponse.status).toBe(200);
    expect(approved.editResult.applied).toBe(true);
    expect(checks.checks[0].status).toBe("passed");
    expect(await readFile(join(workspaceRoot, "README.md"), "utf8")).toBe("lotus api\n");
  });
});
