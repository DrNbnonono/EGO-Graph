import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WorkspaceEditOperation =
  | {
      type: "create_file";
      path: string;
      content: string;
    }
  | {
      type: "replace_file";
      path: string;
      content: string;
    }
  | {
      type: "replace_text";
      path: string;
      oldText: string;
      newText: string;
    }
  | {
      type: "insert_after";
      path: string;
      anchorText: string;
      content: string;
    }
  | {
      type: "insert_before";
      path: string;
      anchorText: string;
      content: string;
    }
  | {
      type: "delete_text";
      path: string;
      text: string;
    }
  | {
      type: "rename_file";
      path: string;
      newPath: string;
    }
  | {
      type: "move_file";
      path: string;
      newPath: string;
    }
  | {
      type: "delete_file";
      path: string;
    };

export type WorkspaceEditPlan = {
  goal: string;
  operations: WorkspaceEditOperation[];
};

export type WorkspaceWritePolicy = {
  maxFileBytes: number;
  deniedPathNames: string[];
  allowDelete: boolean;
};

export type WorkspaceEditPreview = {
  id: string;
  goal: string;
  operations: WorkspaceEditOperation[];
  files: string[];
  diff: string;
  approvalRequired: true;
};

export type WorkspaceEditApproval = {
  approved: boolean;
  approvalId?: string;
};

export type WorkspaceEditResult = {
  previewId: string;
  applied: boolean;
  files: string[];
  approvalId?: string;
};

export type WorkspaceWriteService = {
  proposeWorkspaceEdit(plan: WorkspaceEditPlan): Promise<WorkspaceEditPreview>;
  applyWorkspaceEdit(
    preview: WorkspaceEditPreview,
    approval: WorkspaceEditApproval,
  ): Promise<WorkspaceEditResult>;
  getWorkspaceDiff(files?: string[]): Promise<string>;
};

export class WorkspaceEditPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceEditPolicyError";
  }
}

export const defaultWorkspaceWritePolicy: WorkspaceWritePolicy = {
  maxFileBytes: 256_000,
  deniedPathNames: [".env", ".git", "node_modules", "dist", ".ego"],
  allowDelete: false,
};

