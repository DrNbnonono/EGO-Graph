import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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
  createOperationApproval,
  createPermissionGrantsV2,
  createToolCall,
  executeToolCall,
  hasHarnessPermission,
  permissionRulesForLevel,
  type AgentRunEvent,
  type LoopPolicy,
  type PermissionLevel,
  type PermissionGrantV2,
  type TerminalAgentSession,
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
  createSecurityScopeV2,
  revokeSecurityScope,
  type SecurityScopeV2,
} from "@ego-graph/security-tools";
import {
  deleteMcpServer,
  listMcpRuntimeTools,
  listMcpServers,
  loadMcpConfig,
  saveMcpServer,
  testMcpServer,
} from "@ego-graph/mcp";
import {
  createBuiltinSkillRegistry,
  createTerminalAgentToolRegistry,
  detectSecurityCapabilities,
  deleteLocalSkill,
  listToolHealthRecords,
  listCuratedPlugins,
  listLocalSkills,
  loadPluginManifests,
  installCuratedPlugin,
  saveLocalSkill,
  setPluginEnabled,
  uninstallPlugin,
  verifyInstalledPlugin,
} from "@ego-graph/tools";
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
  buildReproBundleFromEvents,
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
  parseMessageContent,
  reportDir,
  sqlitePath,
  SqliteEgoStore,
  trajectoryDir,
  type MemoryRecord,
} from "@ego-graph/storage";
import type { WorkspaceEditPlan } from "@ego-graph/workspace";
import { Hono } from "hono";
import {
  capabilityCookie,
  isAllowedLocalHost,
  isAllowedOrigin,
  isPublicAssetPath,
  requestHasCapability,
  type ApiAuthMode,
} from "./auth.js";

export { ensureCapabilityToken } from "./auth.js";

export type CreateServerOptions = {
  workspaceRoot?: string;
  egoHome?: string;
  modelProvider?: ChatModelProvider | null;
  authMode?: ApiAuthMode;
  capabilityToken?: string;
};

type EvalArtifactSummary = {
  mode?: string;
  generatedAt?: string;
  averageScore?: number;
  safetyViolations: unknown[];
  results: Array<{
    scenario?: string;
    score?: number;
    seedScores?: number[];
    confirmed?: string[];
    safetyViolations: unknown[];
  }>;
};

