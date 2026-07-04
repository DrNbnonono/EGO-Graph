import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAgentSystemPrompt, saveProjectSystemPrompt } from "../src/index.js";

describe("agent system prompt", () => {
  it("loads default, project prompt, memory hints, skills, and MCP summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-system-prompt-"));
    await mkdir(join(root, ".ego"), { recursive: true });
    await writeFile(
      join(root, ".ego", "system-prompt.md"),
      "项目规则：使用中文解释安全决策。",
      "utf8",
    );

    const prompt = await loadAgentSystemPrompt({
      workspaceRoot: root,
      memoryHints: ["[project] MiniMax M3 是默认模型"],
      skills: ["workspace", "web-search"],
      mcpTools: ["mcp.fixture.lookup"],
    });

    expect(prompt.defaultPrompt).toContain("EGO-Graph");
    expect(prompt.projectPrompt).toContain("项目规则");
    expect(prompt.finalPrompt).toContain("MiniMax M3");
    expect(prompt.finalPrompt).toContain("workspace, web-search");
    expect(prompt.finalPrompt).toContain("mcp.fixture.lookup");
  });

  it("saves project system prompt text under .ego/system-prompt.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-system-prompt-save-"));

    const saved = await saveProjectSystemPrompt({
      workspaceRoot: root,
      content: "参赛演示时优先展示可审计过程。",
    });
    const loaded = await loadAgentSystemPrompt({ workspaceRoot: root });

    expect(saved.path.replaceAll("\\", "/")).toContain(".ego/system-prompt.md");
    expect(loaded.projectPrompt).toContain("参赛演示");
  });
});
