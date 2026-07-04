import { constants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
    };

export type WorkspaceEditPlan = {
  goal: string;
  operations: WorkspaceEditOperation[];
};

export type WorkspaceWritePolicy = {
  maxFileBytes: number;
  deniedPathNames: string[];
  allowDelete: false;
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
        const current = await readCurrentContent(target);
        const next = await previewNextContent(operation, current, target, policy);
        diffs.push(renderUnifiedDiff(toWorkspacePath(root, target), current ?? "", next));
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
      if (current === undefined) {
        throw new WorkspaceEditPolicyError(
          `Cannot replace text in missing file: ${operation.path}`,
        );
      }
      if (!operation.oldText) {
        throw new WorkspaceEditPolicyError("replace_text requires non-empty oldText");
      }
      const count = countOccurrences(current, operation.oldText);
      if (count !== 1) {
        throw new WorkspaceEditPolicyError(
          `replace_text expected exactly one match in ${operation.path}, found ${count}`,
        );
      }
      const next = current.replace(operation.oldText, operation.newText);
      assertContentSize(next, policy);
      await assertExistingFileSize(target, policy);
      return next;
    }
  }
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
