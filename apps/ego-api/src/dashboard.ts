import { isModelConfigured, loadModelConfig } from "@ego-graph/llm";
import { defaultEgoHome, sqlitePath, SqliteEgoStore, trajectoryDir } from "@ego-graph/storage";

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
  progress: {
    completed: string[];
    active: string[];
    next: string[];
  };
  commands: string[];
  recentRuns: {
    runId: string;
    scenario: string;
    status: "complete" | "blocked";
    eventCount: number;
    reportPath?: string;
    updatedAt: string;
  }[];
};

// 中文注释：前端只展示模型名称和连接状态，绝不回显 API Key 等敏感信息。
export async function readDashboardStatus(): Promise<DashboardStatus> {
  const egoHome = defaultEgoHome();
  const modelConfig = loadModelConfig();
  const sqlite = sqlitePath(egoHome);
  const store = new SqliteEgoStore(sqlite);

  try {
    return {
      ok: true,
      product: "EGO-Graph",
      logo: "紫莲花",
      milestone: "MVP 智能体运行时：CLI/TUI、Web 驾驶舱、MiniMax M3、轨迹回放",
      model: {
        provider: modelConfig.provider,
        name: modelConfig.model ?? "deterministic",
        configured: isModelConfigured(modelConfig),
      },
      storage: {
        egoHome,
        sqlite,
        trajectories: trajectoryDir(egoHome),
      },
      progress: {
        completed: [
          "TypeScript monorepo 与 ego 命令",
          "受控 web_pentest 场景",
          "JSONL + SQLite 轨迹存储",
          "MiniMax M3 规划器配置",
          "报告生成与轨迹回放",
        ],
        active: ["交互式终端 TUI", "浏览器可视化驾驶舱", "项目状态可观测"],
        next: ["长任务实时流式展示", "更多安全场景 Overlay", "参赛演示材料完善"],
      },
      commands: [
        "ego",
        "ego serve",
        "ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json",
        "ego replay --trajectory-id <run-id>",
        "ego eval --dataset datasets/evals/web_pentest.jsonl",
        "ego doctor",
      ],
      recentRuns: (await store.listRuns()).slice(0, 8),
    };
  } finally {
    store.close();
  }
}

