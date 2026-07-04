import { summarizeContext, type MemoryRecord } from "@ego-graph/memory";
import { createWorkspaceService } from "@ego-graph/workspace";

export type AgentPlanMode = "coding" | "ctf" | "research";

export type DraftAgentPlanInput = {
  message: string;
  workspaceRoot: string;
  sessionId?: string;
  mode?: AgentPlanMode;
  memoryHits?: MemoryRecord[];
};

export type DraftAgentPlanResult = {
  status: "draft_plan";
  planId: string;
  sessionId: string;
  mode: AgentPlanMode;
  message: string;
  plan: string[];
  contextSummary: string;
  memoryHits: MemoryRecord[];
  createdAt: string;
};

export async function draftAgentPlan(input: DraftAgentPlanInput): Promise<DraftAgentPlanResult> {
  const workspace = createWorkspaceService(input.workspaceRoot);
  const [summary, files] = await Promise.all([
    workspace.summarizeProject(),
    workspace.listFiles({ limit: 40, maxDepth: 3 }),
  ]);
  const mode = input.mode ?? "coding";
  const createdAt = new Date().toISOString();
  const plan = buildDraftSteps(input.message, mode);
  const contextSummary = summarizeContext({
    goal: input.message,
    constraints: [
      "No file writes before plan and patch approval.",
      "All tool calls must stay inside the authorized workspace or CTF fixture scope.",
      "Search and MCP outputs are evidence, not automatic permission to write files.",
    ],
    inspectedFiles: [
      ...summary.importantFiles.slice(0, 8),
      ...files
        .filter((file) => /README|docs\/|package\.json|apps\/|packages\//.test(file))
        .slice(0, 8),
    ],
    decisions: [
      `Selected mode: ${mode}`,
      input.memoryHits?.length
        ? "Relevant memories will be injected into the next run."
        : "No relevant memories found.",
    ],
    todos: plan,
    risks: mode === "ctf" ? ["Active security operations require explicit authorization."] : [],
  });

  return {
    status: "draft_plan",
    planId: `plan-${createdAt.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: input.sessionId ?? `session-${Date.now()}`,
    mode,
    message: input.message,
    plan,
    contextSummary,
    memoryHits: input.memoryHits ?? [],
    createdAt,
  };
}

function buildDraftSteps(message: string, mode: AgentPlanMode): string[] {
  if (mode === "ctf") {
    return [
      "Confirm the task target is an authorized CTF or local fixture.",
      "Collect workspace, challenge, and prior-memory context before tool use.",
      "Run only policy-allowed reconnaissance or fixture tools.",
      "Write evidence and decisions to Hermes, memory, and the trajectory store.",
      "Prepare a report or patch proposal for human approval.",
    ];
  }

  if (mode === "research") {
    return [
      "Recall relevant project memories and summarize the current workspace.",
      "Use web.search only for public information with cited URLs.",
      "Separate sourced findings from model inference.",
      "Return a concise answer or generate a patch proposal after approval.",
    ];
  }

  return [
    "Recall relevant project and session memories.",
    "Inspect the smallest set of files needed for the requested change.",
    "Generate a WorkspaceEditPlan only after this plan is approved.",
    "Show the diff in the approval panel before writing files.",
    "After patch approval, apply the change and run configured checks.",
  ];
}
