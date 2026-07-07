import { describe, expect, it } from "vitest";
import { renderDashboardCss, renderDashboardHtml, renderDashboardJs } from "../src/index.js";

describe("dashboard product polish", () => {
  it("removes decorative mac window dots and exposes real collapsible panels", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(html).not.toContain("window-dots");
    expect(html).toContain('data-panel-toggle="sessions"');
    expect(html).not.toContain('data-collapsible-panel="tools"');
    expect(html).not.toContain('data-collapsible-panel="permissions"');
    expect(html).toContain('aria-expanded="true"');
    expect(css).toContain(".rail-resizer");
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
    const js = renderDashboardJs();

    expect(html).not.toContain("<footer class=\"quickbar\"");
    expect(html).not.toContain('class="command-strip"');
    expect(html).toContain('id="slash-trigger"');
    expect(html).toContain('id="attachment-button"');
    expect(html).toContain('id="slash-menu"');
    expect(css).toContain(".slash-menu");
    expect(js).toContain("openSlashMenu");
  });

  it("keeps the desktop workbench content compact with polished action buttons", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();

    expect(css).toContain(".workbench-fit");
    expect(css).toContain("max-height: calc(100vh - 24px)");
    expect(css).toContain(".send-action");
    expect(css).toContain(".settings-open-button");
    expect(html).toContain("send-action");
    expect(html).toContain("settings-open-button");
  });

  it("renders a polished settings page with a project directory picker", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();
    const js = renderDashboardJs();

    expect(html).toContain('id="project-path-input"');
    expect(html).toContain('id="open-project-button"');
    expect(html).toContain('class="settings-hero"');
    expect(html).toContain('class="settings-row-card"');
    expect(css).toContain(".settings-hero");
    expect(css).toContain(".settings-row-card");
    expect(css).toContain(".switch-control");
    expect(js).toContain("/api/projects/open");
  });

  it("lets each new conversation choose its own workspace directory", () => {
    const html = renderDashboardHtml();
    const js = renderDashboardJs();

    expect(html).toContain('id="new-session-dialog"');
    expect(html).toContain('id="new-session-path-input"');
    expect(html).toContain('id="confirm-new-session"');
    expect(html).toContain('data-new-session-close');
    expect(js).toContain("openNewSessionDialog");
    expect(js).toContain("createSessionFromDialog");
  });

  it("adds permission controls, message actions, and real connector forms", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();
    const js = renderDashboardJs();

    expect(html).toContain('id="permission-menu"');
    expect(html).toContain('data-permission-mode="ask"');
    expect(html).toContain('data-permission-mode="full"');
    expect(html).toContain('id="mcp-server-form"');
    expect(html).toContain('id="skill-form"');
    expect(html).toContain('data-settings-tab="appearance"');
    expect(css).toContain(".permission-mode");
    expect(css).toContain(".message-actions");
    expect(css).toContain(".connector-form");
    expect(js).toContain("/api/mcp/servers");
    expect(js).toContain("/api/skills");
    expect(js).toContain("data-copy-message");
  });

  it("uses the agent harness stream, resizable rails, and bottom terminal dock", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();
    const js = renderDashboardJs();

    expect(html).toContain('data-rail-resizer="left"');
    expect(html).toContain('data-rail-resizer="right"');
    expect(html).toContain('id="bottom-dock"');
    expect(html).toContain('id="terminal-command-input"');
    expect(css).toContain(".bottom-dock");
    expect(css).toContain(".terminal-output");
    expect(js).toContain("/agent/harness/runs/stream");
    expect(js).toContain("permissionModeToLevel");
    expect(js).toContain("/api/terminal/commands");
  });
});
