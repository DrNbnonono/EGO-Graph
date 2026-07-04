import { describe, expect, it } from "vitest";
import { createFixtureAttackSurfaceTool } from "../src/index.js";

describe("fixture tools", () => {
  it("extracts controlled web fixture attack surface", async () => {
    const tool = createFixtureAttackSurfaceTool();
    const output = await tool.execute(
      { fixture: "fixture://web-pentest/basic" },
      { workspaceRoot: process.cwd() },
    );

    expect(output.links).toContain("/admin");
    expect(output.findings[0]).toContain("administrative path");
  });
});
