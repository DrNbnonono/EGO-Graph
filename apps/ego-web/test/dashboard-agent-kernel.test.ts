import { describe, expect, it } from "vitest";
import { renderDashboardHtml, renderDashboardJs } from "../src/index.js";

describe("dashboard agent kernel hooks", () => {
  it("contains plan, memory, skills, MCP, and search UI hooks", () => {
    const html = renderDashboardHtml();
    const js = renderDashboardJs();

    expect(html).toContain('id="plan-preview"');
    expect(html).toContain('id="approve-plan-button"');
    expect(html).toContain('id="memory-list"');
    expect(html).toContain('id="skill-list"');
    expect(html).toContain('id="search-status"');
    expect(js).toContain("/agent/plans");
    expect(js).toContain("/api/hermes/timeline");
    expect(js).toContain("renderPlanPreview");
    expect(js).toContain("renderMemory");
    expect(js).toContain("approveActivePlan");
  });
});
