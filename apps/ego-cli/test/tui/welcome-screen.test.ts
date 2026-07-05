import { describe, expect, it } from "vitest";
import { createWelcomeModel } from "../../src/tui/welcome-screen.js";

describe("welcome screen model", () => {
  it("contains the purple lotus identity and startup tips", () => {
    const model = createWelcomeModel({
      modelLabel: "MiniMax-M3",
      permissionLevel: "read-only",
      cwd: "~/EGO-Graph",
    });

    expect(model.logo.join("\n")).toContain("紫莲花");
    expect(model.left.join("\n")).toContain("EGO-Graph");
    expect(model.left.join("\n")).toContain("MiniMax-M3");
    expect(model.right.join("\n")).toContain("Tips");
  });
});
