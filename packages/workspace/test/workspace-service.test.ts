import { describe, expect, it } from "vitest";
import { createWorkspaceService } from "../src/index.js";

describe("workspace service", () => {
  it("summarizes the current monorepo without exposing ignored build folders", async () => {
    const workspace = createWorkspaceService(process.cwd());
    const summary = await workspace.summarizeProject();
    const files = await workspace.listFiles({ limit: 120 });

    expect(summary.hasReadme).toBe(true);
    expect(summary.packageManager).toContain("pnpm");
    expect(summary.apps).toContain("ego-api");
    expect(summary.apps).toContain("ego-cli");
    expect(summary.apps).toContain("ego-web");
    expect(files).toContain("package.json");
    expect(files).toContain("README.md");
    expect(files.some((file) => file.includes("node_modules"))).toBe(false);
    expect(files.some((file) => file.includes("/dist/"))).toBe(false);
  });

  it("reads text files inside the workspace and rejects path escapes", async () => {
    const workspace = createWorkspaceService(process.cwd());
    const readme = await workspace.readTextFile("README.md");

    expect(readme).toContain("EGO-Graph");
    await expect(workspace.readTextFile("../package.json")).rejects.toThrow("workspace");
  });

  it("suggests safe project commands for agent task planning", () => {
    const workspace = createWorkspaceService(process.cwd());

    expect(workspace.suggestCommands("请测试当前项目")).toContain("pnpm test");
    expect(workspace.suggestCommands("检查构建")[0]).toBe("pnpm typecheck");
  });
});
