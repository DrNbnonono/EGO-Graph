import {
  zodToJsonSchema,
  type ChatMessage,
  type ChatModelProvider,
  type StructuredChatCompletion,
} from "@ego-graph/llm";
import type { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import {
  executeHarnessToolStep,
  type HarnessEvidenceEventInput,
  type HarnessToolEventInput,
} from "./tool-flow.js";
import { mergeLoopPolicy, type LoopPolicy } from "./loop-policy.js";
import { createLoopState, type LoopIntent, type PlannerAction } from "./loop-state.js";
import { buildLoopReflection } from "./reflection.js";
import { evaluateBudgetWarning, evaluateStopCondition } from "./stop-condition.js";
import type { SecurityScopeGate } from "./tool-executor.js";
import type { AgentRunEvent, PermissionLevel } from "./session.js";

export type AgentLoopInput = {
  runId: string;
  sessionId: string;
  message: string;
  intent: LoopIntent;
  workspaceRoot: string;
  permissionLevel: PermissionLevel;
  toolRegistry: ReturnType<typeof createTerminalAgentToolRegistry>;
  modelProvider?: ChatModelProvider | null;
  securityScope?: SecurityScopeGate;
  policy?: Partial<LoopPolicy>;
  /**
   * Prior conversation messages recalled from persistent storage. When
   * provided, these are prepended to the in-memory model context so the model
   * sees true multi-turn history instead of a single-shot prompt.
   */
  seedMessages?: ChatMessage[];
  /**
   * Optional callback invoked for every message appended to the model context
   * (user turns, assistant turns, tool exchanges). Used by the session layer
   * to persist the conversation. Keeping the loop decoupled from storage.
   */
  onMessage?(message: ChatMessage): void;
  /**
   * Polled once per loop step. Returns any "by the way" messages the user
   * injected while the run was in flight, and clears them from the queue.
   * Each returned message is appended as a new user turn before the next
   * planner decision, letting the user redirect a running task without
   * cancelling it (Codex-style mid-run interjection).
   */
  pollBtw?(): string[];
  /**
   * When aborted, the loop emits run.cancelled at the next check point and
   * stops. The signal is also forwarded to the provider so an in-flight model
   * request is aborted rather than waited out.
   */
  signal?: AbortSignal;
  emit(event: HarnessToolEventInput): Promise<AgentRunEvent>;
  emitEvidence(event: HarnessEvidenceEventInput): Promise<AgentRunEvent>;
};

export async function* runAgentLoop(input: AgentLoopInput): AsyncIterable<AgentRunEvent> {
  const policy = mergeLoopPolicy(input.policy);
  // For chat intent, allow read-only tool calls (e.g. workspace.grep) but
  // keep a tighter tool budget so small questions do not spiral. The previous
  // behaviour of short-circuiting chat entirely meant the model could never
  // answer "where is X defined?" by actually searching the repo.
  const isChat = input.intent === "chat";
  const effectivePolicy = isChat
    ? mergeLoopPolicy({
        ...input.policy,
        maxToolCalls: Math.min(input.policy?.maxToolCalls ?? policy.maxToolCalls, 3),
        maxSteps: Math.min(input.policy?.maxSteps ?? policy.maxSteps, 4),
      })
    : policy;
  const state = createLoopState({
    runId: input.runId,
    sessionId: input.sessionId,
    message: input.message,
    intent: input.intent,
  });

  // Seed multi-turn history from persistent storage, then record the current
  // user turn. Both go to the model context and to the persistence callback.
  const modelMessages: ChatMessage[] = input.seedMessages ? [...input.seedMessages] : [];
  if (!modelMessages.some((message) => message.role === "system")) {
    modelMessages.unshift({
      role: "system",
      content: buildLoopSystemPreamble(input.intent, Boolean(input.securityScope)),
    });
  }
  const userTurn: ChatMessage = {
    role: "user",
    content: isChat
      ? input.message
      : [
          `Task: ${input.message}`,
          `Intent: ${input.intent}`,
          `Security scope configured: ${Boolean(input.securityScope)}`,
        ].join("\n"),
  };
  modelMessages.push(userTurn);
  input.onMessage?.(userTurn);

  while (state.status === "running") {
    if (input.signal?.aborted) {
      state.status = "stopped";
      state.stopReason = "Run cancelled by user.";
      yield await input.emit({
        type: "run.cancelled",
        runId: input.runId,
        sessionId: input.sessionId,
        message: "Run cancelled by user.",
        payload: { reason: "user-cancel" },
      });
      return;
    }

    const stop = evaluateStopCondition(state, effectivePolicy);
    if (stop.shouldStop) {
      state.status = stop.status;
      state.stopReason = stop.reason;
      yield await input.emit({
        type: "run.blocked",
        runId: input.runId,
        sessionId: input.sessionId,
        message: stop.reason,
        payload: { loop: state },
      });
      return;
    }

    // Warn once before the loop actually blocks on budget, so the user has a
    // chance to /continue with a higher policy or /btw a correction instead
    // of the run just stopping without warning.
    if (!state.budgetWarningEmitted) {
      const warning = evaluateBudgetWarning(state, effectivePolicy);
      if (warning) {
        state.budgetWarningEmitted = true;
        yield await input.emit({
          type: "loop.budget.warning",
          runId: input.runId,
          sessionId: input.sessionId,
          message: warning.reason,
          payload: {
            remainingSteps: warning.remainingSteps,
            remainingToolCalls: warning.remainingToolCalls,
          },
        });
      }
    }

    // Fold in any "by the way" messages the user injected while this run was
    // in flight, as new user turns, before the planner decides the next step.
    const btwMessages = input.pollBtw?.() ?? [];
    for (const btw of btwMessages) {
      const btwTurn: ChatMessage = { role: "user", content: `(btw) ${btw}` };
      modelMessages.push(btwTurn);
      input.onMessage?.(btwTurn);
      yield await input.emit({
        type: "user.btw",
        runId: input.runId,
        sessionId: input.sessionId,
        message: btw,
        payload: { step: state.stepCount },
      });
    }

    state.stepCount += 1;
    yield await input.emit({
      type: "loop.step.started",
      runId: input.runId,
      sessionId: input.sessionId,
      message: `Loop step ${state.stepCount} started.`,
      payload: {
        step: state.stepCount,
        intent: input.intent,
        toolCallCount: state.toolCallCount,
        maxToolCalls: effectivePolicy.maxToolCalls,
      },
    });

    let action: PlannerAction | undefined;
    for await (const step of choosePlannerAction(input, state, effectivePolicy, modelMessages)) {
      if (step.type === "delta") {
        yield step.event;
      } else {
        action = step.action;
      }
    }
    if (!action) {
      action = deterministicAction(input, state);
    }
    yield await input.emit({
      type: "planner.decision",
      runId: input.runId,
      sessionId: input.sessionId,
      message: action.userVisibleMessage,
      payload: { action },
    });

    if (action.nextAction === "ask_user") {
      state.status = "blocked";
      state.stopReason = action.stopCondition;
      yield await input.emit({
        type: "loop.stopped",
        runId: input.runId,
        sessionId: input.sessionId,
        message: action.userVisibleMessage,
        payload: { status: "blocked", reason: action.stopCondition },
      });
      return;
    }

    if (action.nextAction === "propose_plan" || action.nextAction === "propose_patch") {
      state.status = "stopped";
      state.stopReason = action.stopCondition;
      yield await input.emit({
        type: "loop.stopped",
        runId: input.runId,
        sessionId: input.sessionId,
        message: action.userVisibleMessage,
        payload: { status: "stopped", reason: action.stopCondition },
      });
      return;
    }

    if (action.nextAction === "stop" || action.nextAction === "answer") {
      state.status = "stopped";
      state.stopReason = action.stopCondition;
      yield await input.emit({
        type: "loop.stopped",
        runId: input.runId,
        sessionId: input.sessionId,
        message: action.userVisibleMessage,
        payload: { status: "stopped", reason: action.stopCondition },
      });
      return;
    }

    if (action.nextAction === "call_tool" && action.toolCall) {
      state.toolCallCount += 1;
      let lastObservation: string | undefined;
      let lastToolOutput: unknown;
      let modelToolUseId = `loop-tool-${state.stepCount}`;
      for await (const event of executeHarnessToolStep({
        runId: input.runId,
        sessionId: input.sessionId,
        workspaceRoot: input.workspaceRoot,
        toolRegistry: input.toolRegistry,
        permissionLevel: input.permissionLevel,
        toolName: action.toolCall.name,
        toolInput: action.toolCall.arguments,
        ...(input.securityScope ? { securityScope: input.securityScope } : {}),
        emit: input.emit,
        emitEvidence: input.emitEvidence,
      })) {
        if (event.type === "tool.started") {
          modelToolUseId = readToolCallId(event.payload) ?? modelToolUseId;
        }
        if (event.type === "observation.created") {
          lastObservation = event.message;
          lastToolOutput = event.payload.output;
          state.observations.push(event.message);
        }
        yield event;
      }

      appendToolExchange(modelMessages, {
        toolUseId: modelToolUseId,
        action,
        output: lastToolOutput,
        ...(lastObservation ? { observation: lastObservation } : {}),
      });
      const reflection = buildLoopReflection({
        action,
        remainingToolBudget: Math.max(0, effectivePolicy.maxToolCalls - state.toolCallCount),
        ...(lastObservation ? { observation: lastObservation } : {}),
      });
      state.reflections.push(reflection);
      yield await input.emit({
        type: "loop.step.completed",
        runId: input.runId,
        sessionId: input.sessionId,
        message: `Loop step ${state.stepCount} completed.`,
        payload: { reflection, loop: state },
      });
      continue;
    }

    state.status = "blocked";
    state.stopReason = "Planner returned an unsupported action.";
    yield await input.emit({
      type: "run.blocked",
      runId: input.runId,
      sessionId: input.sessionId,
      message: state.stopReason,
      payload: { action },
    });
    return;
  }
}

type PlannerStep = { type: "delta"; event: AgentRunEvent } | { type: "action"; action: PlannerAction };

async function* choosePlannerAction(
  input: AgentLoopInput,
  state: ReturnType<typeof createLoopState>,
  policy: LoopPolicy,
  modelMessages: ChatMessage[],
): AsyncIterable<PlannerStep> {
  let structured: PlannerAction | undefined;
  for await (const step of tryStructuredModelAction(input, state, policy, modelMessages)) {
    if (step.type === "delta") {
      yield step;
    } else {
      structured = step.action;
    }
  }
  yield { type: "action", action: structured ?? deterministicAction(input, state) };
}

async function* tryStructuredModelAction(
  input: AgentLoopInput,
  state: ReturnType<typeof createLoopState>,
  policy: LoopPolicy,
  modelMessages: ChatMessage[],
): AsyncIterable<PlannerStep> {
  if (!input.modelProvider?.completeStructured) {
    return;
  }
  // Chat intent is restricted to read-only tools so small questions can still
  // grep/list the repo without risking writes or shell execution.
  const isChat = input.intent === "chat";
  try {
    const toolManifests = input.toolRegistry
      .list()
      .filter((tool) => {
        if (!isChat) {
          return true;
        }
        const permission = inferRequiredPermission(tool);
        return permission === "read-only";
      })
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
        riskLevel: tool.riskLevel ?? tool.permission.risk,
        requiredPermission: inferRequiredPermission(tool),
        requiresApproval: Boolean(tool.requiresApproval),
        sandboxProfile: tool.sandboxProfile ?? (tool.permission.requiresSandbox ? "docker" : "none"),
        timeoutMs: tool.timeoutMs ?? 30_000,
        scenarios: tool.scenarios ?? [],
      }));
    const tools = toolManifests.map((tool) => ({
      name: tool.name,
      description: [
        tool.description,
        `risk=${tool.riskLevel}`,
        `permission=${tool.requiredPermission}`,
        `approval=${tool.requiresApproval}`,
        `sandbox=${tool.sandboxProfile}`,
      ].join(" | "),
      inputSchema: tool.inputSchema,
    }));
    const remainingTools = Math.max(0, policy.maxToolCalls - state.toolCallCount);
    // Emit a thinking heartbeat before the (possibly multi-second) model call
    // so the UI shows activity instead of going silent, without exposing any
    // hidden chain-of-thought content.
    yield {
      type: "delta",
      event: await input.emit({
        type: "assistant.thinking",
        runId: input.runId,
        sessionId: input.sessionId,
        message: "Thinking...",
        payload: { step: state.stepCount },
      }),
    };
    const request = {
      temperature: 0,
      maxTokens: 1200,
      ...(tools.length > 0 ? { toolChoice: "auto" as const, tools } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      messages: [
        ...modelMessages,
        {
          role: "user" as const,
          content: [
            `Step: ${state.stepCount}`,
            `Observations: ${state.observations.join(" | ") || "(none)"}`,
            `Reflections: ${state.reflections.join(" | ") || "(none)"}`,
            `Remaining tool budget: ${remainingTools}/${policy.maxToolCalls}`,
            "Available tool manifests:",
            JSON.stringify(toolManifests.slice(0, 40)),
            "If you have enough evidence to answer, reply with text only (no tool call).",
          ].join("\n"),
        },
      ],
    };
    let result: StructuredChatCompletion;
    if (input.modelProvider.streamStructured) {
      let content = "";
      let toolCalls: StructuredChatCompletion["toolCalls"] = [];
      for await (const event of input.modelProvider.streamStructured(request)) {
        if (event.type === "text") {
          yield {
            type: "delta",
            event: await input.emit({
              type: "assistant.delta",
              runId: input.runId,
              sessionId: input.sessionId,
              message: event.content,
              payload: { modelStreaming: true },
            }),
          };
        } else if (event.type === "done") {
          content = event.content;
          toolCalls = event.toolCalls;
        }
      }
      result = { content, toolCalls };
    } else {
      result = await input.modelProvider.completeStructured(request);
    }
    const call = result.toolCalls[0];
    if (!call) {
      // No tool call: treat the model's text content as the final answer and
      // persist it as an assistant turn so the next user turn has context.
      const answer = result.content.trim();
      if (answer) {
        input.onMessage?.({ role: "assistant", content: answer });
      }
      yield {
        type: "action",
        action: {
          thoughtSummary: answer || "Model produced no tool call.",
          intent: input.intent,
          nextAction: "answer",
          riskLevel: "low",
          requiredPermission: "read-only",
          userVisibleMessage: answer || "模型未给出明确回答。",
          expectedObservation: "No further tool required.",
          stopCondition: "Model produced a final text answer.",
        },
      };
      return;
    }
    yield {
      type: "action",
      action: {
        thoughtSummary: result.content || `Model selected ${call.name}.`,
        intent: input.intent,
        nextAction: "call_tool",
        toolCall: { name: call.name, arguments: call.arguments },
        riskLevel: "low",
        requiredPermission: "read-only",
        userVisibleMessage: `模型选择调用工具：${call.name}`,
        expectedObservation: "Tool returns additional evidence for the current task.",
        stopCondition: "Stop when enough evidence is collected or a plan is ready.",
      },
    };
  } catch {
    return;
  }
}

