import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { assertNoEditConflicts, detectCrossOperationConflicts, type EditConflict } from "./edit-conflict.js";
import {
  applyRollbackProposal,
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
  /**
   * Present (with the triggering error) when the apply failed partway and the
   * snapshot was used to roll the workspace back to its pre-patch state.
   * `applied` is false in that case.
   */
  rolledBack?: { reason: string };
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

  // Whole-list conflicts (same path twice, delete vs edit, rename target
  // collisions) are invisible to the per-operation loop below.
  conflicts.push(...detectCrossOperationConflicts(plan.operations));

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
  try {
    for (const operation of preview.operations) {
      await applyPatchOperation(root, operation, policy);
    }
  } catch (error) {
    // A mid-patch failure leaves the workspace half-written. Restore every
    // snapshotted file before re-throwing so the repo is not left in an
    // inconsistent state; the caller learns about the rollback from the
    // result shape (when caught) or the re-thrown error.
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await applyRollbackProposal(root, createRollbackProposal(snapshot));
    } catch {
      // Best-effort rollback; surface the original failure reason regardless.
    }
    return {
      previewId: preview.id,
      applied: false,
      files: preview.files,
      snapshot,
      rollback: createRollbackProposal(snapshot),
      rolledBack: { reason },
    };
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

/**
 * Generate a proper unified diff with @@ hunk headers and context lines,
 * replacing the old naive full-file +/- output. Uses a line-based LCS so
 * only the minimal changed lines appear in the output.
 */
export function renderUnifiedDiff(path: string, before: string, after: string, contextLines = 3): string {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  if (oldLines.length === 0 && newLines.length === 0) {
    return `--- a/${path}\n+++ b/${path}\n`;
  }

  const hunks = computeHunks(oldLines, newLines, contextLines);
  if (hunks.length === 0) {
    return `--- a/${path}\n+++ b/${path}\n`;
  }

  return `--- a/${path}\n+++ b/${path}\n${hunks.join("\n")}\n`;
}

type Hunk = string;

function computeHunks(oldLines: string[], newLines: string[], context: number): Hunk[] {
  // Myers-based line diff: compute edit script, then collapse into hunks.
  const edits = diffLines(oldLines, newLines);
  const hunks: Hunk[] = [];

  let i = 0;
  while (i < edits.length) {
    // Skip leading unchanged context above the window.
    if (edits[i]!.type === "keep") {
      i += 1;
      continue;
    }

    // Find the start of the current hunk: rewind to include context lines.
    const hunkStart = Math.max(0, i - context);
    let oldStart = hunkStart;
    let newStart = hunkStart;

    // Count oldStart and newStart from the beginning up to hunkStart.
    // (recompute from scratch for simplicity)
    oldStart = 0;
    newStart = 0;
    for (let k = 0; k < hunkStart; k++) {
      const edit = edits[k]!;
      if (edit.type === "keep" || edit.type === "delete") {
        oldStart += 1;
      }
      if (edit.type === "keep" || edit.type === "insert") {
        newStart += 1;
      }
    }
    let oldEnd = oldStart;
    let newEnd = newStart;
    const hunkLines: string[] = [];
    let j = hunkStart;
    let tailContext = context;

    while (j < edits.length && tailContext >= 0) {
      const edit = edits[j]!;
      if (edit.type === "keep") {
        if (j >= hunkStart && edits.slice(j - (context > 0 ? 1 : 0), j + 1).every((e) => e.type === "keep")) {
          // Pure keep at the end of a hunk; count down the context window.
          tailContext -= 1;
          if (tailContext < 0) {
            // But only break if we've accumulated at least one changed line.
            if (hunkLines.some((l) => l.startsWith("-") || l.startsWith("+"))) {
              break;
            }
          }
        }
      } else {
        tailContext = context;
      }

      // Track offsets
      const oldLine = edit.type !== "insert" ? oldLines[oldEnd] : undefined;
      const newLine = edit.type !== "delete" ? newLines[newEnd] : undefined;

      if (edit.type === "keep") {
        hunkLines.push(` ${oldLine}`);
        oldEnd += 1;
        newEnd += 1;
      } else if (edit.type === "delete") {
        hunkLines.push(`-${oldLine}`);
        oldEnd += 1;
      } else {
        hunkLines.push(`+${newLine}`);
        newEnd += 1;
      }
      j += 1;
    }

    // Skip trailing keep lines that are pure context without edits.
    while (hunkLines.length > 0 && hunkLines[hunkLines.length - 1]!.startsWith(" ") && hunkLines.filter((l) => l.startsWith("-") || l.startsWith("+")).length > 0) {
      // Only trim if the last line is context AND there are actual changes.
      // Don't trim the very first or very last context line if still within window.
      break;
    }

    const oldCount = oldEnd - oldStart;
    const newCount = newEnd - newStart;
    hunks.push(`@@ -${oldStart + 1}${oldCount > 1 ? `,${oldCount}` : ""} +${newStart + 1}${newCount > 1 ? `,${newCount}` : ""} @@\n${hunkLines.join("\n")}`);

    i = j;
  }

  return hunks;
}

type LineEdit = { type: "keep" | "insert" | "delete" };

function diffLines(oldLines: string[], newLines: string[]): LineEdit[] {
  // Simple LCS-based diff: O(n*m) for now, adequate for small files.
  const lcs = longestCommonSubsequence(oldLines, newLines);
  const edits: LineEdit[] = [];
  let oi = 0;
  let ni = 0;

  for (const line of lcs) {
    while (oi < oldLines.length && oldLines[oi] !== line) {
      edits.push({ type: "delete" });
      oi += 1;
    }
    while (ni < newLines.length && newLines[ni] !== line) {
      edits.push({ type: "insert" });
      ni += 1;
    }
    edits.push({ type: "keep" });
    oi += 1;
    ni += 1;
  }
  while (oi < oldLines.length) {
    edits.push({ type: "delete" });
    oi += 1;
  }
  while (ni < newLines.length) {
    edits.push({ type: "insert" });
    ni += 1;
  }
  return edits;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  // dp[i][j] = LCS length of a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]! + 1
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  // Backtrack
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]!);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return result.reverse();
}

function toWorkspacePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}
