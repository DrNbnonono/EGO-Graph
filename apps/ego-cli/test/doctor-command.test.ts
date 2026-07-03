import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego doctor", () => {
  it("prints readiness checks", async () => {
    const result = await execa("node", ["apps/ego-cli/dist/index.js", "doctor"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Node.js");
    expect(result.stdout).toContain("EGO_HOME");
    expect(result.stdout).toContain("Trajectory storage");
  });
});