export function createWorkspaceWriteService(
  workspaceRoot: string,
  policy: WorkspaceWritePolicy = defaultWorkspaceWritePolicy,
): WorkspaceWriteService {
  const root = resolve(workspaceRoot);

  return {
    async proposeWorkspaceEdit(plan) {
      if (plan.operations.length === 0) {
        throw new WorkspaceEditPolicyError("Edit plan must contain at least one operation");
      }

      const diffs: string[] = [];
      const files: string[] = [];

      for (const operation of plan.operations) {
        const target = resolveEditPath(root, operation.path, policy);
        files.push(toWorkspacePath(root, target));
        if ("newPath" in operation) {
          files.push(toWorkspacePath(root, resolveEditPath(root, operation.newPath, policy)));
        }
        const current = await readCurrentContent(target);
        const next = await previewNextContent(operation, current, target, policy);
        diffs.push(renderOperationDiff(root, target, operation, current, next));
      }

      return {
        id: `edit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        goal: plan.goal,
        operations: plan.operations,
        files: [...new Set(files)],
        diff: diffs.join("\n"),
        approvalRequired: true,
      };
    },

    async applyWorkspaceEdit(preview, approval) {
      if (!approval.approved) {
        throw new WorkspaceEditPolicyError("Workspace edit requires explicit approval");
      }

      for (const operation of preview.operations) {
        const target = resolveEditPath(root, operation.path, policy);
        if (operation.type === "delete_file") {
          if (!policy.allowDelete) {
            throw new WorkspaceEditPolicyError("delete_file is disabled by workspace policy");
          }
          await rm(target, { force: true });
          continue;
        }
        if (operation.type === "rename_file" || operation.type === "move_file") {
          const nextPath = resolveEditPath(root, operation.newPath, policy);
          await assertExistingFileSize(target, policy);
          await mkdir(dirname(nextPath), { recursive: true });
          await rename(target, nextPath);
          continue;
        }
        const current = await readCurrentContent(target);
        const next = await previewNextContent(operation, current, target, policy);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, next, "utf8");
      }

      return {
        previewId: preview.id,
        applied: true,
        files: preview.files,
        ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
      };
    },

    async getWorkspaceDiff(files) {
      const args = ["diff", "--"];
      if (files?.length) {
        args.push(...files);
      }

      try {
        const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 2_000_000 });
        return stdout;
      } catch (error) {
        const maybe = error as { stdout?: string; code?: number };
        if (typeof maybe.stdout === "string") {
          return maybe.stdout;
        }
        return "";
      }
    },
  };
}

function resolveEditPath(root: string, relativePath: string, policy: WorkspaceWritePolicy): string {
  if (relativePath.includes("\0")) {
    throw new WorkspaceEditPolicyError("Path contains a NUL byte");
  }
  if (isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new WorkspaceEditPolicyError(`Absolute paths are not allowed: ${relativePath}`);
  }

  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new WorkspaceEditPolicyError(`Refusing to edit outside workspace: ${relativePath}`);
  }

  const parts = toWorkspacePath(root, target).split("/");
  for (const part of parts) {
    if (policy.deniedPathNames.includes(part) || part.startsWith(".env")) {
      throw new WorkspaceEditPolicyError(`Path is denied by workspace policy: ${relativePath}`);
    }
  }

  return target;
}

async function previewNextContent(
  operation: WorkspaceEditOperation,
  current: string | undefined,
  target: string,
  policy: WorkspaceWritePolicy,
): Promise<string> {
  switch (operation.type) {
    case "create_file": {
      if (current !== undefined) {
        throw new WorkspaceEditPolicyError(`Cannot create existing file: ${operation.path}`);
      }
      assertContentSize(operation.content, policy);
      return operation.content;
    }
    case "replace_file": {
      if (current === undefined) {
        throw new WorkspaceEditPolicyError(`Cannot replace missing file: ${operation.path}`);
      }
      assertContentSize(operation.content, policy);
      await assertExistingFileSize(target, policy);
      return operation.content;
    }
    case "replace_text": {
      return replaceExact(current, target, operation.path, operation.oldText, operation.newText, policy);
    }
    case "insert_after": {
      return insertExact(
        current,
        target,
        operation.path,
        operation.anchorText,
        operation.content,
        "after",
        policy,
      );
    }
    case "insert_before": {
      return insertExact(
        current,
        target,
        operation.path,
        operation.anchorText,
        operation.content,
        "before",
        policy,
      );
    }
    case "delete_text": {
      return replaceExact(current, target, operation.path, operation.text, "", policy);
    }
    case "rename_file":
    case "move_file": {
      if (current === undefined) {
        throw new WorkspaceEditPolicyError(`Cannot move missing file: ${operation.path}`);
      }
      await assertExistingFileSize(target, policy);
      return current;
    }
    case "delete_file": {
      if (!policy.allowDelete) {
        throw new WorkspaceEditPolicyError("delete_file is disabled by workspace policy");
      }
      if (current === undefined) {
        throw new WorkspaceEditPolicyError(`Cannot delete missing file: ${operation.path}`);
      }
      await assertExistingFileSize(target, policy);
      return "";
    }
  }
}

async function replaceExact(
  current: string | undefined,
  target: string,
  path: string,
  oldText: string,
  newText: string,
  policy: WorkspaceWritePolicy,
): Promise<string> {
  if (current === undefined) {
    throw new WorkspaceEditPolicyError(`Cannot replace text in missing file: ${path}`);
  }
  if (!oldText) {
    throw new WorkspaceEditPolicyError("exact text operation requires non-empty text");
  }
  const count = countOccurrences(current, oldText);
  if (count !== 1) {
    throw new WorkspaceEditPolicyError(
      `exact text operation expected exactly one match in ${path}, found ${count}`,
    );
  }
  const next = current.replace(oldText, newText);
  assertContentSize(next, policy);
  await assertExistingFileSize(target, policy);
  return next;
}

async function insertExact(
  current: string | undefined,
  target: string,
  path: string,
  anchorText: string,
  content: string,
  position: "before" | "after",
  policy: WorkspaceWritePolicy,
): Promise<string> {
  if (current === undefined) {
    throw new WorkspaceEditPolicyError(`Cannot insert text in missing file: ${path}`);
  }
  if (!anchorText) {
    throw new WorkspaceEditPolicyError("insert operation requires non-empty anchorText");
  }
  const count = countOccurrences(current, anchorText);
  if (count !== 1) {
    throw new WorkspaceEditPolicyError(
      `insert operation expected exactly one anchor in ${path}, found ${count}`,
    );
  }
  const replacement = position === "before" ? `${content}${anchorText}` : `${anchorText}${content}`;
  const next = current.replace(anchorText, replacement);
  assertContentSize(next, policy);
  await assertExistingFileSize(target, policy);
  return next;
}

async function readCurrentContent(path: string): Promise<string | undefined> {
  try {
    await access(path, constants.F_OK);
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function assertExistingFileSize(path: string, policy: WorkspaceWritePolicy): Promise<void> {
  const info = await stat(path);
  if (!info.isFile()) {
    throw new WorkspaceEditPolicyError(`Refusing to edit non-file path: ${path}`);
  }
  if (info.size > policy.maxFileBytes) {
    throw new WorkspaceEditPolicyError(`Refusing to edit file larger than ${policy.maxFileBytes}`);
  }
}

function assertContentSize(content: string, policy: WorkspaceWritePolicy): void {
  if (Buffer.byteLength(content, "utf8") > policy.maxFileBytes) {
    throw new WorkspaceEditPolicyError(`New file content exceeds ${policy.maxFileBytes} bytes`);
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

function renderOperationDiff(
  root: string,
  target: string,
  operation: WorkspaceEditOperation,
  current: string | undefined,
  next: string,
): string {
  if (operation.type === "rename_file" || operation.type === "move_file") {
    return `rename from ${operation.path}\nrename to ${operation.newPath}\n`;
  }
  return renderUnifiedDiff(toWorkspacePath(root, target), current ?? "", next);
}

function countOccurrences(input: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = input.indexOf(needle, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + needle.length;
  }
}

function toWorkspacePath(root: string, absolute: string): string {
  return relative(root, absolute).replaceAll("\\", "/");
}
