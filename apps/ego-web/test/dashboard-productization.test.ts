import { describe, expect, it } from "vitest";
import { renderDashboardCss, renderDashboardHtml, renderDashboardJs } from "../src/index.js";

describe("dashboard productization UI", () => {
  it("renders a Codex-like agent cockpit instead of a logo-first hero page", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(html).toContain("EGO-Graph Agent Workbench");
    expect(html).toContain('id="conversation"');
    expect(html).toContain('id="event-timeline"');
    expect(html).toContain('id="slash-menu"');
    expect(html).toContain('data-settings-tab="models"');
    expect(html).toContain('data-settings-tab="skills"');
    expect(html).toContain('data-settings-tab="mcp"');
    expect(html).toContain('id="new-session-dialog"');
    expect(html).not.toContain("可视化驾驶舱");
    expect(html).not.toContain("hero-lockup");
    expect(css).toContain(".brand-logo");
    expect(css).toContain(".timeline-strip");
    expect(css).toContain(".slash-menu");
  });

  it("wires slash commands, model profiles, prompt, and management pages in client script", () => {
    const js = renderDashboardJs();

    expect(js).toContain("/api/workbench");
    expect(js).toContain("/api/projects");
    expect(js).toContain("/api/projects/open");
    expect(js).toContain("/api/sessions");
    expect(js).toContain("/api/mcp/servers");
    expect(js).toContain("openSlashMenu");
    expect(js).toContain("renderSettingsManagers");
    expect(js).toContain("renderInspector");
  });
});
