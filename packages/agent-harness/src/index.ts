import {
  draftAgentPlan,
  loadAgentSystemPrompt,
  runAssistantChatTurn,
  runCodingAgentTurn,
  type AgentCheckCommand,
} from "@ego-graph/agent";
import { createTrajectoryEvent, type TrajectoryEvent } from "@ego-graph/core";
import { createHermesEvent } from "@ego-graph/hermes";
import {
  createChatModelProvider,
  generateJson,
  loadModelConfig,
  type ChatModelProvider,
} from "@ego-graph/llm";
import { listMcpRuntimeTools, loadMcpConfig, type McpConfig } from "@ego-graph/mcp";
import { createMemoryService, type MemoryRecord as RuntimeMemoryRecord } from "@ego-graph/memory";
import {
  defaultEgoHome,
  sqlitePath,
  SqliteEgoStore,
  type AgentCheckRecord,
  type AgentEditRecord,
  type AgentPlanRecord,
  type MemoryRecord,
} from "@ego-graph/storage";
import {
  createTerminalAgentToolRegistry,
  type ToolDefinition,
  type ToolEvidenceCandidate,
} from "@ego-graph/tools";
import {
  createWorkspaceContextPack,
  createWorkspaceService,
  type ProjectSummary,
  type WorkspaceContextPack,
  type WorkspaceEditPlan,
} from "@ego-graph/workspace";
import { z, type ZodTypeAny } from "zod";

export type PermissionLevel =
  "read-only" | "workspace-write" | "shell-readonly" | "network-low" | "security-active";

export type AgentRunEventType =
  | "user.message"
  | "assistant.message"
  | "run.started"
  | "context.loaded"
  | "memory.recalled"
  | "model.failed"
  | "planner.fallback"
  | "planner.model.used"
  | "plan.proposed"
  | "plan.approved"
  | "plan.rejected"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "tool.blocked"
  | "observation.created"
  | "evidence.created"
  | "reflection.created"
  | "patch.proposed"
  | "patch.approved"
  | "patch.rejected"
  | "patch.applied"
  | "check.started"
  | "check.completed"
  | "repair.proposed"
  | "repair.skipped"
  | "memory.written"
  | "memory.compacted"
  | "memory.archived"
  | "memory.forgotten"
  | "mcp.tools.discovered"
  | "mcp.call.proposed"
  | "mcp.call.completed"
  | "run.completed"
  | "run.blocked";

export type AgentHarnessPhase =
  | "chat"
  | "inspect"
  | "plan"
  | "tool_call"
  | "diff_preview"
  | "approval"
  | "apply"
  | "check"
  | "repair"
  | "complete"
  | "blocked";

export type TerminalToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  permissionRequired: PermissionLevel;
  riskLevel: string;
  timeoutMs: number;
};

export type EvidenceGapStep = {
  id: string;
  title: string;
  knownEvidence: string[];
  missingEvidence: string[];
  toolChoiceRationale: string;
  expectedResult: string;
  stopCondition: string;
  riskNote: string;
};

