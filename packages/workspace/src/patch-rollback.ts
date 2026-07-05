import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type PatchSnapshotFile = {
  path: string;
  existed: boolean;
  content?: string;
};

export type PatchSnapshot = {
  id: string;
  createdAt: string;
  files: PatchSnapshotFile[];
};

export type RollbackProposal = {
  goal: string;
  operations: Array<
    | { type: "create_file"; path: string; content: string }
    | { type: "replace_file"; path: string; content: string }
    | { type: "delete_file"; path: string }
  >;
};

export async function createPatchSnapshot(
  workspaceRoot: string,
  files: string[],
): Promise<PatchSnapshot> {
  const unique = [...new Set(files)];
  const snapshots: PatchSnapshotFile[] = [];
  for (const path of unique) {
    const absolute = resolve(workspaceRoot, path);
    const content = await readFile(absolute, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    snapshots.push(
      content === undefined ? { path, existed: false } : { path, existed: true, content },
    );
  }
  return {
    id: `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    files: snapshots,
  };
}

export function createRollbackProposal(snapshot: PatchSnapshot): RollbackProposal {
  return {
    goal: `Rollback patch snapshot ${snapshot.id}`,
    operations: snapshot.files.map((file) =>
      file.existed
        ? { type: "replace_file", path: file.path, content: file.content ?? "" }
        : { type: "delete_file", path: file.path },
    ),
  };
}

export async function applyRollbackProposal(
  workspaceRoot: string,
  proposal: RollbackProposal,
): Promise<void> {
  for (const operation of proposal.operations) {
    const absolute = resolve(workspaceRoot, operation.path);
    if (operation.type === "delete_file") {
      await rm(absolute, { force: true });
      continue;
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, operation.content, "utf8");
  }
}