export function createServer(options: CreateServerOptions = {}): Hono {
  const app = new Hono();
  const workspaceRoot = options.workspaceRoot
    ? resolve(options.workspaceRoot)
    : findWorkspaceRoot(process.cwd());
  const egoHome = options.egoHome ?? defaultEgoHome();
  const authMode = options.authMode ?? (process.env.NODE_ENV === "test" ? "disabled" : "required");
  const capabilityToken = options.capabilityToken ?? process.env.EGO_API_TOKEN ?? "";
  if (authMode === "required" && capabilityToken.length < 32) {
    throw new Error("Secure API mode requires a capability token of at least 32 characters.");
  }
  const metricsSampler = createRuntimeMetricsSampler();
  const activeHarnessSessions = new Map<string, TerminalAgentSession>();
  const sessionPolicies = new Map<string, PermissionLevel>();
  const pendingToolCalls = new Map<string, {
    call: ReturnType<typeof createToolCall>;
    sessionId: string;
    permissionLevel: PermissionLevel;
    securityScope?: SecurityScopeV2;
  }>();
  const securityScopes = new Map<string, { sessionId: string; scope: SecurityScopeV2 }>();
  const permissionGrants = new Map<string, PermissionGrantV2>();
  const defaultProject = toProjectRecord(workspaceRoot, true);

  app.use("*", async (context, next) => {
    if (authMode === "disabled") {
      await next();
      return;
    }
    if (!isAllowedLocalHost(context.req.raw)) {
      return context.json({ ok: false, error: "invalid host" }, 403);
    }
    const pathname = new URL(context.req.url).pathname;
    if (pathname === "/") {
      await next();
      context.header("set-cookie", capabilityCookie(capabilityToken));
      return;
    }
    if (isPublicAssetPath(pathname)) {
      await next();
      return;
    }
    if (!isAllowedOrigin(context.req.raw)) {
      return context.json({ ok: false, error: "invalid origin" }, 403);
    }
    if (!requestHasCapability(context.req.raw, capabilityToken)) {
      return context.json({ ok: false, error: "capability token required" }, 401);
    }
    await next();
  });

  async function withStore<T>(callback: (store: SqliteEgoStore) => Promise<T>): Promise<T> {
    const store = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      const projects = await store.listProjects();
      if (!projects.some((project) => project.id === defaultProject.id)) {
        await store.upsertProject({ ...defaultProject, active: projects.length === 0 });
      }
      return await callback(store);
    } finally {
      store.close();
    }
  }

  async function getSessionPolicy(sessionId: string): Promise<PermissionLevel> {
    const cached = sessionPolicies.get(sessionId);
    if (cached) return cached;
    const persisted = await withStore((store) => store.getSessionPolicy(sessionId));
    const preset = persisted?.preset ?? "read-only";
    sessionPolicies.set(sessionId, preset);
    return preset;
  }

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

  app.get("/assets/vendor/marked.esm.js", async (context) => {
    const source = await readFile(
      join(workspaceRoot, "node_modules", ".pnpm", "marked@17.0.1", "node_modules", "marked", "lib", "marked.esm.js"),
      "utf8",
    );
    return context.text(source, 200, {
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

  app.get("/api/projects", async (context) => {
    return context.json(
      await withStore(async (store) => {
        const projects = await store.listProjects();
        return {
          ok: true,
          activeProject: projects.find((project) => project.active) ?? defaultProject,
          projects,
        };
      }),
    );
  });

  app.post("/api/projects/open", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { path?: string };
    const targetPath = body.path?.trim() ? resolve(body.path) : workspaceRoot;
    if (!existsSync(targetPath)) {
      return context.json({ ok: false, error: "project path does not exist" }, 400);
    }

    return context.json(
      await withStore(async (store) => {
        const project = await store.upsertProject(toProjectRecord(targetPath, true));
        return {
          ok: true,
          activeProject: project,
          projects: await store.listProjects(),
        };
      }),
    );
  });

  app.get("/api/sessions", async (context) => {
    const projectId = context.req.query("projectId") ?? defaultProject.id;
    return context.json(
      await withStore(async (store) => ({
        ok: true,
        sessions: await store.listSessions(projectId),
      })),
    );
  });

  app.post("/api/sessions", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      projectId?: string;
      title?: string;
    };
    const projectId = body.projectId ?? defaultProject.id;
    const title = normalizeSessionTitle(body.title);

    return context.json(
      await withStore(async (store) => {
        const project = await store.getProject(projectId);
        if (!project) {
          return { ok: false, error: "project not found" };
        }
        const session = await store.createSession({ projectId, title });
        sessionPolicies.set(session.id, "read-only");
        await store.saveSessionPolicy({ sessionId: session.id, preset: "read-only", updatedAt: new Date().toISOString() });
        return { ok: true, session };
      }),
    );
  });

  app.patch("/api/sessions/:id/policy", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { preset?: unknown };
    const preset = parsePermissionLevel(body.preset);
    if (!preset) return context.json({ ok: false, error: "invalid permission preset" }, 400);
    const sessionId = context.req.param("id");
    const exists = await withStore(async (store) => Boolean(await store.getSession(sessionId)));
    if (!exists) return context.json({ ok: false, error: "session not found" }, 404);
    sessionPolicies.set(sessionId, preset);
    await withStore(async (store) => {
      await store.saveSessionPolicy({ sessionId, preset, updatedAt: new Date().toISOString() });
      await store.saveHermesEvent(createHermesEvent({
        type: "session.policy.changed",
        sessionId,
        source: "api.sessions.policy",
        payload: { preset },
      }));
    });
    return context.json({ ok: true, sessionId, preset });
  });

  app.get("/api/security-scopes", async (context) => {
    const sessionId = context.req.query("sessionId");
    const persisted = await withStore((store) => store.listSecurityScopes(sessionId));
    for (const record of persisted) {
      if (!securityScopes.has(record.id)) {
        securityScopes.set(record.id, { sessionId: record.sessionId, scope: record.payload as unknown as SecurityScopeV2 });
      }
    }
    const scopes = [...securityScopes.values()].filter((entry) => !sessionId || entry.sessionId === sessionId).map((entry) => ({ sessionId: entry.sessionId, scope: entry.scope }));
    return context.json({ ok: true, scopes });
  });

  app.post("/api/security-scopes", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      sessionId?: string;
      targetType?: SecurityScopeV2["targetType"];
      targets?: SecurityScopeV2["targets"];
      allowedActions?: string[];
      forbiddenActions?: string[];
      riskLevel?: SecurityScopeV2["riskLevel"];
      limits?: Partial<SecurityScopeV2["limits"]>;
      network?: Partial<SecurityScopeV2["network"]>;
      expiresAt?: string;
    };
    if (!body.sessionId || !body.targetType || !body.targets?.length) {
      return context.json({ ok: false, error: "sessionId, targetType and targets are required" }, 400);
    }
    const sessionExists = await withStore(async (store) => Boolean(await store.getSession(body.sessionId!)));
    if (!sessionExists) return context.json({ ok: false, error: "session not found" }, 404);
    try {
      const scope = createSecurityScopeV2({
        workspaceId: defaultProject.id,
        targetType: body.targetType,
        targets: body.targets,
        ...(body.allowedActions ? { allowedActions: body.allowedActions } : {}),
        ...(body.forbiddenActions ? { forbiddenActions: body.forbiddenActions } : {}),
        ...(body.riskLevel ? { riskLevel: body.riskLevel } : {}),
        ...(body.limits ? { limits: body.limits } : {}),
        ...(body.network ? { network: body.network } : {}),
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      });
      securityScopes.set(scope.scopeId, { sessionId: body.sessionId, scope });
      await withStore((store) => store.saveSecurityScope({
        id: scope.scopeId,
        sessionId: body.sessionId!,
        workspaceId: defaultProject.id,
        status: "active",
        payload: scope as unknown as Record<string, unknown>,
        createdAt: scope.createdAt,
        updatedAt: scope.createdAt,
      }));
      return context.json({ ok: true, scope }, 201);
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/api/security-scopes/:id/revoke", async (context) => {
    const scopeId = context.req.param("id");
    let entry = securityScopes.get(scopeId);
    if (!entry) {
      const persisted = await withStore((store) => store.getSecurityScope(scopeId));
      if (persisted) entry = { sessionId: persisted.sessionId, scope: persisted.payload as unknown as SecurityScopeV2 };
    }
    if (!entry) return context.json({ ok: false, error: "scope not found" }, 404);
    revokeSecurityScope(entry.scope);
    await withStore((store) => store.saveSecurityScope({
      id: entry.scope.scopeId,
      sessionId: entry.sessionId,
      workspaceId: entry.scope.workspaceId,
      status: "revoked",
      payload: entry.scope as unknown as Record<string, unknown>,
      createdAt: entry.scope.createdAt,
      updatedAt: entry.scope.revokedAt ?? new Date().toISOString(),
    }));
    return context.json({ ok: true, scope: entry.scope });
  });

  app.get("/api/permission-grants", async (context) => {
    const persisted = await withStore((store) => store.listPermissionGrants(defaultProject.id));
    for (const record of persisted) permissionGrants.set(record.id, record.payload as unknown as PermissionGrantV2);
    return context.json({ ok: true, grants: [...permissionGrants.values()] });
  });

  app.post("/api/permission-grants/:id/revoke", async (context) => {
    const id = context.req.param("id");
    let grant = permissionGrants.get(id);
    if (!grant) {
      const persisted = (await withStore((store) => store.listPermissionGrants(defaultProject.id))).find((item) => item.id === id);
      if (persisted) grant = persisted.payload as unknown as PermissionGrantV2;
    }
    if (!grant) return context.json({ ok: false, error: "grant not found" }, 404);
    grant.revokedAt = new Date().toISOString();
    permissionGrants.set(grant.id, grant);
    await withStore((store) => store.savePermissionGrant({
      id: grant!.id,
      sessionId: "permission-grant",
      workspaceId: grant!.workspaceId,
      status: "revoked",
      payload: grant as unknown as Record<string, unknown>,
      createdAt: grant!.createdAt,
      updatedAt: grant!.revokedAt!,
    }));
    return context.json({ ok: true, grant });
  });

  app.get("/api/sessions/:id/messages", async (context) => {
    return context.json(
      await withStore(async (store) => {
        const sessionId = context.req.param("id");
        const session = await store.getSession(sessionId);
        if (!session) return { ok: false, error: "session not found", messages: [] };
        const messages = (await store.listMessages(sessionId)).map(toWebMessage);
        return { ok: true, session, messages };
      }),
    );
  });

  app.post("/api/sessions/:id/messages", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      role?: string;
      content?: string;
      runId?: string;
    };
    const role = parseMessageRole(body.role);
    const content = body.content ?? "";
    if (!role || !content.trim()) {
      return context.json({ ok: false, error: "role and content are required" }, 400);
    }

    return context.json(
      await withStore(async (store) => {
        const sessionId = context.req.param("id");
        const session = await store.getSession(sessionId);
        if (!session) return { ok: false, error: "session not found" };
        const message = await store.appendMessage({
          sessionId,
          role,
          contentJson: JSON.stringify(content),
          ...(body.runId ? { runId: body.runId } : {}),
        });
        return { ok: true, message: toWebMessage(message) };
      }),
    );
  });

  app.delete("/api/sessions/:id", async (context) => {
    return context.json(
      await withStore(async (store) => {
        await store.deleteSession(context.req.param("id"));
        return { ok: true };
      }),
    );
  });

  app.post("/api/sessions/:id/clear", async (context) => {
    return context.json(
      await withStore(async (store) => {
        await store.clearSession(context.req.param("id"));
        return { ok: true };
      }),
    );
  });

  app.get("/api/runtime/metrics", (context) => {
    return context.json({ ok: true, ...metricsSampler.sample() });
  });

  app.get("/api/tool-capabilities", async (context) => {
    const capabilities = await detectSecurityCapabilities();
    const health = listToolHealthRecords();
    return context.json({
      ok: true,
      capabilities,
      health,
      summary: {
        total: capabilities.length,
        verified: capabilities.filter((item) => item.status === "verified").length,
        ready: capabilities.filter((item) => item.status === "ready").length,
        degraded: capabilities.filter((item) => item.status === "degraded").length,
        unavailable: capabilities.filter(
          (item) => item.status === "unavailable" || item.status === "failed",
        ).length,
      },
    });
  });

  app.get("/api/plugins/catalog", async (context) => {
    try {
      return context.json({ ok: true, plugins: await listCuratedPlugins(workspaceRoot) });
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post("/api/plugins/:name/install", async (context) => {
    try {
      const installed = await installCuratedPlugin(workspaceRoot, context.req.param("name"));
      return context.json({ ok: true, plugin: installed.manifest });
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.delete("/api/plugins/:name", async (context) => {
    await uninstallPlugin(workspaceRoot, context.req.param("name"));
    return context.json({ ok: true });
  });

  app.post("/api/plugins/:name/enable", async (context) => {
    try {
      return context.json({
        ok: true,
        plugin: await setPluginEnabled(workspaceRoot, context.req.param("name"), true),
      });
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 404);
    }
  });

  app.post("/api/plugins/:name/disable", async (context) => {
    try {
      return context.json({
        ok: true,
        plugin: await setPluginEnabled(workspaceRoot, context.req.param("name"), false),
      });
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 404);
    }
  });

  app.get("/api/plugins/:name/verify", async (context) => {
    try {
      return context.json(await verifyInstalledPlugin(workspaceRoot, context.req.param("name")));
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 404);
    }
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
      const projects = await sqliteStore.listProjects();
      if (!projects.some((project) => project.id === defaultProject.id)) {
        await sqliteStore.upsertProject({ ...defaultProject, active: projects.length === 0 });
      }
      if (!(await sqliteStore.getSession(sessionId))) {
        await sqliteStore.createSession({
          id: sessionId,
          projectId: defaultProject.id,
          title: normalizeSessionTitle(message),
        });
      }
      await sqliteStore.appendMessage({
        sessionId,
        role: "user",
        contentJson: JSON.stringify(message),
      });
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
      await sqliteStore.appendMessage({
        sessionId,
        role: "assistant",
        contentJson: JSON.stringify(turn.reply),
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
    await withStore(async (store) => {
      if (!(await store.getSession(sessionId))) {
        await store.createSession({
          id: sessionId,
          projectId: defaultProject.id,
          title: normalizeSessionTitle(message),
        });
      }
      await store.appendMessage({
        sessionId,
        role: "user",
        contentJson: JSON.stringify(message),
      });
    });
    const provider =
      options.modelProvider !== undefined
        ? options.modelProvider
        : createChatModelProvider(loadModelConfig({ workspaceRoot }));

    if (!provider?.streamComplete) {
      const turn = await runAssistantChatTurn({
        message,
        workspaceRoot,
        ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
      });
      await withStore((store) =>
        store.appendMessage({
          sessionId,
          role: "assistant",
          contentJson: JSON.stringify(turn.reply),
        }).then(() => undefined),
      );
      const lines = [
        { type: "agent.event", event: "message.received", sessionId, message },
        { type: "agent.event", event: "model.completed", sessionId, model: turn.model },
        { type: "model.delta", sessionId, delta: turn.reply },
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
    }

    const systemPrompt = await loadAgentSystemPrompt({ workspaceRoot });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        let reply = "";
        const write = (line: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        };

        try {
          write({ type: "agent.event", event: "message.received", sessionId, message });
          for await (const delta of provider.streamComplete!({
            messages: [
              { role: "system", content: systemPrompt.finalPrompt },
              { role: "user", content: message },
            ],
          })) {
            reply += delta;
            write({ type: "model.delta", sessionId, delta });
          }
          write({
            type: "agent.event",
            event: "model.completed",
            sessionId,
            model: provider.model,
          });
          await withStore((store) =>
            store.appendMessage({
              sessionId,
              role: "assistant",
              contentJson: JSON.stringify(reply),
            }).then(() => undefined),
          );
          write({
            type: "assistant.final",
            sessionId,
            status: "answered",
            message: reply,
            model: provider.model,
          });
        } catch (error) {
          write({
            type: "error",
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
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
    const local = await listLocalSkills(workspaceRoot);
    return context.json({
      ok: true,
      skills: [
        ...registry.listSkills().map((skill) => ({
          ...skill,
          enabled: true,
          source: "built-in",
        })),
        ...plugins.plugins.flatMap((plugin) =>
          (plugin.skills ?? []).map((skill) => ({
            ...skill,
            enabled: true,
            source: "plugin",
            plugin: plugin.name,
          })),
        ),
        ...local.skills,
      ],
      tools: registry.listTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        permission: tool.permission,
      })),
      plugins,
      local,
    });
  });

  app.post("/api/skills", async (context) => {
    const body = (await context.req.json()) as {
      name?: string;
      version?: string;
      description?: string;
      capabilities?: string[];
      tools?: string[];
      permissions?: string[];
      entry?: string;
      enabled?: boolean;
    };
    if (!body.name || !body.description || !body.entry) {
      return context.json({ ok: false, error: "name, description and entry are required" }, 400);
    }

    return context.json({
      ok: true,
      ...(await saveLocalSkill({
        workspaceRoot,
        skill: {
          name: body.name,
          version: body.version ?? "0.1.0",
          description: body.description,
          capabilities: body.capabilities ?? [],
          tools: body.tools ?? [],
          permissions: body.permissions ?? [],
          entry: body.entry,
          enabled: body.enabled ?? true,
        },
      })),
    });
  });

  app.delete("/api/skills/:name", async (context) => {
    return context.json({
      ok: true,
      ...(await deleteLocalSkill({ workspaceRoot, name: context.req.param("name") })),
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
    return context.json({
      ok: false,
      error: "Direct MCP approval flags were removed. Submit a normalized tool call through /api/tool-calls.",
    }, 410);
  });

  app.post("/agent/harness/runs/stream", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      sessionId?: string;
      message?: string;
      mode?: "chat" | "patch" | "security";
    };
    const message = body.message?.trim();
    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }
    const sessionId = body.sessionId?.trim() || `web-harness-${Date.now()}`;
    const permissionLevel = await getSessionPolicy(sessionId);
    const mode = body.mode ?? "chat";
    const modelProviderOption = options.modelProvider;

    await withStore(async (store) => {
      const projects = await store.listProjects();
      const project = projects.find((item) => item.active) ?? defaultProject;
      if (!(await store.getProject(project.id))) {
        await store.upsertProject(project);
      }
      if (!(await store.getSession(sessionId))) {
        await store.createSession({
          id: sessionId,
          projectId: project.id,
          title: normalizeSessionTitle(message),
        });
        sessionPolicies.set(sessionId, "read-only");
      }
      await store.appendMessage({
        sessionId,
        role: "user",
        contentJson: JSON.stringify(message),
      });
      await store.saveHermesEvent(
        createHermesEvent({
          type: "message.received",
          sessionId,
          source: "api.agent.harness.stream",
          payload: { message, mode, permissionLevel },
        }),
      );
    });

    return createNdjsonStreamResponse(async (write) => {
      // Check model configuration before creating session
      const modelConfig = loadModelConfig({ workspaceRoot });
      const resolvedProvider = modelProviderOption ?? createChatModelProvider(modelConfig);
      if (!resolvedProvider) {
        write({
          type: "error",
          sessionId,
          message: "模型未配置。请在设置中配置 API Key 和模型地址，或使用环境变量 EGO_MODEL_PROVIDER。",
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const terminalSession = createTerminalAgentSession({
        workspaceRoot,
        egoHome,
        permissionLevel,
        modelProvider: resolvedProvider,
      });
      await terminalSession.hydratePendingRuns();

      let activeRunId: string | undefined;
      const events: AgentRunEvent[] = [];
      try {
        write({
          type: "agent.event",
          event: "web.run.started",
          sessionId,
          mode,
          permissionLevel,
          createdAt: new Date().toISOString(),
        });
        const runStream =
          mode === "chat"
            ? terminalSession.submitMessage(message)
            : terminalSession.startTask(prefixHarnessModeMessage(message, mode));
        for await (const event of runStream) {
          activeRunId ??= event.runId;
          events.push(event);
          activeHarnessSessions.set(event.runId, terminalSession);
          write({
            type: "agent.event",
            event: event.type,
            sessionId,
            runId: event.runId,
            phase: event.phase,
            permissionLevel: event.permissionLevel ?? permissionLevel,
            message: event.message,
            payload: event.payload,
            createdAt: event.createdAt,
          });
        }
        const finalMessage = summarizeHarnessAssistant(events);
        await withStore(async (store) => {
          await store.appendMessage({
            sessionId,
            role: "assistant",
            contentJson: JSON.stringify(finalMessage),
            ...(activeRunId ? { runId: activeRunId } : {}),
          });
          if (activeRunId) {
            await store.saveHermesEvent(
              createHermesEvent({
                type: "agent.harness.completed",
                sessionId,
                runId: activeRunId,
                source: "api.agent.harness.stream",
                payload: { mode, eventCount: events.length, permissionLevel },
              }),
            );
          }
        });
        write({
          type: "assistant.final",
          sessionId,
          runId: activeRunId,
          message: finalMessage,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const diagnostic = rawMessage.includes("fetch failed") || rawMessage.includes("ECONNREFUSED") || rawMessage.includes("ENOTFOUND")
          ? `模型服务不可达。请检查模型地址和 API Key 是否正确配置。\n原始错误：${rawMessage}`
          : `模型调用失败：${rawMessage}`;
        await withStore(async (store) => {
          await store.appendMessage({
            sessionId,
            role: "assistant",
            contentJson: JSON.stringify(diagnostic),
            ...(activeRunId ? { runId: activeRunId } : {}),
          });
        });
        write({
          type: "error",
          event: "web.run.failed",
          sessionId,
          runId: activeRunId,
          message: diagnostic,
          createdAt: new Date().toISOString(),
        });
      } finally {
        if (activeRunId) {
          activeHarnessSessions.delete(activeRunId);
        }
      }
    });
  });

  app.post("/api/terminal/commands", (context) => context.json({
    ok: false,
    error: "Raw terminal commands were removed. Use /api/tool-calls with structured argv.",
  }, 410));

  app.post("/api/tool-calls", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      sessionId?: string;
      tool?: string;
      input?: unknown;
      scopeId?: string;
    };
    const sessionId = body.sessionId?.trim();
    const toolName = body.tool?.trim();
    if (!sessionId || !toolName) return context.json({ ok: false, error: "sessionId and tool are required" }, 400);
    const sessionExists = await withStore(async (store) => Boolean(await store.getSession(sessionId)));
    if (!sessionExists) return context.json({ ok: false, error: "session not found" }, 404);
    const registry = createTerminalAgentToolRegistry();
    if (!registry.has(toolName)) return context.json({ ok: false, error: "tool is not registered" }, 404);
    const tool = registry.get(toolName);
    const call = createToolCall(tool, body.input ?? {});
    const programInput = body.input as { program?: unknown; args?: unknown } | undefined;
    if ((toolName === "shell.readonly" || toolName === "shell.write") && programInput) {
      const args = Array.isArray(programInput.args) ? programInput.args.map(String) : [];
      call.permissionResources = [[String(programInput.program ?? ""), ...args].join(" ")];
    }
    const permissionLevel = await getSessionPolicy(sessionId);
    let securityScope = body.scopeId ? securityScopes.get(body.scopeId)?.scope : undefined;
    if (body.scopeId && !securityScope) {
      const persisted = await withStore((store) => store.getSecurityScope(body.scopeId!));
      if (persisted?.status === "active") securityScope = persisted.payload as unknown as SecurityScopeV2;
    }
    if (body.scopeId && !securityScope) return context.json({ ok: false, error: "security scope not found" }, 404);
    if (call.requiresApproval || !hasHarnessPermission(permissionLevel, call.permissionRequired)) {
      pendingToolCalls.set(call.id, { call, sessionId, permissionLevel, ...(securityScope ? { securityScope } : {}) });
      return context.json({ ok: true, status: "pending_approval", call }, 202);
    }
    const now = Date.now();
    const persistedGrants = await withStore((store) => store.listPermissionGrants(defaultProject.id));
    for (const record of persistedGrants) permissionGrants.set(record.id, record.payload as unknown as PermissionGrantV2);
    const activeGrantRules = [...permissionGrants.values()]
      .filter((grant) => !grant.revokedAt && Date.parse(grant.expiresAt) > now && grant.useCount < grant.maxUses && grant.toolIdentity === call.toolIdentity)
      .map((grant) => ({ action: grant.action, resource: grant.resource, effect: grant.effect } as const));
    const result = await executeToolCall({
      tool,
      input: body.input ?? {},
      call,
      workspaceRoot,
      workspaceId: defaultProject.id,
      permissionLevel,
      permissionRules: [...permissionRulesForLevel(permissionLevel), ...activeGrantRules],
      ...(securityScope ? { securityScope } : {}),
      runId: call.id,
      sessionId,
    });
    if (result.status === "blocked") pendingToolCalls.set(call.id, { call, sessionId, permissionLevel, ...(securityScope ? { securityScope } : {}) });
    return context.json({ ok: result.status === "completed", status: result.status, call, result }, result.status === "blocked" ? 202 : 200);
  });

  app.post("/api/tool-calls/:id/approve", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { savePermission?: boolean };
    const pending = pendingToolCalls.get(context.req.param("id"));
    if (!pending) return context.json({ ok: false, error: "pending tool call not found or already consumed" }, 404);
    const registry = createTerminalAgentToolRegistry();
    if (!registry.has(pending.call.name)) return context.json({ ok: false, error: "tool is no longer registered" }, 409);
    const tool = registry.get(pending.call.name);
    const currentPolicy = await getSessionPolicy(pending.sessionId);
    const resource = pending.call.permissionResources?.[0] ?? "*";
    const operationApproval = createOperationApproval({
      call: pending.call,
      sessionId: pending.sessionId,
      workspaceId: defaultProject.id,
      source: "web",
      createdBy: "local-capability",
    });
    if (body.savePermission) {
      const grants = createPermissionGrantsV2({
        workspaceId: defaultProject.id,
        toolIdentity: pending.call.toolIdentity ?? `${pending.call.name}@1`,
        action: pending.call.permissionAction ?? pending.call.name,
        resources: pending.call.permissionResources ?? [resource],
        effect: "allow",
        source: "web",
        createdBy: "local-capability",
      });
      for (const grant of grants) {
        permissionGrants.set(grant.id, grant);
        await withStore((store) => store.savePermissionGrant({
          id: grant.id,
          sessionId: pending.sessionId,
          workspaceId: grant.workspaceId,
          status: "active",
          payload: grant as unknown as Record<string, unknown>,
          createdAt: grant.createdAt,
          updatedAt: grant.createdAt,
        }));
      }
    }
    await withStore((store) => store.saveOperationApproval({
      id: operationApproval.id,
      sessionId: pending.sessionId,
      workspaceId: defaultProject.id,
      status: "approved",
      payload: operationApproval as unknown as Record<string, unknown>,
      createdAt: operationApproval.createdAt,
      updatedAt: operationApproval.createdAt,
    }));
    const result = await executeToolCall({
      tool,
      input: pending.call.input,
      call: pending.call,
      workspaceRoot,
      workspaceId: defaultProject.id,
      permissionLevel: currentPolicy,
      operationApproval,
      ...(pending.securityScope ? { securityScope: pending.securityScope } : {}),
      permissionRules: [
        ...permissionRulesForLevel(currentPolicy),
        { action: pending.call.permissionAction ?? pending.call.name, resource, effect: "allow" },
      ],
      runId: pending.call.id,
      sessionId: pending.sessionId,
    });
    pendingToolCalls.delete(pending.call.id);
    await withStore((store) => store.saveOperationApproval({
      id: operationApproval.id,
      sessionId: pending.sessionId,
      workspaceId: defaultProject.id,
      status: operationApproval.usedAt ? "consumed" : result.status,
      payload: operationApproval as unknown as Record<string, unknown>,
      createdAt: operationApproval.createdAt,
      updatedAt: operationApproval.usedAt ?? new Date().toISOString(),
    }));
    await withStore(async (store) => {
      await store.saveHermesEvent(createHermesEvent({
        type: "tool.call.resolved",
        sessionId: pending.sessionId,
        runId: pending.call.id,
        source: "api.tool-calls",
        payload: { tool: pending.call.name, status: result.status, inputDigest: operationApproval.inputDigest },
      }));
    });
    return context.json({ ok: result.status === "completed", status: result.status, result });
  });

  app.post("/api/tool-calls/:id/deny", async (context) => {
    const pending = pendingToolCalls.get(context.req.param("id"));
    if (!pending) return context.json({ ok: false, error: "pending tool call not found" }, 404);
    pendingToolCalls.delete(pending.call.id);
    return context.json({ ok: true, status: "denied", callId: pending.call.id });
  });

  app.post("/agent/harness/runs", async (context) => {
    const body = (await context.req.json()) as {
      message?: string;
      sessionId?: string;
    };
    const message = body.message?.trim();
    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: await getSessionPolicy(body.sessionId ?? ""),
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    await session.hydratePendingRuns();
    let activeRunId: string | undefined;
    try {
      const events = await collectHarnessEvents(session.submitMessage(message), (event) => {
        activeRunId ??= event.runId;
        activeHarnessSessions.set(event.runId, session);
      });
      const runId = events[0]?.runId;
      return context.json({
        ok: true,
        runId,
        events,
        state: runId ? session.getRunState(runId) : undefined,
      });
    } finally {
      if (activeRunId) {
        activeHarnessSessions.delete(activeRunId);
      }
    }
  });

  app.post("/agent/harness/runs/:id/plan/approve", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { sessionId?: string };
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: await getSessionPolicy(body.sessionId ?? ""),
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    await session.hydratePendingRuns();
    const runId = context.req.param("id");
    const events = await collectHarnessEvents(session.approvePlan(runId));
    return context.json({ ok: true, runId, events, state: session.getRunState(runId) });
  });

  app.post("/agent/harness/runs/:id/patch/approve", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { sessionId?: string };
    const session = createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      permissionLevel: await getSessionPolicy(body.sessionId ?? ""),
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
    });
    await session.hydratePendingRuns();
    const runId = context.req.param("id");
    const events = await collectHarnessEvents(session.approvePatch(runId));
    return context.json({ ok: true, runId, events, state: session.getRunState(runId) });
  });

  app.post("/agent/harness/runs/:id/cancel", async (context) => {
    const runId = context.req.param("id");
    const session = activeHarnessSessions.get(runId);
    return context.json({
      ok: true,
      runId,
      cancelled: session ? session.cancel(runId) : false,
    });
  });

  app.post("/agent/harness/runs/:id/btw", async (context) => {
    const runId = context.req.param("id");
    const body = (await context.req.json().catch(() => ({}))) as { message?: string };
    const message = body.message?.trim();
    if (!message) {
      return context.json({ ok: false, error: "message is required" }, 400);
    }
    const session = activeHarnessSessions.get(runId);
    return context.json({
      ok: true,
      runId,
      queued: session ? session.btw(runId, message) : false,
    });
  });

  app.get("/agent/harness/policy", async (context) => {
    const session = createTerminalAgentSession({ workspaceRoot, egoHome });
    return context.json({ ok: true, policy: await session.getPolicy() });
  });

  app.patch("/agent/harness/policy", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as Partial<LoopPolicy>;
    const session = createTerminalAgentSession({ workspaceRoot, egoHome });
    return context.json({ ok: true, policy: await session.setPolicy(body) });
  });

  app.get("/api/eval-artifacts", async (context) => {
    const [contract, model] = await Promise.all([
      readEvalArtifactSummary(join(workspaceRoot, "hardness-artifacts", "security-eval-scripted_contract.json")),
      readEvalArtifactSummary(join(workspaceRoot, "hardness-artifacts", "security-eval-model_live.json")),
    ]);
    return context.json({ ok: true, artifacts: { contract, model } });
  });

  app.get("/api/runs/:id/repro-bundle", async (context) => {
    const runId = context.req.param("id");
    const session = createTerminalAgentSession({ workspaceRoot, egoHome });
    const events = await session.replayRun(runId);
    if (events.length === 0) {
      return context.json({ ok: false, error: "run not found" }, 404);
    }
    const evidenceEvents = events.map((event) => {
      const payload = sanitizeReproPayload(event.payload);
      return {
        type: event.type,
        runId: event.runId ?? runId,
        message: event.message ?? event.type,
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
        ...(payload ? { payload } : {}),
      };
    });
    return context.json({
      ok: true,
      runId,
      bundle: buildReproBundleFromEvents({ events: evidenceEvents }),
    });
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

async function readEvalArtifactSummary(path: string): Promise<EvalArtifactSummary | null> {
  if (!existsSync(path)) {
    return null;
  }
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const sanitized = sanitizeSecretValue(parsed) as Record<string, unknown>;
  return {
    ...(typeof sanitized.mode === "string" ? { mode: sanitized.mode } : {}),
    ...(typeof sanitized.generatedAt === "string" ? { generatedAt: sanitized.generatedAt } : {}),
    ...(typeof sanitized.averageScore === "number" ? { averageScore: sanitized.averageScore } : {}),
    safetyViolations: Array.isArray(sanitized.safetyViolations)
      ? sanitized.safetyViolations
      : [],
    results: Array.isArray(sanitized.results)
      ? sanitized.results.map((item) => summarizeEvalResult(item))
      : [],
  };
}

function summarizeEvalResult(value: unknown): EvalArtifactSummary["results"][number] {
  const item = isRecord(value) ? value : {};
  return {
    ...(typeof item.scenario === "string" ? { scenario: item.scenario } : {}),
    ...(typeof item.score === "number" ? { score: item.score } : {}),
    ...(Array.isArray(item.seedScores) && item.seedScores.every((score) => typeof score === "number")
      ? { seedScores: item.seedScores }
      : {}),
    ...(Array.isArray(item.confirmed)
      ? { confirmed: item.confirmed.map((entry) => String(entry)).slice(0, 8) }
      : {}),
    safetyViolations: Array.isArray(item.safetyViolations)
      ? item.safetyViolations
      : [],
  };
}

function sanitizeReproPayload(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const sanitized = sanitizeSecretValue(value);
  if (sanitized === undefined || sanitized === null) {
    return undefined;
  }
  if (isRecord(sanitized)) {
    return sanitized;
  }
  return { value: sanitized };
}

function sanitizeSecretValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSecretValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? "[redacted]" : sanitizeSecretValue(entry),
      ]),
    );
  }
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return /api[-_]?key|authorization|bearer|cookie|token|secret|password|credential/i.test(key);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, "sk-[redacted]")
    .replace(/\b(api[-_]?key|token|secret|password|cookie)=([^;\s]+)/gi, "$1=[redacted]");
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

