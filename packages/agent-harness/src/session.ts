import {
  draftAgentPlan,
  loadAgentSystemPrompt,
  runAssistantChatTurn,
  runCodingAgentTurn,
  streamAssistantChatTurn,
  type AgentCheckCommand,
} from "@ego-graph/agent";
import { createTrajectoryEvent, type TrajectoryEvent } from "@ego-graph/core";
import { createHermesEvent } from "@ego-graph/hermes";
import {
  createChatModelProvider,
  estimateMessageTokens,
  generateJson,
  loadModelConfig,
  type ChatMessage,
  type ChatModelProvider,
} from "@ego-graph/llm";
import {
  createMcpClientPool,
  listMcpRuntimeTools,
  loadMcpConfig,
  type McpClientPool,
  type McpConfig,
} from "@ego-graph/mcp";
import { createMemoryService, type MemoryRecord as RuntimeMemoryRecord } from "@ego-graph/memory";
import {
  defaultEgoHome,
  sqlitePath,
  SqliteEgoStore,
  type AgentCheckRecord,
  type MemoryRecord,
} from "@ego-graph/storage";
import {
  createTerminalAgentToolRegistry,
  type ToolDefinition,
  type ToolEvidenceCandidate,
} from "@ego-graph/tools";
import {
  createContextForTask,
  createWorkspaceContextPack,
  type ProjectSummary,
  type TaskContext,
  type WorkspaceContextPack,
  type WorkspaceEditPlan,
} from "@ego-graph/workspace";
import { z, type ZodTypeAny } from "zod";
import { hasPermission, type PermissionLevel as HarnessPermissionLevel } from "./safety-policy.js";
import { runAgentLoop } from "./agent-loop.js";
import {
  localizeCheckFailure,
  renderFailureLocalizationForPrompt,
} from "./failure-localization.js";
import { hydratePendingRunsFromStore, replayRunFromStore } from "./persistence.js";
import { executeHarnessToolStep } from "./tool-flow.js";
import type { SecurityScopeGate, ToolCallProtocol } from "./tool-executor.js";

export type PermissionLevel = HarnessPermissionLevel;

export type AgentRunEventType =
  | "user.message"
  | "assistant.message"
  | "assistant.delta"
  | "assistant.completed"
  | "run.started"
  | "context.loaded"
  | "memory.recalled"
  | "model.failed"
  | "planner.fallback"
  | "planner.model.used"
  | "planner.decision"
  | "loop.step.started"
  | "loop.step.completed"
  | "loop.stopped"
  | "plan.proposed"
  | "plan.approved"
  | "plan.rejected"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "tool.timeout"
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
  | "run.cancelled"
  | "run.blocked";

export type AgentHarnessPhase =
  | "idle"
  | "chat"
  | "context_loading"
  | "planning"
  | "waiting_plan_approval"
  | "tool_running"
  | "patch_generating"
  | "waiting_patch_approval"
  | "patch_applying"
  | "checking"
  | "repairing"
  | "completed"
  | "cancelled"
  // Compatibility aliases used by the existing TUI and persisted runs.
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

export type TerminalToolCall = ToolCallProtocol;

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
  id?: string;
  type: AgentRunEventType;
  runId: string;
  sessionId: string;
  phase?: AgentHarnessPhase;
  permissionLevel?: PermissionLevel;
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
  toolRegistry?: ReturnType<typeof createTerminalAgentToolRegistry>;
};

