import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { assertNoEditConflicts, type EditConflict } from "./edit-conflict.js";
import {
  createPatchSnapshot,
  createRollbackProposal,
  type PatchSnapshot,
  type RollbackProposal,
} from "./patch-rollback.js";
import {
  defaultWorkspaceWritePolicy,
  WorkspaceEditPolicyError,
  type WorkspaceWritePolicy,
} from "./workspace-write-service.js";

export type PatchOperation =
  | { type: "create_file"; path: string; content: string }
  | { type: "replace_file"; path: string; content: string }
  | { type: "replace_text"; path: string; oldText: string; newText: string }
  | { type: "insert_after"; path: string; anchorText: string; content: string }
  | { type: "insert_before"; path: string; anchorText: string; content: string }
  | { type: "delete_text"; path: string; text: string }
  | { type: "rename_file"; path: string; newPath: string }
  | { type: "move_file"; path: string; newPath: string }
  | { type: "delete_file"; path: string }
  | { type: "chmod"; path: string; mode: string };

export type PatchPlan = {
  goal: string;
  operations: PatchOperation[];
};

export type PatchPreview = {
  id: string;
  goal: string;
  files: string[];
  operations: PatchOperation[];
  diff: string;
  conflicts: EditConflict[];
  approvalRequired: true;
};

export type PatchApplyResult = {
  previewId: string;
  applied: boolean;
  files: string[];
  snapshot: PatchSnapshot;
  rollback: RollbackProposal;
};

