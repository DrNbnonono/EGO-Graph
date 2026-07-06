import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPatchPreview, proposePatch } from "../src/index.js";

describe("patch engine", () => {
  it("previews insert operations, snapshots before apply, and returns rollback proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-patch-engine-"));
    await writeFile(join(root, "README.md"), "# Demo\n\nStart\n", "utf8");

    const preview = await proposePatch(root, {
      goal: "add quick start",
      operations: [
        {
          type: "insert_after",
          path: "README.md",
          anchorText: "# Demo\n",
          content: "\nQuick Start\n",
        },
      ],
    });

    expect(preview.conflicts).toHaveLength(0);
    expect(preview.diff).toContain("+Quick Start");
    expect(await readFile(join(root, "README.md"), "utf8")).not.toContain("Quick Start");

    const result = await applyPatchPreview(root, preview, { approved: true });
    expect(await readFile(join(root, "README.md"), "utf8")).toContain("Quick Start");
    expect(result.snapshot.files[0]?.content).toContain("# Demo");
    expect(result.rollback.operations[0]?.type).toBe("replace_file");
  });

  it("reports conflicts for denied deletion and ambiguous exact matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-patch-conflict-"));
    await writeFile(join(root, "note.txt"), "same\nsame\n", "utf8");

    const preview = await proposePatch(root, {
      goal: "bad patch",
      operations: [
        { type: "delete_file", path: "note.txt" },
        { type: "delete_text", path: "note.txt", text: "same" },
      ],
    });

    expect(preview.conflicts.map((conflict) => conflict.operation)).toEqual(
      expect.arrayContaining(["delete_file", "delete_text"]),
    );
    await expect(applyPatchPreview(root, preview, { approved: true })).rejects.toThrow();
  });

  it("rolls back to the pre-patch snapshot when an operation fails mid-apply", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-patch-rollback-"));
    await writeFile(join(root, "a.txt"), "AAA\n", "utf8");
    await writeFile(join(root, "b.txt"), "BBB\n", "utf8");

    // Both ops preview cleanly against the original content. Between preview
    // and apply we delete b.txt, so the second replace_text fails at apply
    // time (file not found) — the first op has already written a.txt, so
    // rollback must restore it.
    const preview = await proposePatch(root, {
      goal: "partial patch",
      operations: [
        { type: "replace_text", path: "a.txt", oldText: "AAA", newText: "AAA-edited" },
        { type: "replace_text", path: "b.txt", oldText: "BBB", newText: "BBB-edited" },
      ],
    });
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "b.txt"), { force: true });

    const result = await applyPatchPreview(root, preview, { approved: true });
    expect(result.applied).toBe(false);
    expect(result.rolledBack?.reason).toBeTruthy();
    // a.txt must be restored to its original content despite the first op having run.
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("AAA\n");
  });

  it("flags cross-operation conflicts: same path edited by two non-text ops", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-patch-cross-"));
    await writeFile(join(root, "shared.txt"), "body\n", "utf8");

    const preview = await proposePatch(root, {
      goal: "conflicting patch",
      operations: [
        { type: "replace_file", path: "shared.txt", content: "one\n" },
        { type: "replace_file", path: "shared.txt", content: "two\n" },
      ],
    });

    expect(
      preview.conflicts.some((conflict) =>
        conflict.reason.includes("Multiple whole-file operations target the same path"),
      ),
    ).toBe(true);
  });

  it("allows multiple replace_text edits against the same file", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-patch-multi-text-"));
    await writeFile(join(root, "doc.md"), "alpha\nbeta\n", "utf8");

    const preview = await proposePatch(root, {
      goal: "two distinct edits",
      operations: [
        { type: "replace_text", path: "doc.md", oldText: "alpha", newText: "ALPHA" },
        { type: "replace_text", path: "doc.md", oldText: "beta", newText: "BETA" },
      ],
    });

    expect(
      preview.conflicts.some((conflict) =>
        conflict.reason.includes("Multiple operations"),
      ),
    ).toBe(false);
    const result = await applyPatchPreview(root, preview, { approved: true });
    expect(result.applied).toBe(true);
    expect(await readFile(join(root, "doc.md"), "utf8")).toBe("ALPHA\nBETA\n");
  });

  it("allows localized edits followed by a rename on the same file", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-patch-edit-then-rename-"));
    await writeFile(join(root, "note.txt"), "alpha\nbeta\ngamma\n", "utf8");

    const preview = await proposePatch(root, {
      goal: "edit then rename",
      operations: [
        { type: "insert_after", path: "note.txt", anchorText: "alpha\n", content: "inserted\n" },
        { type: "delete_text", path: "note.txt", text: "gamma\n" },
        { type: "rename_file", path: "note.txt", newPath: "renamed.txt" },
      ],
    });

    expect(preview.conflicts).toHaveLength(0);
    const result = await applyPatchPreview(root, preview, { approved: true });
    expect(result.applied).toBe(true);
    expect(await readFile(join(root, "renamed.txt"), "utf8")).toBe("alpha\ninserted\nbeta\n");
  });
});
