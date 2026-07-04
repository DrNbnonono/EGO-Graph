import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compressText, createWorkspaceContextPack, rankRepoFiles } from "../src/index.js";

describe("workspace context pack", () => {
  it("builds a ranked repo map and minimal compressed context", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-context-pack-"));
    await mkdir(join(root, "packages", "agent"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "quick start\n", "utf8");
    await writeFile(
      join(root, "packages", "agent", "index.ts"),
      "export const agent = true;\n",
      "utf8",
    );

    const pack = await createWorkspaceContextPack({
      workspaceRoot: root,
      query: "agent README quick start",
      maxFiles: 2,
      maxCharsPerFile: 20,
    });

    expect(pack.repoMap[0]?.path).toBe("README.md");
    expect(pack.selectedFiles).toHaveLength(2);
    expect(pack.selectedFiles[0]?.content.length).toBeLessThanOrEqual(80);
  });

  it("ranks source files by query tokens", () => {
    const ranked = rankRepoFiles(["packages/agent/index.ts", "docs/README.md"], "agent");

    expect(ranked[0]?.path).toBe("packages/agent/index.ts");
  });

  it("compresses long files with head and tail", () => {
    const compressed = compressText("a".repeat(200) + "TAIL", 80);

    expect(compressed).toContain("compressed");
    expect(compressed).toContain("TAIL");
  });
});
