import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("ego default TUI", () => {
  it("prints the non-interactive TUI summary when CI is true", async () => {
    const result = await execa("node", ["apps/ego-cli/dist/index.js"], {
      env: { CI: "true" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("EGO-Graph Purple Lotus Agent Workbench");
    expect(result.stdout).toContain("Project: TypeScript monorepo");
    expect(result.stdout).toContain("Interactive TUI");
    expect(result.stdout).toContain("Terminal chat");
    expect(result.stdout).toContain("Permissions: default read-only");
    expect(result.stdout).toContain("Terminal approvals");
    expect(result.stdout).toContain("Web Workbench");
    expect(result.stdout).toContain("Agent Kernel");
    expect(result.stdout).toContain("SQLite");
    expect(result.stdout).toContain("ego serve");
    expect(result.stdout).toContain("ego run --scenario web_pentest");
  });

  it("starts the source TUI entry without a React runtime crash", async () => {
    const result = await execa("pnpm", ["exec", "tsx", "apps/ego-cli/src/index.ts"], {
      reject: false,
      timeout: 5000,
      env: { FORCE_COLOR: "0" },
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode === 0 || result.timedOut).toBe(true);
    expect(output).not.toContain("React is not defined");
    if (output.trim().length > 0) {
      expect(output).toContain("PURPLE LOTUS");
      expect(output).toContain("/history  /model  /permissions  /mcp  /memory  /help");
    }
  });
});
