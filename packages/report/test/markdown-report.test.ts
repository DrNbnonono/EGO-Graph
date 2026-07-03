import {describe, expect, it} from "vitest";
import {renderMarkdownReport} from "../src/markdown-report.js";

describe("renderMarkdownReport", () => {
  it("renders a trajectory-backed report", () => {
    const markdown = renderMarkdownReport({
      runId: "run-test-001",
      scenario: "web_pentest",
      goal: "Assess fixture",
      status: "complete",
      evidence: [{summary: "Fixture contains an exposed admin hint", source: "fixture.read"}],
      decisions: [
        {
          step: 1,
          type: "use_tool",
          toolName: "fixture.read",
          rationale: "Read the controlled fixture before extracting evidence.",
        },
      ],
      observations: [
        {
          toolName: "fixture.read",
          findings: ["Fixture contains an exposed admin hint"],
        },
      ],
    });

    expect(markdown).toContain("# EGO-Graph Report");
    expect(markdown).toContain("Fixture contains an exposed admin hint");
    expect(markdown).toContain("## Decision Trace");
    expect(markdown).toContain("use_tool using fixture.read");
    expect(markdown).toContain("## Reproduction");
    expect(markdown).toContain("run-test-001");
  });
});