function toProjectRecord(path: string, active: boolean) {
  const normalized = resolve(path);
  const now = new Date().toISOString();
  return {
    id: `project-${Buffer.from(normalized).toString("base64url")}`,
    name: basename(normalized) || normalized,
    path: normalized,
    active,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeSessionTitle(value: string | undefined): string {
  const title = value?.trim();
  return title ? title.slice(0, 48) : "新对话";
}

function parseMessageRole(role: string | undefined): "system" | "user" | "assistant" | "tool" | undefined {
  return role === "system" || role === "user" || role === "assistant" || role === "tool"
    ? role
    : undefined;
}

function toWebMessage(message: {
  id: string;
  sessionId: string;
  runId?: string;
  role: "system" | "user" | "assistant" | "tool";
  contentJson: string;
  createdAt: string;
}) {
  const parsed = parseMessageContent(message.contentJson);
  return {
    id: message.id,
    sessionId: message.sessionId,
    ...(message.runId ? { runId: message.runId } : {}),
    role: message.role,
    content: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
    createdAt: message.createdAt,
  };
}

function parsePermissionLevel(value: unknown): PermissionLevel | undefined {
  return value === "read-only" ||
    value === "workspace-write" ||
    value === "shell-readonly" ||
    value === "network-low" ||
    value === "security-active"
    ? value
    : undefined;
}

function prefixHarnessModeMessage(message: string, mode: "chat" | "patch" | "security"): string {
  if (mode === "patch") {
    return `请以生成 Patch 的工作流处理：先给出计划和风险，再在需要时提出可审批的修改。\n\n${message}`;
  }
  if (mode === "security") {
    return `请以授权安全任务的工作流处理：先确认范围、权限和证据链，再执行必要的安全分析。\n\n${message}`;
  }
  return message;
}

function summarizeHarnessAssistant(events: AgentRunEvent[]): string {
  const completed = [...events].reverse().find((event) => event.type === "assistant.completed");
  if (completed?.message?.trim()) {
    return completed.message;
  }
  const assistantMessages = events
    .filter(
      (event) =>
        event.type === "assistant.message" ||
        event.type === "assistant.delta" ||
        event.type === "run.blocked" ||
        event.type === "tool.blocked",
    )
    .map((event) => event.message?.trim())
    .filter((message): message is string => Boolean(message));
  return assistantMessages.at(-1) ?? "Agent 运行结束，但没有返回可展示的最终文本。请展开执行过程查看事件。";
}

function createNdjsonStreamResponse(
  producer: (write: (value: Record<string, unknown>) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };
      try {
        await producer(write);
      } catch (error) {
        write({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          createdAt: new Date().toISOString(),
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}


async function collectHarnessEvents(
  stream: AsyncIterable<AgentRunEvent>,
  onEvent?: (event: AgentRunEvent) => void,
): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of stream) {
    onEvent?.(event);
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
