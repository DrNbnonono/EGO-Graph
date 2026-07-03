import {describe, expect, it} from "vitest";
import {checkToolPermission, createFixtureReadTool} from "../src/index.js";

describe("permission policy", () => {
  it("allows fixture tools for fixture scope", () => {
    const decision = checkToolPermission(createFixtureReadTool(), {
      kind: "fixture",
      values: ["fixture://web-pentest/basic"],
    });

    expect(decision.allowed).toBe(true);
  });

  it("blocks fixture tools for network scope", () => {
    const decision = checkToolPermission(createFixtureReadTool(), {
      kind: "network",
      values: ["https://example.com"],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("fixture");
  });
});
