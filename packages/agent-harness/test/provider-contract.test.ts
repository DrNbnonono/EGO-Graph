import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatModelProvider, StructuredChatCompletion } from "@ego-graph/llm";
import { createTerminalAgentSession, type AgentRunEvent } from "../src/index.js";

/**
 * Model-replaceable integration tests.
 *
 * The session's `resolvePlannerProvider` entry point accepts any
 * ChatModelProvider — config-driven (createChatModelProvider), stub, or null.
 * These tests prove the same task produces the same structural trajectory
 * (plan.proposed → patch.proposed → patch.applied → run.completed) regardless
 * of which provider contract shape is injected, preventing over-fitting to
 * the fake provider used in other tests.
 */

const editPlanJson = JSON.stringify({
  rationale: "README contains the requested text.",
  editPlan: {
    goal: "update readme",
    operations: [
      { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
    ],
  },
});

const planJson = JSON.stringify({
  plan: [
    {
      id: "context",
      title: "Read README",
      knownEvidence: ["README exists"],
      missingEvidence: ["Need edit"],
      toolChoiceRationale: "Read first",
      expectedResult: "Context ready",
      stopCondition: "Done",
      riskNote: "Read-only",
    },
    {
      id: "patch",
      title: "Edit README",
      knownEvidence: ["Context"],
      missingEvidence: ["Approval"],
      toolChoiceRationale: "Use WorkspaceEditPlan",
      expectedResult: "Diff",
      stopCondition: "Approved",
      riskNote: "Workspace write",
    },
  ],
});

/** Provider that only implements complete() — the minimal contract. */
function minimalProvider(content: string): ChatModelProvider {
  return {
    name: "minimal",
    model: "minimal-model",
    async complete() {
      return content;
    },
  };
}

/** Provider that implements complete() + completeStructured() — full contract. */
function structuredProvider(
  completeContent: string,
  structuredResponse: StructuredChatCompletion,
): ChatModelProvider {
  return {
    name: "structured",
    model: "structured-model",
    async complete() {
      return completeContent;
    },
    async completeStructured() {
      return structuredResponse;
    },
  };
}

/** Provider with streaming methods — the richest contract. */
function streamingProvider(content: string): ChatModelProvider {
  return {
    name: "streaming",
    model: "streaming-model",
    async complete() {
      return content;
    },
    async *streamComplete() {
      yield content;
    },
    async completeStructured() {
      return { content, toolCalls: [] };
    },
    async *streamStructured() {
      yield { type: "text", content };
      yield { type: "done", content, toolCalls: [] };
    },
  };
}

async function collect(iterable: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function eventTypes(events: AgentRunEvent[]): string[] {
  return events.map((event) => event.type);
}

async function setupWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ego-provider-contract-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
  await writeFile(join(root, "README.md"), "hello\n", "utf8");
  return root;
}

const checkCommands = [{ name: "node-version", command: process.execPath, args: ["--version"] }];

describe("model-replaceable integration", () => {
  it("completes the full chain with a minimal provider (complete-only)", async () => {
    const root = await setupWorkspace();
    const egoHome = await mkdtemp(join(tmpdir(), "ego-provider-minimal-home-"));
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: minimalProvider(editPlanJson),
      checkCommands,
    });

    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    expect(eventTypes(started)).toContain("plan.proposed");

    const planned = await collect(session.approvePlan(runId));
    expect(eventTypes(planned)).toContain("patch.proposed");

    const applied = await collect(session.approvePatch(runId));
    expect(eventTypes(applied)).toContain("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });

  it("completes the full chain with a structured provider (complete + completeStructured)", async () => {
    const root = await setupWorkspace();
    const egoHome = await mkdtemp(join(tmpdir(), "ego-provider-structured-home-"));
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: structuredProvider(editPlanJson, {
        content: editPlanJson,
        toolCalls: [],
      }),
      checkCommands,
    });

    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    expect(eventTypes(started)).toContain("plan.proposed");

    const planned = await collect(session.approvePlan(runId));
    expect(eventTypes(planned)).toContain("patch.proposed");

    const applied = await collect(session.approvePatch(runId));
    expect(eventTypes(applied)).toContain("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });

  it("completes the full chain with a streaming provider (all methods)", async () => {
    const root = await setupWorkspace();
    const egoHome = await mkdtemp(join(tmpdir(), "ego-provider-streaming-home-"));
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: streamingProvider(editPlanJson),
      checkCommands,
    });

    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    expect(eventTypes(started)).toContain("plan.proposed");

    const planned = await collect(session.approvePlan(runId));
    expect(eventTypes(planned)).toContain("patch.proposed");

    const applied = await collect(session.approvePatch(runId));
    expect(eventTypes(applied)).toContain("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });

  it("falls back to deterministic planning with a null provider", async () => {
    const root = await setupWorkspace();
    const egoHome = await mkdtemp(join(tmpdir(), "ego-provider-null-home-"));
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: null,
      checkCommands,
    });

    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    // With no model, the deterministic planner still produces a plan
    expect(eventTypes(started)).toContain("plan.proposed");
    // But the plan is the fallback, not model-generated
    expect(eventTypes(started)).not.toContain("planner.model.used");
    expect(eventTypes(started)).not.toContain("planner.fallback");

    // Patch approval should be blocked (no model to generate edit plan)
    const planned = await collect(session.approvePlan(runId));
    expect(eventTypes(planned)).toContain("plan.approved");
    // Without a model, runCodingAgentTurn cannot generate a diff
    expect(eventTypes(planned)).toContain("run.blocked");
  });

  it("produces identical structural outcomes across minimal, structured, and streaming providers", async () => {
    const providers = [
      { label: "minimal", provider: minimalProvider(editPlanJson) },
      { label: "structured", provider: structuredProvider(editPlanJson, { content: editPlanJson, toolCalls: [] }) },
      { label: "streaming", provider: streamingProvider(editPlanJson) },
    ];

    const results: Array<{ label: string; eventSequence: string[]; finalContent: string }> = [];

    for (const { label, provider } of providers) {
      const root = await setupWorkspace();
      const egoHome = await mkdtemp(join(tmpdir(), `ego-provider-parity-${label}-`));
      const session = createTerminalAgentSession({
        workspaceRoot: root,
        egoHome,
        permissionLevel: "shell-readonly",
        modelProvider: provider,
        checkCommands,
      });

      const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
      const runId = started[0]!.runId;
      const planned = await collect(session.approvePlan(runId));
      const applied = await collect(session.approvePatch(runId));

      const allEvents = [...started, ...planned, ...applied];
      const keyEvents = eventTypes(allEvents).filter((type) =>
        ["plan.proposed", "plan.approved", "patch.proposed", "patch.approved", "patch.applied", "check.completed", "run.completed"].includes(type),
      );
      const finalContent = await readFile(join(root, "README.md"), "utf8");

      results.push({ label, eventSequence: keyEvents, finalContent });
    }

    // All three providers must produce the same key event sequence
    const baseline = results[0]!.eventSequence;
    for (const result of results) {
      expect(result.eventSequence).toEqual(baseline);
      expect(result.finalContent).toBe("lotus\n");
    }
  });
});
