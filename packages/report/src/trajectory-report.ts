import type {ReportDecision, ReportObservation, ReportPolicyDecision} from "./markdown-report.js";

export type ReportTrajectoryEvent = {
  type: string;
  message: string;
  data: Record<string, unknown>;
};

export function extractReportDecisions(events: ReportTrajectoryEvent[]): ReportDecision[] {
  return events
    .filter((event) => event.type === "decision.made")
    .map((event, index) => {
      const decision = event.data.decision as Record<string, unknown> | undefined;
      const toolName = decision?.toolName;
      return {
        step: index + 1,
        type: String(decision?.type ?? "unknown"),
        rationale: event.message,
        ...(typeof toolName === "string" && toolName.length > 0 ? {toolName} : {}),
      };
    });
}

export function extractReportObservations(events: ReportTrajectoryEvent[]): ReportObservation[] {
  return events
    .filter((event) => event.type === "observation.created")
    .map((event) => ({
      toolName: String(event.data.toolName ?? "unknown"),
      findings: Array.isArray(event.data.findings)
        ? event.data.findings.map((finding: unknown) => String(finding))
        : [],
    }));
}

export function extractReportPolicyDecisions(
  events: ReportTrajectoryEvent[],
): ReportPolicyDecision[] {
  return events
    .filter((event) => event.type === "safety.checked")
    .map((event, index) => ({
      step: index + 1,
      toolName: String(event.data.tool ?? "unknown"),
      allowed: event.data.allowed === true,
      reason: event.message,
    }));
}
