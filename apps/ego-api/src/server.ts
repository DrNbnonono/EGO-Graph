import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { runCodingAgentTurn, type AgentCheckCommand } from "@ego-graph/agent";
import {
  createModelBackedPlanner,
  createTrajectoryEvent,
  runMission,
  type AgentPlanner,
  type TaskSpecInput,
  type TrajectoryEvent,
} from "@ego-graph/core";
import { createChatModelProvider, loadModelConfig, type ChatModelProvider } from "@ego-graph/llm";
import {
  readDashboardStatus,
  renderDashboardCss,
  renderDashboardHtml,
  renderDashboardJs,
} from "@ego-graph/ego-web";
import { readWorkbenchState } from "@ego-graph/workbench";
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
import type { WorkspaceEditPlan } from "@ego-graph/workspace";
import { Hono } from "hono";

export type CreateServerOptions = {
  workspaceRoot?: string;
  egoHome?: string;
  modelProvider?: ChatModelProvider | null;
};

export function createServer(options: CreateServerOptions = {}): Hono {
  const app = new Hono();
  const workspaceRoot = options.workspaceRoot
    ? resolve(options.workspaceRoot)
    : findWorkspaceRoot(process.cwd());
  const egoHome = options.egoHome ?? defaultEgoHome();

  app.get("/health", (context) => {
    return context.json({ ok: true, service: "ego-api" });
  });

  app.get("/", (context) => {
    return context.html(renderDashboardHtml());
  });

  app.get("/assets/dashboard.css", (context) => {
    return context.text(renderDashboardCss(), 200, {
      "content-type": "text/css; charset=utf-8",
    });
  });

  app.get("/assets/dashboard.js", (context) => {
    return context.text(renderDashboardJs(), 200, {
      "content-type": "application/javascript; charset=utf-8",
    });
  });

  app.get("/assets/brand/ego-lotus.png", async () => {
    const logo = await readFile(join(workspaceRoot, "assets", "brand", "ego-lotus.png"));

    return new Response(logo, {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "image/png",
      },
    });
  });

  app.get("/favicon.ico", async () => {
    const logo = await readFile(join(workspaceRoot, "assets", "brand", "ego-lotus.png"));

    return new Response(logo, {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "image/png",
      },
    });
  });

  app.get("/api/status", async (context) => {
    return context.json(await readDashboardStatus(workspaceRoot, egoHome));
  });

  app.get("/api/workbench", async (context) => {
    return context.json({
      ok: true,
      workbench: await readWorkbenchState({ workspaceRoot, egoHome }),
    });
  });

  app.post("/chat", async (context) => {
    const body = (await context.req.json()) as { message?: string };
    const message = body.message?.trim();

    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }

    const turn = await runCodingAgentTurn({
      message,
      workspaceRoot,
    });

    return context.json({ ok: true, ...turn });
  });

  app.post("/agent/runs", async (context) => {
    const body = (await context.req.json()) as {
      message?: string;
      runId?: string;
      editPlan?: WorkspaceEditPlan;
      autoPropose?: boolean;
    };
    const message = body.message?.trim() || body.editPlan?.goal || "Agent workspace task";
    const runId = body.runId ?? `agent-run-${Date.now()}`;
    const modelProviderOption = options.modelProvider;
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const trajectoryStore = new CompositeTrajectoryStore([
      new JsonlTrajectoryStore(trajectoryDir(egoHome)),
      sqliteStore,
    ]);
    const now = new Date().toISOString();

    try {
      const turn = await runCodingAgentTurn({
        message,
        workspaceRoot,
        runId,
        mode: body.editPlan || body.autoPropose ? "propose_edits" : "inspect",
        autoPropose: body.autoPropose ?? false,
        ...(body.editPlan ? { editPlan: body.editPlan } : {}),
        ...(modelProviderOption !== undefined ? { modelProvider: modelProviderOption } : {}),
      });
      for (const event of turn.trajectoryEvents) {
        await trajectoryStore.append(event);
      }

      await sqliteStore.saveAgentRun({
        runId,
        message,
        mode: turn.executionMode,
        status: turn.status,
        createdAt: now,
        updatedAt: now,
      });

      let approvalId: string | undefined;
      if (turn.status === "pending_approval" && turn.editPreview) {
        approvalId = `approval-${turn.editPreview.id}`;
        await sqliteStore.saveAgentEdit({
          runId,
          previewId: turn.editPreview.id,
          status: "pending",
          diff: turn.editPreview.diff,
          plan: turn.editPlan as unknown as Record<string, unknown>,
          files: turn.editPreview.files,
          createdAt: now,
        });
        await sqliteStore.saveApproval({
          id: approvalId,
          runId,
          kind: "agent_edit",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }

      return context.json({
        ok: true,
        runId,
        approvalId,
        ...turn,
      });
    } finally {
      sqliteStore.close();
    }
  });

  app.post("/agent/runs/:id/approve", async (context) => {
    const runId = context.req.param("id");
    const body = (await context.req.json().catch(() => ({}))) as {
      approvalId?: string;
      checkCommands?: AgentCheckCommand[];
    };
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const trajectoryStore = new CompositeTrajectoryStore([
      new JsonlTrajectoryStore(trajectoryDir(egoHome)),
      sqliteStore,
    ]);
    const now = new Date().toISOString();

    try {
      const pending = await sqliteStore.getPendingAgentEdit(runId);
      const agentRun = await sqliteStore.getAgentRun(runId);
      if (!pending || !agentRun) {
        return context.json({ ok: false, error: `No pending agent edit for ${runId}` }, 404);
      }

      const approvalId = body.approvalId ?? `approval-${pending.previewId}`;
      await sqliteStore.saveApproval({
        id: approvalId,
        runId,
        kind: "agent_edit",
        status: "approved",
        createdAt: now,
        updatedAt: now,
      });

      const turn = await runCodingAgentTurn({
        message: agentRun.message,
        workspaceRoot,
        runId,
        mode: "apply_approved_edits",
        approvalId,
        editPlan: pending.plan as unknown as WorkspaceEditPlan,
        ...(body.checkCommands ? { checkCommands: body.checkCommands } : {}),
      });
      for (const event of turn.trajectoryEvents) {
        await trajectoryStore.append(event);
      }
      await sqliteStore.updateAgentEditStatus(runId, "applied", now);
      await sqliteStore.saveAgentRun({
        ...agentRun,
        status: "applied",
        updatedAt: now,
      });
      for (const check of turn.checks) {
        await sqliteStore.saveAgentCheck({
          runId,
          name: check.name,
          command: check.command,
          status: check.status,
          exitCode: check.exitCode,
          stdout: check.stdout,
          stderr: check.stderr,
          createdAt: now,
        });
      }

      return context.json({ ok: true, runId, approvalId, ...turn });
    } finally {
      sqliteStore.close();
    }
  });

  app.get("/agent/runs/:id/diff", async (context) => {
    const runId = context.req.param("id");
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      const edit = await sqliteStore.getLatestAgentEdit(runId);
      return context.text(edit?.diff ?? "", 200, {
        "content-type": "text/plain; charset=utf-8",
      });
    } finally {
      sqliteStore.close();
    }
  });

  app.get("/agent/runs/:id/checks", async (context) => {
    const runId = context.req.param("id");
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      return context.json({ ok: true, runId, checks: await sqliteStore.listAgentChecks(runId) });
    } finally {
      sqliteStore.close();
    }
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
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const store = new CompositeTrajectoryStore([
      new JsonlTrajectoryStore(trajectoryDir(egoHome)),
      sqliteStore,
    ]);
    const result = await runMission({
      workspaceRoot,
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
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const runs = await sqliteStore.listRuns();

    return context.json({ ok: true, runs });
  });

  app.get("/runs/:id", async (context) => {
    const runId = context.req.param("id");
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
    const events = await readEvents(runId, egoHome);

    return context.json({ ok: true, runId, events });
  });

  app.get("/runs/:id/evidence", async (context) => {
    const runId = context.req.param("id");
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const evidence = await sqliteStore.listEvidence(runId);

    return context.json({ ok: true, runId, evidence });
  });

  app.get("/runs/:id/report", async (context) => {
    const runId = context.req.param("id");
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
    const events = await readEvents(runId, egoHome);
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

function findWorkspaceRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (
      existsSync(join(current, "pnpm-workspace.yaml")) &&
      existsSync(join(current, "package.json"))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }
    current = parent;
  }
}

function loadPlannerFromEnv(): AgentPlanner | undefined {
  const provider = createChatModelProvider(loadModelConfig());
  return provider ? createModelBackedPlanner(provider) : undefined;
}

async function readEvents(runId: string, egoHome: string): Promise<TrajectoryEvent[]> {
  const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
  const sqliteEvents = await sqliteStore.readRun(runId);
  if (sqliteEvents.length > 0) {
    return sqliteEvents;
  }

  return new JsonlTrajectoryStore(trajectoryDir(egoHome)).readRun(runId);
}
