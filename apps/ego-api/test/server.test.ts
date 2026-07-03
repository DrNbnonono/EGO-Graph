import {describe, expect, it} from "vitest";
import {createServer} from "../src/server.js";

describe("ego api server", () => {
  it("responds to health checks", async () => {
    const app = createServer();
    const response = await app.request("/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ok: true, service: "ego-api"});
  });

  it("runs the controlled fixture through the HTTP API", async () => {
    const app = createServer();
    const response = await app.request("/runs", {
      method: "POST",
      body: JSON.stringify({runId: "api-run-test-001"}),
      headers: {"content-type": "application/json"},
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
      body: JSON.stringify({runId: "api-run-test-002"}),
      headers: {"content-type": "application/json"},
    });

    const eventsResponse = await app.request("/runs/api-run-test-002/events");
    const eventsBody = await eventsResponse.json();
    const runsResponse = await app.request("/runs");
    const runsBody = await runsResponse.json();
    const evidenceResponse = await app.request("/runs/api-run-test-002/evidence");
    const evidenceBody = await evidenceResponse.json();
    const reportResponse = await app.request("/runs/api-run-test-002/report");
    const streamResponse = await app.request("/runs/api-run-test-002/stream");

    expect(runsBody.runs.map((run: {runId: string}) => run.runId)).toContain("api-run-test-002");
    expect(eventsBody.events.map((event: {type: string}) => event.type)).toContain(
      "decision.made",
    );
    expect(evidenceBody.evidence[0].summary).toContain("admin hint");
    expect(await reportResponse.text()).toContain("## Policy Decisions");
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
  });
});
