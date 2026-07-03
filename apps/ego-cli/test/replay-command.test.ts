import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego replay", () => {
  it("prints recorded trajectory events", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-replay-"));
    try {
      await execa(
        "node",
        [
          "apps/ego-cli/dist/index.js",
          "run",
          "--scenario",
          "web_pentest",
          "--input",
          "scenarios/web_pentest/basic/task.json",
          "--run-id",
          "run-replay-001",
        ],
        {env: {EGO_HOME: egoHome}},
      );

      const result = await execa(
        "node",
        ["apps/ego-cli/dist/index.js", "replay", "--trajectory-id", "run-replay-001"],
        {env: {EGO_HOME: egoHome}},
      );

      expect(result.stdout).toContain("task.parsed");
      expect(result.stdout).toContain("run.completed");
    } finally {
      await rm(egoHome, {recursive: true, force: true});
    }
  });
});
