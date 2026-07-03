import {describe, expect, it} from "vitest";
import {createFixtureReadTool, ToolRegistry} from "../src/index.js";

describe("ToolRegistry", () => {
  it("registers and retrieves a fixture tool", () => {
    const registry = new ToolRegistry();
    const tool = createFixtureReadTool();

    registry.register(tool);

    expect(registry.get("fixture.read").name).toBe("fixture.read");
    expect(registry.list().map((entry) => entry.name)).toEqual(["fixture.read"]);
  });
});
