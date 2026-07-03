import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { generateJson, type ChatModelProvider } from "@ego-graph/llm";
import type { ToolDefinition } from "@ego-graph/tools";
import type { MissionGraph } from "./mission-graph.js";
import type { TaskSpec } from "./task-spec.js";

export type AgentEvidence = {
  summary: string;
  source: string;
  raw: Record<string, unknown>;
};

export type AgentObservation = {
  toolName: string;
  output: Record<string, unknown>;
  findings: string[];
};

export type AgentDecision =
  | {
      type: "use_tool";
      toolName: string;
      rationale: string;
      input: Record<string, unknown>;
      expectedEvidence: string;
    }
  | {
      type: "finish";
      rationale: string;
    }
  | {
      type: "block";
      rationale: string;
    };

export type AgentPlannerContext = {
  task: TaskSpec;
  graph: MissionGraph;
  tools: ToolDefinition<ZodTypeAny, ZodTypeAny>[];
  evidence: AgentEvidence[];
  observations: AgentObservation[];
};

export type AgentPlanner = {
  name?: string;
  decide(context: AgentPlannerContext): Promise<AgentDecision>;
};

export function createDeterministicPlanner(): AgentPlanner {
  return {
    name: "deterministic",
    async decide(context) {
      const usedToolNames = new Set(
        context.observations.map((observation) => observation.toolName),
      );
      const nextTool = context.tools.find((tool) => !usedToolNames.has(tool.name));

      if (!nextTool) {
        if (context.evidence.length > 0) {
          return {
            type: "finish",
            rationale: `Collected ${context.evidence.length} evidence item(s), enough to answer the mission goal.`,
          };
        }

        return {
          type: "block",
          rationale: "All available tools were exhausted without producing evidence.",
        };
      }

      const target = context.task.targets[0];
      if (!target) {
        return {
          type: "block",
          rationale: "The task has no target inside the authorized scope.",
        };
      }

      return {
        type: "use_tool",
        toolName: nextTool.name,
        rationale: [
          `Use ${nextTool.name} because ${nextTool.description}.`,
          `This checks the next evidence gap for: ${context.task.goal}.`,
        ].join(" "),
        input: buildDefaultToolInput(nextTool, target),
        expectedEvidence: [
          "Evidence that helps determine whether the goal is satisfied:",
          context.task.goal,
        ].join(" "),
      };
    },
  };
}

export const createEvidenceGuidedPlanner = createDeterministicPlanner;

export function createModelBackedPlanner(provider: ChatModelProvider): AgentPlanner {
  return {
    name: `model:${provider.name}:${provider.model}`,
    async decide(context) {
      const schema = z.discriminatedUnion("type", [
        z.object({
          type: z.literal("use_tool"),
          toolName: z.string().min(1),
          rationale: z.string().min(1),
          input: z.record(z.unknown()),
          expectedEvidence: z.string().min(1),
        }),
        z.object({
          type: z.literal("finish"),
          rationale: z.string().min(1),
        }),
        z.object({
          type: z.literal("block"),
          rationale: z.string().min(1),
        }),
      ]);

      return generateJson(provider, schema, {
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You are the EGO-Graph cybersecurity mission planner.",
              "Choose exactly one next action as JSON.",
              "Only use tools listed in the user message.",
              "Prefer completing when evidence already satisfies the goal.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              task: context.task,
              graph: context.graph,
              tools: context.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                permission: tool.permission,
              })),
              evidence: context.evidence,
              observations: context.observations,
            }),
          },
        ],
      });
    },
  };
}

function buildDefaultToolInput(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  target: string,
): Record<string, unknown> {
  switch (tool.permission.scope) {
    case "fixture":
      return { fixture: target };
    case "file":
      return { file: target };
    case "network":
      return { target };
  }
}
