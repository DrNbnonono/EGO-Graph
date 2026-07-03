import type { z, ZodTypeAny } from "zod";

export type ToolScopeKind = "fixture" | "network" | "file";
export type ToolRiskLevel = "low" | "medium" | "high";
export type SandboxProfile = "none" | "process" | "docker";

export type ToolPermission = {
  scope: ToolScopeKind;
  risk: ToolRiskLevel;
  requiresSandbox: boolean;
};

export type ToolExecutionContext = {
  workspaceRoot: string;
};

export type ToolEvidenceCandidate = {
  summary: string;
  kind?: "fact" | "hypothesis" | "artifact" | "human_hint" | "decision_trace";
  confidence?: number;
  raw?: Record<string, unknown>;
};

export type ToolDefinition<InputSchema extends ZodTypeAny, OutputSchema extends ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  permission: ToolPermission;
  scenarios?: string[];
  riskLevel?: ToolRiskLevel;
  sandboxProfile?: SandboxProfile;
  timeoutMs?: number;
  requiresApproval?: boolean;
  evidenceMapper?(output: z.output<OutputSchema>): ToolEvidenceCandidate[];
  execute(
    input: z.output<InputSchema>,
    context: ToolExecutionContext,
  ): Promise<z.output<OutputSchema>>;
};
