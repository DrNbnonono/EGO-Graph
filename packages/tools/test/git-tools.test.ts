import { describe, expect, it } from "vitest";
import {
  createGitStatusTool,
  createGitDiffTool,
  createGitLogTool,
  createGitBranchTool,
  createGitCommitTool,
} from "../src/git-tools.js";

describe("git tool definitions", () => {
  it("creates git.status tool with correct metadata", () => {
    const tool = createGitStatusTool();
    expect(tool.name).toBe("git.status");
    expect(tool.permission.risk).toBe("low");
    expect(tool.riskLevel).toBe("low");
    expect(tool.sandboxProfile).toBe("none");
  });

  it("creates git.diff tool with correct metadata", () => {
    const tool = createGitDiffTool();
    expect(tool.name).toBe("git.diff");
    expect(tool.permission.risk).toBe("low");
    expect(tool.riskLevel).toBe("low");
  });

  it("creates git.log tool with correct metadata", () => {
    const tool = createGitLogTool();
    expect(tool.name).toBe("git.log");
    expect(tool.permission.risk).toBe("low");
    expect(tool.riskLevel).toBe("low");
  });

  it("creates git.branch tool with medium risk", () => {
    const tool = createGitBranchTool();
    expect(tool.name).toBe("git.branch");
    expect(tool.permission.risk).toBe("medium");
    expect(tool.riskLevel).toBe("medium");
  });

  it("creates git.commit tool requiring approval", () => {
    const tool = createGitCommitTool();
    expect(tool.name).toBe("git.commit");
    expect(tool.permission.risk).toBe("medium");
    expect(tool.requiresApproval).toBe(true);
  });

  it("git.status validates empty input", () => {
    const tool = createGitStatusTool();
    const result = tool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("git.diff validates staged option", () => {
    const tool = createGitDiffTool();
    const result = tool.inputSchema.safeParse({ staged: true });
    expect(result.success).toBe(true);
  });

  it("git.diff validates files option", () => {
    const tool = createGitDiffTool();
    const result = tool.inputSchema.safeParse({ files: ["src/index.ts"] });
    expect(result.success).toBe(true);
  });

  it("git.log validates limit option", () => {
    const tool = createGitLogTool();
    const result = tool.inputSchema.safeParse({ limit: 10 });
    expect(result.success).toBe(true);
  });

  it("git.branch validates action enum", () => {
    const tool = createGitBranchTool();
    expect(tool.inputSchema.safeParse({ action: "list" }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ action: "create", name: "feat" }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ action: "invalid" }).success).toBe(false);
  });

  it("git.commit requires non-empty message", () => {
    const tool = createGitCommitTool();
    expect(tool.inputSchema.safeParse({ message: "" }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ message: "fix: bug" }).success).toBe(true);
  });
});
