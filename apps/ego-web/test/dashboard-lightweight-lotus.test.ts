import { describe, expect, it } from "vitest";
import { renderDashboardCss, renderDashboardHtml, renderDashboardJs } from "../src/index.js";
import type {
  ApprovalUiState,
  CommandAction,
  InspectorTab,
  PanelKind,
  RunUiState,
  WorkbenchViewModel,
} from "../src/data/view-model.js";

describe("dashboard lightweight lotus UI", () => {
  it("uses Codex-like readable design tokens", () => {
    const css = renderDashboardCss();

    expect(css).toContain("--bg: #f7f9fc");
    expect(css).toContain("--panel: rgba(255, 255, 255, 0.76)");
    expect(css).toContain("--accent: #1a1a2e");
    expect(css).toContain("--body-font:");
    expect(css).toContain("system-ui");
    expect(css).not.toContain("Charter");
    expect(css).not.toContain("ui-serif");
    expect(css).toContain(".mobile-section-nav");
  });

  it("renders workbench sections with inspector tabs and clear Chinese actions", () => {
    const html = renderDashboardHtml();
    const js = renderDashboardJs();

    expect(html).toContain("Lightweight Lotus Console");
    expect(html).toContain('data-inspector-tab="context"');
    expect(html).toContain('data-inspector-tab="plan"');
    expect(html).toContain('data-inspector-tab="diff"');
    expect(html).toContain('data-inspector-tab="checks"');
    expect(html).toContain('data-inspector-tab="runs"');
    expect(html).toContain('data-inspector-tab="settings"');
    expect(html).toContain('data-mobile-target="threads"');
    expect(html).toContain('data-mobile-target="chat"');
    expect(html).toContain('data-mobile-target="inspector"');
    expect(html).toContain('data-mobile-target="manage"');
    expect(html).toContain("新对话");
    expect(html).toContain("打开设置");
    expect(js).toContain("setInspectorTab");
    expect(js).toContain("setMobileSection");
  });

  it("supports polished app-shell interaction details", () => {
    const html = renderDashboardHtml();
    const css = renderDashboardCss();
    const js = renderDashboardJs();

    expect(css).toContain("--ui-font-size");
    expect(css).toContain(".settings-page");
    expect(css).toContain("body.settings-open");
    expect(css).toContain('"JetBrains Mono"');
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain(".conversation-scroll");
    expect(css).toContain("body.rail-left-collapsed");
    expect(css).toContain("body.rail-right-collapsed");
    expect(html).toContain('data-rail-toggle="left"');
    expect(html).toContain('data-rail-toggle="right"');
    expect(html).toContain('aria-label="收起左侧栏"');
    expect(html).toContain('aria-label="收起右侧栏"');
    expect(html).toContain('id="settings-page"');
    expect(html).toContain("data-settings-open");
    expect(html).not.toContain('class="panel manage-pages"');
    expect(js).toContain("renderMarkdown");
    expect(js).toContain("createRunSummaryDetails");
    expect(js).toContain("toggleRail");
    expect(js).toContain("deleteSession");
    expect(js).toContain("applyUiPreferences");
  });

  it("exposes typed frontend view-state aliases for future modules", () => {
    const panel: PanelKind = "inspector";
    const tab: InspectorTab = "diff";
    const command: CommandAction = {
      name: "/status",
      category: "session",
      requiresApproval: false,
    };
    const run: RunUiState = { status: "idle", label: "待命" };
    const approval: ApprovalUiState = { kind: "patch", status: "pending" };
    const viewModel: WorkbenchViewModel = {
      activePanel: panel,
      activeInspectorTab: tab,
      activeCommand: command,
      run,
      approval,
    };

    expect(viewModel.activePanel).toBe("inspector");
    expect(viewModel.activeInspectorTab).toBe("diff");
  });
});
