import { proposePatch } from "@ego-graph/workspace";
import { z } from "zod";
import type { ToolDefinition } from "@ego-graph/tools";

/**
 * The "edit" tool lets the model propose a workspace patch from inside the
 * agent loop, mirroring Codex's apply_patch tool. It does NOT apply writes:
 * it returns a preview (diff + files + conflicts) that the loop layer turns
 * into a patch.proposed event, pausing for human approval before anything
 * lands on disk.
 *
 * The tool accepts the same operation union as the patch engine, so the model
 * can express create_file / replace_file / replace_text / insert_after /
 * insert_before / delete_text / rename_file / move_file / delete_file in a
 * single call.
 */

const editOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_file"), path: z.string().min(1), content: z.string() }),
  z.object({ type: z.literal("replace_file"), path: z.string().min(1), content: z.string() }),
  z.object({
    type: z.literal("replace_text"),
    path: z.string().min(1),
    oldText: z.string().min(1),
    newText: z.string(),
  }),
  z.object({
    type: z.literal("insert_after"),
    path: z.string().min(1),
    anchorText: z.string().min(1),
    content: z.string(),
  }),
  z.object({
    type: z.literal("insert_before"),
    path: z.string().min(1),
    anchorText: z.string().min(1),
    content: z.string(),
  }),
  z.object({ type: z.literal("delete_text"), path: z.string().min(1), text: z.string().min(1) }),
  z.object({ type: z.literal("rename_file"), path: z.string().min(1), newPath: z.string().min(1) }),
  z.object({ type: z.literal("move_file"), path: z.string().min(1), newPath: z.string().min(1) }),
  z.object({ type: z.literal("delete_file"), path: z.string().min(1) }),
]);

const editInputSchema = z.object({
  goal: z.string().min(1).describe("Short description of what this patch achieves."),
  operations: z.array(editOperationSchema).min(1),
});

const editOutputSchema = z.object({
  status: z.enum(["proposed", "blocked"]),
  previewId: z.string(),
  goal: z.string(),
  files: z.array(z.string()),
  diff: z.string(),
  conflicts: z.array(
    z.object({
      path: z.string(),
      operation: z.string(),
      reason: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

export type EditToolInput = z.infer<typeof editInputSchema>;
export type EditToolOutput = z.infer<typeof editOutputSchema>;

export function createEditTool(): ToolDefinition<typeof editInputSchema, typeof editOutputSchema> {
  return {
    name: "workspace.edit",
    description:
      "Propose a workspace patch (create/replace/insert/delete/rename file operations). " +
      "Returns a diff preview pending human approval; does NOT write to disk. " +
      "Use this when the task requires file changes.",
    inputSchema: editInputSchema,
    outputSchema: editOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    // The tool only PROPOSES a patch (no disk writes), so it is safe to call
    // at read-only permission. Human approval is enforced at the apply step,
    // after the model has produced its diff preview.
    requiresApproval: false,
    timeoutMs: 15_000,
    async execute(input, context) {
      try {
        const preview = await proposePatch(context.workspaceRoot, {
          goal: input.goal,
          operations: input.operations,
        });
        const blocked = preview.conflicts.length > 0;
        return {
          status: blocked ? "blocked" : "proposed",
          previewId: preview.id,
          goal: preview.goal,
          files: preview.files,
          diff: preview.diff,
          conflicts: preview.conflicts,
          findings: blocked
            ? preview.conflicts.map(
                (conflict) => `${conflict.path}: ${conflict.reason}`,
              )
            : [`Patch preview ready for ${preview.files.length} file(s); awaiting approval.`],
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          status: "blocked",
          previewId: `edit-error-${Date.now()}`,
          goal: input.goal,
          files: [],
          diff: "",
          conflicts: [{ path: "*", operation: "edit", reason }],
          findings: [`Patch proposal blocked: ${reason}`],
        };
      }
    },
    evidenceMapper(output) {
      return output.findings.map((summary) => ({
        summary,
        kind: "artifact",
        confidence: output.status === "proposed" ? 0.9 : 0.5,
        raw: { previewId: output.previewId, files: output.files },
      }));
    },
  };
}
