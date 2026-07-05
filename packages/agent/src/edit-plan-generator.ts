import { generateJson, type ChatModelProvider } from "@ego-graph/llm";
import {
  createContextForTask,
  type TaskContext,
  type WorkspaceEditPlan,
} from "@ego-graph/workspace";
import { z } from "zod";
import { loadAgentSystemPrompt } from "./system-prompt.js";

const workspaceEditOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_file"),
    path: z.string().min(1),
    content: z.string(),
  }),
  z.object({
    type: z.literal("replace_file"),
    path: z.string().min(1),
    content: z.string(),
  }),
  z.object({
    type: z.literal("replace_text"),
    path: z.string().min(1),
    oldText: z.string().min(1),
    newText: z.string(),
  }),
]);

const workspaceEditPlanSchema = z.object({
  goal: z.string().min(1),
  operations: z.array(workspaceEditOperationSchema).min(1),
});

const modelEditPlanSchema = z.object({
  rationale: z.string().min(1),
  editPlan: workspaceEditPlanSchema,
});

export type GenerateWorkspaceEditPlanInput = {
  message: string;
  workspaceRoot: string;
  provider?: ChatModelProvider | null;
};

export type GenerateWorkspaceEditPlanResult =
  | {
      status: "proposed";
      editPlan: WorkspaceEditPlan;
      rationale: string;
      inspectedFiles: string[];
    }
  | {
      status: "needs_model";
      message: string;
      inspectedFiles: string[];
    }
  | {
      status: "blocked";
      message: string;
      inspectedFiles: string[];
    };

export async function generateWorkspaceEditPlan(
  input: GenerateWorkspaceEditPlanInput,
): Promise<GenerateWorkspaceEditPlanResult> {
  const context = await createContextForTask({
    workspaceRoot: input.workspaceRoot,
    goal: input.message,
    intent: "code_change",
    tokenBudget: 10_000,
  });
  const selectedFiles = context.selectedFiles.map((file) => file.path);

  if (!input.provider) {
    return {
      status: "needs_model",
      message: "模型未配置，自动生成 Patch 已降级为只读模式。",
      inspectedFiles: selectedFiles,
    };
  }

  try {
    const systemPrompt = await loadAgentSystemPrompt({
      workspaceRoot: input.workspaceRoot,
      skills: ["workspace", "patch-approval", "checks"],
      mcpTools: [],
    });
    // 中文注释：这里只要求模型生成结构化计划，真正写入仍由 workspace policy 和审批链负责。
    const result = await generateJson(input.provider, modelEditPlanSchema, {
      temperature: 0,
      maxTokens: 4096,
      messages: [
        {
          role: "system",
          content: [
            systemPrompt.finalPrompt,
            "You are EGO-Graph's coding agent edit planner.",
            "Return only JSON that matches this shape:",
            '{"rationale":"...","editPlan":{"goal":"...","operations":[...]}}',
            "Allowed operations are create_file, replace_file, and replace_text.",
            "Use relative workspace paths only. Do not target .env, .git, node_modules, dist, or files outside the workspace.",
            "Prefer the smallest safe edit. If changing an existing file, prefer replace_text with exact oldText.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [`User task:\n${input.message}`, "", renderEditContextForPrompt(context)].join(
            "\n",
          ),
        },
      ],
    });

    return {
      status: "proposed",
      rationale: result.rationale,
      editPlan: result.editPlan,
      inspectedFiles: selectedFiles,
    };
  } catch (error) {
    return {
      status: "blocked",
      message: `模型生成 Patch 失败：${error instanceof Error ? error.message : String(error)}`,
      inspectedFiles: selectedFiles,
    };
  }
}

function renderEditContextForPrompt(context: TaskContext): string {
  return [
    "Repo context selected by EGO-Graph Context Engine:",
    `selectedFiles=${context.selectedFiles.map((file) => file.path).join(", ") || "(none)"}`,
    `relevantTests=${context.relevantTests.join(", ") || "(none)"}`,
    `symbols=${
      context.selectedSymbols
        .slice(0, 32)
        .map((symbol) => `${symbol.kind}:${symbol.name}@${symbol.file}:${symbol.line}`)
        .join(", ") || "(none)"
    }`,
    `budget=${context.budget.estimatedTokens}/${context.budget.requestedTokens}`,
    "Selection rationale:",
    context.explanation.map((item) => `- ${item}`).join("\n"),
    "Relevant snippets:",
    context.snippets
      .map(
        (snippet) =>
          `--- ${snippet.path} lines ${snippet.startLine}-${snippet.endLine} ---\n${snippet.content}`,
      )
      .join("\n\n") || "(none)",
  ].join("\n");
}
