export type PanelKind = "threads" | "chat" | "inspector" | "manage";

export type InspectorTab =
  | "context"
  | "strategy"
  | "evidence"
  | "approvals"
  | "scope"
  | "tools"
  | "risk"
  | "memory"
  | "mcp"
  | "report"
  | "settings";

export type CommandAction = {
  name: string;
  category: string;
  requiresApproval: boolean;
  description?: string;
};

export type RunUiState = {
  status: "idle" | "running" | "plan_pending" | "patch_pending" | "applied" | "failed";
  label: string;
  runId?: string;
};

export type ApprovalUiState = {
  kind: "plan" | "patch" | "tool" | "none";
  status: "idle" | "pending" | "approved" | "rejected" | "failed";
};

export type WorkbenchViewModel = {
  activePanel: PanelKind;
  activeInspectorTab: InspectorTab;
  activeCommand?: CommandAction;
  run: RunUiState;
  approval: ApprovalUiState;
};
