import { describe, expect, it } from "vitest";
import { renderDashboardHtml, renderDashboardJs } from "../src/index.js";

describe("dashboard agent kernel hooks", () => {
  it("contains strategy, evidence, memory, skills, MCP, and search UI hooks", () => {
    const html = renderDashboardHtml();
    const js = renderDashboardJs();

    expect(html).toContain('id="inspector-strategy"');
    expect(html).toContain('id="inspector-evidence"');
    expect(html).toContain('id="inspector-approvals"');
    expect(html).toContain('id="inspector-scope"');
    expect(html).toContain('id="inspector-tools"');
    expect(html).toContain('id="inspector-risk"');
    expect(html).toContain('id="inspector-memory"');
    expect(html).toContain('id="skills-manager"');
    expect(html).toContain('id="mcp-manager"');
    expect(html).toContain('id="report-list"');
    expect(js).toContain("/agent/harness/runs/stream");
    expect(js).toContain("renderInspector");
    expect(js).toContain("renderSettingsManagers");
    expect(js).toContain("submitMission");
  });
});
