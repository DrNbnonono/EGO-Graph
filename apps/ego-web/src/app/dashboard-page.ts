import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { icon } from "../components/icons.js";
import { DESIGN_NAME, PRODUCT_NAME, inspectorTabs, mobileSections } from "../data/labels.js";
import { renderDashboardCss } from "../styles/dashboard-style.js";
import { renderDashboardJs } from "../client/dashboard-client.js";

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
    milestone: "Codex-like Agent Workbench: Web / CLI / TUI / SQLite / Model / MCP",
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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
    />
    <link rel="stylesheet" href="/assets/dashboard.css" />
  </head>
  <body data-mobile-section="chat" data-theme="light" data-font-scale="normal" data-density="normal" data-grid="on">
    <div class="page-field" aria-hidden="true"></div>
    <main class="workbench workbench-fit">
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
          <span id="memory-label">RSS --</span>
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
        <aside class="left-rail" aria-label="项目和会话">
          <button class="rail-toggle-icon left-rail-toggle" type="button" data-rail-toggle="left" aria-label="收起左侧栏" title="收起左侧栏">${icon("chevronLeft")}</button>
          <div class="rail-resizer rail-resizer-left" data-rail-resizer="left" aria-hidden="true"></div>
          <section class="panel session-panel" data-collapsible-panel="sessions">
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
                <button class="project-change-button" type="button" data-new-session-open title="为新对话选择工作目录">更换</button>
              </div>
              <button class="new-session-button" type="button" id="new-session-button">${icon("plus")}<span>新对话</span></button>
              <div class="session-list" id="session-list"></div>
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
            <textarea id="goal-input" rows="3" placeholder="输入任务、问题或 / 命令。Enter 发送，Shift + Enter 换行。"></textarea>
            <div class="composer-row">
              <div class="composer-tools" aria-label="输入工具">
                <button class="composer-tool-button" id="attachment-button" type="button" title="添加附件">${icon("paperclip")}</button>
                <button class="composer-tool-button permission-trigger" id="permission-trigger" type="button" aria-haspopup="menu" aria-expanded="false" title="权限">请求批准</button>
                <button class="composer-tool-button slash-trigger" id="slash-trigger" type="button" title="打开命令">/</button>
              </div>
              <input id="session-input" placeholder="会话标识可选" />
              <button class="primary-action send-action" id="start-run" type="button">发送 <span>Enter</span></button>
            </div>
            <input id="attachment-input" type="file" multiple hidden />
            <div id="slash-menu" class="slash-menu" hidden></div>
            <div id="permission-menu" class="permission-menu" hidden role="menu">
              <button type="button" class="permission-mode" data-permission-mode="ask" role="menuitem">
                ${icon("shield")}<span><strong>请求批准</strong><small>高风险操作先询问</small></span>
              </button>
              <button type="button" class="permission-mode" data-permission-mode="auto" role="menuitem">
                ${icon("zap")}<span><strong>替我批准</strong><small>允许只读 Shell 与检查</small></span>
              </button>
              <button type="button" class="permission-mode" data-permission-mode="full" role="menuitem">
                ${icon("terminal")}<span><strong>完全访问</strong><small>允许写入与命令，保留审计</small></span>
              </button>
            </div>
          </section>

          <section class="bottom-dock panel" id="bottom-dock" aria-label="底部命令面板">
            <div class="dock-heading">
              <div class="dock-tabs" role="tablist">
                <button class="dock-tab active" type="button" data-dock-tab="terminal">${icon("terminal")}终端</button>
                <button class="dock-tab" type="button" data-dock-tab="events">${icon("zap")}事件</button>
                <button class="dock-tab" type="button" data-dock-tab="checks">${icon("check")}检查</button>
              </div>
              <button class="dock-close" type="button" data-bottom-dock-toggle title="收起底部面板">${icon("chevronUp")}</button>
            </div>
            <div class="dock-panel terminal-panel" id="dock-terminal">
              <pre class="terminal-output" id="terminal-output">终端命令会在当前会话工作目录中运行。</pre>
              <div class="terminal-input-row">
                <input id="terminal-command-input" placeholder="例如：git status" />
                <button class="soft-action" type="button" id="run-terminal-command">运行</button>
              </div>
            </div>
            <div class="dock-panel" id="dock-events" hidden>
              <div class="dock-list" id="dock-event-list"></div>
            </div>
            <div class="dock-panel" id="dock-checks" hidden>
              <div class="dock-list" id="dock-check-list">暂无检查输出</div>
            </div>
          </section>
        </section>

        <aside class="right-rail" aria-label="Inspector">
          <button class="rail-toggle-icon right-rail-toggle" type="button" data-rail-toggle="right" aria-label="收起右侧栏" title="收起右侧栏">${icon("chevronRight")}</button>
          <div class="rail-resizer rail-resizer-right" data-rail-resizer="right" aria-hidden="true"></div>
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
            <div class="inspector-panel" id="inspector-runs" hidden><div class="detail-list" id="run-list"></div></div>
            <div class="inspector-panel" id="inspector-memory" hidden></div>
            <div class="inspector-panel" id="inspector-mcp" hidden></div>
            <div class="inspector-panel" id="inspector-report" hidden><div class="detail-list" id="report-list"><p class="muted">选择完成的 run 查看报告。</p></div></div>
            <div class="inspector-panel" id="inspector-settings" hidden>
              <div class="settings-panel-entry">
                <p>模型、外观、MCP 和 Skills 的管理入口已移到独立设置页。</p>
                <button class="settings-open-button" type="button" data-settings-open>${icon("settings")}打开设置</button>
              </div>
            </div>
          </section>
        </aside>
      </section>

      ${renderSettingsPage()}
      ${renderNewSessionDialog()}
    </main>
    <script src="/assets/dashboard.js" type="module"></script>
  </body>
