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
});
