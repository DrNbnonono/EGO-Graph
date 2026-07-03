import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateWorkspaceEditPlan, runCodingAgentTurn } from "../src/index.js";

const fakeProvider = (content: string) => ({
  name: "fake",
  model: "fake-model",
  async complete(): Promise<string> {
    return content;
  },
});

describe("model-backed workspace edit planning", () => {
  it("generates a structured edit plan from a natural-language request", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-plan-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    const result = await generateWorkspaceEditPlan({
      message: "把 README 里的 hello 改成 lotus",
      workspaceRoot: root,
      provider: fakeProvider(
        JSON.stringify({
          rationale: "The README contains the target text and can be updated safely.",
          editPlan: {
            goal: "update readme greeting",
            operations: [
              {
                type: "replace_text",
                path: "README.md",
                oldText: "hello",
                newText: "lotus",
              },
            ],
          },
        }),
      ),
    });

    expect(result).toMatchObject({
      status: "proposed",
      rationale: "The README contains the target text and can be updated safely.",
      editPlan: {
        goal: "update readme greeting",
      },
    });
    expect(result.status === "proposed" ? result.inspectedFiles : []).toContain("README.md");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");
  });

  it("returns needs_model when no provider is available for auto proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-no-model-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    const result = await generateWorkspaceEditPlan({
      message: "修改 README",
      workspaceRoot: root,
    });

    expect(result).toMatchObject({
      status: "needs_model",
    });
  });

  it("auto-proposes a diff but does not write before approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-auto-propose-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    const turn = await runCodingAgentTurn({
      message: "把 README 里的 hello 改成 lotus",
      workspaceRoot: root,
      mode: "propose_edits",
      autoPropose: true,
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update readme",
            operations: [
              {
                type: "replace_text",
                path: "README.md",
                oldText: "hello",
                newText: "lotus",
              },
            ],
          },
        }),
      ),
    });

    expect(turn.status).toBe("pending_approval");
    expect(turn.approvalRequired).toBe(true);
    expect(turn.diff).toContain("+lotus");
    expect(turn.editPreview?.files).toEqual(["README.md"]);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");
  });

  it("blocks generated edit plans that violate workspace policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-agent-policy-block-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    const turn = await runCodingAgentTurn({
      message: "写入环境变量",
      workspaceRoot: root,
      mode: "propose_edits",
      autoPropose: true,
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "The user asked for an env file.",
          editPlan: {
            goal: "create env",
            operations: [{ type: "create_file", path: ".env", content: "TOKEN=bad" }],
          },
        }),
      ),
    });

    expect(turn.status).toBe("blocked");
    expect(turn.approvalRequired).toBe(false);
    expect(turn.editPreview).toBeUndefined();
    expect(turn.trajectoryEvents.map((event) => event.type)).toContain("agent.edit.blocked");
  });
});
