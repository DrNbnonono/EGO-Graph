import type { detectSecurityCapabilities } from "@ego-graph/tools";
import type { AgentRunEvent } from "./session.js";

/**
 * Emit a `tool.capability.report` event for the active run, capturing the
 * detected security tool capabilities (external vs builtin vs unavailable)
 * so the TUI/Web can render a one-line status footer.
 *
 * Kept as a standalone helper (rather than baked into the 70KB session.ts)
 * so the capability probe is opt-in and lazy: the session calls this once
 * per run start, and the TUI reads the result from the event stream or from
 * the `getToolCapabilityStatus` accessor a future P1 session refactor exposes.
 *
 * Dynamically importing the tools-package security entry keeps
 * agent-harness's startup path free of the binary-probe cost when the caller
 * does not need capability reporting.
 */
export async function buildToolCapabilityReportEvent(input: {
  runId: string;
  sessionId: string;
  toolsModule: typeof import("@ego-graph/tools");
}): Promise<AgentRunEvent> {
  const capabilities = await input.toolsModule.detectSecurityCapabilities();
  const summary = input.toolsModule.summarizeCapabilityStatus
    ? input.toolsModule.summarizeCapabilityStatus(capabilities)
    : undefined;
  return {
    id: `cap-${input.runId}`,
    type: "tool.capability.report",
    runId: input.runId,
    sessionId: input.sessionId,
    message: `${capabilities.length} capability(ies) detected`,
    payload: {
      capabilities,
      ...(summary ? { summary } : {}),
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Type-only re-export so callers can reference the capability shape without a
 * runtime dependency on the tools package.
 */
export type ToolCapabilityReport = Awaited<ReturnType<typeof detectSecurityCapabilities>>;
