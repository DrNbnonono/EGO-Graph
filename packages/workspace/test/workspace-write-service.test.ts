import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspaceWriteService } from "../src/index.js";

describe("workspace write service", () => {
  it("previews and applies approved edits without writing before approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-workspace-write-"));
    await writeFile(join(root, "note.txt"), "hello\n", "utf8");
    const writer = createWorkspaceWriteService(root);

    const preview = await writer.proposeWorkspaceEdit({
      goal: "update note",
      operations: [{ type: "replace_text", path: "note.txt", oldText: "hello", newText: "lotus" }],
    });

    expect(preview.diff).toContain("-hello");
    expect(preview.diff).toContain("+lotus");
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("hello\n");
    await expect(writer.applyWorkspaceEdit(preview, { approved: false })).rejects.toThrow(
      "approval",
    );

    await writer.applyWorkspaceEdit(preview, { approved: true, approvalId: "approval-test" });
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("lotus\n");
  });

  it("rejects denied paths and path escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-workspace-deny-"));
    const writer = createWorkspaceWriteService(root);

    await expect(
      writer.proposeWorkspaceEdit({
        goal: "secret",
        operations: [{ type: "create_file", path: ".env", content: "TOKEN=bad" }],
      }),
    ).rejects.toThrow("denied");

    await expect(
      writer.proposeWorkspaceEdit({
        goal: "escape",
        operations: [{ type: "create_file", path: "../escape.txt", content: "bad" }],
      }),
    ).rejects.toThrow("outside workspace");
  });
});
