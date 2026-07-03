import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createModelBackedPlanner,
  createTrajectoryEvent,
  runMission,
  type AgentPlanner,
  type TaskSpecInput,
  type TrajectoryEvent,
} from "@ego-graph/core";
import { createChatModelProvider, loadModelConfig } from "@ego-graph/llm";
import { loadOverlay } from "@ego-graph/overlays";
import {
  extractReportDecisions,
  extractReportObservations,
  extractReportPolicyDecisions,
  renderMarkdownReport,
} from "@ego-graph/report";
import { isScenarioName } from "@ego-graph/shared";
import {
  CompositeTrajectoryStore,
  defaultEgoHome,
  JsonlTrajectoryStore,
  reportDir,
  sqlitePath,
  SqliteEgoStore,
  trajectoryDir,
} from "@ego-graph/storage";
import { Hono } from "hono";

export function createServer(): Hono {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({ ok: true, service: "ego-api" });
  });

  app.post("/runs", async (context) => {
    const body = (await context.req.json()) as {
      scenario?: string;
      task?: TaskSpecInput;
      runId?: string;
    };
    const scenario = body.scenario ?? body.task?.scenario ?? "web_pentest";

    if (!isScenarioName(scenario)) {
      return context.json({ ok: false, error: `Unknown scenario: ${scenario}` }, 400);
    }

    const overlay = loadOverlay(scenario);
    const task: TaskSpecInput = body.task ?? {
      scenario,
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: [overlay.defaultTarget],
      constraints: ["authorized-fixture-only"],
    };
    const runId = body.runId ?? `api-run-${Date.now()}`;
    const planner = loadPlannerFromEnv();
    const egoHome = defaultEgoHome();
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const store = new CompositeTrajectoryStore([
      new JsonlTrajectoryStore(trajectoryDir(egoHome)),
      sqliteStore,
    ]);
    const result = await runMission({
      workspaceRoot: process.cwd(),
      task,
      overlay,
      trajectoryStore: store,
      runId,
      ...(planner ? { planner } : {}),
    });
    const report = renderMarkdownReport({
      runId: result.runId,
      scenario: task.scenario,
      goal: task.goal,
      status: result.status,
      scope: task.targets,
      evidence: result.evidence,
      decisions: extractReportDecisions(result.events),
      observations: extractReportObservations(result.events),
      policyDecisions: extractReportPolicyDecisions(result.events),
    });
    const reports = reportDir(egoHome);
    await mkdir(reports, { recursive: true });
    const reportPath = join(reports, `${result.runId}.md`);
    await writeFile(reportPath, report, "utf8");
    await store.append(
      createTrajectoryEvent(result.runId, "report.created", "Report written", { reportPath }),
    );
    await sqliteStore.saveReport({
      runId: result.runId,
      markdown: report,
      reportPath,
      createdAt: new Date().toISOString(),
    });
    await sqliteStore.upsertRun({
      runId: result.runId,
      scenario: task.scenario,
      status: result.status,
      eventCount: result.events.length + 1,
      reportPath,
      updatedAt: new Date().toISOString(),
    });

    return context.json({
      ok: true,
      runId: result.runId,
      status: result.status,
      evidence: result.evidence,
      evidenceBoard: result.evidenceBoard,
      eventCount: result.events.length + 1,
      reportPath,
      report,
    });
  });

  app.get("/runs", async (context) => {
    const sqliteStore = new SqliteEgoStore(sqlitePath(defaultEgoHome()));
    const runs = await sqliteStore.listRuns();

    return context.json({ ok: true, runs });
  });

  app.get("/runs/:id", async (context) => {
    const runId = context.req.param("id");
    const egoHome = defaultEgoHome();
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const indexed = await sqliteStore.getRun(runId);
    if (indexed) {
      return context.json({ ok: true, ...indexed });
    }
    const store = new JsonlTrajectoryStore(trajectoryDir(egoHome));
    const events = await store.readRun(runId);
    const terminal = [...events]
      .reverse()
      .find((event) => event.type === "run.completed" || event.type === "run.blocked");

    return context.json({
      ok: true,
      runId,
      status: terminal?.type === "run.completed" ? "complete" : "blocked",
      eventCount: events.length,
      lastEvent: events.at(-1),
    });
  });

  app.get("/runs/:id/events", async (context) => {
    const runId = context.req.param("id");
    const events = await readEvents(runId);

    return context.json({ ok: true, runId, events });
  });

  app.get("/runs/:id/evidence", async (context) => {
    const runId = context.req.param("id");
    const sqliteStore = new SqliteEgoStore(sqlitePath(defaultEgoHome()));
    const evidence = await sqliteStore.listEvidence(runId);

    return context.json({ ok: true, runId, evidence });
  });

  app.get("/runs/:id/report", async (context) => {
    const runId = context.req.param("id");
    const egoHome = defaultEgoHome();
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const storedReport = await sqliteStore.getReport(runId);
    if (storedReport) {
      return context.text(storedReport.markdown, 200, {
        "content-type": "text/markdown; charset=utf-8",
      });
    }
    const store = new JsonlTrajectoryStore(trajectoryDir(egoHome));
    const events = await store.readRun(runId);
    const parsed = events.find((event) => event.type === "task.parsed")?.data.task as
      TaskSpecInput | undefined;
    const evidence = events
      .filter((event) => event.type === "evidence.created")
      .map((event) => ({
        summary: event.message,
        source: String(event.data.source ?? "unknown"),
      }));
    const status = events.some((event) => event.type === "run.completed") ? "complete" : "blocked";
    const report = renderMarkdownReport({
      runId,
      scenario: parsed?.scenario ?? "unknown",
      goal: parsed?.goal ?? "Unknown goal",
      status,
      ...(parsed?.targets ? { scope: parsed.targets } : {}),
      evidence,
      decisions: extractReportDecisions(events),
      observations: extractReportObservations(events),
      policyDecisions: extractReportPolicyDecisions(events),
    });

    return context.text(report, 200, { "content-type": "text/markdown; charset=utf-8" });
  });

  app.get("/runs/:id/stream", async (context) => {
    const runId = context.req.param("id");
    const events = await readEvents(runId);
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  });

  return app;
}

function loadPlannerFromEnv(): AgentPlanner | undefined {
  const provider = createChatModelProvider(loadModelConfig());
  return provider ? createModelBackedPlanner(provider) : undefined;
}

async function readEvents(runId: string): Promise<TrajectoryEvent[]> {
  const egoHome = defaultEgoHome();
  const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
  const sqliteEvents = await sqliteStore.readRun(runId);
  if (sqliteEvents.length > 0) {
    return sqliteEvents;
  }

  return new JsonlTrajectoryStore(trajectoryDir(egoHome)).readRun(runId);
}
