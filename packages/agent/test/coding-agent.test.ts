import { describe, expect, it } from "vitest";
import { runCodingAgentTurn } from "../src/index.js";

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
});