function buildLoopSystemPreamble(intent: LoopIntent, hasSecurityScope: boolean): string {
  const lines = [
    "You are the EGO-Graph terminal agent planner.",
    "Choose at most one safe next tool call per turn, or answer directly when you have enough evidence.",
    "Do not reveal hidden chain-of-thought; provide auditable summaries only.",
  ];
  if (intent === "chat") {
    lines.push("This is a conversational turn; only read-only tools are available.");
  }
  if (intent === "security_task") {
    lines.push(
      hasSecurityScope
        ? "Security scope is configured; stay within the authorized targets and actions."
        : "No security scope is configured; do not perform active security tooling.",
    );
  }
  return lines.join(" ");
}

function appendToolExchange(
  messages: ChatMessage[],
  input: {
    toolUseId: string;
    action: PlannerAction;
    observation?: string;
    output: unknown;
  },
): void {
  if (!input.action.toolCall) {
    return;
  }
  messages.push({
    role: "assistant",
    content: [
      { type: "text", text: input.action.userVisibleMessage },
      {
        type: "tool_use",
        id: input.toolUseId,
        name: input.action.toolCall.name,
        input: input.action.toolCall.arguments,
      },
    ],
  });
  messages.push({
    role: "tool",
    toolCallId: input.toolUseId,
    name: input.action.toolCall.name,
    content: [
      {
        type: "tool_result",
        toolUseId: input.toolUseId,
        content: serializeToolResult(input.output, input.observation),
      },
    ],
  });
}

