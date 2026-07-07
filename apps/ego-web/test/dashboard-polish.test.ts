import { describe, expect, it } from "vitest";
import { renderDashboardCss, renderDashboardHtml, renderDashboardJs } from "../src/index.js";

describe("dashboard product polish", () => {
  it("removes decorative mac window dots and exposes real collapsible panels", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(html).not.toContain("window-dots");
    expect(html).toContain('data-panel-toggle="sessions"');
    expect(html).toContain('data-panel-toggle="tools"');
    expect(html).toContain('aria-expanded="true"');
    expect(css).toContain(".rail-gutter");
    expect(css).toContain(".panel-body[hidden]");
  });

  it("keeps runs out of the local session list and loads shared sessions from API", () => {
    const js = renderDashboardJs();

    expect(js).toContain("/api/sessions");
    expect(js).toContain("/api/projects");
    expect(js).not.toContain("serverRuns");
    expect(js).not.toContain("localStorage.getItem(\"ego.workbench.sessions\")");
  });

  it("renders full markdown syntax safely", () => {
    const js = renderDashboardJs();
    const css = renderDashboardCss();

    expect(js).toContain("marked");
    expect(js).toContain("renderMarkdown");
    expect(js).toContain("sanitizeRenderedMarkdown");
    expect(css).toContain(".markdown-body table");
    expect(css).toContain(".markdown-body blockquote");
    expect(css).toContain(".markdown-body hr");
  });

  it("moves command shortcuts into the composer instead of a distant footer", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(html).not.toContain("<footer class=\"quickbar\"");
    expect(html).toContain('class="command-strip"');
    expect(css).toContain(".command-strip");
  });

  it("keeps the desktop workbench content compact with polished action buttons", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(css).toContain(".workbench-fit");
    expect(css).toContain("max-height: calc(100vh - 24px)");
    expect(css).toContain(".send-action");
    expect(css).toContain(".settings-open-button");
    expect(html).toContain('class="send-action"');
    expect(html).toContain('class="settings-open-button"');
  });
});
