import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRepoIndex, createContextForTask } from "../src/index.js";

describe("context engine", () => {
  it("selects relevant files and filters secret-like files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-context-engine-"));
    await mkdir(join(root, "packages/agent-harness/src"), { recursive: true });
    await mkdir(join(root, "packages/agent-harness/test"), { recursive: true });
    await writeFile(
      join(root, "packages/agent-harness/src/session.ts"),
      "export function createTerminalAgentSession() { return 'session'; }\n",
      "utf8",
    );
    await writeFile(
      join(root, "packages/agent-harness/test/session.test.ts"),
      "import { createTerminalAgentSession } from '../src/session';\n",
      "utf8",
    );
    await writeFile(join(root, ".env"), "API_KEY=super-secret-token-value", "utf8");

    const index = await buildRepoIndex(root, { cache: false });
    expect(index.files.map((file) => file.path)).not.toContain(".env");

    const context = await createContextForTask({
      workspaceRoot: root,
      goal: "improve terminal agent harness session",
      intent: "project_analysis",
      tokenBudget: 1200,
    });

    expect(context.selectedFiles.map((file) => file.path)).toContain(
      "packages/agent-harness/src/session.ts",
    );
    expect(
      context.selectedSymbols.some((symbol) => symbol.name === "createTerminalAgentSession"),
    ).toBe(true);
    expect(context.relevantTests).toContain("packages/agent-harness/test/session.test.ts");
    expect(context.budget.estimatedTokens).toBeLessThanOrEqual(1200);
  });
});
