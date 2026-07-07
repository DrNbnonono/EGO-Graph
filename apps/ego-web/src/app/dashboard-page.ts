import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { icon } from "../components/icons.js";
import { DESIGN_NAME, PRODUCT_NAME, inspectorTabs, mobileSections } from "../data/labels.js";
import { renderDashboardCss } from "../styles/dashboard-style.js";
import { renderDashboardJs } from "./dashboard-client.js";

declare const process: { cwd(): string };

export { renderDashboardCss, renderDashboardJs };

export type DashboardStatus = {
  ok: true;
  product: "EGO-Graph";
  logo: "紫莲花";
  milestone: string;
  model: WorkbenchState["model"];
  storage: WorkbenchState["storage"];
  mcp: WorkbenchState["mcp"];
  progress: WorkbenchState["progress"];
  commands: string[];
  recentRuns: WorkbenchState["recentRuns"];
};

export async function readDashboardStatus(
  workspaceRoot = process.cwd(),
  egoHome?: string,
): Promise<DashboardStatus> {
  const workbench = await readWorkbenchState({
    workspaceRoot,
    ...(egoHome ? { egoHome } : {}),
  });

  return {
    ok: true,
    product: "EGO-Graph",
    logo: "紫莲花",
    milestone: "Lightweight Lotus Console: CLI/TUI/Web/Runtime Server/SQLite/Model/MCP 能力边界",
    model: workbench.model,
    storage: workbench.storage,
    mcp: workbench.mcp,
    progress: workbench.progress,
    commands: workbench.commands,
    recentRuns: workbench.recentRuns,
  };
}

export function renderDashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${PRODUCT_NAME}</title>
    <link rel="icon" href="/assets/brand/ego-lotus.png" type="image/png" />
    <link rel="stylesheet" href="/assets/dashboard.css" />
  </head>
  <body data-mobile-section="chat" data-theme="light">
    <div class="page-field" aria-hidden="true"></div>
    <main class="workbench">
      <header class="topbar">
        <div class="brand">
          <img class="brand-logo" src="/assets/brand/ego-lotus.png" alt="EGO-Graph" />
          <strong>${PRODUCT_NAME}</strong>
          <small class="design-chip">${DESIGN_NAME}</small>
          <small id="cwd-label">~/EGO-Graph</small>
        </div>
        <div class="runtime-strip" aria-label="运行状态">
          <span>模式 <b id="mode-label">对话</b></span>
          <span>网络 <b id="network-label">读取中</b></span>
          <span>模型 <b id="model-chip">读取中</b></span>
          <span id="cpu-label">CPU --</span>
          <span id="memory-label">内存 --</span>
          <span id="clock-label">--:--:--</span>
        </div>
      </header>

      <nav class="mobile-section-nav" aria-label="移动端工作区">
        ${mobileSections
          .map(
            ([target, label], index) =>
              `<button type="button" data-mobile-target="${target}" class="${index === 1 ? "active" : ""}">${label}</button>`,
          )
          .join("")}
      </nav>

      <section class="dashboard-shell">
        <aside class="left-rail" aria-label="会话、项目和工具">
          <button class="rail-gutter left-rail-toggle" type="button" data-rail-toggle="left" aria-label="收起左侧栏" title="收起左侧栏">${icon("chevronLeft")}</button>
          <section class="panel" data-collapsible-panel="sessions">
            <div class="panel-heading">
              <h2>会话</h2>
              <button class="panel-toggle" type="button" data-panel-toggle="sessions" aria-expanded="true" aria-label="折叠会话">${icon("chevronUp")}</button>
            </div>
            <div class="panel-body">
              <div class="project-card">
                ${icon("folder")}
                <div>
                  <strong id="active-project-name">当前项目</strong>
                  <small id="active-project-path">读取中</small>
                </div>
              </div>
              <button class="new-session-button" type="button" id="new-session-button">${icon("plus")}<span>新对话</span></button>
              <div class="session-list" id="session-list"></div>
            </div>
          </section>
          <section class="panel" data-collapsible-panel="tools">
            <div class="panel-heading">
              <h2>工具入口</h2>
              <button class="panel-toggle" type="button" data-panel-toggle="tools" aria-expanded="true" aria-label="折叠工具">${icon("chevronUp")}</button>
            </div>
            <div class="panel-body">
              <div class="tool-list" id="tool-list"></div>
              <button class="link-button" type="button" data-page="mcp">管理工具</button>
            </div>
          </section>
        </aside>

        <section class="center-stage" id="mission-chat">
          <section class="panel agent-cockpit">
            <div class="panel-heading">
              <h2>Agent 线程</h2>
              <div class="mode-tabs" role="tablist" aria-label="工作模式">
                <button class="mode-tab active" type="button" data-mode="chat">对话</button>
                <button class="mode-tab" type="button" data-mode="patch">生成 Patch</button>
                <button class="mode-tab" type="button" data-mode="security">安全任务</button>
              </div>
              <button class="run-chip" type="button" data-inspector-tab-shortcut="runs" id="run-count-label">0 runs</button>
            </div>
            <div class="conversation-scroll" id="conversation"></div>
            <div class="timeline-strip" id="event-timeline" aria-live="polite"></div>
          </section>

          <section class="composer panel" aria-label="输入区">
            <textarea id="goal-input" rows="3" placeholder="在此输入你的问题，模型可用时会调用 /chat 进行回复..."></textarea>
            <div class="composer-row">
              <input id="session-input" placeholder="会话标识可选" />
              <button class="primary-action" id="start-run" type="button">发送 <span>Enter</span></button>
            </div>
            <div class="command-strip" aria-label="快捷命令">
              <span class="slash-mark">/</span>
              <div id="quick-command-list" class="quick-command-list"></div>
              <small>输入 /help 查看所有命令</small>
            </div>
            <div id="slash-menu" class="slash-menu" hidden></div>
          </section>
        </section>

        <aside class="right-rail" aria-label="Inspector">
          <button class="rail-gutter right-rail-toggle" type="button" data-rail-toggle="right" aria-label="收起右侧栏" title="收起右侧栏">${icon("chevronRight")}</button>
          <section class="panel inspector-shell">
            <div class="panel-heading inspector-heading">
              <h2>Inspector</h2>
              <div class="inspector-tabs" role="tablist">
                ${inspectorTabs
                  .map(
                    ([tab, label], index) =>
                      `<button type="button" class="inspector-tab ${index === 0 ? "active" : ""}" data-inspector-tab="${tab}">${label}</button>`,
                  )
                  .join("")}
              </div>
            </div>
            <div class="inspector-panel" id="inspector-context"></div>
            <div class="inspector-panel" id="inspector-plan" hidden></div>
            <div class="inspector-panel" id="inspector-diff" hidden></div>
            <div class="inspector-panel" id="inspector-checks" hidden></div>
            <div class="inspector-panel" id="inspector-runs" hidden>
              <div class="detail-list" id="run-list"></div>
            </div>
            <div class="inspector-panel" id="inspector-memory" hidden></div>
            <div class="inspector-panel" id="inspector-mcp" hidden></div>
            <div class="inspector-panel" id="inspector-settings" hidden>
              <button class="primary-action" type="button" data-settings-open>打开设置</button>
            </div>
          </section>
        </aside>
      </section>

      ${renderSettingsPage()}
    </main>
    <script src="/assets/dashboard.js" type="module"></script>
  </body>
