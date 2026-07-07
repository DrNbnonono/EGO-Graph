import type { EvidenceInputEvent } from "./evidence-graph.js";

/**
 * Decision trace: an ordered, auditable record of every planner decision,
 * tool invocation, and strategy update during a run. Each step cites the
 * evidence it relied on and the strategy update (if any) it triggered.
 */

export type DecisionTraceStep = {
  step: number;
  type: "planner_decision" | "tool_invocation" | "strategy_update" | "permission_decision" | "observation";
  action: string;
  toolName?: string;
  rationale: string;
  evidenceRefs: string[];
  strategyUpdateRefs: string[];
  createdAt?: string;
  approval?: {
    action: string;
    resources: string[];
    effect: string;
    source?: string;
  };
};

export function buildDecisionTraceFromEvents(events: EvidenceInputEvent[]): DecisionTraceStep[] {
  const steps: DecisionTraceStep[] = [];
  let step = 0;
  const pendingToolEvidence = new Map<string, string[]>();

  for (const event of events) {
    if (event.type === "planner.decision" || event.type === "plan.proposed") {
      step += 1;
      const action = readPayload(event, "action") as
        | { nextAction?: string; thoughtSummary?: string; userVisibleMessage?: string; toolCall?: { name: string } }
        | undefined;
      steps.push({
        step,
        type: "planner_decision",
        action: action?.nextAction ?? event.type,
        ...(action?.toolCall?.name ? { toolName: action.toolCall.name } : {}),
        rationale: action?.thoughtSummary ?? action?.userVisibleMessage ?? event.message,
        evidenceRefs: [],
        strategyUpdateRefs: [],
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
      });
      continue;
    }
    if (event.type === "tool.requested" || event.type === "tool.started") {
      const toolName = readPayload(event, "tool") as string | undefined;
      const toolCallId = (readPayload(event, "toolCall") as { id?: string } | undefined)?.id;
      if (toolName) {
        step += 1;
        steps.push({
          step,
          type: "tool_invocation",
          action: toolName,
          toolName,
          rationale: event.message,
          evidenceRefs: [],
          strategyUpdateRefs: [],
          ...(event.createdAt ? { createdAt: event.createdAt } : {}),
        });
        if (toolCallId) {
          pendingToolEvidence.set(toolCallId, []);
        }
      }
      continue;
    }
    if (event.type === "patch.proposed" || event.type === "repair.proposed" || event.type === "check.completed") {
      step += 1;
      steps.push({
        step,
        type: "observation",
        action: event.type,
        rationale: event.message,
        evidenceRefs: [],
        strategyUpdateRefs: [],
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
      });
      continue;
    }
    if (event.type === "observation.created" || event.type === "evidence.created") {
      const last = steps[steps.length - 1];
      if (last) {
        last.evidenceRefs.push(event.message.slice(0, 120));
      }
      continue;
    }
    if (event.type === "strategy.graph.updated") {
      const updates = readPayload(event, "updates") as
        | Array<{ kind: string; ref: string; summary: string }>
        | undefined;
      const last = steps[steps.length - 1];
      if (last && updates) {
        last.strategyUpdateRefs.push(...updates.map((update) => `${update.kind}:${update.ref}`));
      }
      continue;
    }
    if (event.type === "permission.requested" || event.type === "permission.replied") {
      step += 1;
      const action = readPayload(event, "action") as string | undefined;
      const resources = readPayload(event, "resources") as string[] | undefined;
      const matchedRule = readPayload(event, "matchedRule") as { effect?: string } | undefined;
      const source = readPayload(event, "source") as string | undefined;
      steps.push({
        step,
        type: "permission_decision",
        action: event.type,
        rationale: event.message,
        evidenceRefs: [],
        strategyUpdateRefs: [],
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
        ...(action || resources || matchedRule
          ? {
              approval: {
                action: action ?? "*",
                resources: resources ?? [],
                effect: matchedRule?.effect ?? "ask",
                ...(source ? { source } : {}),
              },
            }
          : {}),
      });
    }
  }
  return steps;
}

function readPayload(event: EvidenceInputEvent, key: string): unknown {
  const payload = event.payload;
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}