export type TerminalAgentSession = {
  getPermissionLevel(): PermissionLevel;
  setPermissionLevel(level: PermissionLevel): void;
  /** Stable per-TUI-session id; conversation history is keyed by this. */
  getActiveSessionId(): string;
  /** Reset the active session id and wipe persisted conversation history. */
  clearConversation(): Promise<AgentRunEvent[]>;
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

export function createTerminalAgentSession(
  options: TerminalAgentSessionOptions,
): TerminalAgentSession {
  const workspaceRoot = options.workspaceRoot;
  const egoHome = options.egoHome ?? defaultEgoHome();
  const store = new SqliteEgoStore(sqlitePath(egoHome));
  const toolRegistry = options.toolRegistry ?? createTerminalAgentToolRegistry();
  const mcpPool = createMcpClientPool();
  const pendingRuns = new Map<string, PendingRun>();
  const plannerProvider = resolvePlannerProvider(options);
  let permissionLevel = options.permissionLevel ?? "read-only";
  // Stable per-TUI-session id so conversation history accumulates across
  // turns. Reset by clearConversation() (the /clear command).
  let activeSessionId = `tui-session-${Date.now()}`;

  return {
    getPermissionLevel() {
      return permissionLevel;
    },
    setPermissionLevel(level) {
      permissionLevel = level;
    },
    getActiveSessionId() {
      return activeSessionId;
    },
    async clearConversation() {
      await store.clearSession(activeSessionId);
      activeSessionId = `tui-session-${Date.now()}`;
      return [];
    },
    async hydratePendingRuns() {
      await hydratePendingRunsFromStore({ store, pendingRuns });
      return [...pendingRuns.values()];
    },
    submitMessage(message) {
      const intent = classifyTerminalIntent(message);
      const sessionId = activeSessionId;
      if (intent === "code_change" || intent === "security_task") {
        return streamStartTask({
          message,
          workspaceRoot,
          store,
          toolRegistry,
          mcpPool,
          pendingRuns,
          plannerProvider,
          sessionId,
          getPermissionLevel: () => permissionLevel,
        });
      }

      return streamChatTurn({
        message,
        workspaceRoot,
        store,
        toolRegistry,
        pendingRuns,
        intent,
        plannerProvider,
        sessionId,
        modelProvider: options.modelProvider,
        getPermissionLevel: () => permissionLevel,
      });
    },
    startTask(message) {
      const sessionId = activeSessionId;
      return streamStartTask({
        message,
        workspaceRoot,
        store,
        toolRegistry,
        mcpPool,
        pendingRuns,
        plannerProvider,
        sessionId,
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
      return replayRunFromStore(store, runId);
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
      return discoverMcpToolEvents({ store, workspaceRoot, mcpPool });
    },
    callMcpTool(name, args) {
      return streamMcpToolCall({
        name,
        args: args ?? {},
        workspaceRoot,
        store,
        mcpPool,
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
  toolRegistry: ReturnType<typeof createTerminalAgentToolRegistry>;
  pendingRuns: Map<string, PendingRun>;
  intent: TerminalIntent;
  plannerProvider: ChatModelProvider | null | undefined;
  modelProvider: TerminalAgentSessionOptions["modelProvider"];
  sessionId: string;
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const now = new Date().toISOString();
  const runId = `tui-chat-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = input.sessionId;
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
  if (input.intent === "project_analysis" || input.intent === "chat") {
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

    // Recall cross-turn conversation history so the model sees prior Q&A and
    // tool exchanges, not just the current user turn. Persist every new
    // message produced inside the loop back into the store.
    const seedMessages = await recallChatSeedMessages(input.store, sessionId);
    yield* runAgentLoop({
      runId,
      sessionId,
      message: input.message,
      intent: input.intent,
      workspaceRoot: input.workspaceRoot,
      permissionLevel: input.getPermissionLevel(),
      toolRegistry: input.toolRegistry,
      seedMessages,
      onMessage: (message) => {
        void persistChatMessage(input.store, sessionId, runId, message);
      },
      ...(input.plannerProvider !== undefined ? { modelProvider: input.plannerProvider } : {}),
      emit: (event) => emit(input.store, event),
      emitEvidence: (event) => emitEvidence(input.store, event),
    });
  }

  try {
    let finalTurn: Awaited<ReturnType<typeof runAssistantChatTurn>> | undefined;
    for await (const event of streamAssistantChatTurn({
      message: input.message,
      workspaceRoot: input.workspaceRoot,
      memoryHints: memoryHits.map((memory) => `[${memory.scope}] ${memory.content}`),
      ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
    })) {
      if (event.type === "delta") {
        yield await emit(input.store, {
          type: "assistant.delta",
          runId,
          sessionId,
          message: event.content,
          payload: { modelStreaming: true },
        });
      } else {
        finalTurn = event.turn;
      }
    }
    const turn =
      finalTurn ??
      (await runAssistantChatTurn({
        message: input.message,
        workspaceRoot: input.workspaceRoot,
        memoryHints: memoryHits.map((memory) => `[${memory.scope}] ${memory.content}`),
        ...(input.modelProvider !== undefined ? { modelProvider: input.modelProvider } : {}),
      }));
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
    if (turn.model.configured && turn.status === "answered") {
      yield await emit(input.store, {
        type: "assistant.completed",
        runId,
        sessionId,
        message: reply,
        payload: {
          status: turn.status,
          model: turn.model,
          suggestedCommands: turn.suggestedCommands,
        },
      });
    }
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
  mcpPool: McpClientPool;
  pendingRuns: Map<string, PendingRun>;
  plannerProvider: ChatModelProvider | null | undefined;
  sessionId: string;
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const now = new Date().toISOString();
  const runId = `tui-run-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = input.sessionId;
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
  const taskContext = await createContextForTask({
    workspaceRoot: input.workspaceRoot,
    goal: input.message,
    intent: "terminal-agent",
    recentEvents: await readRecentEventMessages(input.store),
    tokenBudget: 8_000,
  });
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
      taskContext: {
        selectedFiles: taskContext.selectedFiles.map((file) => file.path),
        relevantTests: taskContext.relevantTests,
        symbols: taskContext.selectedSymbols.slice(0, 20),
        budget: taskContext.budget,
      },
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

  const mcpDiscovery = await registerMcpRuntimeTools(
    input.toolRegistry,
    input.workspaceRoot,
    input.mcpPool,
  );
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

  const classifiedIntent = classifyTerminalIntent(input.message);
  const loopIntent = classifiedIntent === "chat" ? "project_analysis" : classifiedIntent;

  const seedMessages = await recallChatSeedMessages(input.store, sessionId);
  yield* runAgentLoop({
    runId,
    sessionId,
    message: input.message,
    intent: loopIntent,
    workspaceRoot: input.workspaceRoot,
    permissionLevel: input.getPermissionLevel(),
    toolRegistry: input.toolRegistry,
    seedMessages,
    onMessage: (message) => {
      void persistChatMessage(input.store, sessionId, runId, message);
    },
    ...(input.plannerProvider !== undefined ? { modelProvider: input.plannerProvider } : {}),
    ...resolveSecurityScopeGate(memoryHits),
    emit: (event) => emit(input.store, event),
    emitEvidence: (event) => emitEvidence(input.store, event),
  });

  if (loopIntent === "security_task") {
    const hasSecurityScope = memoryHits.some((memory) => memory.kind === "security_scope");
    if (!hasSecurityScope) {
      input.pendingRuns.set(runId, {
        runId,
        sessionId,
        message: input.message,
        status: "blocked",
        phase: "blocked",
        contextPack,
      });
      return;
    }
  }

  for (const request of buildLegacyReadOnlyToolRequests()) {
    yield* executeHarnessToolStep({
      runId,
      sessionId,
      workspaceRoot: input.workspaceRoot,
      toolRegistry: input.toolRegistry,
      permissionLevel: input.getPermissionLevel(),
      toolName: request.toolName,
      toolInput: request.input,
      emit: (event) => emit(input.store, event),
      emitEvidence: (event) => emitEvidence(input.store, event),
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
      taskContext,
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
  const localization = await localizeCheckFailure({
    workspaceRoot: input.workspaceRoot,
    goal: pending.message,
    changedFiles: pending.files ?? [],
    failedChecks: input.failedChecks,
  });
  const repairMessage = [
    pending.message,
    "",
    "Checks failed after applying the previous patch. Generate a minimal repair WorkspaceEditPlan.",
    renderFailureLocalizationForPrompt(localization),
    "",
    "Raw check summaries:",
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
          failureLocalization: localization,
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
        failureLocalization: localization,
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
    case "tool.failed":
    case "tool.timeout":
    case "tool.blocked":
      return "tool.failed";
    case "observation.created":
      return "observation.created";
    case "evidence.created":
      return "evidence.created";
    case "model.failed":
      return "model.failed";
    case "planner.fallback":
      return "planner.fallback";
    case "planner.decision":
    case "loop.step.started":
    case "loop.step.completed":
    case "loop.stopped":
      return "decision.made";
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

function buildLegacyReadOnlyToolRequests(): Array<{
  toolName: string;
  input: Record<string, unknown>;
}> {
  // The dynamic Agent Loop now owns bounded read-only evidence gathering. Keep
  // this compatibility hook as an empty extension point for older callers.
  return [];
}

async function generateEvidenceGapPlan(input: {
  provider: ChatModelProvider;
  workspaceRoot: string;
  message: string;
  summary: ProjectSummary;
  files: string[];
  taskContext: TaskContext;
  memories: RuntimeMemoryRecord[];
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
  const planArraySchema = z.array(stepSchema).min(2).max(6);
  const schema = z.union([z.object({ plan: planArraySchema }), planArraySchema]);
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
              selectedContextFiles: input.taskContext.selectedFiles.map((file) => file.path),
              relevantTests: input.taskContext.relevantTests,
              selectedSymbols: input.taskContext.selectedSymbols
                .slice(0, 40)
                .map((symbol) => `${symbol.kind}:${symbol.name}@${symbol.file}:${symbol.line}`),
              snippets: input.taskContext.snippets.map((snippet) => ({
                path: snippet.path,
                lines: `${snippet.startLine}-${snippet.endLine}`,
                reason: snippet.reason,
                content: snippet.content.slice(0, 2_000),
              })),
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
    return { status: "proposed", plan: Array.isArray(result) ? result : result.plan };
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
  memories: RuntimeMemoryRecord[],
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

async function recallStoreMemories(
  store: SqliteEgoStore,
  query: string,
): Promise<RuntimeMemoryRecord[]> {
  const stored = await store.listMemories({ limit: 100 });
  const service = createMemoryService(stored.map(storageMemoryToRuntimeMemory));
  return service.recall({ query, limit: 6 });
}

async function registerMcpRuntimeTools(
  registry: ReturnType<typeof createTerminalAgentToolRegistry>,
  workspaceRoot: string,
  mcpPool: McpClientPool,
): Promise<{
  config: McpConfig;
  tools: Array<{ name: string; description: string }>;
  errors: Array<{ server: string; message: string }>;
}> {
  const config = await loadMcpConfig(workspaceRoot);
  const runtime = await listMcpRuntimeTools(config, { pool: mcpPool });
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
  mcpPool: McpClientPool;
}): Promise<AgentRunEvent[]> {
  const runId = `mcp-${Date.now()}`;
  const registry = createTerminalAgentToolRegistry();
  const discovery = await registerMcpRuntimeTools(registry, input.workspaceRoot, input.mcpPool);
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
  mcpPool: McpClientPool;
  getPermissionLevel(): PermissionLevel;
}): AsyncIterable<AgentRunEvent> {
  const now = new Date().toISOString();
  const runId = `mcp-call-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `mcp-session-${Date.now()}`;
  const registry = createTerminalAgentToolRegistry();
  await registerMcpRuntimeTools(registry, input.workspaceRoot, input.mcpPool);

  yield await emit(input.store, {
    type: "mcp.call.proposed",
    runId,
    sessionId,
    message: `MCP tool call requested: ${input.name}`,
    payload: { tool: input.name, args: input.args },
  });

  yield* executeHarnessToolStep({
    runId,
    sessionId,
    workspaceRoot: input.workspaceRoot,
    toolRegistry: registry,
    permissionLevel: input.getPermissionLevel(),
    toolName: input.name,
    toolInput: { arguments: input.args },
    emit: (event) => emit(input.store, event),
    emitEvidence: (event) => emitEvidence(input.store, event),
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
  const forgotten = await input.store.forgetMemory(input.id);
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
      ...(result.memory.kind ? { kind: result.memory.kind } : {}),
      content: result.memory.content,
      summary: result.memory.summary,
      ...(result.memory.rawContent ? { rawContent: result.memory.rawContent } : {}),
      source: result.memory.source,
      ...(result.memory.sourceRunId ? { sourceRunId: result.memory.sourceRunId } : {}),
      evidenceRefs: result.memory.evidenceRefs,
      tags: result.memory.tags,
      references: result.memory.references,
      importance: result.memory.importance,
      confidence: result.memory.confidence,
      ...(result.memory.expiresAt ? { expiresAt: result.memory.expiresAt } : {}),
      ...(result.memory.status ? { status: result.memory.status } : {}),
      ...(result.memory.lastAccessedAt ? { lastAccessedAt: result.memory.lastAccessedAt } : {}),
      accessCount: result.memory.accessCount,
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
    /渗透|攻击|漏洞利用|扫描公网|nmap|端口扫描|靶场|ctf|exploit|pentest|scan target|漏洞审计|依赖漏洞|安全审计|semgrep|sast/.test(
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

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Recall persisted conversation history for a session and deserialize it back
 * into ChatMessage form so the agent loop can seed its model context with
 * real multi-turn history (user/assistant/tool exchanges from prior turns).
 *
 * The token budget keeps the recall bounded; system messages are always
 * retained without consuming budget. Storage stores content as opaque JSON,
 * so we parse it back into the ChatContentBlock shape here.
 */
async function recallChatSeedMessages(
  store: SqliteEgoStore,
  sessionId: string,
): Promise<ChatMessage[]> {
  const tokenBudget = 16_000;
  const stored = await store.recallForPrompt(sessionId, tokenBudget);
  return stored.map((row) => {
    const content = parseChatContent(row.contentJson);
    const message: ChatMessage = { role: row.role, content };
    if (row.toolCallId) {
      message.toolCallId = row.toolCallId;
    }
    if (row.toolName) {
      message.name = row.toolName;
    }
    return message;
  });
}

/**
 * Persist a chat message produced inside the agent loop. Content is serialized
 * to JSON so storage remains content-agnostic. Fire-and-forget: a failed
 * write must not break the conversation flow.
 */
async function persistChatMessage(
  store: SqliteEgoStore,
  sessionId: string,
  runId: string,
  message: ChatMessage,
): Promise<void> {
  try {
    await store.appendMessage({
      sessionId,
      runId,
      role: message.role,
      contentJson: serializeChatContent(message.content),
      tokenCount: estimateMessageTokens(message),
      ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
      ...(message.name ? { toolName: message.name } : {}),
    });
  } catch {
    // Persistence is best-effort: a storage failure should not abort the run.
  }
}

function serializeChatContent(content: ChatMessage["content"]): string {
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function parseChatContent(contentJson: string): ChatMessage["content"] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    // Block arrays and single blocks round-trip as their JSON form; the
    // ChatContentBlock union is structurally compatible with the parsed shape.
    return parsed as ChatMessage["content"];
  } catch {
    return contentJson;
  }
}

/**
 * Extract a SecurityScopeGate from the active security_scope memory record,
 * if any. The memory layer stores the scope as a serialized JSON object in
 * its content/rawContent field. Returns an empty object when no scope is
 * configured so the spread is a no-op (loop receives no securityScope).
 */
function resolveSecurityScopeGate(
  memories: RuntimeMemoryRecord[],
): { securityScope?: SecurityScopeGate } {
  const record = memories.find((memory) => memory.kind === "security_scope");
  if (!record) {
    return {};
  }
  const candidate = record.rawContent ?? record.content;
  const parsed = parseSecurityScope(candidate);
  if (!parsed) {
    return {};
  }
  return { securityScope: parsed };
}

function parseSecurityScope(value: unknown): SecurityScopeGate | undefined {
  let object: unknown = value;
  if (typeof value === "string") {
    try {
      object = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return undefined;
  }
  const record = object as Record<string, unknown>;
  const allowedActions = Array.isArray(record.allowedActions)
    ? record.allowedActions.filter((item): item is string => typeof item === "string")
    : [];
  const forbiddenActions = Array.isArray(record.forbiddenActions)
    ? record.forbiddenActions.filter((item): item is string => typeof item === "string")
    : [];
  const riskLevel = record.riskLevel;
  const expiresAt = record.expiresAt;
  if (typeof expiresAt !== "string") {
    return undefined;
  }
  return {
    allowedActions,
    forbiddenActions,
    riskLevel:
      riskLevel === "low" || riskLevel === "medium" || riskLevel === "high" || riskLevel === "critical"
        ? riskLevel
        : "low",
    expiresAt,
  };
}
