import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("ego cli help", () => {
  it("prints the public command surface", async () => {
    const result = await execa(process.execPath, ["apps/ego-cli/dist/index.js", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("EGO-Graph");
    expect(result.stdout).toContain("run");
    expect(result.stdout).toContain("replay");
    expect(result.stdout).toContain("eval");
    expect(result.stdout).toContain("config");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("serve");
  });
});
