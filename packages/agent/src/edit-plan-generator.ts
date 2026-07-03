import { basename } from "node:path";
import { generateJson, type ChatModelProvider } from "@ego-graph/llm";
import { createWorkspaceService, type WorkspaceEditPlan } from "@ego-graph/workspace";
import { z } from "zod";

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
  const workspace = createWorkspaceService(input.workspaceRoot);
  const files = await workspace.listFiles({ limit: 80, maxDepth: 4 });
  const selectedFiles = selectEditContextFiles(input.message, files);
  const context = await readContextSnippets(workspace, selectedFiles);

  if (!input.provider) {
    return {
      status: "needs_model",
      message: "模型未配置，自动生成 Patch 已降级为只读模式。",
      inspectedFiles: selectedFiles,
    };
  }

  try {
    // 中文注释：提示词只要求模型产出结构化 JSON，实际写入仍由 workspace policy 审批链负责。
    const result = await generateJson(input.provider, modelEditPlanSchema, {
      temperature: 0,
      maxTokens: 4096,
      messages: [
        {
          role: "system",
          content: [
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
          content: [
            `User task:\n${input.message}`,
            "",
            "Workspace files:",
            files.slice(0, 80).join("\n") || "(none)",
            "",
            "Relevant file excerpts:",
            context || "(no text context available)",
          ].join("\n"),
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

function selectEditContextFiles(message: string, files: string[]): string[] {
  const normalizedMessage = message.toLowerCase();
  const preferred = ["README.md", "package.json", "docs/architecture.md"];
  const matches = files.filter((file) => {
    const normalized = file.toLowerCase();
    const fileName = basename(file).toLowerCase();
    return normalizedMessage.includes(normalized) || normalizedMessage.includes(fileName);
  });

  return [...new Set([...matches, ...preferred.filter((file) => files.includes(file))])].slice(
    0,
    6,
  );
}

async function readContextSnippets(
  workspace: ReturnType<typeof createWorkspaceService>,
  files: string[],
): Promise<string> {
  const snippets: string[] = [];

  for (const file of files) {
    try {
      const content = await workspace.readTextFile(file);
      snippets.push(`--- ${file} ---\n${content.slice(0, 4_000)}`);
    } catch (error) {
      snippets.push(
        `--- ${file} ---\n[read failed: ${error instanceof Error ? error.message : String(error)}]`,
      );
    }
  }

  return snippets.join("\n\n").slice(0, 18_000);
}