</html>`;
}

function renderSettingsPage(): string {
  return String.raw`<section class="settings-page" id="settings-page" hidden aria-label="设置">
  <aside class="settings-sidebar">
    <button class="ghost settings-back" type="button" data-settings-close>返回工作台</button>
    <input class="settings-search" id="settings-search" placeholder="搜索设置..." />
    <nav class="settings-nav" aria-label="设置分类">
      <button class="active" type="button" data-settings-tab="general">${icon("settings")}常规</button>
      <button type="button" data-settings-tab="appearance">${icon("settings")}外观</button>
      <button type="button" data-settings-tab="models">${icon("settings")}模型</button>
      <button type="button" data-settings-tab="mcp">${icon("settings")}MCP 服务器</button>
      <button type="button" data-settings-tab="skills">${icon("settings")}Skills</button>
      <button type="button" data-settings-tab="memory">${icon("settings")}记忆</button>
      <button type="button" data-settings-tab="runs">${icon("settings")}运行记录</button>
    </nav>
  </aside>
  <section class="settings-main">
    <header class="settings-page-header">
      <div>
        <h2 id="settings-title">常规</h2>
        <p id="settings-subtitle">模型配置保持全局，项目切换只改变上下文和会话归属。</p>
      </div>
      <button class="ghost" type="button" data-settings-close>关闭</button>
    </header>
    <div class="settings-content" id="settings-content">
      <section class="settings-section" data-settings-panel="general">
        <h3>工作模式</h3>
        <div class="option-grid">
          <label class="option-card">
            <input type="radio" name="work-mode" value="coding" checked />
            <span>适用于编程</span>
            <small>更具技术性的回复和控制</small>
          </label>
          <label class="option-card">
            <input type="radio" name="work-mode" value="daily" />
            <span>适用于日常工作</span>
            <small>技术细节更少，节奏更轻</small>
          </label>
        </div>
        <h3>权限</h3>
        <div class="settings-card">
          <label><span>默认权限</span><input type="checkbox" checked /></label>
          <label><span>自动审核</span><input type="checkbox" checked /></label>
          <label><span>完整访问权限</span><input type="checkbox" /></label>
        </div>
      </section>
      <section class="settings-section" data-settings-panel="appearance" hidden>
        <h3>外观</h3>
        <div class="settings-card">
          <label><span>主题</span><select id="theme-select"><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <label><span>字体大小</span><select id="font-scale-select"><option value="compact">紧凑</option><option value="normal">标准</option><option value="large">宽松</option></select></label>
          <label><span>信息密度</span><select id="density-select"><option value="compact">紧凑</option><option value="normal">标准</option><option value="comfortable">舒适</option></select></label>
        </div>
      </section>
      <section class="settings-section" data-settings-panel="models" hidden>
        <h3>全局模型</h3>
        <p class="muted">当前项目继承全局模型配置；切换项目不会改写 active model。</p>
        <div id="model-manager" class="settings-card"></div>
      </section>
      <section class="settings-section" data-settings-panel="mcp" hidden>
        <h3>MCP 服务器</h3>
        <div id="mcp-manager" class="settings-card"></div>
      </section>
      <section class="settings-section" data-settings-panel="skills" hidden>
        <h3>Skills</h3>
        <div id="skills-manager" class="settings-card"></div>
      </section>
      <section class="settings-section" data-settings-panel="memory" hidden>
        <h3>记忆</h3>
        <div id="memory-manager" class="settings-card"></div>
      </section>
      <section class="settings-section" data-settings-panel="runs" hidden>
        <h3>运行记录</h3>
        <div id="runs-manager" class="settings-card"></div>
      </section>
    </div>
  </section>
</section>`;
}
