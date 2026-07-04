import { describe, expect, it } from "vitest";
import { renderDashboardCss, renderDashboardHtml, renderDashboardJs } from "../src/index.js";

describe("dashboard productization UI", () => {
  it("renders a Codex-like agent cockpit instead of a logo-first hero page", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(html).toContain("EGO-Graph Agent Workbench");
    expect(html).toContain('id="agent-thread"');
    expect(html).toContain('id="execution-timeline"');
    expect(html).toContain('id="slash-palette"');
    expect(html).toContain('data-page="models"');
    expect(html).toContain('data-page="skills"');
    expect(html).toContain('data-page="mcp"');
    expect(html).toContain('data-page="prompt"');
    expect(html).not.toContain("可视化驾驶舱");
    expect(html).not.toContain("hero-lockup");
    expect(css).toContain(".brand-logo");
    expect(css).toContain(".agent-thread");
    expect(css).toContain(".slash-palette");
  });

  it("wires slash commands, model profiles, prompt, and management pages in client script", () => {
    const js = renderDashboardJs();

    expect(js).toContain("/api/commands");
    expect(js).toContain("/api/commands/execute");
    expect(js).toContain("/api/config/models");
    expect(js).toContain("/api/config/system-prompt");
    expect(js).toContain("/api/mcp/servers");
    expect(js).toContain("openSlashPalette");
    expect(js).toContain("renderManagementPage");
    expect(js).toContain("renderExecutionTimeline");
  });
});
