import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { renderDashboardJs } from "../client/dashboard-client.js";
import { renderLotusLogo } from "../components/lotus-logo.js";
import { renderDashboardCss } from "../styles/dashboard-style.js";

export { renderDashboardCss, renderDashboardJs };

export type DashboardStatus = {
  ok: true;
  product: "EGO-Graph";
  logo: "紫莲花";
  milestone: string;
  model: {
    provider: string;
    name: string;
    configured: boolean;
  };
  storage: {
    egoHome: string;
    sqlite: string;
    trajectories: string;
  };
  mcp: WorkbenchState["mcp"];
  progress: {
    completed: string[];
    active: string[];
    next: string[];
  };
  commands: string[];
  recentRuns: WorkbenchState["recentRuns"];
};

export async function readDashboardStatus(workspaceRoot = process.cwd()): Promise<DashboardStatus> {
  const workbench = await readWorkbenchState({ workspaceRoot });

  return {
    ok: true,
    product: "EGO-Graph",
    logo: "紫莲花",
    milestone:
      "Lotus Agent Workbench：CLI/TUI、Web、Runtime Server、SQLite、模型回退、MCP 能力边界",
    model: workbench.model,
    storage: workbench.storage,
    mcp: workbench.mcp,
    progress: workbench.progress,
    commands: workbench.commands,
    recentRuns: workbench.recentRuns,
  };
}

// 中文注释：Dashboard 使用静态资源字符串，便于 CLI 打包后无需额外前端构建步骤。
export function renderDashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EGO-Graph 可视化驾驶舱</title>
    <link rel="icon" href="/assets/brand/ego-lotus.png" type="image/png" />
    <link rel="stylesheet" href="/assets/dashboard.css" />
  </head>
  <body>
    <div class="stars" aria-hidden="true"></div>
    <main class="workbench">
      <header class="topbar">
        <div class="window-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="brand">
          <span class="brand-orbit"></span>
          <strong>挑战杯Agent TUI v0.1.0</strong>
          <span id="cwd-label">~/EGO-Graph</span>
        </div>
        <div class="runtime-strip">
          <span>模式: <b id="mode-label">智能安全分析</b></span>
          <span>网络: <b id="network-label">读取中</b></span>
          <span>模型: <b id="model-chip">模型状态读取中</b></span>
          <span id="cpu-label">CPU --</span>
          <span id="memory-label">内存 --</span>
          <span id="clock-label">--:--:--</span>
        </div>
      </header>

      <section class="dashboard-shell">
        <aside class="left-rail">
          <section class="panel">
            <div class="panel-heading compact"><h2>会话 / 任务</h2><button class="ghost">⌃</button></div>
            <div class="session-list" id="session-list"></div>
          </section>
          <section class="panel">
            <div class="panel-heading compact"><h2>工具集</h2><button class="ghost">⌃</button></div>
            <div class="tool-list" id="tool-list"></div>
            <button class="link-button">+ 管理工具</button>
          </section>
        </aside>

        <section class="center-stage" id="mission-chat">
          <div class="hero-lockup">
            ${renderLotusLogo()}
            <h1>EGO-Graph 可视化驾驶舱</h1>
            <p>= 智能网络安全AI代理 · 发现 · 分析 · 响应 · 加固 =</p>
          </div>

          <section class="panel intro-panel">
            <p>欢迎使用挑战杯Agent TUI</p>
            <p>我可以帮助你进行安全分析、威胁检测、漏洞评估和事件响应。输入 /help 查看可用命令，或描述你的安全分析需求。</p>
          </section>

          <section class="panel console-panel">
            <div class="panel-heading compact"><h2>对话控制台</h2><span id="run-count">0 runs</span></div>
            <div class="conversation" id="conversation">
              <article class="message assistant">
                <span>lotus</span>
                <p>输入自然语言任务，我会先读取项目、给出计划、列出建议命令，并展示 MCP、SQLite、Evidence 与运行轨迹状态。</p>
              </article>
              <article class="message assistant output">
                <span>tool</span>
                <pre>PORT     STATE   SERVICE   VERSION
22/tcp   open    ssh       OpenSSH 8.4p1
80/tcp   open    http      nginx 1.18.0
443/tcp  open    https     nginx 1.18.0</pre>
              </article>
            </div>
          </section>

          <form class="composer" id="mission-form">
            <textarea id="goal-input" name="goal" rows="3" placeholder="在此输入你的安全分析需求或命令...">阅读项目状态并说明下一步应该做什么</textarea>
            <div class="composer-actions">
              <input id="run-id-input" name="runId" placeholder="会话标识可选" />
              <button type="submit">发送 (Enter)</button>
            </div>
          </form>
        </section>

        <aside class="right-rail">
          <section class="panel">
            <div class="panel-heading compact"><h2>上下文</h2><button class="ghost">⌄</button></div>
            <dl class="context-list">
              <div><dt>目标</dt><dd id="context-target">-</dd></div>
              <div><dt>类型</dt><dd id="context-type">-</dd></div>
              <div><dt>范围</dt><dd id="context-scope">-</dd></div>
              <div><dt>优先级</dt><dd id="context-priority">-</dd></div>
            </dl>
          </section>
          <section class="panel">
            <div class="panel-heading compact"><h2>文件</h2><button class="ghost">‹</button></div>
            <div class="file-list" id="file-list"></div>
          </section>
          <section class="panel">
            <div class="panel-heading compact"><h2>日志</h2><button class="ghost">‹</button></div>
            <div class="log-list" id="log-list"></div>
          </section>
          <section class="panel">
            <div class="panel-heading compact"><h2>审批 / 执行</h2><button class="ghost">⌄</button></div>
            <div class="approval-list" id="approval-list"></div>
          </section>
        </aside>
      </section>

      <footer class="quickbar">
        <span class="bolt">/</span>
        <div id="quick-command-list"></div>
        <span>提示：输入 /help 查看所有命令</span>
      </footer>

      <section class="sr-compatible">
        <h2>项目进展</h2>
        <ul id="completed-list"></ul>
        <ul id="active-list"></ul>
        <ul id="next-list"></ul>
        <div id="run-list"></div>
        <div id="mcp-list"></div>
        <div id="command-list"></div>
        <dl>
          <div><dt>EGO_HOME</dt><dd id="ego-home">-</dd></div>
          <div><dt>SQLite</dt><dd id="sqlite-path">-</dd></div>
          <div><dt>Trajectories</dt><dd id="trajectory-path">-</dd></div>
        </dl>
      </section>
    </main>

    <script src="/assets/dashboard.js" type="module"></script>
  </body>
</html>`;
}
