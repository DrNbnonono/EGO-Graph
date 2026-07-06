import { describe, expect, it } from "vitest";
import {
  evaluatePermissionRules,
  permissionRulesForLevel,
  type PermissionRule,
} from "../src/permission-rules.js";

describe("permission rules", () => {
  it("uses the last matching allow/ask/deny rule for action and resource", () => {
    const rules: PermissionRule[] = [
      { action: "shell.write", resource: "*", effect: "deny" },
      { action: "shell.*", resource: "pnpm *", effect: "ask" },
      { action: "shell.write", resource: "pnpm test", effect: "allow" },
    ];

    expect(
      evaluatePermissionRules({
        action: "shell.write",
        resources: ["pnpm test"],
        rules,
      }).effect,
    ).toBe("allow");

    expect(
      evaluatePermissionRules({
        action: "shell.write",
        resources: ["rm -rf dist"],
        rules,
      }).effect,
    ).toBe("deny");
  });

  it("turns permission levels into conservative rule presets", () => {
    const readOnly = permissionRulesForLevel("read-only");
    const securityActive = permissionRulesForLevel("security-active");

    expect(
      evaluatePermissionRules({
        action: "workspace.read",
        resources: ["README.md"],
        rules: readOnly,
      }).effect,
    ).toBe("allow");
    expect(
      evaluatePermissionRules({
        action: "shell.write",
        resources: ["pnpm test"],
        rules: readOnly,
      }).effect,
    ).toBe("deny");
    expect(
      evaluatePermissionRules({
        action: "security.fingerprint",
        resources: ["http://127.0.0.1:3000"],
        rules: securityActive,
      }).effect,
    ).toBe("ask");
  });
});
