import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  registerCapabilityDetector,
  unregisterCapabilityDetector,
  detectCapability,
  clearCapabilityCache,
  resolveCapabilityExecution,
  createBinaryCapabilityDetector,
  createBuiltinOnlyCapability,
  summarizeCapabilityStatus,
  type CapabilityDetector,
} from "../src/security/capability-registry.js";
import { registerBuiltinSecurityDetectors } from "../src/security/index.js";

describe("security capability matrix", () => {
  beforeEach(() => {
    clearCapabilityCache();
  });

  afterEach(() => {
    clearCapabilityCache();
  });

  it("createBinaryCapabilityDetector falls back to builtin when binary is missing", async () => {
    const detector = createBinaryCapabilityDetector({
      name: "test-missing-tool",
      label: "Test Missing Tool",
      binary: "this-binary-does-not-exist-12345",
      versionArgs: ["--version"],
      builtinFallback: true,
    });
    registerCapabilityDetector(detector);

    const cap = await detectCapability("test-missing-tool");
    expect(cap?.source).toBe("builtin");
    expect(cap?.available).toBe(true);

    unregisterCapabilityDetector("test-missing-tool");
  });

  it("createBinaryCapabilityDetector returns unavailable when no builtin fallback", async () => {
    const detector = createBinaryCapabilityDetector({
      name: "test-no-fallback",
      label: "Test No Fallback",
      binary: "this-binary-does-not-exist-67890",
      versionArgs: ["--version"],
      builtinFallback: false,
    });
    registerCapabilityDetector(detector);

    const cap = await detectCapability("test-no-fallback");
    expect(cap?.source).toBe("unavailable");
    expect(cap?.available).toBe(false);

    unregisterCapabilityDetector("test-no-fallback");
  });

  it("createBuiltinOnlyCapability always returns builtin source", async () => {
    const detector = createBuiltinOnlyCapability({
      name: "test-builtin-only",
      label: "Test Builtin Only",
    });
    registerCapabilityDetector(detector);

    const cap = await detectCapability("test-builtin-only");
    expect(cap?.source).toBe("builtin");
    expect(cap?.available).toBe(true);

    unregisterCapabilityDetector("test-builtin-only");
  });

  it("resolveCapabilityExecution returns the correct source for tool adapters", async () => {
    const detector = createBinaryCapabilityDetector({
      name: "test-resolve",
      label: "Test Resolve",
      binary: "this-binary-does-not-exist-abcde",
      builtinFallback: true,
    });
    registerCapabilityDetector(detector);

    const { source, capability } = await resolveCapabilityExecution("test-resolve");
    expect(source).toBe("builtin");
    expect(capability?.source).toBe("builtin");

    unregisterCapabilityDetector("test-resolve");
  });

  it("resolveCapabilityExecution returns unavailable for unknown capability", async () => {
    const { source, capability } = await resolveCapabilityExecution("nonexistent-capability");
    expect(source).toBe("unavailable");
    expect(capability).toBeUndefined();
  });

  it("detection is cached after first probe", async () => {
    let probeCount = 0;
    const detector: CapabilityDetector = {
      name: "test-cache",
      label: "Test Cache",
      async detect() {
        probeCount += 1;
        return {
          name: "test-cache",
          label: "Test Cache",
          available: true,
          source: "builtin",
          detectedAt: new Date().toISOString(),
        };
      },
    };
    registerCapabilityDetector(detector);

    await detectCapability("test-cache");
    await detectCapability("test-cache");
    expect(probeCount).toBe(1);

    clearCapabilityCache();
    await detectCapability("test-cache");
    expect(probeCount).toBe(2);

    unregisterCapabilityDetector("test-cache");
  });

  it("summarizeCapabilityStatus counts sources correctly", () => {
    const caps = [
      { name: "a", label: "A", available: true, source: "external" as const, detectedAt: "" },
      { name: "b", label: "B", available: true, source: "builtin" as const, detectedAt: "" },
      { name: "c", label: "C", available: false, source: "unavailable" as const, detectedAt: "" },
      { name: "d", label: "D", available: true, source: "builtin" as const, detectedAt: "" },
    ];
    const summary = summarizeCapabilityStatus(caps);
    expect(summary.total).toBe(4);
    expect(summary.available).toBe(3);
    expect(summary.external).toBe(1);
    expect(summary.builtin).toBe(2);
    expect(summary.unavailable).toBe(1);
  });

  it("nuclei detector is registered with builtin fallback", async () => {
    // The nuclei detector was added to registerBuiltinSecurityDetectors.
    // We verify it's registered and falls back to builtin (since nuclei
    // is not installed in CI).
    registerBuiltinSecurityDetectors();

    const cap = await detectCapability("nuclei");
    expect(cap).toBeDefined();
    expect(cap?.source === "external" || cap?.source === "builtin").toBe(true);
    // In CI without nuclei binary, should be builtin
    if (cap?.source === "builtin") {
      expect(cap.available).toBe(true);
    }
  });
});
