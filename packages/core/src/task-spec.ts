import { z } from "zod";

export const taskInputRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
  z.object({ kind: z.literal("file"), path: z.string().min(1), mediaType: z.string().min(1).optional() }),
  z.object({ kind: z.literal("archive"), path: z.string().min(1), mediaType: z.literal("application/zip").default("application/zip") }),
  z.object({ kind: z.literal("api_document"), path: z.string().min(1), mediaType: z.string().min(1).default("application/json") }),
]);

export type TaskInputRef = z.output<typeof taskInputRefSchema>;

export const taskSpecSchema = z.object({
  scenario: z.enum([
    "web_pentest",
    "incident_response",
    "vulnerability_research",
    "reverse_engineering",
  ]),
  goal: z.string().min(8),
  targets: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)).default([]),
  inputs: z.array(taskInputRefSchema).default([]),
});

export type TaskSpecInput = z.input<typeof taskSpecSchema>;
export type TaskSpec = z.output<typeof taskSpecSchema> & {
  id: string;
  allowedScope: { kind: "fixture" | "network" | "file"; values: string[] };
};

export function parseTaskSpec(input: TaskSpecInput): TaskSpec {
  const parsed = taskSpecSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`TaskSpec validation failed: ${parsed.error.message}`);
  }

  const firstTarget = parsed.data.targets[0] ?? "";
  const scopeKind = firstTarget.startsWith("fixture://")
    ? "fixture"
    : firstTarget.startsWith("file://")
      ? "file"
      : "network";

  return {
    ...parsed.data,
    id: `task-${Buffer.from(`${parsed.data.scenario}:${parsed.data.goal}`).toString("hex").slice(0, 12)}`,
    allowedScope: { kind: scopeKind, values: parsed.data.targets },
  };
}
