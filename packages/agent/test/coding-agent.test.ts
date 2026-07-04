import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAssistantChatTurn, runCodingAgentTurn } from "../src/index.js";

const fakeProvider = (content: string) => ({
  name: "fake-provider",
  model: "fake-model",
  async complete(): Promise<string> {
    return content;
  },
});

describe("coding agent foundation", () => {
  it("turns a natural-language request into visible plan, observations, commands, and MCP state", async () => {
    const turn = await runCodingAgentTurn({
      message: "阅读项目状态并说明下一步应该做什么",
      workspaceRoot: process.cwd(),
    });

    expect(turn.mode).toBe("coding-agent");
    expect(turn.assistantMessage).toContain("coding agent");
    expect(turn.plan.length).toBeGreaterThan(0);
    expect(
      turn.observations.some((item) => item.includes("README.md") || item.includes("ego-web")),
    ).toBe(true);
    expect(turn.suggestedCommands).toContain("pnpm test");
    expect(turn.mcp.status).toBe("not_configured");
  });

  it("applies an approved edit plan and records check events", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-write-"));
    await writeFile(
      join(root, "package.json"),
      '{"name":"fixture","packageManager":"pnpm@11.7.0"}',
      "utf8",
    );
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    const turn = await runCodingAgentTurn({
      message: "修改 README",
      workspaceRoot: root,
      mode: "apply_approved_edits",
      approvalId: "approval-agent-test",
      editPlan: {
        goal: "update readme",
        operations: [
          { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
        ],
      },
      checkCommands: [{ name: "node-version", command: "node", args: ["--version"] }],
    });

    expect(turn.editResult?.applied).toBe(true);
    expect(turn.checks[0]?.status).toBe("passed");
    expect(turn.trajectoryEvents.map((event) => event.type)).toContain("agent.edit.applied");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });

  it("answers read-only chat through the model provider when configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-chat-"));
    await writeFile(join(root, "package.json"), '{"name":"chat-fixture"}', "utf8");

    const turn = await runAssistantChatTurn({
      message: "你好",
      workspaceRoot: root,
      modelProvider: fakeProvider("你好，我是模型返回的真实回复。"),
    });

    expect(turn.mode).toBe("assistant-chat");
    expect(turn.status).toBe("answered");
    expect(turn.reply).toContain("模型返回");
    expect(turn.model.configured).toBe(true);
  });

  it("returns needs_model for read-only chat without a model provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-chat-needs-model-"));
    await writeFile(join(root, "package.json"), '{"name":"chat-fixture"}', "utf8");

    const turn = await runAssistantChatTurn({
      message: "你好",
      workspaceRoot: root,
      modelProvider: null,
    });

    expect(turn.status).toBe("needs_model");
    expect(turn.reply).toContain("模型尚未启用");
  });
});
