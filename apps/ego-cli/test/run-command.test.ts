import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego run", () => {
  it("runs the controlled web pentest fixture", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-cli-run-"));
    try {
      const result = await execa(
        "node",
        [
          "apps/ego-cli/dist/index.js",
          "run",
          "--scenario",
          "web_pentest",
          "--input",
          "scenarios/web_pentest/basic/task.json",
          "--run-id",
          "run-cli-001",
        ],
        {env: {EGO_HOME: egoHome}},
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("run-cli-001");
      expect(result.stdout).toContain("complete");
      expect(result.stdout).toContain("Decision Trace");
      expect(result.stdout).toContain("fixture.attack_surface");
      expect(result.stdout).toContain("Fixture contains an exposed admin hint");
    } finally {
      await rm(egoHome, {recursive: true, force: true});
    }
  });
});
