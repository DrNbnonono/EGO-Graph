import { describe, expect, it } from "vitest";
import {
  assertSecurityScopeAllows,
  createSecurityScope,
  extractPrintableStrings,
  identifyHash,
  lowRiskSecurityTools,
  parseApiDoc,
} from "../src/index.js";

describe("security tools boundary", () => {
  it("requires a scope before security tools run", () => {
    const tool = lowRiskSecurityTools.find((item) => item.name === "local_fixture.fingerprint")!;
    expect(assertSecurityScopeAllows(undefined, tool)).toMatchObject({ allowed: false });

    const scope = createSecurityScope({
      targetType: "local_fixture",
      targets: ["http://127.0.0.1:3000"],
      allowedActions: ["fingerprint"],
    });
    expect(assertSecurityScopeAllows(scope, tool)).toEqual({ allowed: true });
  });

  it("exposes low-risk CTF/document helpers without network side effects", () => {
    expect(extractPrintableStrings("abc\0EGO-GRAPH\0xyz", 4)).toContain("EGO-GRAPH");
    expect(identifyHash("ego").sha256).toHaveLength(64);
    expect(parseApiDoc("GET /api/workbench\nPOST /agent/runs")).toEqual([
      { method: "GET", path: "/api/workbench" },
      { method: "POST", path: "/agent/runs" },
    ]);
  });
});
