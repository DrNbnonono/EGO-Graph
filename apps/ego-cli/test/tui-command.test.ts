import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("ego default TUI", () => {
  it("prints the non-interactive TUI summary when CI is true", async () => {
    const result = await execa("node", ["apps/ego-cli/dist/index.js"], {
      env: { CI: "true" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("EGO-Graph");
    expect(result.stdout).toContain("紫莲花");
    expect(result.stdout).toContain("项目进展");
    expect(result.stdout).toContain("交互对话");
    expect(result.stdout).toContain("Terminal chat");
    expect(result.stdout).toContain("权限等级");
    expect(result.stdout).toContain("终端审批");
    expect(result.stdout).toContain("Web Workbench");
    expect(result.stdout).toContain("Agent Kernel");
    expect(result.stdout).toContain("SQLite");
    expect(result.stdout).toContain("ego serve");
    expect(result.stdout).toContain("ego run --scenario web_pentest");
  });
});
