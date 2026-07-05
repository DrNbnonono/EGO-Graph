import { createWorkspaceContextPack, type WorkspaceContextPack } from "@ego-graph/workspace";

export type HarnessContextPackInput = {
  workspaceRoot: string;
  message: string;
};

export async function buildHarnessContextPack(
  input: HarnessContextPackInput,
): Promise<WorkspaceContextPack> {
  return createWorkspaceContextPack({
    workspaceRoot: input.workspaceRoot,
    query: input.message,
  });
}
