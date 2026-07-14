import {
  type AgentEditRecord,
  type AgentPlanRecord,
  type SqliteEgoStore,
} from "@ego-graph/storage";
import type { WorkspaceEditPlan } from "@ego-graph/workspace";
import type { AgentRunEvent, AgentRunEventType, TerminalAgentRunState } from "./session.js";

export type HydratedPendingRun = TerminalAgentRunState & {
  editPlan?: WorkspaceEditPlan;
  approvalId?: string;
};

export async function hydratePendingRunsFromStore(input: {
  store: SqliteEgoStore;
  pendingRuns: Map<string, HydratedPendingRun>;
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

export async function replayRunFromStore(
  store: SqliteEgoStore,
  runId: string,
): Promise<AgentRunEvent[]> {
  const events = await store.listHermesEvents({ runId, limit: 200 });
  return events
    .slice()
    .reverse()
    .map((event) => ({
      type: normalizePersistedEventType(event.type),
      runId,
      sessionId: event.sessionId,
      message: readString(event.payload.message, event.type),
      createdAt: event.createdAt,
      payload: event.payload,
    }));
}

function hydratePlanRun(plan: AgentPlanRecord): HydratedPendingRun {
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

function normalizePersistedEventType(type: string): AgentRunEventType {
  const known: AgentRunEventType[] = [
    "user.message",
    "assistant.message",
    "assistant.delta",
    "assistant.completed",
    "run.started",
    "context.loaded",
    "context.budget.warning",
    "context.compacted",
    "memory.recalled",
    "model.failed",
    "strategy.graph.created",
    "strategy.graph.updated",
    "planner.fallback",
    "planner.model.used",
    "planner.decision",
    "loop.step.started",
    "loop.step.completed",
    "loop.stopped",
    "plan.proposed",
    "plan.approved",
    "plan.rejected",
    "tool.requested",
    "tool.started",
    "tool.completed",
    "tool.failed",
    "tool.timeout",
    "tool.cancelled",
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
    "run.cancelled",
    "run.blocked",
  ];
  return known.includes(type as AgentRunEventType)
    ? (type as AgentRunEventType)
    : "reflection.created";
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
