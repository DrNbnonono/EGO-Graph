import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("ego eval", () => {
  it("runs the web pentest dataset", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-eval-"));
    try {
      const result = await execa(process.execPath,
        ["apps/ego-cli/dist/index.js", "eval", "--dataset", "datasets/evals/web_pentest.jsonl"],
        { env: { EGO_HOME: egoHome } },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("web-pentest-smoke-001");
      expect(result.stdout).toContain("PASS");
    } finally {
      await rm(egoHome, { recursive: true, force: true });
    }
  });
});
