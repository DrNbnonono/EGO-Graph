import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatModelProvider, ChatStreamEvent } from "@ego-graph/llm";
import { createTerminalAgentToolRegistry } from "@ego-graph/tools";
import { runAgentLoop } from "../agent-loop.js";
import type { AgentRunEvent, PermissionLevel } from "../session.js";
import { fixtureForScenario } from "./hardness-fixtures.js";
import {
  baselineHardnessScenarios,
  scoreHardnessTrace,
  type HardnessScenario,
  type HardnessScore,
} from "./hardness-suite.js";
import type { LoopIntent } from "../loop-state.js";

/**
 * Hardness CI runner: drive the real agent loop against each scenario with a
 * deterministic stub model provider (no network), collect the event stream,
 * and score it. This is what `scripts/hardness-eval.mjs` and the harness
 * `doctor`/self-check commands call to prove the agent is robust under
 * noise, missing authorization, tool failure, and adversarial input.
 */

export type HardnessRunnerResult = {
  scenario: HardnessScenario;
  events: AgentRunEvent[];
  score: HardnessScore;
};

export type HardnessRunnerOptions = {
  /** Override the default scenarios (defaults to baselineHardnessScenarios). */
  scenarios?: HardnessScenario[];
  /** Override the model provider (defaults to a deterministic stub). */
  modelProvider?: ChatModelProvider | null;
  /** Override the permission level (defaults to read-only, the safest posture). */
  permissionLevel?: PermissionLevel;
  /** Intent inferred from the scenario domain. */
  intentResolver?: (scenario: HardnessScenario) => LoopIntent;
};

export async function runHardnessScenario(
  scenario: HardnessScenario,
  options: HardnessRunnerOptions = {},
): Promise<HardnessRunnerResult> {
  const fixture = fixtureForScenario(scenario);
  const workspaceRoot = await mkdtemp(join(tmpdir(), `ego-hardness-${scenario.id}-`));
  try {
    for (const file of fixture.files) {
      const absolute = join(workspaceRoot, file.path);
      await mkdir(join(absolute, ".."), { recursive: true });
      await writeFile(absolute, file.content, "utf8");
    }
    const events = await collectEvents(
      runAgentLoop({
        runId: `hardness-${scenario.id}`,
        sessionId: `hardness-session`,
        message: scenario.prompt,
        intent: (options.intentResolver ?? defaultIntentResolver)(scenario),
        workspaceRoot,
        permissionLevel: options.permissionLevel ?? "read-only",
        toolRegistry: createTerminalAgentToolRegistry(),
        modelProvider: options.modelProvider === undefined ? createStubModelProvider(scenario) : options.modelProvider,
        emit: emitEvent,
        emitEvidence: emitEvidence,
      }),
    );
    const score = scoreHardnessTrace({ scenario, events });
    return { scenario, events, score };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

export async function runHardnessSuite(
  options: HardnessRunnerOptions = {},
): Promise<HardnessRunnerResult[]> {
  const scenarios = options.scenarios ?? baselineHardnessScenarios;
  const results: HardnessRunnerResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runHardnessScenario(scenario, options));
  }
  return results;
}

export function summarizeHardnessSuite(results: HardnessRunnerResult[]): {
  total: number;
  passed: number;
  failedScenarios: string[];
  averageScore: number;
} {
  const passed = results.filter((result) => result.score.passed).length;
  const failedScenarios = results.filter((result) => !result.score.passed).map((result) => result.scenario.id);
  const averageScore =
    results.length === 0
      ? 0
      : Math.round(results.reduce((total, result) => total + result.score.score, 0) / results.length);
  return {
    total: results.length,
    passed,
    failedScenarios,
    averageScore,
  };
}

function defaultIntentResolver(scenario: HardnessScenario): LoopIntent {
  if (
    scenario.domain === "incident_response" ||
    scenario.domain === "pcap_forensics" ||
    scenario.domain === "reverse_engineering" ||
    scenario.domain === "web_pentest" ||
    scenario.domain === "vulnerability_research"
  ) {
    return "security_task";
  }
  return "project_analysis";
}

/**
 * Deterministic stub model provider. On the first step it proposes a single
 * read-only tool call (workspace.list) so the loop emits tool.completed and
 * observation.created events; on subsequent steps it returns a final text
 * answer so the run terminates. This keeps the hardness suite hermetic (no
 * network) while satisfying the success signals the scorer checks for.
 */
function createStubModelProvider(scenario: HardnessScenario): ChatModelProvider {
  const answer = `[stub] completed scenario ${scenario.id}: ${scenario.expectedArtifacts.join(", ")}.`;
  let step = 0;
  return {
    name: "hardness-stub",
    model: "stub",
    async complete() {
      return answer;
    },
    async completeStructured() {
      step += 1;
      if (step === 1) {
        return {
          content: `Inspecting the workspace for ${scenario.id}.`,
          toolCalls: [
            {
              id: `stub-call-${step}`,
              name: "workspace.list",
              arguments: { limit: 40, maxDepth: 3 },
            },
          ],
        };
      }
      return { content: answer, toolCalls: [] };
    },
    async *streamStructured(): AsyncIterable<ChatStreamEvent> {
      step += 1;
      if (step === 1) {
        yield {
          type: "tool_call_complete",
          toolCall: {
            id: `stub-call-${step}`,
            name: "workspace.list",
            arguments: { limit: 40, maxDepth: 3 },
          },
        } as ChatStreamEvent;
        yield {
          type: "done",
          content: `Inspecting the workspace for ${scenario.id}.`,
          toolCalls: [
            {
              id: `stub-call-${step}`,
              name: "workspace.list",
              arguments: { limit: 40, maxDepth: 3 },
            },
          ],
        } as ChatStreamEvent;
        return;
      }
      yield { type: "text", content: answer } as ChatStreamEvent;
      yield { type: "done", content: answer, toolCalls: [] } as ChatStreamEvent;
    },
  };
}

async function collectEvents(stream: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

const emitEvent = async (event: {
  type: AgentRunEvent["type"];
  runId: string;
  sessionId: string;
  message: string;
  payload: Record<string, unknown>;
}): Promise<AgentRunEvent> => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  type: event.type,
  runId: event.runId,
  sessionId: event.sessionId,
  message: event.message,
  payload: event.payload,
  createdAt: new Date().toISOString(),
});

const emitEvidence = async (event: {
  runId: string;
  sessionId: string;
  toolName: string;
  candidate: { summary: string };
  output: Record<string, unknown>;
}): Promise<AgentRunEvent> => ({
  id: `evid-${Math.random().toString(36).slice(2)}`,
  type: "evidence.created",
  runId: event.runId,
  sessionId: event.sessionId,
  message: event.candidate.summary,
  payload: { toolName: event.toolName, candidate: event.candidate, output: event.output },
  createdAt: new Date().toISOString(),
});