// 中文注释：Dashboard 使用静态资源字符串，便于 CLI 打包后无需额外前端构建步骤。
export function renderDashboardHtml(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EGO-Graph 可视化驾驶舱</title>
    <link rel="stylesheet" href="/assets/dashboard.css" />
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <div class="lotus-mark" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div>
          <p class="eyebrow">紫莲花</p>
          <h1>EGO-Graph 可视化驾驶舱</h1>
        </div>
      </div>
      <div class="runtime-chip" id="model-chip">模型状态读取中</div>
    </header>

    <main class="dashboard-shell">
      <section class="panel command-panel" id="mission-chat">
        <div class="panel-heading">
          <p class="eyebrow">Mission Console</p>
          <h2>对话控制台</h2>
        </div>
        <div class="conversation" id="conversation">
          <article class="message assistant">
            <span>EGO</span>
            <p>输入授权范围内的任务目标，我会创建一次受控 web_pentest 运行，并把轨迹、证据和报告同步到右侧状态面板。</p>
          </article>
        </div>
        <form class="composer" id="mission-form">
          <label for="goal-input">任务目标</label>
          <textarea id="goal-input" name="goal" rows="4">Assess the controlled fixture for exposed admin hints</textarea>
          <div class="composer-actions">
            <input id="run-id-input" name="runId" placeholder="run-id 可选" />
            <button type="submit">发送任务</button>
          </div>
        </form>
      </section>

      <section class="panel status-panel">
        <div class="panel-heading">
          <p class="eyebrow">Project State</p>
          <h2>项目进展</h2>
        </div>
        <div class="progress-grid">
          <div>
            <h3>已完成</h3>
            <ul id="completed-list"></ul>
          </div>
          <div>
            <h3>进行中</h3>
            <ul id="active-list"></ul>
          </div>
          <div>
            <h3>下一步</h3>
            <ul id="next-list"></ul>
          </div>
        </div>
      </section>

      <section class="panel runs-panel">
        <div class="panel-heading">
          <p class="eyebrow">Runtime</p>
          <h2>运行状态</h2>
        </div>
        <dl class="status-facts">
          <div><dt>EGO_HOME</dt><dd id="ego-home">-</dd></div>
          <div><dt>SQLite</dt><dd id="sqlite-path">-</dd></div>
          <div><dt>Trajectories</dt><dd id="trajectory-path">-</dd></div>
        </dl>
        <div class="run-list" id="run-list"></div>
      </section>

      <section class="panel command-list-panel">
        <div class="panel-heading">
          <p class="eyebrow">Terminal</p>
          <h2>终端入口</h2>
        </div>
        <div class="command-list" id="command-list"></div>
      </section>
    </main>

    <script src="/assets/dashboard.js" type="module"></script>
  </body>
</html>`;
}

export function renderDashboardCss(): string {
  return String.raw`:root {
  color-scheme: dark;
  --bg: #121416;
  --panel: #1a1f22;
  --panel-strong: #22292c;
  --line: #344046;
  --text: #f2f0e8;
  --muted: #aeb8b4;
  --lotus: #b36bff;
  --teal: #5ee2c6;
  --amber: #d9b35f;
  --danger: #ff7a7a;
  --radius: 8px;
  font-family: "Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgba(94, 226, 198, 0.08), transparent 32%),
    radial-gradient(circle at 86% 12%, rgba(179, 107, 255, 0.14), transparent 30%),
    var(--bg);
  color: var(--text);
}

button,
input,
textarea {
  font: inherit;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 32px 16px;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.lotus-mark {
  position: relative;
  width: 54px;
  height: 54px;
}

.lotus-mark span {
  position: absolute;
  left: 20px;
  top: 8px;
  width: 16px;
  height: 36px;
  border: 1px solid rgba(242, 240, 232, 0.52);
  border-radius: 999px 999px 8px 8px;
  background: linear-gradient(180deg, rgba(179, 107, 255, 0.92), rgba(94, 226, 198, 0.38));
  transform-origin: 50% 92%;
}

.lotus-mark span:nth-child(1) {
  transform: rotate(-48deg);
}
.lotus-mark span:nth-child(2) {
  transform: rotate(-24deg);
}
.lotus-mark span:nth-child(3) {
  transform: rotate(0deg);
}
.lotus-mark span:nth-child(4) {
  transform: rotate(24deg);
}
.lotus-mark span:nth-child(5) {
  transform: rotate(48deg);
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 28px;
  line-height: 1.15;
}

h2 {
  font-size: 20px;
}

h3 {
  margin-bottom: 10px;
  color: var(--teal);
  font-size: 14px;
}

.eyebrow {
  color: var(--amber);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.runtime-chip {
  min-width: 180px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(34, 41, 44, 0.82);
  color: var(--muted);
  text-align: center;
}

.runtime-chip.ready {
  color: var(--teal);
}

.dashboard-shell {
  display: grid;
  grid-template-columns: minmax(360px, 1.15fr) minmax(320px, 0.85fr);
  gap: 16px;
  padding: 18px 32px 32px;
}

.panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(26, 31, 34, 0.92);
}

.panel-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid var(--line);
}

.command-panel {
  min-height: 620px;
  grid-row: span 3;
}

.conversation {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 330px;
  max-height: 48vh;
  overflow: auto;
  padding: 18px;
}

.message {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 12px;
  align-items: start;
}

.message span {
  color: var(--amber);
  font-size: 12px;
}

.message p {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel-strong);
  color: var(--text);
  line-height: 1.6;
}

.message.user p {
  border-color: rgba(94, 226, 198, 0.58);
}

.composer {
  display: grid;
  gap: 10px;
  padding: 18px;
  border-top: 1px solid var(--line);
}

.composer label {
  color: var(--muted);
  font-size: 13px;
}

textarea,
input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #0f1214;
  color: var(--text);
  outline: none;
}

textarea {
  min-height: 112px;
  resize: vertical;
  padding: 12px;
}

input {
  height: 42px;
  padding: 0 12px;
}

textarea:focus,
input:focus {
  border-color: var(--teal);
  box-shadow: 0 0 0 3px rgba(94, 226, 198, 0.12);
}

.composer-actions {
  display: grid;
  grid-template-columns: 1fr 136px;
  gap: 10px;
}

