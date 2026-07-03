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
    });

    expect(markdown).toContain("# EGO-Graph Report");
    expect(markdown).toContain("Fixture contains an exposed admin hint");
    expect(markdown).toContain("run-test-001");
  });
});
