import {describe, expect, it} from "vitest";
import {checkPolicyGate, checkToolPermission, createFixtureReadTool} from "../src/index.js";

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

  it("blocks tools that require human approval until approved", () => {
    const tool = {...createFixtureReadTool(), requiresApproval: true};
    const blocked = checkPolicyGate(tool, {
      allowedScope: {kind: "fixture", values: ["fixture://web-pentest/basic"]},
      scenario: "web_pentest",
    });
    const allowed = checkPolicyGate(tool, {
      allowedScope: {kind: "fixture", values: ["fixture://web-pentest/basic"]},
      scenario: "web_pentest",
      approvedTools: [tool.name],
    });

    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });
});