</html>`;
}

function renderSettingsPage(): string {
  return String.raw`<section class="settings-page" id="settings-page" hidden aria-label="设置">
  <aside class="settings-sidebar">
    <button class="settings-back" type="button" data-settings-close>${icon("chevronLeft")}返回工作台</button>
    <input class="settings-search" id="settings-search" placeholder="搜索设置..." />
    <nav class="settings-nav" aria-label="设置分类">
      <button class="active" type="button" data-settings-tab="general">${icon("sliders")}常规</button>
      <button type="button" data-settings-tab="appearance">${icon("palette")}外观</button>
      <button type="button" data-settings-tab="models">${icon("terminal")}模型</button>
      <button type="button" data-settings-tab="mcp">${icon("plug")}MCP 服务器</button>
      <button type="button" data-settings-tab="skills">${icon("sparkles")}Skills</button>
      <button type="button" data-settings-tab="memory">${icon("database")}记忆</button>
      <button type="button" data-settings-tab="runs">${icon("zap")}运行记录</button>
    </nav>
  </aside>
  <section class="settings-main">
    <header class="settings-page-header">
      <div class="settings-hero">
        <span id="settings-kicker">Workspace</span>
        <h2 id="settings-title">常规</h2>
        <p id="settings-subtitle">控制工作模式、权限和默认行为。模型配置保持全局，不随目录切换改变。</p>
      </div>
      <button class="settings-close-button" type="button" data-settings-close>关闭</button>
    </header>
    <div class="settings-content" id="settings-content">
      <section class="settings-section" data-settings-panel="general">
        <div class="settings-group-title">
          <h3>项目 / 目标目录</h3>
          <p>每个新对话都可以选择工作目录。浏览器版请输入路径；未来 App 版可接原生文件夹选择。</p>
        </div>
        <div class="settings-card project-picker-card">
          <div class="settings-row-card">
            <div><strong>当前目标目录</strong><small id="settings-current-project-path">读取中</small></div>
            <span class="inherit-chip">全局模型不变</span>
          </div>
          <div class="project-path-row">
            <input id="project-path-input" placeholder="输入项目文件夹路径，例如 E:\path\to\project" />
            <button class="secondary-action" id="open-project-button" type="button">${icon("folder")}打开目录</button>
          </div>
        </div>
        <h3>工作模式</h3>
        <div class="option-grid">
          <label class="option-card">
            <input class="visually-hidden-control" type="radio" name="work-mode" value="coding" checked />
            <span>适用于编程</span><small>更具技术性的回复和控制</small><i class="option-mark" aria-hidden="true"></i>
          </label>
          <label class="option-card">
            <input class="visually-hidden-control" type="radio" name="work-mode" value="daily" />
            <span>适用于日常工作</span><small>技术细节更少，节奏更轻</small><i class="option-mark" aria-hidden="true"></i>
          </label>
        </div>
        <div class="settings-group-title"><h3>权限</h3><p>默认权限会影响下一次 Agent run；高风险动作仍会进入审计流程。</p></div>
        <div class="settings-card">
          <label class="settings-row-card"><span><strong>默认权限</strong><small>允许读取当前工作区文件。</small></span><input class="switch-control" type="checkbox" checked /><i class="switch-visual" aria-hidden="true"></i></label>
          <label class="settings-row-card"><span><strong>自动审核</strong><small>低风险读取请求自动通过，高风险仍进入审批。</small></span><input class="switch-control" type="checkbox" checked /><i class="switch-visual" aria-hidden="true"></i></label>
          <label class="settings-row-card"><span><strong>完整访问权限</strong><small>允许写入和联网命令，需要谨慎开启。</small></span><input class="switch-control" type="checkbox" /><i class="switch-visual" aria-hidden="true"></i></label>
        </div>
      </section>
      <section class="settings-section" data-settings-panel="appearance" hidden>
        <div class="settings-group-title"><h3>外观</h3><p>正文使用系统 sans 字体，代码和 runId 使用 mono 字体。</p></div>
        <div class="settings-card preference-card">
          <label class="settings-row-card"><span><strong>主题</strong><small>浅色更接近 Codex App，深色保留控制台氛围。</small></span><select id="theme-select"><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <label class="settings-row-card"><span><strong>字体大小</strong><small>影响 UI 字号。</small></span><select id="font-scale-select"><option value="compact">紧凑</option><option value="normal">标准</option><option value="large">宽松</option></select></label>
          <label class="settings-row-card"><span><strong>信息密度</strong><small>控制面板间距和列表高度。</small></span><select id="density-select"><option value="compact">紧凑</option><option value="normal">标准</option><option value="comfortable">舒适</option></select></label>
        </div>
      </section>
      <section class="settings-section" data-settings-panel="models" hidden>
        <h3>全局模型</h3>
        <p class="muted">当前项目继承全局模型配置；切换项目不会改变 active model。</p>
        <div id="model-manager" class="settings-card"></div>
      </section>
      <section class="settings-section" data-settings-panel="mcp" hidden>
        <div class="settings-group-title"><h3>MCP 服务器</h3><p>Web 和 CLI 共用同一份 MCP 配置。</p></div>
        <form id="mcp-server-form" class="settings-card connector-form">
          <div class="connector-form-grid">
            <label><span>名称</span><input id="mcp-server-name" placeholder="例如 filesystem" /></label>
            <label><span>传输</span><select id="mcp-server-transport"><option value="stdio">stdio</option><option value="http">http</option></select></label>
            <label><span>命令 / URL</span><input id="mcp-server-command" placeholder="npx / uvx / https://..." /></label>
            <label><span>参数</span><input id="mcp-server-args" placeholder="逗号分隔，例如 -y,@modelcontextprotocol/server-filesystem,." /></label>
          </div>
          <div class="connector-actions">
            <button class="soft-action" type="button" id="test-mcp-server">${icon("zap")}测试连接</button>
            <button class="confirm-action" type="submit">${icon("plug")}保存 MCP</button>
          </div>
        </form>
        <div id="mcp-manager" class="connector-list"></div>
      </section>
      <section class="settings-section" data-settings-panel="skills" hidden>
        <div class="settings-group-title"><h3>Skills</h3><p>注册本地或插件 Skill，Web 和 CLI 后续读取同源配置。</p></div>
        <form id="skill-form" class="settings-card connector-form">
          <div class="connector-form-grid">
            <label><span>名称</span><input id="skill-name" placeholder="例如 report-writer" /></label>
            <label><span>版本</span><input id="skill-version" value="0.1.0" /></label>
            <label class="wide"><span>描述</span><input id="skill-description" placeholder="这个 Skill 负责什么" /></label>
            <label><span>入口</span><input id="skill-entry" placeholder="local:report-writer 或插件入口" /></label>
            <label><span>能力</span><input id="skill-capabilities" placeholder="逗号分隔，例如 report,security" /></label>
          </div>
          <div class="connector-actions"><button class="confirm-action" type="submit">${icon("sparkles")}保存 Skill</button></div>
        </form>
        <div id="skills-manager" class="connector-list"></div>
      </section>
      <section class="settings-section" data-settings-panel="memory" hidden><h3>记忆</h3><div id="memory-manager" class="settings-card"></div></section>
      <section class="settings-section" data-settings-panel="runs" hidden><h3>运行记录</h3><div id="runs-manager" class="settings-card"></div></section>
    </div>
  </section>
