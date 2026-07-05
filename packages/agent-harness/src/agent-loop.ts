import type { ChatModelProvider } from "@ego-graph/llm";
import type { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import type { ZodTypeAny } from "zod";
import {
  executeHarnessToolStep,
  type HarnessEvidenceEventInput,
  type HarnessToolEventInput,
} from "./tool-flow.js";
import { mergeLoopPolicy, type LoopPolicy } from "./loop-policy.js";
import { createLoopState, type LoopIntent, type PlannerAction } from "./loop-state.js";
import { buildLoopReflection } from "./reflection.js";
import { evaluateStopCondition } from "./stop-condition.js";
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
  securityScope?: unknown;
  policy?: Partial<LoopPolicy>;
  emit(event: HarnessToolEventInput): Promise<AgentRunEvent>;
  emitEvidence(event: HarnessEvidenceEventInput): Promise<AgentRunEvent>;
};

export async function* runAgentLoop(input: AgentLoopInput): AsyncIterable<AgentRunEvent> {
  const policy = mergeLoopPolicy(input.policy);
  const state = createLoopState({
    runId: input.runId,
    sessionId: input.sessionId,
    message: input.message,
    intent: input.intent,
  });

  if (input.intent === "chat") {
    yield await input.emit({
      type: "loop.stopped",
      runId: input.runId,
      sessionId: input.sessionId,
      message: "Chat intent does not enter the autonomous tool loop.",
      payload: { reason: "chat-direct-answer" },
    });
    return;
  }

  while (state.status === "running") {
    const stop = evaluateStopCondition(state, policy);
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
        maxToolCalls: policy.maxToolCalls,
      },
    });

    const action = await choosePlannerAction(input, state);
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
      for await (const event of executeHarnessToolStep({
        runId: input.runId,
        sessionId: input.sessionId,
        workspaceRoot: input.workspaceRoot,
        toolRegistry: input.toolRegistry,
        permissionLevel: input.permissionLevel,
        toolName: action.toolCall.name,
        toolInput: action.toolCall.arguments,
        emit: input.emit,
        emitEvidence: input.emitEvidence,
      })) {
        if (event.type === "observation.created") {
          lastObservation = event.message;
          state.observations.push(event.message);
        }
        yield event;
      }

      const reflection = buildLoopReflection({
        action,
        remainingToolBudget: Math.max(0, policy.maxToolCalls - state.toolCallCount),
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

async function choosePlannerAction(
  input: AgentLoopInput,
  state: ReturnType<typeof createLoopState>,
): Promise<PlannerAction> {
  const structured = await tryStructuredModelAction(input, state);
  if (structured) {
    return structured;
  }
  return deterministicAction(input, state);
}

async function tryStructuredModelAction(
  input: AgentLoopInput,
  state: ReturnType<typeof createLoopState>,
): Promise<PlannerAction | undefined> {
  if (!input.modelProvider?.completeStructured) {
    return undefined;
  }
  try {
    const toolManifests = input.toolRegistry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchemaLite(tool.inputSchema),
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
    const result = await input.modelProvider.completeStructured({
      temperature: 0,
      maxTokens: 1200,
      toolChoice: "auto",
      tools,
      messages: [
        {
          role: "system",
          content:
            "You are the EGO-Graph planner. Choose at most one safe next tool call, or answer/stop. Do not reveal hidden chain-of-thought.",
        },
        {
          role: "user",
          content: [
            `Task: ${input.message}`,
            `Intent: ${input.intent}`,
            `Step: ${state.stepCount}`,
            `Observations: ${state.observations.join(" | ") || "(none)"}`,
            `Security scope configured: ${Boolean(input.securityScope)}`,
            "Available tool manifests:",
            JSON.stringify(toolManifests.slice(0, 40)),
          ].join("\n"),
        },
      ],
    });
    const call = result.toolCalls[0];
    if (!call) {
      return undefined;
    }
    return {
      thoughtSummary: result.content || `Model selected ${call.name}.`,
      intent: input.intent,
      nextAction: "call_tool",
      toolCall: { name: call.name, arguments: call.arguments },
      riskLevel: "low",
      requiredPermission: "read-only",
      userVisibleMessage: `模型选择调用工具：${call.name}`,
      expectedObservation: "Tool returns additional evidence for the current task.",
      stopCondition: "Stop when enough evidence is collected or a plan is ready.",
    };
  } catch {
    return undefined;
  }
}

function zodToJsonSchemaLite(schema: ZodTypeAny): Record<string, unknown> {
  const def = schema._def as {
    typeName?: string;
    shape?: () => Record<string, ZodTypeAny>;
    innerType?: ZodTypeAny;
    values?: string[];
  };
  if (def.typeName === "ZodObject" && typeof def.shape === "function") {
    const shape = def.shape();
    const properties = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [key, zodToJsonSchemaLite(value)]),
    );
    return {
      type: "object",
      properties,
      required: Object.entries(shape)
        .filter(([, value]) => !isOptionalZod(value))
        .map(([key]) => key),
      additionalProperties: false,
    };
  }
  if (def.typeName === "ZodString") return { type: "string" };
  if (def.typeName === "ZodNumber") return { type: "number" };
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  if (def.typeName === "ZodArray" && "type" in def) {
    return {
      type: "array",
      items: zodToJsonSchemaLite((def as unknown as { type: ZodTypeAny }).type),
    };
  }
  if (def.typeName === "ZodEnum" && Array.isArray(def.values)) {
    return { type: "string", enum: def.values };
  }
  if (def.typeName === "ZodOptional" && def.innerType) {
    return zodToJsonSchemaLite(def.innerType);
  }
  if (def.typeName === "ZodDefault" && def.innerType) {
    return zodToJsonSchemaLite(def.innerType);
  }
  return { type: "object" };
}

function isOptionalZod(schema: ZodTypeAny): boolean {
  const def = schema._def as { typeName?: string };
  return def.typeName === "ZodOptional" || def.typeName === "ZodDefault";
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
