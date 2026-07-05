export const patchApprovalFlow = [
  "plan",
  "plan_approval",
  "workspace_edit_plan",
  "workspace_policy",
  "diff_preview",
  "patch_approval",
  "apply",
  "checks",
  "repair_proposal",
  "patch_approval",
  "checks",
] as const;

export function requiresPatchApproval(step: string): boolean {
  return step === "patch_approval" || step === "repair_proposal";
}
