import { describe, expect, it } from "vitest";
import {
  createFixtureAttackSurfaceTool,
  createFixtureReadTool,
  ToolRegistry,
} from "../src/index.js";

describe("ToolRegistry", () => {
  it("registers and retrieves a fixture tool", () => {
    const registry = new ToolRegistry();
    const tool = createFixtureReadTool();

    registry.register(tool);
    registry.register(createFixtureAttackSurfaceTool());

    expect(registry.get("fixture.read").name).toBe("fixture.read");
    expect(registry.list().map((entry) => entry.name)).toEqual([
      "fixture.attack_surface",
      "fixture.read",
    ]);
  });
});