export type AgentRunEvent = {
  type: AgentRunEventType;
  runId: string;
  sessionId: string;
  message: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export type TerminalAgentSessionOptions = {
  workspaceRoot: string;
  egoHome?: string;
  permissionLevel?: PermissionLevel;
  modelProvider?: ChatModelProvider | null;
  checkCommands?: AgentCheckCommand[];
};

export type TerminalAgentSession = {
  getPermissionLevel(): PermissionLevel;
  setPermissionLevel(level: PermissionLevel): void;
  hydratePendingRuns(): Promise<TerminalAgentRunState[]>;
  submitMessage(message: string): AsyncIterable<AgentRunEvent>;
  startTask(message: string): AsyncIterable<AgentRunEvent>;
  approvePlan(runId: string): AsyncIterable<AgentRunEvent>;
  rejectPlan(runId: string): AsyncIterable<AgentRunEvent>;
  approvePatch(runId: string): AsyncIterable<AgentRunEvent>;
  rejectPatch(runId: string): AsyncIterable<AgentRunEvent>;
  replayRun(runId: string): Promise<AgentRunEvent[]>;
  recallMemory(query: string): Promise<AgentRunEvent[]>;
  compactMemory(query?: string): Promise<AgentRunEvent[]>;
  archiveMemory(id: string): Promise<AgentRunEvent[]>;
  forgetMemory(id: string): Promise<AgentRunEvent[]>;
  discoverMcpTools(): Promise<AgentRunEvent[]>;
  callMcpTool(name: string, args?: Record<string, unknown>): AsyncIterable<AgentRunEvent>;
  getRunState(runId: string): TerminalAgentRunState | undefined;
};

export type TerminalAgentRunState = {
  runId: string;
  sessionId: string;
  message: string;
  status:
    | "planning"
    | "answered"
    | "plan_pending"
    | "patch_pending"
    | "repair_pending"
    | "applied"
    | "blocked"
    | "rejected";
  phase: AgentHarnessPhase;
  plan?: EvidenceGapStep[];
  diff?: string;
  files?: string[];
  checks?: AgentCheckRecord[];
  repairAttempts?: number;
  contextPack?: WorkspaceContextPack;
};

type PendingRun = TerminalAgentRunState & {
  editPlan?: WorkspaceEditPlan;
  approvalId?: string;
};

export type TerminalIntent = "chat" | "project_analysis" | "code_change" | "security_task";

const maxRepairAttempts = 2;

const permissionRank: Record<PermissionLevel, number> = {
  "read-only": 0,
  "workspace-write": 1,
  "shell-readonly": 2,
  "network-low": 3,
  "security-active": 4,
};

export function createTerminalAgentSession(
  options: TerminalAgentSessionOptions,
): TerminalAgentSession {
  const workspaceRoot = options.workspaceRoot;
  const egoHome = options.egoHome ?? defaultEgoHome();
  const store = new SqliteEgoStore(sqlitePath(egoHome));
  const toolRegistry = createTerminalAgentToolRegistry();
  const pendingRuns = new Map<string, PendingRun>();
  const plannerProvider = resolvePlannerProvider(options);
  let permissionLevel = options.permissionLevel ?? "read-only";

  return {
    getPermissionLevel() {
      return permissionLevel;
    },
    setPermissionLevel(level) {
      permissionLevel = level;
    },
    async hydratePendingRuns() {
      await hydratePendingRunsFromStore({ store, pendingRuns });
      return [...pendingRuns.values()];
    },
    submitMessage(message) {
      const intent = classifyTerminalIntent(message);
      if (intent === "code_change" || intent === "security_task") {
        return streamStartTask({
          message,
          workspaceRoot,
          store,
          toolRegistry,
          pendingRuns,
          plannerProvider,
          getPermissionLevel: () => permissionLevel,
        });
      }

      return streamChatTurn({
        message,
        workspaceRoot,
        store,
        pendingRuns,
        intent,
        modelProvider: options.modelProvider,
        getPermissionLevel: () => permissionLevel,
      });
    },
    startTask(message) {
      return streamStartTask({
        message,
        workspaceRoot,
        store,
        toolRegistry,
        pendingRuns,
        plannerProvider,
        getPermissionLevel: () => permissionLevel,
      });
    },
    approvePlan(runId) {
      return streamApprovePlan({
        runId,
        workspaceRoot,
        store,
        pendingRuns,
        modelProvider: options.modelProvider,
        ...(options.checkCommands ? { checkCommands: options.checkCommands } : {}),
        getPermissionLevel: () => permissionLevel,
      });
    },
    rejectPlan(runId) {
      return streamRejectPlan({ runId, store, pendingRuns });
    },
    approvePatch(runId) {
      return streamApprovePatch({
        runId,
        workspaceRoot,
        store,
        pendingRuns,
        modelProvider: options.modelProvider,
        ...(options.checkCommands ? { checkCommands: options.checkCommands } : {}),
      });
    },
    rejectPatch(runId) {
      return streamRejectPatch({ runId, store, pendingRuns });
    },
    async replayRun(runId) {
      const events = await store.listHermesEvents({ runId, limit: 200 });
      return events
        .slice()
        .reverse()
        .map((event) => ({
          type: normalizeEventType(event.type),
          runId,
          sessionId: event.sessionId,
          message: readString(event.payload.message, event.type),
          createdAt: event.createdAt,
          payload: event.payload,
        }));
    },
    recallMemory(query) {
      return recallMemoryEvents({ store, query });
    },
    compactMemory(query) {
      return compactMemoryEvents({ store, ...(query ? { query } : {}) });
    },
    archiveMemory(id) {
      return archiveMemoryEvents({ store, id });
    },
    forgetMemory(id) {
      return forgetMemoryEvents({ store, id });
    },
    discoverMcpTools() {
      return discoverMcpToolEvents({ store, workspaceRoot });
    },
    callMcpTool(name, args) {
      return streamMcpToolCall({
        name,
        args: args ?? {},
        workspaceRoot,
        store,
        getPermissionLevel: () => permissionLevel,
      });
    },
    getRunState(runId) {
      return pendingRuns.get(runId);
    },
  };
}

async function* streamChatTurn(input: {
  message: string;
  workspaceRoot: string;
  store: SqliteEgoStore;
  pendingRuns: Map<string, PendingRun>;
  intent: TerminalIntent;
  modelProvider: TerminalAgentSessionOptions["modelProvider"];
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const now = new Date().toISOString();
  const runId = `tui-chat-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `tui-session-${Date.now()}`;
  input.pendingRuns.set(runId, {
    runId,
    sessionId,
    message: input.message,
    status: "planning",
    phase: "chat",
  });
  await input.store.saveAgentRun({
    runId,
    message: input.message,
    mode: "terminal-chat",
    status: "inspect",
    createdAt: now,
    updatedAt: now,
  });

  yield await emit(input.store, {
    type: "user.message",
    runId,
    sessionId,
    message: input.message,
    payload: { intent: input.intent, permissionLevel: input.getPermissionLevel() },
  });

  const memoryHits = await recallStoreMemories(input.store, input.message);
  if (input.intent === "project_analysis") {
    const contextPack = await createWorkspaceContextPack({
      workspaceRoot: input.workspaceRoot,
      query: input.message,
      recentEvents: await readRecentEventMessages(input.store),
      maxFiles: 6,
      maxCharsPerFile: 6_000,
    });
    yield await emit(input.store, {
      type: "context.loaded",
      runId,
      sessionId,
      message: `已读取项目上下文：${contextPack.summary.apps.length} 个 app、${contextPack.summary.packages.length} 个 package、${contextPack.selectedFiles.length} 个相关文件。`,
      payload: {
        repoMap: contextPack.repoMap.slice(0, 12),
        selectedFiles: contextPack.selectedFiles.map((file) => ({
          path: file.path,
          score: file.score,
          reason: file.reason,
          truncated: file.truncated,
        })),
        recentEventsSummary: contextPack.recentEventsSummary,
      },
    });
  }

  try {
    const turn = await runAssistantChatTurn({
      message: input.message,
      workspaceRoot: input.workspaceRoot,
      memoryHints: memoryHits.map((memory) => `[${memory.scope}] ${memory.content}`),
      ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
    });
    const reply =
      turn.status === "needs_model"
        ? buildLocalAssistantFallback(input.message, input.intent, turn.observations)
        : turn.reply;

    input.pendingRuns.set(runId, {
      runId,
      sessionId,
      message: input.message,
      status: "answered",
      phase: "complete",
    });
    await input.store.saveAgentRun({
      runId,
      message: input.message,
      mode: "terminal-chat",
      status: "inspect",
      createdAt: now,
      updatedAt: new Date().toISOString(),
    });

    yield await emit(input.store, {
      type: "assistant.message",
      runId,
      sessionId,
      message: reply,
      payload: {
        status: turn.status,
        model: turn.model,
        suggestedCommands: turn.suggestedCommands,
      },
    });
  } catch (error) {
    const debug = error instanceof Error ? error.message : String(error);
    input.pendingRuns.set(runId, {
      runId,
      sessionId,
      message: input.message,
      status: "blocked",
      phase: "blocked",
    });
    yield await emit(input.store, {
      type: "assistant.message",
      runId,
      sessionId,
      message: "模型回答失败，已保留调试信息。请检查模型配置或使用 /debug 查看详情。",
      payload: { debug },
    });
  }
}

async function* streamStartTask(input: {
  message: string;
  workspaceRoot: string;
  store: SqliteEgoStore;
  toolRegistry: ReturnType<typeof createTerminalAgentToolRegistry>;
  pendingRuns: Map<string, PendingRun>;
  plannerProvider: ChatModelProvider | null | undefined;
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const now = new Date().toISOString();
  const runId = `tui-run-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `tui-session-${Date.now()}`;
  const createdAt = new Date().toISOString();
  input.pendingRuns.set(runId, {
    runId,
    sessionId,
    message: input.message,
    status: "planning",
    phase: "inspect",
  });
  await input.store.saveAgentRun({
    runId,
    message: input.message,
    mode: "terminal-agent",
    status: "inspect",
    createdAt,
    updatedAt: createdAt,
  });

  yield await emit(input.store, {
    type: "run.started",
    runId,
    sessionId,
    message: `Terminal Agent started with ${input.getPermissionLevel()} permissions.`,
    payload: { userMessage: input.message, permissionLevel: input.getPermissionLevel() },
  });

  const contextPack = await createWorkspaceContextPack({
    workspaceRoot: input.workspaceRoot,
    query: input.message,
    recentEvents: await readRecentEventMessages(input.store),
    maxFiles: 8,
    maxCharsPerFile: 8_000,
  });
  const summary = contextPack.summary;
  const files = contextPack.selectedFiles.map((file) => file.path);
  yield await emit(input.store, {
    type: "context.loaded",
    runId,
    sessionId,
    message: `Loaded repo map and ${contextPack.selectedFiles.length} relevant context file(s).`,
    payload: {
      repoMap: contextPack.repoMap.slice(0, 20),
      selectedFiles: contextPack.selectedFiles.map((file) => ({
        path: file.path,
        score: file.score,
        reason: file.reason,
        truncated: file.truncated,
        originalChars: file.originalChars,
      })),
      recentEventsSummary: contextPack.recentEventsSummary,
      budget: contextPack.budget,
    },
  });

  const memoryHits = await recallStoreMemories(input.store, input.message);
  yield await emit(input.store, {
    type: "memory.recalled",
    runId,
    sessionId,
    message: `Recalled ${memoryHits.length} relevant memory item(s).`,
    payload: { memories: memoryHits.map((memory) => memory.content).slice(0, 5) },
  });

  const mcpDiscovery = await registerMcpRuntimeTools(input.toolRegistry, input.workspaceRoot);
  if (mcpDiscovery.tools.length > 0 || mcpDiscovery.errors.length > 0) {
    yield await emit(input.store, {
      type: "mcp.tools.discovered",
      runId,
      sessionId,
      message: `Discovered ${mcpDiscovery.tools.length} MCP tool(s) from configured stdio server(s).`,
      payload: {
        tools: mcpDiscovery.tools,
        errors: mcpDiscovery.errors,
      },
    });
  }

  for (const request of buildReadOnlyToolRequests(input.message, summary)) {
    yield* executeToolStep({
      runId,
      sessionId,
      store: input.store,
      workspaceRoot: input.workspaceRoot,
      toolRegistry: input.toolRegistry,
      permissionLevel: input.getPermissionLevel(),
      toolName: request.toolName,
      toolInput: request.input,
    });
  }

  let plan = buildEvidenceGapPlan(input.message, summary, files, memoryHits);
  if (input.plannerProvider) {
    const modelPlan = await generateEvidenceGapPlan({
      provider: input.plannerProvider,
      workspaceRoot: input.workspaceRoot,
      message: input.message,
      summary,
      files,
      memories: memoryHits,
      tools: input.toolRegistry.list().map(summarizeTool),
    });
    if (modelPlan.status === "proposed") {
      plan = modelPlan.plan;
      yield await emit(input.store, {
        type: "planner.model.used",
        runId,
        sessionId,
        message: `Model generated ${plan.length} evidence-gap step(s).`,
        payload: {
          provider: input.plannerProvider.name,
          model: input.plannerProvider.model,
        },
      });
    } else {
      yield await emit(input.store, {
        type: "model.failed",
        runId,
        sessionId,
        message: modelPlan.message,
        payload: {
          provider: input.plannerProvider.name,
          model: input.plannerProvider.model,
          debug: modelPlan.debug,
        },
      });
      yield await emit(input.store, {
        type: "planner.fallback",
        runId,
        sessionId,
        message: "Fell back to deterministic evidence-gap planner.",
        payload: {},
      });
    }
  }
  const draft = await draftAgentPlan({
    message: input.message,
    workspaceRoot: input.workspaceRoot,
    sessionId,
    mode: "coding",
    memoryHits,
  });
  await input.store.saveAgentPlan({
    planId: draft.planId,
    sessionId,
    runId,
    mode: "coding",
    message: input.message,
    status: "draft",
    plan: plan.map(formatEvidenceGapStep),
    contextSummary: draft.contextSummary,
    memoryIds: memoryHits.map((memory) => memory.id),
    createdAt: draft.createdAt,
    updatedAt: draft.createdAt,
  });
  await input.store.saveApproval({
    id: `approval-plan-${runId}`,
    runId,
    kind: "agent_plan",
    status: "pending",
    createdAt: draft.createdAt,
    updatedAt: draft.createdAt,
  });
  input.pendingRuns.set(runId, {
    runId,
    sessionId,
    message: input.message,
    status: "plan_pending",
    phase: "approval",
    plan,
    contextPack,
  });

  yield await emit(input.store, {
    type: "plan.proposed",
    runId,
    sessionId,
    message: "Evidence-gap plan proposed. Approve it before generating a Patch.",
    payload: { planId: draft.planId, plan },
  });
}

async function* streamApprovePlan(input: {
  runId: string;
  workspaceRoot: string;
  store: SqliteEgoStore;
  pendingRuns: Map<string, PendingRun>;
  modelProvider: TerminalAgentSessionOptions["modelProvider"];
  checkCommands?: AgentCheckCommand[];
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const pending = input.pendingRuns.get(input.runId);
  if (!pending) {
    yield await emitSyntheticBlocked(input.store, input.runId, "No pending plan found.");
    return;
  }
  if (!hasPermission(input.getPermissionLevel(), "workspace-write")) {
    pending.status = "blocked";
    pending.phase = "blocked";
    yield await emit(input.store, {
      type: "run.blocked",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: "Plan approval requires /allow workspace-write or higher.",
      payload: { permissionLevel: input.getPermissionLevel() },
    });
    return;
  }

  const now = new Date().toISOString();
  pending.phase = "approval";
  await input.store.saveApproval({
    id: `approval-plan-${pending.runId}`,
    runId: pending.runId,
    kind: "agent_plan",
    status: "approved",
    createdAt: now,
    updatedAt: now,
  });
  yield await emit(input.store, {
    type: "plan.approved",
    runId: pending.runId,
    sessionId: pending.sessionId,
    message: "Plan approved. Generating policy-gated Patch preview.",
    payload: { plan: pending.plan ?? [] },
  });

  const turn = await runCodingAgentTurn({
    message: pending.message,
    workspaceRoot: input.workspaceRoot,
    runId: pending.runId,
    mode: "propose_edits",
    autoPropose: true,
    ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
  });
  await persistTrajectoryEvents(input.store, turn.trajectoryEvents);

  if (turn.status !== "pending_approval" || !turn.editPlan || !turn.diff || !turn.editPreview) {
    pending.status = turn.status === "needs_model" ? "blocked" : "blocked";
    pending.phase = "blocked";
    yield await emit(input.store, {
      type: "run.blocked",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: turn.assistantMessage,
      payload: { status: turn.status, plan: turn.plan },
    });
    return;
  }

  const approvalId = `approval-${turn.editPreview.id}`;
  await input.store.saveAgentEdit({
    runId: pending.runId,
    previewId: turn.editPreview.id,
    status: "pending",
    diff: turn.diff,
    plan: turn.editPlan as unknown as Record<string, unknown>,
    files: turn.editPreview.files,
    createdAt: now,
  });
  await input.store.saveApproval({
    id: approvalId,
    runId: pending.runId,
    kind: "agent_edit",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  await input.store.saveAgentRun({
    runId: pending.runId,
    message: pending.message,
    mode: "terminal-agent",
    status: "pending_approval",
    createdAt: now,
    updatedAt: now,
  });

  pending.status = "patch_pending";
  pending.phase = "diff_preview";
  pending.editPlan = turn.editPlan;
  pending.diff = turn.diff;
  pending.files = turn.editPreview.files;
  pending.approvalId = approvalId;
  pending.repairAttempts ??= 0;

  yield await emit(input.store, {
    type: "patch.proposed",
    runId: pending.runId,
    sessionId: pending.sessionId,
    message: `Patch preview ready for ${turn.editPreview.files.length} file(s).`,
    payload: { approvalId, diff: turn.diff, files: turn.editPreview.files },
  });
}

async function* streamRejectPlan(input: {
  runId: string;
  store: SqliteEgoStore;
  pendingRuns: Map<string, PendingRun>;
}): AsyncIterable<AgentRunEvent> {
  const pending = input.pendingRuns.get(input.runId);
  if (!pending) {
    yield await emitSyntheticBlocked(input.store, input.runId, "No pending plan found.");
    return;
  }
  const now = new Date().toISOString();
  pending.status = "rejected";
  pending.phase = "blocked";
  await input.store.saveApproval({
    id: `approval-plan-${pending.runId}`,
    runId: pending.runId,
    kind: "agent_plan",
    status: "rejected",
    createdAt: now,
    updatedAt: now,
  });
  yield await emit(input.store, {
    type: "plan.rejected",
    runId: pending.runId,
    sessionId: pending.sessionId,
    message: "Plan rejected. No Patch generated.",
    payload: {},
  });
}

async function* streamApprovePatch(input: {
  runId: string;
  workspaceRoot: string;
  store: SqliteEgoStore;
  pendingRuns: Map<string, PendingRun>;
  checkCommands?: AgentCheckCommand[];
  modelProvider: TerminalAgentSessionOptions["modelProvider"];
}): AsyncIterable<AgentRunEvent> {
  const pending = input.pendingRuns.get(input.runId);
  if (!pending?.editPlan) {
    yield await emitSyntheticBlocked(input.store, input.runId, "No pending Patch found.");
    return;
  }
  const now = new Date().toISOString();
  pending.phase = "apply";
  await input.store.saveApproval({
    id: pending.approvalId ?? `approval-patch-${pending.runId}`,
    runId: pending.runId,
    kind: "agent_edit",
    status: "approved",
    createdAt: now,
    updatedAt: now,
  });
  yield await emit(input.store, {
    type: "patch.approved",
    runId: pending.runId,
    sessionId: pending.sessionId,
    message: "Patch approved. Applying workspace edit and running checks.",
    payload: { files: pending.files ?? [] },
  });

  const turn = await runCodingAgentTurn({
    message: pending.message,
    workspaceRoot: input.workspaceRoot,
    runId: pending.runId,
    mode: "apply_approved_edits",
    editPlan: pending.editPlan,
    checkCommands: input.checkCommands ?? [
      { name: "typecheck", command: "pnpm", args: ["typecheck"] },
    ],
    ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
    ...(pending.approvalId ? { approvalId: pending.approvalId } : {}),
  });
  await persistTrajectoryEvents(input.store, turn.trajectoryEvents);

  if (turn.editResult?.applied) {
    await input.store.updateAgentEditStatus(pending.runId, "applied", now);
    yield await emit(input.store, {
      type: "patch.applied",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: `Patch applied to ${(turn.editResult.files ?? []).join(", ") || "workspace"}.`,
      payload: { files: turn.editResult.files ?? [] },
    });
  }

  pending.phase = "check";
  const checks: AgentCheckRecord[] = [];
  for (const check of turn.checks) {
    yield await emit(input.store, {
      type: "check.started",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: `Check started: ${check.command}`,
      payload: { check },
    });
    const record = {
      runId: pending.runId,
      name: check.name,
      command: check.command,
      status: check.status,
      exitCode: check.exitCode,
      stdout: check.stdout,
      stderr: check.stderr,
      createdAt: new Date().toISOString(),
    } satisfies AgentCheckRecord;
    checks.push(record);
    await input.store.saveAgentCheck(record);
    yield await emit(input.store, {
      type: "check.completed",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: `Check ${check.status}: ${check.command}`,
      payload: { check },
    });
  }

  pending.checks = checks;
  const status = checks.every((check) => check.status === "passed") ? "applied" : "blocked";
  if (status === "blocked") {
    const repairEvents = await proposeRepairAfterFailedChecks({
      pending,
      workspaceRoot: input.workspaceRoot,
      store: input.store,
      modelProvider: input.modelProvider,
      failedChecks: checks.filter((check) => check.status === "failed"),
    });
    if (repairEvents.length > 0) {
      for (const event of repairEvents) {
        yield event;
      }
      return;
    }
  }

  pending.status = "applied";
  pending.phase = status === "applied" ? "complete" : "blocked";
  await rememberRunSummary(input.store, pending, checks, status);
  await input.store.saveAgentRun({
    runId: pending.runId,
    message: pending.message,
    mode: "terminal-agent",
    status,
    createdAt: now,
    updatedAt: new Date().toISOString(),
  });

  yield await emit(input.store, {
    type: "run.completed",
    runId: pending.runId,
    sessionId: pending.sessionId,
    message: buildFinalSummary(turn.checks),
    payload: { checks: turn.checks, files: pending.files ?? [] },
  });
}

async function* streamRejectPatch(input: {
  runId: string;
  store: SqliteEgoStore;
  pendingRuns: Map<string, PendingRun>;
}): AsyncIterable<AgentRunEvent> {
  const pending = input.pendingRuns.get(input.runId);
  if (!pending) {
    yield await emitSyntheticBlocked(input.store, input.runId, "No pending Patch found.");
    return;
  }
  const now = new Date().toISOString();
  pending.status = "rejected";
  pending.phase = "blocked";
  await input.store.updateAgentEditStatus(pending.runId, "blocked");
  await input.store.saveApproval({
    id: pending.approvalId ?? `approval-patch-${pending.runId}`,
    runId: pending.runId,
    kind: "agent_edit",
    status: "rejected",
    createdAt: now,
    updatedAt: now,
  });
  yield await emit(input.store, {
    type: "patch.rejected",
    runId: pending.runId,
    sessionId: pending.sessionId,
    message: "Patch rejected. No files changed.",
    payload: { files: pending.files ?? [] },
  });
}

async function proposeRepairAfterFailedChecks(input: {
  pending: PendingRun;
  workspaceRoot: string;
  store: SqliteEgoStore;
  modelProvider: TerminalAgentSessionOptions["modelProvider"];
  failedChecks: AgentCheckRecord[];
}): Promise<AgentRunEvent[]> {
  const pending = input.pending;
  const attempts = pending.repairAttempts ?? 0;
  if (attempts >= maxRepairAttempts) {
    pending.status = "blocked";
    pending.phase = "blocked";
    return [
      await emit(input.store, {
        type: "repair.skipped",
        runId: pending.runId,
        sessionId: pending.sessionId,
        message: `Checks failed and repair limit (${maxRepairAttempts}) was reached.`,
        payload: { failedChecks: summarizeChecks(input.failedChecks), repairAttempts: attempts },
      }),
    ];
  }

  pending.phase = "repair";
  const repairMessage = [
    pending.message,
    "",
    "Checks failed after applying the previous patch. Generate a minimal repair WorkspaceEditPlan.",
    ...summarizeChecks(input.failedChecks).map((check) => `- ${check}`),
  ].join("\n");
  const turn = await runCodingAgentTurn({
    message: repairMessage,
    workspaceRoot: input.workspaceRoot,
    runId: `${pending.runId}-repair-${attempts + 1}`,
    mode: "propose_edits",
    autoPropose: true,
    ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
  });
  await persistTrajectoryEvents(input.store, turn.trajectoryEvents);

  if (turn.status !== "pending_approval" || !turn.editPlan || !turn.diff || !turn.editPreview) {
    pending.status = "blocked";
    pending.phase = "blocked";
    return [
      await emit(input.store, {
        type: "repair.skipped",
        runId: pending.runId,
        sessionId: pending.sessionId,
        message:
          turn.status === "needs_model"
            ? "Checks failed; configure a model to generate a repair proposal."
            : "Checks failed; repair proposal could not be generated.",
        payload: {
          status: turn.status,
          assistantMessage: turn.assistantMessage,
          failedChecks: summarizeChecks(input.failedChecks),
        },
      }),
    ];
  }

  const now = new Date().toISOString();
  const approvalId = `approval-${turn.editPreview.id}`;
  await input.store.saveAgentEdit({
    runId: pending.runId,
    previewId: turn.editPreview.id,
    status: "pending",
    diff: turn.diff,
    plan: turn.editPlan as unknown as Record<string, unknown>,
    files: turn.editPreview.files,
    createdAt: now,
  });
  await input.store.saveApproval({
    id: approvalId,
    runId: pending.runId,
    kind: "agent_edit",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  await input.store.saveAgentRun({
    runId: pending.runId,
    message: pending.message,
    mode: "terminal-agent",
    status: "pending_approval",
    createdAt: now,
    updatedAt: now,
  });

  pending.status = "patch_pending";
  pending.phase = "diff_preview";
  pending.editPlan = turn.editPlan;
  pending.diff = turn.diff;
  pending.files = turn.editPreview.files;
  pending.approvalId = approvalId;
  pending.repairAttempts = attempts + 1;

  return [
    await emit(input.store, {
      type: "repair.proposed",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: `Checks failed; repair Patch ${pending.repairAttempts}/${maxRepairAttempts} is ready for review.`,
      payload: {
        approvalId,
        failedChecks: summarizeChecks(input.failedChecks),
        repairAttempts: pending.repairAttempts,
      },
    }),
    await emit(input.store, {
      type: "patch.proposed",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: `Repair diff ready for ${turn.editPreview.files.length} file(s).`,
      payload: { approvalId, diff: turn.diff, files: turn.editPreview.files },
    }),
  ];
}

async function* executeToolStep(input: {
  runId: string;
  sessionId: string;
  store: SqliteEgoStore;
  workspaceRoot: string;
  toolRegistry: ReturnType<typeof createTerminalAgentToolRegistry>;
  permissionLevel: PermissionLevel;
  toolName: string;
  toolInput: Record<string, unknown>;
}): AsyncIterable<AgentRunEvent> {
  const tool = input.toolRegistry.get(input.toolName);
  const toolCall = createTerminalToolCall(tool, input.toolInput);
  yield await emit(input.store, {
    type: "tool.requested",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Tool requested: ${tool.name}`,
    payload: { tool: summarizeTool(tool), toolCall },
  });

  const decision = checkTerminalPermission(tool, input.permissionLevel);
  if (!decision.allowed) {
    yield await emit(input.store, {
      type: "tool.blocked",
      runId: input.runId,
      sessionId: input.sessionId,
      message: decision.reason,
      payload: { tool: tool.name, toolCall, permissionLevel: input.permissionLevel },
    });
    return;
  }

  yield await emit(input.store, {
    type: "tool.started",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Started ${tool.name}`,
    payload: { tool: tool.name, toolCall },
  });
  let output: Record<string, unknown>;
  try {
    const parsedInput = tool.inputSchema.parse(input.toolInput);
    const rawOutput = await tool.execute(parsedInput, { workspaceRoot: input.workspaceRoot });
    output = sanitizeToolOutput(tool.outputSchema.parse(rawOutput) as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output = {
      status: "failed",
      findings: [`${tool.name} failed: ${message}`],
      recoveryHint: buildToolRecoveryHint(tool.name, message),
    };
    yield await emit(input.store, {
      type: "tool.completed",
      runId: input.runId,
      sessionId: input.sessionId,
      message: `Failed ${tool.name}`,
      payload: { tool: tool.name, toolCall, output },
    });
    yield await emit(input.store, {
      type: "reflection.created",
      runId: input.runId,
      sessionId: input.sessionId,
      message: `Reflection: ${tool.name} failed; try a smaller input, lower-risk tool, or inspect manually.`,
      payload: { tool: tool.name, toolCall, recoveryHint: output.recoveryHint },
    });
    return;
  }
  yield await emit(input.store, {
    type: "tool.completed",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Completed ${tool.name}`,
    payload: { tool: tool.name, toolCall, output },
  });

  const findings = Array.isArray(output.findings) ? output.findings.map(String) : [];
  yield await emit(input.store, {
    type: "observation.created",
    runId: input.runId,
    sessionId: input.sessionId,
    message: findings[0] ?? `Observed ${tool.name} output.`,
    payload: { tool: tool.name, findings, output },
  });

  const candidates =
    tool.evidenceMapper?.(output as z.output<ZodTypeAny>) ??
    findings.map((summary) => ({ summary, raw: output }));
  for (const candidate of candidates) {
    yield await emitEvidence(input.store, {
      runId: input.runId,
      sessionId: input.sessionId,
      toolName: tool.name,
      candidate,
      output,
    });
  }

  yield await emit(input.store, {
    type: "reflection.created",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `Reflection: ${tool.name} reduced the evidence gap with ${findings.length} finding(s).`,
    payload: { tool: tool.name, findingsCount: findings.length },
  });
}

async function emit(
  store: SqliteEgoStore,
  input: {
    type: AgentRunEventType;
    runId: string;
    sessionId: string;
    message: string;
    payload: Record<string, unknown>;
  },
): Promise<AgentRunEvent> {
  const createdAt = new Date().toISOString();
  const event: AgentRunEvent = {
    type: input.type,
    runId: input.runId,
    sessionId: input.sessionId,
    message: input.message,
    createdAt,
    payload: { ...input.payload, message: input.message },
  };
  await store.saveHermesEvent(
    createHermesEvent({
      type: input.type,
      runId: input.runId,
      sessionId: input.sessionId,
      source: "terminal-agent",
      createdAt,
      payload: event.payload,
    }),
  );
  const trajectory = toTrajectoryEvent(event);
  if (trajectory) {
    store.appendSync(trajectory);
  }
  return event;
}

async function emitEvidence(
  store: SqliteEgoStore,
  input: {
    runId: string;
    sessionId: string;
    toolName: string;
    candidate: ToolEvidenceCandidate;
    output: Record<string, unknown>;
  },
): Promise<AgentRunEvent> {
  return emit(store, {
    type: "evidence.created",
    runId: input.runId,
    sessionId: input.sessionId,
    message: input.candidate.summary,
    payload: {
      summary: input.candidate.summary,
      source: input.toolName,
      raw: input.candidate.raw ?? input.output,
    },
  });
}

async function emitSyntheticBlocked(
  store: SqliteEgoStore,
  runId: string,
  message: string,
): Promise<AgentRunEvent> {
  return emit(store, {
    type: "run.blocked",
    runId,
    sessionId: "terminal-agent",
    message,
    payload: {},
  });
}

function toTrajectoryEvent(event: AgentRunEvent): TrajectoryEvent | undefined {
  const mapped = mapTrajectoryType(event.type);
  if (!mapped) {
    return undefined;
  }
  return createTrajectoryEvent(event.runId, mapped, event.message, event.payload);
}

function mapTrajectoryType(type: AgentRunEventType): TrajectoryEvent["type"] | undefined {
  switch (type) {
    case "tool.started":
      return "tool.started";
    case "tool.completed":
      return "tool.completed";
    case "observation.created":
      return "observation.created";
    case "evidence.created":
      return "evidence.created";
    case "model.failed":
      return "model.failed";
    case "planner.fallback":
      return "planner.fallback";
    case "patch.proposed":
      return "agent.edit.proposed";
    case "patch.approved":
      return "agent.edit.approved";
    case "patch.applied":
      return "agent.edit.applied";
    case "check.started":
      return "agent.check.started";
    case "check.completed":
      return "agent.check.completed";
    case "repair.proposed":
    case "repair.skipped":
      return "decision.made";
    case "memory.written":
    case "memory.compacted":
    case "memory.archived":
    case "memory.forgotten":
    case "mcp.tools.discovered":
    case "mcp.call.proposed":
    case "mcp.call.completed":
      return "decision.made";
    case "run.completed":
      return "run.completed";
    case "run.blocked":
      return "run.blocked";
    default:
      return undefined;
  }
}

async function persistTrajectoryEvents(
  store: SqliteEgoStore,
  events: TrajectoryEvent[],
): Promise<void> {
  for (const event of events) {
    store.appendSync(event);
  }
}

function buildReadOnlyToolRequests(
  message: string,
  summary: ProjectSummary,
): Array<{
  toolName: string;
  input: Record<string, unknown>;
}> {
  const query = selectSearchQuery(message);
  const requests: Array<{
    toolName: string;
    input: Record<string, unknown>;
  }> = [
    { toolName: "workspace.list", input: { limit: 80, maxDepth: 4 } },
    { toolName: "workspace.grep", input: { query, limit: 20 } },
  ];
  const readTarget = summary.importantFiles.includes("README.md")
    ? "README.md"
    : summary.importantFiles[0];
  if (readTarget) {
    requests.push({ toolName: "workspace.read", input: { path: readTarget, maxBytes: 20_000 } });
  }
  requests.push({
    toolName: "evidence.write",
    input: {
      summary: `Terminal agent gathered initial context for: ${message}`,
      source: "terminal-agent",
      raw: { query },
    },
  });
  if (isSecurityResearchRequest(message)) {
    requests.push({
      toolName: "security.package_manifest_audit",
      input: { manifestPath: "package.json", includeDevDependencies: true },
    });
    if (/semgrep|静态|sast|源码|source|漏洞|vuln/i.test(message)) {
      requests.push({
        toolName: "security.semgrep_scan",
        input: { path: ".", config: "p/typescript", timeoutMs: 60_000 },
      });
    }
  }
  return requests;
}

async function generateEvidenceGapPlan(input: {
  provider: ChatModelProvider;
  workspaceRoot: string;
  message: string;
  summary: ProjectSummary;
  files: string[];
  memories: MemoryRecord[];
  tools: Array<Record<string, unknown>>;
}): Promise<
  | { status: "proposed"; plan: EvidenceGapStep[] }
  | { status: "failed"; message: string; debug: string }
> {
  const stepSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    knownEvidence: z.array(z.string()).min(1),
    missingEvidence: z.array(z.string()).min(1),
    toolChoiceRationale: z.string().min(1),
    expectedResult: z.string().min(1),
    stopCondition: z.string().min(1),
    riskNote: z.string().min(1),
  });
  const schema = z.object({ plan: z.array(stepSchema).min(2).max(6) });
  try {
    const systemPrompt = await loadAgentSystemPrompt({
      workspaceRoot: input.workspaceRoot,
      memoryHints: input.memories.map((memory) => `[${memory.scope}] ${memory.content}`),
      skills: ["workspace", "memory", "evidence", "patch-approval", "checks"],
      mcpTools: [],
    });
    const result = await generateJson(input.provider, schema, {
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            systemPrompt.finalPrompt,
            "You are the EGO-Graph terminal security agent planner.",
            "Return concise evidence-gap planning JSON only.",
            "The top-level JSON object MUST contain a plan array.",
            "Do not reveal hidden chain-of-thought; provide auditable summaries.",
            "Do not plan unauthorized public scanning or exploitation.",
            'Required JSON shape: {"plan":[{"id":"...","title":"...","knownEvidence":["..."],"missingEvidence":["..."],"toolChoiceRationale":"...","expectedResult":"...","stopCondition":"...","riskNote":"..."}]}',
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: input.message,
            workspace: {
              apps: input.summary.apps,
              packages: input.summary.packages,
              importantFiles: input.summary.importantFiles,
              sampledFiles: input.files.slice(0, 40),
            },
            memories: input.memories.map((memory) => ({
              scope: memory.scope,
              content: memory.content,
              tags: memory.tags,
            })),
            availableTools: input.tools,
            requiredFields: [
              "knownEvidence",
              "missingEvidence",
              "toolChoiceRationale",
              "expectedResult",
              "stopCondition",
              "riskNote",
            ],
          }),
        },
      ],
    });
    return { status: "proposed", plan: result.plan };
  } catch (error) {
    const debug = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      message: "模型计划生成失败，已切换到本地 fallback plan。",
      debug,
    };
  }
}

function buildEvidenceGapPlan(
  message: string,
  summary: ProjectSummary,
  files: string[],
  memories: MemoryRecord[],
): EvidenceGapStep[] {
  return [
    {
      id: "context",
      title: "确认任务和上下文",
      knownEvidence: [
        `README: ${summary.hasReadme ? "present" : "missing"}`,
        `apps=${summary.apps.length}, packages=${summary.packages.length}, sampledFiles=${files.length}`,
      ],
      missingEvidence: ["需要定位与用户任务最相关的文件和历史记忆。"],
      toolChoiceRationale:
        "workspace.list/read/grep 和 memory.recall 可以在 read-only 权限下安全收集上下文。",
      expectedResult: "得到最小相关文件集合、已有约束和可执行检查命令。",
      stopCondition: "已识别修改范围或确认任务只需只读回答。",
      riskNote: "只读上下文采集，不写文件、不访问公网。",
    },
    {
      id: "patch",
      title: "生成可审批 Patch",
      knownEvidence:
        memories.length > 0
          ? memories.map((memory) => memory.content).slice(0, 3)
          : ["暂无相关长期记忆。"],
      missingEvidence: ["需要模型或显式 editPlan 生成结构化 WorkspaceEditPlan。"],
      toolChoiceRationale:
        "WorkspaceEditPlan 会进入 workspace policy 和 diff preview，避免直接写入。",
      expectedResult: "生成 diff、受影响文件和 Patch 审批项。",
      stopCondition: "用户批准 Patch 后才能落盘；拒绝则停止。",
      riskNote: "需要 workspace-write 权限，仍必须二次审批 Patch。",
    },
    {
      id: "checks",
      title: "运行检查并总结",
      knownEvidence: [`用户任务: ${message}`],
      missingEvidence: ["修改后的 typecheck/test 结果。"],
      toolChoiceRationale: "check runner 通过受控命令记录 stdout/stderr 和 exit code。",
      expectedResult: "得到 passed/failed 检查结果、最终总结和可回放轨迹。",
      stopCondition: "检查完成并写入 Hermes/SQLite/trajectory。",
      riskNote: "需要 shell-readonly 或更高权限；默认检查命令为 pnpm typecheck。",
    },
  ];
}

function checkTerminalPermission(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  level: PermissionLevel,
): { allowed: true; reason: string } | { allowed: false; reason: string } {
  const required = requiredPermissionForTool(tool);
  if (hasPermission(level, required)) {
    return { allowed: true, reason: `${tool.name} allowed by ${level}` };
  }
  return {
    allowed: false,
    reason: `${tool.name} requires ${required}; current permission is ${level}. Use /allow ${required}.`,
  };
}

function requiredPermissionForTool(tool: ToolDefinition<ZodTypeAny, ZodTypeAny>): PermissionLevel {
  if (tool.name.startsWith("check.") || tool.name === "shell.readonly") {
    return "shell-readonly";
  }
  if (tool.permission.scope === "network") {
    return "network-low";
  }
  if ((tool.riskLevel ?? tool.permission.risk) === "high" || tool.requiresApproval) {
    return "security-active";
  }
  return "read-only";
}

function resolvePlannerProvider(
  options: TerminalAgentSessionOptions,
): ChatModelProvider | null | undefined {
  if (options.modelProvider !== undefined) {
    return options.modelProvider;
  }
  try {
    return createChatModelProvider(loadModelConfig({ workspaceRoot: options.workspaceRoot }));
  } catch {
    return undefined;
  }
}

function hasPermission(current: PermissionLevel, required: PermissionLevel): boolean {
  return permissionRank[current] >= permissionRank[required];
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

async function hydratePendingRunsFromStore(input: {
  store: SqliteEgoStore;
  pendingRuns: Map<string, PendingRun>;
}): Promise<void> {
  const [draftPlans, pendingEdits] = await Promise.all([
    input.store.listAgentPlans({ status: "draft", limit: 50 }),
    input.store.listPendingAgentEdits(),
  ]);

  for (const plan of draftPlans) {
    if (plan.runId && !input.pendingRuns.has(plan.runId)) {
      input.pendingRuns.set(plan.runId, hydratePlanRun(plan));
    }
  }

  for (const edit of pendingEdits) {
    const run = await input.store.getAgentRun(edit.runId);
    const checks = await input.store.listAgentChecks(edit.runId);
    const editPlan = readWorkspaceEditPlan(edit);
    input.pendingRuns.set(edit.runId, {
      runId: edit.runId,
      sessionId: `hydrated-${edit.runId}`,
      message: run?.message ?? readString(edit.plan.goal, "Hydrated pending patch"),
      status: "patch_pending",
      phase: "diff_preview",
      diff: edit.diff,
      files: edit.files,
      checks,
      repairAttempts: 0,
      ...(editPlan ? { editPlan } : {}),
      approvalId: `approval-${edit.previewId}`,
    });
  }
}

function hydratePlanRun(plan: AgentPlanRecord): PendingRun {
  return {
    runId: plan.runId ?? plan.planId,
    sessionId: plan.sessionId,
    message: plan.message,
    status: "plan_pending",
    phase: "approval",
    plan: plan.plan.map((item, index) => ({
      id: `hydrated-${index + 1}`,
      title: item.split(":")[0] || `Step ${index + 1}`,
      knownEvidence: ["Hydrated from SQLite draft plan."],
      missingEvidence: ["Open the run or approve/reject the hydrated plan."],
      toolChoiceRationale: item,
      expectedResult: "Continue the persisted Agent Harness workflow.",
      stopCondition: "Plan approved or rejected.",
      riskNote: "Hydrated state; no new tool call executed.",
    })),
  };
}

function readWorkspaceEditPlan(edit: AgentEditRecord): WorkspaceEditPlan | undefined {
  const plan = edit.plan as unknown;
  if (!plan || typeof plan !== "object" || !("operations" in plan)) {
    return undefined;
  }
  return plan as WorkspaceEditPlan;
}

async function registerMcpRuntimeTools(
  registry: ReturnType<typeof createTerminalAgentToolRegistry>,
  workspaceRoot: string,
): Promise<{
  config: McpConfig;
  tools: Array<{ name: string; description: string }>;
  errors: Array<{ server: string; message: string }>;
}> {
  const config = await loadMcpConfig(workspaceRoot);
  const runtime = await listMcpRuntimeTools(config);
  for (const tool of runtime.tools) {
    try {
      registry.register(tool);
    } catch (error) {
      runtime.errors.push({
        server: tool.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    config,
    tools: runtime.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
    errors: runtime.errors,
  };
}

async function discoverMcpToolEvents(input: {
  store: SqliteEgoStore;
  workspaceRoot: string;
}): Promise<AgentRunEvent[]> {
  const runId = `mcp-${Date.now()}`;
  const registry = createTerminalAgentToolRegistry();
  const discovery = await registerMcpRuntimeTools(registry, input.workspaceRoot);
  return [
    await emit(input.store, {
      type: "mcp.tools.discovered",
      runId,
      sessionId: "terminal-agent",
      message: `Discovered ${discovery.tools.length} MCP tool(s).`,
      payload: {
        source: discovery.config.source,
        tools: discovery.tools,
        errors: discovery.errors,
      },
    }),
  ];
}

async function* streamMcpToolCall(input: {
  name: string;
  args: Record<string, unknown>;
  workspaceRoot: string;
  store: SqliteEgoStore;
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const now = new Date().toISOString();
  const runId = `mcp-call-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `mcp-session-${Date.now()}`;
  const registry = createTerminalAgentToolRegistry();
  await registerMcpRuntimeTools(registry, input.workspaceRoot);

  yield await emit(input.store, {
    type: "mcp.call.proposed",
    runId,
    sessionId,
    message: `MCP tool call requested: ${input.name}`,
    payload: { tool: input.name, args: input.args },
  });

  yield* executeToolStep({
    runId,
    sessionId,
    store: input.store,
    workspaceRoot: input.workspaceRoot,
    toolRegistry: registry,
    permissionLevel: input.getPermissionLevel(),
    toolName: input.name,
    toolInput: { arguments: input.args },
  });

  yield await emit(input.store, {
    type: "mcp.call.completed",
    runId,
    sessionId,
    message: `MCP tool call completed or blocked: ${input.name}`,
    payload: { tool: input.name },
  });
}

async function recallMemoryEvents(input: {
  store: SqliteEgoStore;
  query: string;
}): Promise<AgentRunEvent[]> {
  const runId = `memory-${Date.now()}`;
  const memories = await recallStoreMemories(input.store, input.query);
  return [
    await emit(input.store, {
      type: "memory.recalled",
      runId,
      sessionId: "terminal-agent",
      message:
        memories.length > 0
          ? `Recalled ${memories.length} memory item(s).`
          : "No relevant memory found.",
      payload: {
        query: input.query,
        memories: memories.map((memory) => ({
          id: memory.id,
          scope: memory.scope,
          content: memory.content,
          tags: memory.tags,
        })),
      },
    }),
  ];
}

async function compactMemoryEvents(input: {
  store: SqliteEgoStore;
  query?: string;
}): Promise<AgentRunEvent[]> {
  const runId = `memory-${Date.now()}`;
  const memories = await input.store.listMemories({ limit: 100 });
  const service = createMemoryService(storedToRuntimeMemories(memories));
  const summary = await service.compact({
    ...(input.query ? { query: input.query } : {}),
    maxChars: 1_600,
  });
  return [
    await emit(input.store, {
      type: "memory.compacted",
      runId,
      sessionId: "terminal-agent",
      message: summary,
      payload: { query: input.query ?? "", total: memories.length },
    }),
  ];
}

async function archiveMemoryEvents(input: {
  store: SqliteEgoStore;
  id: string;
}): Promise<AgentRunEvent[]> {
  const archived = await input.store.archiveMemory(input.id);
  return [
    await emit(input.store, {
      type: "memory.archived",
      runId: `memory-${Date.now()}`,
      sessionId: "terminal-agent",
      message: archived ? `Archived memory ${input.id}.` : `Memory not found: ${input.id}.`,
      payload: { id: input.id, archived },
    }),
  ];
}

async function forgetMemoryEvents(input: {
  store: SqliteEgoStore;
  id: string;
}): Promise<AgentRunEvent[]> {
  const forgotten = await input.store.deleteMemory(input.id);
  return [
    await emit(input.store, {
      type: "memory.forgotten",
      runId: `memory-${Date.now()}`,
      sessionId: "terminal-agent",
      message: forgotten ? `Forgot memory ${input.id}.` : `Memory not found: ${input.id}.`,
      payload: { id: input.id, forgotten },
    }),
  ];
}

async function readRecentEventMessages(store: SqliteEgoStore): Promise<string[]> {
  const events = await store.listHermesEvents({ limit: 16 });
  return events
    .slice()
    .reverse()
    .map((event) => readString(event.payload.message, event.type));
}

function storageMemoryToRuntimeMemory(memory: MemoryRecord): RuntimeMemoryRecord {
  return {
    id: memory.id,
    scope: memory.scope,
    content: memory.content,
    source: memory.source,
    tags: memory.tags,
    references: memory.references,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

function storedToRuntimeMemories(memories: MemoryRecord[]): RuntimeMemoryRecord[] {
  return memories.map(storageMemoryToRuntimeMemory);
}

function summarizeTool(tool: ToolDefinition<ZodTypeAny, ZodTypeAny>): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    scope: tool.permission.scope,
    riskLevel: tool.riskLevel ?? tool.permission.risk,
    requiresApproval: Boolean(tool.requiresApproval),
    sandboxProfile: tool.sandboxProfile ?? (tool.permission.requiresSandbox ? "docker" : "none"),
    timeoutMs: tool.timeoutMs,
  };
}

function createTerminalToolCall(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  toolInput: Record<string, unknown>,
): TerminalToolCall {
  return {
    id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: tool.name,
    input: toolInput,
    permissionRequired: requiredPermissionForTool(tool),
    riskLevel: tool.riskLevel ?? tool.permission.risk,
    timeoutMs: tool.timeoutMs ?? 30_000,
  };
}

function sanitizeToolOutput(output: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(output).map(([key, value]) => [
      key,
      typeof value === "string" ? truncateToolText(value) : value,
    ]),
  );
}

function truncateToolText(value: string, maxChars = 12_000): string {
  if (value.length <= maxChars) {
    return value;
  }
  const head = Math.floor(maxChars * 0.75);
  const tail = Math.max(0, maxChars - head - 80);
  return `${value.slice(0, head)}\n[...truncated ${value.length - head - tail} chars...]\n${value.slice(
    value.length - tail,
  )}`;
}

function buildToolRecoveryHint(toolName: string, message: string): string {
  if (/permission|requires|allow/i.test(message)) {
    return `Check permission level before calling ${toolName}.`;
  }
  if (/timeout/i.test(message)) {
    return `Retry ${toolName} with a narrower path, lower limit, or shorter command.`;
  }
  return `Inspect the tool input and retry ${toolName} with a smaller, read-only scope.`;
}

function summarizeChecks(checks: AgentCheckRecord[]): string[] {
  return checks.map((check) =>
    [
      `${check.name}: ${check.status} exit=${check.exitCode}`,
      check.stderr ? `stderr=${truncateToolText(check.stderr, 800)}` : "",
      check.stdout ? `stdout=${truncateToolText(check.stdout, 800)}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

async function rememberRunSummary(
  store: SqliteEgoStore,
  pending: PendingRun,
  checks: AgentCheckRecord[],
  status: "applied" | "blocked",
): Promise<void> {
  const service = createMemoryService();
  const result = await service.remember({
    scope: "project",
    kind: status === "applied" ? "run_summary" : "failure",
    source: "terminal-agent",
    tags: ["terminal-agent", `run:${pending.runId}`, `status:${status}`],
    references: pending.files ?? [],
    content: [
      `Run ${pending.runId} ${status}.`,
      `Task: ${pending.message}`,
      pending.files?.length ? `Files: ${pending.files.join(", ")}` : "",
      checks.length ? `Checks: ${summarizeChecks(checks).join(" | ")}` : "Checks: none",
    ]
      .filter(Boolean)
      .join(" "),
  });
  if (result.status === "stored") {
    await store.saveMemory({
      id: result.memory.id,
      scope: result.memory.scope,
      content: result.memory.content,
      source: result.memory.source,
      tags: result.memory.tags,
      references: result.memory.references,
      ...(result.memory.status ? { status: result.memory.status } : {}),
      createdAt: result.memory.createdAt,
      updatedAt: result.memory.updatedAt,
    });
    await emit(store, {
      type: "memory.written",
      runId: pending.runId,
      sessionId: pending.sessionId,
      message: "Stored run summary memory.",
      payload: { memoryId: result.memory.id, kind: result.memory.kind },
    });
  }
}

export function classifyTerminalIntent(message: string): TerminalIntent {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return "chat";
  }

  if (
    /渗透|攻击|漏洞利用|扫描公网|nmap|端口扫描|靶场|ctf|exploit|pentest|scan target/.test(
      normalized,
    )
  ) {
    return "security_task";
  }

  if (
    /修改|改成|更新|补充|创建|删除|重构|修复|实现|写入|生成\s*patch|edit|update|modify|refactor|fix|implement|write|delete|create/.test(
      normalized,
    )
  ) {
    return "code_change";
  }

  if (
    /分析|项目结构|结构|总结|解释|为什么|怎么|阅读项目|查看项目|架构|依赖|analy[sz]e|explain|summarize|architecture|structure/.test(
      normalized,
    )
  ) {
    return "project_analysis";
  }

  return "chat";
}

function buildLocalAssistantFallback(
  message: string,
  intent: TerminalIntent,
  observations: string[],
): string {
  if (intent === "project_analysis") {
    return [
      "当前模型未配置完整，所以我先给出只读本地摘要：",
      ...observations.slice(0, 4).map((item) => `- ${item}`),
      "",
      "要获得更完整的自然语言分析，请在 Web Workbench 的 Models 页面或 `.ego/config.json` 配置模型。",
    ].join("\n");
  }

  return [
    "你好，我是 EGO-Graph 终端 Agent。",
    "当前模型未配置完整，所以这次使用本地降级回答；我仍然可以帮你查看项目结构、生成待审批计划，或提示如何配置模型。",
    `你刚才的问题是：${message}`,
  ].join("\n");
}

function selectSearchQuery(message: string): string {
  const normalized = message.match(/README|readme/i) ? "README" : message.slice(0, 32).trim();
  return normalized.length > 0 ? normalized : "EGO-Graph";
}

function isSecurityResearchRequest(message: string): boolean {
  return /src|漏洞|vuln|vulnerability|semgrep|sast|安全审计|源码审计|依赖|dependency/i.test(
    message,
  );
}

function formatEvidenceGapStep(step: EvidenceGapStep): string {
  return `${step.title}: ${step.toolChoiceRationale} Stop: ${step.stopCondition}`;
}

function buildFinalSummary(checks: Array<{ status: string; command: string }>): string {
  if (checks.length === 0) {
    return "Patch applied. No checks were configured.";
  }
  const passed = checks.filter((check) => check.status === "passed").length;
  return `Patch applied. Checks passed ${passed}/${checks.length}: ${checks
    .map((check) => `${check.command}=${check.status}`)
    .join(", ")}`;
}

function normalizeEventType(type: string): AgentRunEventType {
  const known: AgentRunEventType[] = [
    "user.message",
    "assistant.message",
    "run.started",
    "context.loaded",
    "memory.recalled",
    "model.failed",
    "planner.fallback",
    "planner.model.used",
    "plan.proposed",
    "plan.approved",
    "plan.rejected",
    "tool.requested",
    "tool.started",
    "tool.completed",
    "tool.blocked",
    "observation.created",
    "evidence.created",
    "reflection.created",
    "patch.proposed",
    "patch.approved",
    "patch.rejected",
    "patch.applied",
    "check.started",
    "check.completed",
    "repair.proposed",
    "repair.skipped",
    "memory.written",
    "memory.compacted",
    "memory.archived",
    "memory.forgotten",
    "mcp.tools.discovered",
    "mcp.call.proposed",
    "mcp.call.completed",
    "run.completed",
    "run.blocked",
  ];
  return known.includes(type as AgentRunEventType)
    ? (type as AgentRunEventType)
    : "reflection.created";
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