button {
  height: 42px;
  border: 0;
  border-radius: var(--radius);
  background: var(--teal);
  color: #0d1314;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.progress-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 18px;
}

ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #14191b;
  color: var(--muted);
  line-height: 1.4;
}

.status-facts {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 18px;
}

.status-facts div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
}

dt {
  color: var(--amber);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
}

.run-list,
.command-list {
  display: grid;
  gap: 10px;
  padding: 0 18px 18px;
}

.run-card,
.command-item {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
  background: #14191b;
}

.run-card strong,
.command-item code {
  color: var(--text);
}

.run-card small {
  display: block;
  margin-top: 6px;
  color: var(--muted);
}

.empty {
  color: var(--muted);
  padding: 18px;
}

@media (max-width: 920px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-shell,
  .progress-grid,
  .composer-actions {
    grid-template-columns: 1fr;
  }

  .command-panel {
    min-height: auto;
    grid-row: auto;
  }
}`;
}

export function renderDashboardJs(): string {
  return String.raw`const state = {
  status: null,
};

const byId = (id) => document.getElementById(id);

function appendMessage(role, body) {
  const list = byId("conversation");
  const item = document.createElement("article");
  item.className = "message " + role;
  const speaker = document.createElement("span");
  speaker.textContent = role === "user" ? "你" : "EGO";
  const text = document.createElement("p");
  text.textContent = body;
  item.append(speaker, text);
  list.append(item);
  list.scrollTop = list.scrollHeight;
}

function fillList(id, items) {
  const list = byId(id);
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));
}

function renderRuns(runs) {
  const list = byId("run-list");
  if (!runs.length) {
    list.innerHTML = '<p class="empty">暂无运行记录</p>';
    return;
  }

  list.replaceChildren(...runs.map((run) => {
    const card = document.createElement("article");
    card.className = "run-card";
    const title = document.createElement("strong");
    title.textContent = run.runId + " · " + run.status;
    const meta = document.createElement("small");
    meta.textContent = run.scenario + " · " + run.eventCount + " events · " + run.updatedAt;
    card.append(title, meta);
    return card;
  }));
}

function renderCommands(commands) {
  const list = byId("command-list");
  list.replaceChildren(...commands.map((command) => {
    const item = document.createElement("div");
    item.className = "command-item";
    const code = document.createElement("code");
    code.textContent = command;
    item.append(code);
    return item;
  }));
}

async function refreshStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();
  state.status = status;

  const chip = byId("model-chip");
  chip.textContent = status.model.provider + " · " + (status.model.configured ? "已配置" : "确定性回退");
  chip.classList.toggle("ready", status.model.configured);
  byId("ego-home").textContent = status.storage.egoHome;
  byId("sqlite-path").textContent = status.storage.sqlite;
  byId("trajectory-path").textContent = status.storage.trajectories;
  fillList("completed-list", status.progress.completed);
  fillList("active-list", status.progress.active);
  fillList("next-list", status.progress.next);
  renderRuns(status.recentRuns);
  renderCommands(status.commands);
}

export async function submitMission(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const goal = byId("goal-input").value.trim();
  const runId = byId("run-id-input").value.trim();
  if (!goal) {
    appendMessage("assistant", "任务目标不能为空。");
    return;
  }

  appendMessage("user", goal);
  button.disabled = true;
  button.textContent = "运行中";

  try {
    const response = await fetch("/runs", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        runId: runId || undefined,
        task: {
          scenario: "web_pentest",
          goal,
          targets: ["fixture://web-pentest/basic"],
          constraints: ["authorized-fixture-only"],
        },
      }),
    });
    const result = await response.json();
    appendMessage("assistant", "运行 " + result.runId + " 已" + result.status + "，证据 " + result.evidence.length + " 条，报告已写入 " + result.reportPath);
    await refreshStatus();
  } catch (error) {
    appendMessage("assistant", "运行失败：" + (error instanceof Error ? error.message : String(error)));
  } finally {
    button.disabled = false;
    button.textContent = "发送任务";
  }
}

byId("mission-form").addEventListener("submit", submitMission);
refreshStatus().catch((error) => {
  appendMessage("assistant", "状态读取失败：" + (error instanceof Error ? error.message : String(error)));
});`;
}