function readToolCallId(payload: Record<string, unknown>): string | undefined {
  const toolCall = payload.toolCall;
  if (typeof toolCall !== "object" || toolCall === null || Array.isArray(toolCall)) {
    return undefined;
  }
  const id = (toolCall as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function serializeToolResult(output: unknown, fallback: string | undefined): string {
  if (output !== undefined) {
    try {
      return JSON.stringify(output).slice(0, 16_000);
    } catch {
      return String(output).slice(0, 16_000);
    }
  }
  return fallback ?? "Tool completed without structured output.";
}

function inferRequiredPermission(tool: {
  name: string;
  riskLevel?: "low" | "medium" | "high";
  permission: { risk: "low" | "medium" | "high"; scope: string };
  requiresApproval?: boolean;
}): PermissionLevel {
  const risk = tool.riskLevel ?? tool.permission.risk;
  if (risk === "high") return "security-active";
  if (tool.permission.scope === "network") return "network-low";
  if (tool.name.startsWith("shell.") || tool.name.startsWith("check.")) return "shell-readonly";
  if (tool.requiresApproval || risk === "medium") return "shell-readonly";
  return "read-only";
}

function deterministicAction(
  input: AgentLoopInput,
  state: ReturnType<typeof createLoopState>,
): PlannerAction {
  if (
    input.intent === "security_task" &&
    !input.securityScope &&
    !isLocalSecurityAudit(input.message)
  ) {
    return {
      thoughtSummary: "Security task lacks an explicit authorization scope.",
      intent: input.intent,
      nextAction: "ask_user",
      riskLevel: "high",
      requiredPermission: "security-active",
      userVisibleMessage:
        "安全任务需要先补充授权范围、目标、允许动作和风险等级；当前不会执行主动工具。",
      expectedObservation: "User provides SecurityScope.",
      stopCondition: "Stop until SecurityScope exists.",
    };
  }

  if (
    input.intent === "security_task" &&
    isLocalSecurityAudit(input.message) &&
    state.toolCallCount === 0
  ) {
    return {
      thoughtSummary:
        "Local dependency audit can be represented as a gated local manifest tool call.",
      intent: input.intent,
      nextAction: "call_tool",
      toolCall: {
        name: "security.package_manifest_audit",
        arguments: { manifestPath: "package.json", includeDevDependencies: true },
      },
      riskLevel: "high",
      requiredPermission: "security-active",
      userVisibleMessage: "请求本地依赖漏洞审计，先经过 security-active 权限门。",
      expectedObservation: "Local package manifest audit result or permission block.",
      stopCondition: "Stop after the local audit tool returns or is blocked.",
    };
  }

  if (input.intent === "security_task") {
    return {
      thoughtSummary: "Security task loop stops after bounded scope or local audit handling.",
      intent: input.intent,
      nextAction: "stop",
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleMessage: "安全任务循环已停止；未执行未授权公网扫描或攻击自动化。",
      expectedObservation: "No additional active security tool required.",
      stopCondition: "Security safety boundary reached.",
    };
  }

  if (input.intent === "code_change" && state.toolCallCount === 0) {
    return {
      thoughtSummary: "Code change requests still start with bounded read-only repository context.",
      intent: input.intent,
      nextAction: "call_tool",
      toolCall: { name: "workspace.list", arguments: { limit: 80, maxDepth: 4 } },
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleMessage: "先读取项目文件列表，确定修改范围。",
      expectedObservation: "Workspace file list.",
      stopCondition: "Continue until enough evidence exists for plan approval.",
    };
  }

  if (input.intent === "code_change" && state.toolCallCount === 1) {
    return {
      thoughtSummary: "Search likely files before drafting an approvable plan.",
      intent: input.intent,
      nextAction: "call_tool",
      toolCall: {
        name: "workspace.grep",
        arguments: { query: firstSearchTerm(input.message), limit: 20 },
      },
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleMessage: "搜索任务关键词，补充 Plan 证据。",
      expectedObservation: "Relevant text matches.",
      stopCondition: "Stop at plan approval gate after bounded evidence gathering.",
    };
  }

  if (input.intent === "code_change") {
    return {
      thoughtSummary: "Code changes must enter the plan approval gate before patch generation.",
      intent: input.intent,
      nextAction: "propose_plan",
      riskLevel: "medium",
      requiredPermission: "workspace-write",
      userVisibleMessage: "代码修改任务已完成上下文收集，下一步进入 Plan 审批。",
      expectedObservation: "Human approves or rejects plan.",
      stopCondition: "Stop at plan approval gate.",
    };
  }

  if (input.intent === "project_analysis" && state.toolCallCount === 0) {
    return {
      thoughtSummary: "Start with a bounded workspace listing to understand repository shape.",
      intent: input.intent,
      nextAction: "call_tool",
      toolCall: { name: "workspace.list", arguments: { limit: 80, maxDepth: 4 } },
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleMessage: "读取项目文件列表以建立分析上下文。",
      expectedObservation: "Workspace file list.",
      stopCondition: "Continue until enough evidence exists for summary.",
    };
  }

  if (input.intent === "project_analysis" && state.toolCallCount === 1) {
    return {
      thoughtSummary: "Search for the user's key terms before answering.",
      intent: input.intent,
      nextAction: "call_tool",
      toolCall: {
        name: "workspace.grep",
        arguments: { query: firstSearchTerm(input.message), limit: 20 },
      },
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleMessage: "搜索相关关键词以补充证据。",
      expectedObservation: "Relevant text matches.",
      stopCondition: "Stop after bounded read-only evidence gathering.",
    };
  }

  return {
    thoughtSummary: "Enough bounded evidence was gathered for a user-visible answer.",
    intent: input.intent,
    nextAction: "stop",
    riskLevel: "low",
    requiredPermission: "read-only",
    userVisibleMessage: "动态循环已停止，已有证据足够生成总结。",
    expectedObservation: "No more tools required.",
    stopCondition: "Evidence budget reached.",
  };
}

function firstSearchTerm(message: string): string {
  return (
    message
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
      .find((token) => token.length > 1) ?? "agent"
  );
}

function isLocalSecurityAudit(message: string): boolean {
  return /依赖|package|manifest|semgrep|sast|源码|source|本地|local/i.test(message);
}