</section>`;
}

function renderNewSessionDialog(): string {
  return String.raw`<section class="dialog-backdrop" id="new-session-dialog" hidden aria-label="新对话">
  <div class="new-session-sheet" role="dialog" aria-modal="true" aria-labelledby="new-session-title">
    <header>
      <div>
        <span class="sheet-kicker">New conversation</span>
        <h2 id="new-session-title">选择工作目录</h2>
        <p>每个新对话都可以绑定自己的工作目录。模型配置保持全局，不随目录切换。</p>
      </div>
      <button class="sheet-close" type="button" data-new-session-close aria-label="关闭">${icon("chevronLeft")}</button>
    </header>
    <div class="new-session-body">
      <label class="field-stack"><span>对话名称</span><input id="new-session-title-input" placeholder="新对话" /></label>
      <label class="field-stack"><span>工作目录</span><input id="new-session-path-input" placeholder="输入或粘贴项目文件夹路径" /></label>
      <button class="directory-choice active" type="button" id="use-current-project">${icon("folder")}<span><strong>使用当前目录</strong><small id="new-session-current-path">读取中</small></span></button>
    </div>
    <footer>
      <button class="soft-action" type="button" data-new-session-close>取消</button>
      <button class="confirm-action" type="button" id="confirm-new-session">创建对话</button>
    </footer>
  </div>
</section>`;
}
