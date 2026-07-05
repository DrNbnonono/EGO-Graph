import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  draftAgentPlan,
  loadAgentSystemPrompt,
  runAssistantChatTurn,
  runCodingAgentTurn,
  saveProjectSystemPrompt,
  type AgentCheckCommand,
  type AgentPlanMode,
} from "@ego-graph/agent";
import {
  createTerminalAgentSession,
  type AgentRunEvent,
  type PermissionLevel,
} from "@ego-graph/agent-harness";
import {
  createModelBackedPlanner,
  createTrajectoryEvent,
  runMission,
  type AgentPlanner,
  type TaskSpecInput,
  type TrajectoryEvent,
} from "@ego-graph/core";
import {
  createChatModelProvider,
  deleteModelProfile,
  listModelProfiles,
  loadModelConfig,
  loadModelConfigWithSource,
  ModelConfigValidationError,
  modelProviderProfiles,
  saveModelConfig,
  saveModelProfile,
  selectModelProfile,
  toPublicModelConfig,
  type ChatModelProvider,
  type ModelProfile,
  type PersistedModelConfig,
} from "@ego-graph/llm";
import { createHermesEvent } from "@ego-graph/hermes";
import { createMemoryService, type MemoryRecord as RuntimeMemoryRecord } from "@ego-graph/memory";
import {
  deleteMcpServer,
  listMcpRuntimeTools,
  listMcpServers,
  loadMcpConfig,
  saveMcpServer,
  testMcpServer,
} from "@ego-graph/mcp";
import { createBuiltinSkillRegistry, loadPluginManifests } from "@ego-graph/tools";
import {
  readDashboardStatus,
  renderDashboardCss,
  renderDashboardHtml,
  renderDashboardJs,
} from "@ego-graph/ego-web";
import {
  createRuntimeMetricsSampler,
  executeBuiltinCommand,
  getBuiltinCommands,
  readWorkbenchState,
} from "@ego-graph/workbench";
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
  type MemoryRecord,
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
  const metricsSampler = createRuntimeMetricsSampler();

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
      workbench: await readWorkbenchState({ workspaceRoot, egoHome, metricsSampler }),
    });
  });

  app.get("/api/runtime/metrics", (context) => {
    return context.json({ ok: true, ...metricsSampler.sample() });
  });

  app.get("/api/config/model", (context) => {
    return context.json({
      ok: true,
      model: toPublicModelConfig(loadModelConfigWithSource({ workspaceRoot })),
      profiles: modelProviderProfiles,
    });
  });

  app.post("/api/config/model", async (context) => {
    const body = (await context.req.json()) as PersistedModelConfig;
    try {
      const loaded = await saveModelConfig({ workspaceRoot, ...body });

      return context.json({
        ok: true,
        model: toPublicModelConfig(loaded),
        profiles: modelProviderProfiles,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof ModelConfigValidationError ? 400 : 500;
      return context.json({ ok: false, error: message }, status);
    }
  });

  app.post("/api/config/model/test", async (context) => {
    const provider =
      options.modelProvider !== undefined
        ? options.modelProvider
        : createChatModelProvider(loadModelConfig({ workspaceRoot }));
    if (!provider) {
      return context.json({
        ok: true,
        status: "needs_model",
        message: "模型尚未配置完整，无法测试连接。",
      });
    }

    try {
      const reply = await provider.complete({
        temperature: 0,
        maxTokens: 32,
        messages: [
          { role: "system", content: "Reply with the exact text: ego-ok" },
          { role: "user", content: "ping" },
        ],
      });
      return context.json({
        ok: true,
        status: "connected",
        model: { provider: provider.name, name: provider.model },
        reply: reply.slice(0, 200),
      });
    } catch (error) {
      return context.json({
        ok: true,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/config/models", async (context) => {
    return context.json({
      ok: true,
      ...(await listModelProfiles({ workspaceRoot, env: {} })),
    });
  });

  app.post("/api/config/models", async (context) => {
    const body = (await context.req.json()) as ModelProfile;
    try {
      return context.json({
        ok: true,
        ...(await saveModelProfile({ workspaceRoot, profile: body })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof ModelConfigValidationError ? 400 : 500;
      return context.json({ ok: false, error: message }, status);
    }
  });

  app.post("/api/config/models/:id/select", async (context) => {
    try {
      const loaded = await selectModelProfile({
        workspaceRoot,
        id: context.req.param("id"),
      });
      return context.json({
        ok: true,
        model: toPublicModelConfig(loaded),
        ...(await listModelProfiles({ workspaceRoot, env: {} })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return context.json({ ok: false, error: message }, 404);
    }
  });

  app.delete("/api/config/models/:id", async (context) => {
    try {
      return context.json({
        ok: true,
        ...(await deleteModelProfile({ workspaceRoot, id: context.req.param("id") })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof ModelConfigValidationError ? 400 : 404;
      return context.json({ ok: false, error: message }, status);
    }
  });

  app.post("/api/config/models/:id/test", async (context) => {
    try {
      await selectModelProfile({ workspaceRoot, id: context.req.param("id") });
      const provider = createChatModelProvider(loadModelConfig({ workspaceRoot }));
      if (!provider) {
        return context.json({
          ok: true,
          status: "needs_model",
          message: "模型 profile 尚未配置完整。",
        });
      }
      const reply = await provider.complete({
        temperature: 0,
        maxTokens: 32,
        messages: [
          { role: "system", content: "Reply with the exact text: ego-ok" },
          { role: "user", content: "ping" },
        ],
      });
      return context.json({
        ok: true,
        status: "connected",
        model: { provider: provider.name, name: provider.model },
        reply: reply.slice(0, 200),
      });
    } catch (error) {
      return context.json({
        ok: true,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/config/system-prompt", async (context) => {
    return context.json({
      ok: true,
      ...(await loadAgentSystemPrompt({ workspaceRoot })),
    });
  });

  app.put("/api/config/system-prompt", async (context) => {
    const body = (await context.req.json()) as { content?: string };
    const saved = await saveProjectSystemPrompt({
      workspaceRoot,
      content: body.content ?? "",
    });
    return context.json({
      ok: true,
      ...saved,
      ...(await loadAgentSystemPrompt({ workspaceRoot })),
    });
  });

  app.get("/api/commands", async (context) => {
    return context.json({ ok: true, commands: getBuiltinCommands() });
  });

  app.post("/api/commands/execute", async (context) => {
    const body = (await context.req.json()) as { command?: string };
    const result = executeBuiltinCommand(body.command ?? "");
    if (!result) {
      return context.json({ ok: false, error: `Unknown command: ${body.command ?? ""}` }, 400);
    }
    return context.json({ ok: true, ...result });
  });

  app.get("/api/mcp/servers", async (context) => {
    return context.json({ ok: true, ...(await listMcpServers(workspaceRoot)) });
  });

  app.post("/api/mcp/servers", async (context) => {
    const body = (await context.req.json()) as {
      name?: string;
      transport?: "stdio" | "http";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
      oauth?: {
        accessToken?: string;
        tokenType?: "Bearer";
        scopes?: string[];
        resourceMetadataUrl?: string;
      };
      defaultToolPolicy?: {
        scope?: "fixture" | "network" | "file";
        risk?: "low" | "medium" | "high";
        requiresApproval?: boolean;
        sandboxProfile?: "none" | "process" | "docker";
        timeoutMs?: number;
        scenarios?: string[];
      };
      toolPolicies?: Record<
        string,
        {
          scope?: "fixture" | "network" | "file";
          risk?: "low" | "medium" | "high";
          requiresApproval?: boolean;
          sandboxProfile?: "none" | "process" | "docker";
          timeoutMs?: number;
          scenarios?: string[];
        }
      >;
      enabled?: boolean;
    };
    const transport = body.transport ?? (body.url ? "http" : "stdio");
    if (
      !body.name ||
      (transport === "stdio" && !body.command) ||
      (transport === "http" && !body.url)
    ) {
      return context.json(
        {
          ok: false,
          error: "name plus command(stdio) or url(http) are required",
        },
        400,
      );
    }
    return context.json({
      ok: true,
      ...(await saveMcpServer({
        workspaceRoot,
        server: {
          name: body.name,
          transport,
          ...(body.command ? { command: body.command } : {}),
          args: body.args ?? [],
          env: body.env ?? {},
          ...(body.url ? { url: body.url } : {}),
          headers: body.headers ?? {},
          ...(body.oauth ? { oauth: body.oauth } : {}),
          ...(body.defaultToolPolicy ? { defaultToolPolicy: body.defaultToolPolicy } : {}),
          ...(body.toolPolicies ? { toolPolicies: body.toolPolicies } : {}),
          enabled: body.enabled ?? true,
        },
      })),
    });
  });

  app.delete("/api/mcp/servers/:name", async (context) => {
    return context.json({
      ok: true,
      ...(await deleteMcpServer({ workspaceRoot, name: context.req.param("name") })),
    });
  });

  app.post("/api/mcp/servers/:name/test", async (context) => {
    try {
      const result = await testMcpServer({ workspaceRoot, name: context.req.param("name") });
      return context.json({
        ...result,
        ok: result.ok,
      });
    } catch (error) {
      return context.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        404,
      );
    }
  });

  app.post("/chat", async (context) => {
    const body = (await context.req.json()) as { message?: string; sessionId?: string };
    const message = body.message?.trim();

    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }

    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const sessionId = body.sessionId ?? "web-chat";
    try {
      const memoryHits = await recallStoreMemories(sqliteStore, message);
      await sqliteStore.saveHermesEvent(
        createHermesEvent({
          type: "message.received",
          sessionId,
          source: "api.chat",
          payload: { message },
        }),
      );
      const turn = await runAssistantChatTurn({
        message,
        workspaceRoot,
        memoryHints: toMemoryHints(memoryHits),
        ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
      });
      const remembered = await rememberInStore(sqliteStore, {
        scope: "session",
        content: message,
        source: "api.chat",
        tags: ["chat"],
        references: [],
      });
      if (remembered) {
        await sqliteStore.saveHermesEvent(
          createHermesEvent({
            type: "memory.written",
            sessionId,
            source: "api.chat",
            payload: { memoryId: remembered.id, scope: remembered.scope },
          }),
        );
      }

      return context.json({ ok: true, memoryHits, ...turn });
    } finally {
      sqliteStore.close();
    }
  });

  app.post("/chat/stream", async (context) => {
    const body = (await context.req.json()) as { message?: string; sessionId?: string };
    const message = body.message?.trim();
    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }

    const sessionId = body.sessionId ?? "web-chat";
    const turn = await runAssistantChatTurn({
      message,
      workspaceRoot,
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    const lines = [
      {
        type: "agent.event",
        event: "message.received",
        sessionId,
        message,
      },
      {
        type: "agent.event",
        event: "model.completed",
        sessionId,
        model: turn.model,
      },
      {
        type: "model.delta",
        sessionId,
        delta: turn.reply,
      },
      {
        type: "assistant.final",
        sessionId,
        status: turn.status,
        message: turn.reply,
        model: turn.model,
      },
    ];

    return context.text(lines.map((line) => JSON.stringify(line)).join("\n") + "\n", 200, {
      "content-type": "application/x-ndjson; charset=utf-8",
    });
  });

  app.post("/agent/plans", async (context) => {
    const body = (await context.req.json()) as {
      message?: string;
      sessionId?: string;
      mode?: string;
    };
    const message = body.message?.trim();
    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }
    const mode = parseAgentPlanMode(body.mode);
    if (!mode) {
      return context.json({ ok: false, error: "mode must be one of: coding, ctf, research" }, 400);
    }

    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      const memoryHits = await recallStoreMemories(sqliteStore, message);
      const draft = await draftAgentPlan({
        message,
        workspaceRoot,
        mode,
        memoryHits: memoryHits.map(storageMemoryToRuntimeMemory),
        ...(body.sessionId ? { sessionId: body.sessionId } : {}),
      });
      await sqliteStore.saveAgentPlan({
        planId: draft.planId,
        sessionId: draft.sessionId,
        mode: draft.mode,
        message,
        status: "draft",
        plan: draft.plan,
        contextSummary: draft.contextSummary,
        memoryIds: memoryHits.map((memory) => memory.id),
        createdAt: draft.createdAt,
        updatedAt: draft.createdAt,
      });
      await sqliteStore.saveHermesEvent(
        createHermesEvent({
          type: "plan.updated",
          sessionId: draft.sessionId,
          source: "api.agent.plans",
          payload: { planId: draft.planId, status: "draft", mode: draft.mode },
        }),
      );

      return context.json({ ok: true, ...draft, memoryHits });
    } finally {
      sqliteStore.close();
    }
  });

  app.post("/agent/plans/:id/approve", async (context) => {
    const planId = context.req.param("id");
    const body = (await context.req.json().catch(() => ({}))) as { runId?: string };
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const trajectoryStore = new CompositeTrajectoryStore([
      new JsonlTrajectoryStore(trajectoryDir(egoHome)),
      sqliteStore,
    ]);
    const now = new Date().toISOString();

    try {
      const plan = await sqliteStore.getAgentPlan(planId);
      if (!plan) {
        return context.json({ ok: false, error: `No agent plan for ${planId}` }, 404);
      }
      if (plan.status !== "draft") {
        return context.json(
          {
            ok: false,
            error: `Agent plan ${planId} is not draft; current status is ${plan.status}`,
          },
          409,
        );
      }

      const runId = body.runId ?? plan.runId ?? `agent-run-${Date.now()}`;
      await sqliteStore.updateAgentPlanStatus(planId, "approved", runId, now);
      await sqliteStore.saveHermesEvent(
        createHermesEvent({
          type: "plan.updated",
          sessionId: plan.sessionId,
          runId,
          source: "api.agent.plans.approve",
          payload: { planId, status: "approved", mode: plan.mode },
        }),
      );

      if (plan.mode === "ctf" || plan.mode === "research") {
        await sqliteStore.updateAgentPlanStatus(planId, "executed", runId, now);
        return context.json({
          ok: true,
          planId,
          runId,
          status: "approved",
          message:
            plan.mode === "ctf"
              ? "CTF plan approved. Use /runs or security mode to execute the controlled fixture."
              : "Research plan approved. Use read-only chat or search tools before requesting a coding Patch.",
        });
      }

      const memoryHits = await recallStoreMemories(sqliteStore, plan.message);
      const turn = await runCodingAgentTurn({
        message: plan.message,
        workspaceRoot,
        runId,
        mode: "propose_edits",
        autoPropose: true,
        memoryHints: toMemoryHints(memoryHits),
        ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
      });
      for (const event of turn.trajectoryEvents) {
        await trajectoryStore.append(event);
      }

      await sqliteStore.saveAgentRun({
        runId,
        message: plan.message,
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
        await sqliteStore.saveHermesEvent(
          createHermesEvent({
            type: "approval.created",
            sessionId: plan.sessionId,
            runId,
            source: "api.agent.plans.approve",
            payload: { approvalId, kind: "agent_edit" },
          }),
        );
      }

      return context.json({ ok: true, planId, runId, approvalId, ...turn });
    } finally {
      sqliteStore.close();
    }
  });

  app.get("/api/hermes/timeline", async (context) => {
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      const sessionId = context.req.query("sessionId");
      const runId = context.req.query("runId");
      const type = context.req.query("type");
      const limit = Number(context.req.query("limit") ?? 50);
      return context.json({
        ok: true,
        events: await sqliteStore.listHermesEvents({
          ...(sessionId ? { sessionId } : {}),
          ...(runId ? { runId } : {}),
          ...(type ? { type } : {}),
          limit: Number.isFinite(limit) ? limit : 50,
        }),
      });
    } finally {
      sqliteStore.close();
    }
  });

  app.get("/api/memory", async (context) => {
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      const scope = context.req.query("scope") as MemoryRecord["scope"] | undefined;
      return context.json({
        ok: true,
        memories: await sqliteStore.listMemories({
          ...(scope ? { scope } : {}),
          limit: 50,
        }),
      });
    } finally {
      sqliteStore.close();
    }
  });

  app.get("/api/skills", async (context) => {
    const registry = createBuiltinSkillRegistry();
    const plugins = await loadPluginManifests(workspaceRoot);
    return context.json({
      ok: true,
      skills: registry.listSkills(),
      tools: registry.listTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        permission: tool.permission,
      })),
      plugins,
    });
  });

  app.get("/api/mcp/tools", async (context) => {
    const mcp = await loadMcpConfig(workspaceRoot);
    const runtime = await listMcpRuntimeTools(mcp);
    return context.json({
      ok: true,
      mcp: mcp.manifest,
      tools: runtime.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        permission: tool.permission,
        requiresApproval: tool.requiresApproval ?? false,
      })),
      errors: runtime.errors,
    });
  });

  app.post("/api/mcp/tools/call", async (context) => {
    const body = (await context.req.json()) as {
      name?: string;
      args?: Record<string, unknown>;
      approved?: boolean;
      permissionLevel?: PermissionLevel;
    };
    if (!body.name) {
      return context.json({ ok: false, error: "name is required" }, 400);
    }
    if (!body.approved) {
      return context.json(
        { ok: false, error: "MCP tool calls require explicit approved=true." },
        403,
      );
    }
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: body.permissionLevel ?? "security-active",
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    const events = await collectHarnessEvents(session.callMcpTool(body.name, body.args ?? {}));
    return context.json({
      ok: true,
      runId: events[0]?.runId,
      events,
      status: events.some((event) => event.type === "tool.blocked") ? "blocked" : "complete",
    });
  });

  app.post("/agent/harness/runs", async (context) => {
    const body = (await context.req.json()) as {
      message?: string;
      permissionLevel?: PermissionLevel;
    };
    const message = body.message?.trim();
    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: body.permissionLevel ?? "read-only",
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    await session.hydratePendingRuns();
    const events = await collectHarnessEvents(session.submitMessage(message));
    const runId = events[0]?.runId;
    return context.json({
      ok: true,
      runId,
      events,
      state: runId ? session.getRunState(runId) : undefined,
    });
  });

  app.post("/agent/harness/runs/:id/plan/approve", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      permissionLevel?: PermissionLevel;
    };
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: body.permissionLevel ?? "workspace-write",
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    await session.hydratePendingRuns();
    const runId = context.req.param("id");
    const events = await collectHarnessEvents(session.approvePlan(runId));
    return context.json({ ok: true, runId, events, state: session.getRunState(runId) });
  });

  app.post("/agent/harness/runs/:id/patch/approve", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      permissionLevel?: PermissionLevel;
    };
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: body.permissionLevel ?? "shell-readonly",
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    await session.hydratePendingRuns();
    const runId = context.req.param("id");
    const events = await collectHarnessEvents(session.approvePatch(runId));
    return context.json({ ok: true, runId, events, state: session.getRunState(runId) });
  });

  app.get("/agent/harness/runs/:id/replay", async (context) => {
    const session = createTerminalAgentSession({ workspaceRoot, egoHome });
    const runId = context.req.param("id");
    return context.json({ ok: true, runId, events: await session.replayRun(runId) });
  });

  app.post("/agent/runs", async (context) => {
    const body = (await context.req.json()) as {
      message?: string;
      runId?: string;
      sessionId?: string;
      editPlan?: WorkspaceEditPlan;
      autoPropose?: boolean;
    };
    const message = body.message?.trim() || body.editPlan?.goal || "Agent workspace task";
    const runId = body.runId ?? `agent-run-${Date.now()}`;
    const sessionId = body.sessionId ?? runId;
    const modelProviderOption = options.modelProvider;
    const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
    const trajectoryStore = new CompositeTrajectoryStore([
      new JsonlTrajectoryStore(trajectoryDir(egoHome)),
      sqliteStore,
    ]);
    const now = new Date().toISOString();

    try {
      const memoryHits = await recallStoreMemories(sqliteStore, message);
      await sqliteStore.saveHermesEvent(
        createHermesEvent({
          type: "message.received",
          sessionId,
          runId,
          source: "api.agent.runs",
          payload: { message, autoPropose: body.autoPropose ?? false },
        }),
      );
      const turn = await runCodingAgentTurn({
        message,
        workspaceRoot,
        runId,
        mode: body.editPlan || body.autoPropose ? "propose_edits" : "inspect",
        autoPropose: body.autoPropose ?? false,
        memoryHints: toMemoryHints(memoryHits),
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
        await sqliteStore.saveHermesEvent(
          createHermesEvent({
            type: "approval.created",
            sessionId,
            runId,
            source: "api.agent.runs",
            payload: { approvalId, kind: "agent_edit" },
          }),
        );
      }

      return context.json({
        ok: true,
        runId,
        approvalId,
        memoryHits,
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
        await sqliteStore.saveHermesEvent(
          createHermesEvent({
            type: "check.finished",
            sessionId: runId,
            runId,
            source: "api.agent.runs.approve",
            payload: {
              name: check.name,
              status: check.status,
              exitCode: check.exitCode,
            },
          }),
        );
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
    const planner = loadPlannerFromWorkspace(workspaceRoot);
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
    const remembered = await rememberInStore(sqliteStore, {
      scope: "task",
      content: `${task.scenario} ${result.status} with ${result.evidence.length} evidence items for ${task.goal}`,
      source: "api.runs",
      tags: ["ctf", task.scenario, result.status],
      references: [reportPath],
    });
    if (remembered) {
      await sqliteStore.saveHermesEvent(
        createHermesEvent({
          type: "memory.written",
          sessionId: result.runId,
          runId: result.runId,
          source: "api.runs",
          payload: { memoryId: remembered.id, scope: remembered.scope },
        }),
      );
    }

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

function loadPlannerFromWorkspace(workspaceRoot: string): AgentPlanner | undefined {
  const provider = createChatModelProvider(loadModelConfig({ workspaceRoot }));
  return provider ? createModelBackedPlanner(provider) : undefined;
}

function parseAgentPlanMode(mode: string | undefined): AgentPlanMode | undefined {
  if (!mode) {
    return "coding";
  }
  return mode === "coding" || mode === "ctf" || mode === "research" ? mode : undefined;
}

async function collectHarnessEvents(
  stream: AsyncIterable<AgentRunEvent>,
): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function readEvents(runId: string, egoHome: string): Promise<TrajectoryEvent[]> {
  const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
  const sqliteEvents = await sqliteStore.readRun(runId);
  if (sqliteEvents.length > 0) {
    return sqliteEvents;
  }

  return new JsonlTrajectoryStore(trajectoryDir(egoHome)).readRun(runId);
}

async function recallStoreMemories(store: SqliteEgoStore, query: string): Promise<MemoryRecord[]> {
  const stored = await store.listMemories({ limit: 100 });
  const service = createMemoryService(stored.map(storageMemoryToRuntimeMemory));
  const hits = await service.recall({ query, limit: 6 });
  const byId = new Map(stored.map((memory) => [memory.id, memory]));
  return hits
    .map((memory) => byId.get(memory.id))
    .filter((memory): memory is MemoryRecord => Boolean(memory));
}

async function rememberInStore(
  store: SqliteEgoStore,
  input: {
    scope: MemoryRecord["scope"];
    content: string;
    source: string;
    tags?: string[];
    references?: string[];
  },
): Promise<MemoryRecord | undefined> {
  const service = createMemoryService();
  const result = await service.remember(input);
  if (result.status !== "stored") {
    return undefined;
  }
  const record = runtimeMemoryToStorageMemory(result.memory);
  await store.saveMemory(record);
  return record;
}

function toMemoryHints(memories: MemoryRecord[]): string[] {
  return memories.map((memory) => `[${memory.scope}] ${memory.content}`);
}

function storageMemoryToRuntimeMemory(memory: MemoryRecord): RuntimeMemoryRecord {
  return {
    id: memory.id,
    scope: memory.scope,
    ...(memory.kind ? { kind: memory.kind } : {}),
    content: memory.content,
    summary: memory.summary ?? memory.content,
    ...(memory.rawContent ? { rawContent: memory.rawContent } : {}),
    source: memory.source,
    ...(memory.sourceRunId ? { sourceRunId: memory.sourceRunId } : {}),
    evidenceRefs: memory.evidenceRefs ?? [],
    tags: memory.tags,
    references: memory.references,
    importance: memory.importance ?? 3,
    confidence: memory.confidence ?? 0.7,
    ...(memory.expiresAt ? { expiresAt: memory.expiresAt } : {}),
    ...(memory.status ? { status: memory.status } : {}),
    ...(memory.lastAccessedAt ? { lastAccessedAt: memory.lastAccessedAt } : {}),
    accessCount: memory.accessCount ?? 0,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

function runtimeMemoryToStorageMemory(memory: RuntimeMemoryRecord): MemoryRecord {
  return {
    id: memory.id,
    scope: memory.scope,
    ...(memory.kind ? { kind: memory.kind } : {}),
    content: memory.content,
    summary: memory.summary,
    ...(memory.rawContent ? { rawContent: memory.rawContent } : {}),
    source: memory.source,
    ...(memory.sourceRunId ? { sourceRunId: memory.sourceRunId } : {}),
    evidenceRefs: memory.evidenceRefs,
    tags: memory.tags,
    references: memory.references,
    importance: memory.importance,
    confidence: memory.confidence,
    ...(memory.expiresAt ? { expiresAt: memory.expiresAt } : {}),
    status: memory.status ?? "active",
    ...(memory.lastAccessedAt ? { lastAccessedAt: memory.lastAccessedAt } : {}),
    accessCount: memory.accessCount,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}