export async function proposePatch(
  workspaceRoot: string,
  plan: PatchPlan,
  policy: WorkspaceWritePolicy = defaultWorkspaceWritePolicy,
): Promise<PatchPreview> {
  if (plan.operations.length === 0) {
    throw new WorkspaceEditPolicyError("Patch plan must contain at least one operation");
  }
  const root = resolve(workspaceRoot);
  const diffs: string[] = [];
  const files: string[] = [];
  const conflicts: EditConflict[] = [];

  for (const operation of plan.operations) {
    if (operation.type === "chmod") {
      conflicts.push({
        path: operation.path,
        operation: operation.type,
        reason: "chmod is disabled",
      });
      continue;
    }
    if (operation.type === "delete_file" && !policy.allowDelete) {
      conflicts.push({
        path: operation.path,
        operation: operation.type,
        reason: "delete_file is disabled by policy",
      });
      continue;
    }
    const path = resolvePatchPath(root, operation.path, policy);
    files.push(toWorkspacePath(root, path));
    if ("newPath" in operation) {
      files.push(toWorkspacePath(root, resolvePatchPath(root, operation.newPath, policy)));
    }
    const current = await readCurrentContent(path);
    try {
      const next = await previewPatchContent(operation, current, path, policy);
      if (operation.type === "rename_file" || operation.type === "move_file") {
        diffs.push(`rename from ${operation.path}\nrename to ${operation.newPath}\n`);
      } else {
        diffs.push(renderUnifiedDiff(toWorkspacePath(root, path), current ?? "", next ?? ""));
      }
    } catch (error) {
      conflicts.push({
        path: operation.path,
        operation: operation.type,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    id: `patch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    goal: plan.goal,
    files: [...new Set(files)],
    operations: plan.operations,
    diff: diffs.join("\n"),
    conflicts,
    approvalRequired: true,
  };
}

export async function applyPatchPreview(
  workspaceRoot: string,
  preview: PatchPreview,
  approval: { approved: boolean },
  policy: WorkspaceWritePolicy = defaultWorkspaceWritePolicy,
): Promise<PatchApplyResult> {
  if (!approval.approved) {
    throw new WorkspaceEditPolicyError("Patch requires explicit approval");
  }
  assertNoEditConflicts(preview.conflicts);
  const root = resolve(workspaceRoot);
  const snapshot = await createPatchSnapshot(root, preview.files);
  for (const operation of preview.operations) {
    await applyPatchOperation(root, operation, policy);
  }
  return {
    previewId: preview.id,
    applied: true,
    files: preview.files,
    snapshot,
    rollback: createRollbackProposal(snapshot),
  };
}

async function applyPatchOperation(
  root: string,
  operation: PatchOperation,
  policy: WorkspaceWritePolicy,
): Promise<void> {
  if (operation.type === "chmod") {
    throw new WorkspaceEditPolicyError("chmod is disabled");
  }
  const target = resolvePatchPath(root, operation.path, policy);
  if (operation.type === "delete_file") {
    if (!policy.allowDelete) {
      throw new WorkspaceEditPolicyError("delete_file is disabled by policy");
    }
    await rm(target, { force: true });
    return;
  }
  if (operation.type === "rename_file" || operation.type === "move_file") {
    const nextPath = resolvePatchPath(root, operation.newPath, policy);
    await mkdir(dirname(nextPath), { recursive: true });
    await rename(target, nextPath);
    return;
  }
  const current = await readCurrentContent(target);
  const next = await previewPatchContent(operation, current, target, policy);
  if (next === undefined) {
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, next, "utf8");
}

async function previewPatchContent(
  operation: PatchOperation,
  current: string | undefined,
  target: string,
  policy: WorkspaceWritePolicy,
): Promise<string | undefined> {
  switch (operation.type) {
    case "create_file":
      if (current !== undefined)
        throw new WorkspaceEditPolicyError(`Cannot create existing file: ${operation.path}`);
      assertContentSize(operation.content, policy);
      return operation.content;
    case "replace_file":
      if (current === undefined)
        throw new WorkspaceEditPolicyError(`Cannot replace missing file: ${operation.path}`);
      await assertExistingFileSize(target, policy);
      assertContentSize(operation.content, policy);
      return operation.content;
    case "replace_text":
      return replaceExact(current, operation.path, operation.oldText, operation.newText, policy);
    case "insert_after":
      return insertExact(
        current,
        operation.path,
        operation.anchorText,
        operation.content,
        "after",
        policy,
      );
    case "insert_before":
      return insertExact(
        current,
        operation.path,
        operation.anchorText,
        operation.content,
        "before",
        policy,
      );
    case "delete_text":
      return replaceExact(current, operation.path, operation.text, "", policy);
    case "rename_file":
    case "move_file":
      if (current === undefined)
        throw new WorkspaceEditPolicyError(`Cannot move missing file: ${operation.path}`);
      return current;
    case "delete_file":
      return "";
    case "chmod":
      throw new WorkspaceEditPolicyError("chmod is disabled");
  }
}

function replaceExact(
  current: string | undefined,
  path: string,
  oldText: string,
  newText: string,
  policy: WorkspaceWritePolicy,
): string {
  if (current === undefined)
    throw new WorkspaceEditPolicyError(`Cannot edit missing file: ${path}`);
  if (!oldText) throw new WorkspaceEditPolicyError("Exact text operation requires non-empty text");
  const count = current.split(oldText).length - 1;
  if (count !== 1)
    throw new WorkspaceEditPolicyError(`Expected exactly one match in ${path}, found ${count}`);
  const next = current.replace(oldText, newText);
  assertContentSize(next, policy);
  return next;
}

function insertExact(
  current: string | undefined,
  path: string,
  anchor: string,
  content: string,
  position: "before" | "after",
  policy: WorkspaceWritePolicy,
): string {
  if (current === undefined)
    throw new WorkspaceEditPolicyError(`Cannot edit missing file: ${path}`);
  if (!anchor) throw new WorkspaceEditPolicyError("Insert operation requires non-empty anchorText");
  const count = current.split(anchor).length - 1;
  if (count !== 1)
    throw new WorkspaceEditPolicyError(`Expected exactly one anchor in ${path}, found ${count}`);
  const replacement = position === "before" ? `${content}${anchor}` : `${anchor}${content}`;
  const next = current.replace(anchor, replacement);
  assertContentSize(next, policy);
  return next;
}

function resolvePatchPath(
  root: string,
  relativePath: string,
  policy: WorkspaceWritePolicy,
): string {
  if (relativePath.includes("\0") || isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new WorkspaceEditPolicyError(`Invalid patch path: ${relativePath}`);
  }
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new WorkspaceEditPolicyError(`Refusing to edit outside workspace: ${relativePath}`);
  }
  for (const part of toWorkspacePath(root, target).split("/")) {
    if (policy.deniedPathNames.includes(part) || part.startsWith(".env")) {
      throw new WorkspaceEditPolicyError(`Path is denied by workspace policy: ${relativePath}`);
    }
  }
  return target;
}

async function readCurrentContent(path: string): Promise<string | undefined> {
  try {
    await access(path, constants.F_OK);
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertExistingFileSize(path: string, policy: WorkspaceWritePolicy): Promise<void> {
  const info = await stat(path);
  if (!info.isFile()) throw new WorkspaceEditPolicyError(`Refusing to edit non-file path: ${path}`);
  if (info.size > policy.maxFileBytes)
    throw new WorkspaceEditPolicyError(`Refusing to edit file larger than ${policy.maxFileBytes}`);
}

function assertContentSize(content: string, policy: WorkspaceWritePolicy): void {
  if (Buffer.byteLength(content, "utf8") > policy.maxFileBytes) {
    throw new WorkspaceEditPolicyError(`New content exceeds ${policy.maxFileBytes} bytes`);
  }
}

function renderUnifiedDiff(path: string, before: string, after: string): string {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@",
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function toWorkspacePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}
