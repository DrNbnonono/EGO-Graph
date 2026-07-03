import type {z, ZodTypeAny} from "zod";

export type ToolScopeKind = "fixture" | "network" | "file";

export type ToolPermission = {
  scope: ToolScopeKind;
  risk: "low" | "medium" | "high";
  requiresSandbox: boolean;
};

export type ToolExecutionContext = {
  workspaceRoot: string;
};

export type ToolDefinition<InputSchema extends ZodTypeAny, OutputSchema extends ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  permission: ToolPermission;
  execute: (
    input: z.output<InputSchema>,
    context: ToolExecutionContext,
  ) => Promise<z.output<OutputSchema>>;
};
