import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

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
    const status = await statusResponse.json();
    const workbench = await workbenchResponse.json();

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("EGO-Graph 可视化驾驶舱");
    expect(html).toContain("对话控制台");
    expect(html).toContain("项目进展");
    expect(html).toContain('id="mission-chat"');
    expect(html).toContain("/assets/brand/ego-lotus.png");
    expect(html).toContain('rel="icon"');
    expect(cssResponse.headers.get("content-type")).toContain("text/css");
    expect(await cssResponse.text()).toContain(".lotus-mark");
    expect(await jsResponse.text()).toContain("submitMission");
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

  it("handles natural-language coding agent turns through the chat API", async () => {
    const app = createServer();
    const response = await app.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message: "阅读项目状态并说明下一步应该做什么" }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mode: "coding-agent",
    });
    expect(body.assistantMessage).toContain("coding agent");
    expect(body.plan.length).toBeGreaterThan(0);
    expect(body.suggestedCommands).toContain("pnpm test");
    expect(body.mcp.status).toBe("not_configured");
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
});
