import { describe, expect, it } from "vitest";
import * as tools from "@ego-graph/tools";
import { buildToolCapabilityReportEvent } from "../src/tool-capability-report.js";

describe("tool capability report", () => {
  it("builds a tool.capability.report event with a capability snapshot", async () => {
    const event = await buildToolCapabilityReportEvent({
      runId: "run-cap",
      sessionId: "session-cap",
      toolsModule: tools,
    });
    expect(event.type).toBe("tool.capability.report");
    expect(event.runId).toBe("run-cap");
    const capabilities = (event.payload as { capabilities: { name: string }[] }).capabilities;
    expect(Array.isArray(capabilities)).toBe(true);
    // The builtin detectors (tshark/file/binwalk/semgrep/strings/ghidra/cve-feed)
    // are registered on first security-tool use, so at least some should appear.
    expect(capabilities.length).toBeGreaterThan(0);
  });
});
