export function renderDashboardJs(): string {
  return String.raw`import { marked } from "/assets/vendor/marked.esm.js";

const state = {
  workbench: null,
  project: null,
  projects: [],
  sessions: [],
  activeSessionId: null,
  activeMode: "chat",
  activeInspectorTab: "context",
  activeMobileSection: "chat",
  commandsRegistry: [],
  uiPreferences: loadUiPreferences(),
};

const byId = (id) => document.getElementById(id);

marked.setOptions({
  gfm: true,
  breaks: false,
  mangle: false,
  headerIds: false,
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeRenderedMarkdown(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) element.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && !/^(https?:|mailto:|#|\/)/i.test(value)) {
        element.removeAttribute(attr.name);
      }
    }
  });
  template.content.querySelectorAll("a").forEach((anchor) => {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer");
  });
  return template.innerHTML;
}

function renderMarkdown(target, source) {
  target.classList.add("markdown-body");
  target.innerHTML = sanitizeRenderedMarkdown(marked.parse(String(source || "")));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || response.statusText || "请求失败");
  }
  return payload;
}

function formatRelativeTime(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + " 分钟前";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " 小时前";
  return Math.floor(diff / 86_400_000) + " 天前";
}

function currentSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || state.sessions[0] || null;
}

async function ensureServerSession() {
  const existing = currentSession();
  if (existing) {
    state.activeSessionId = existing.id;
    return existing;
  }
  return createNewSession({ silent: true });
}

async function loadProjectsAndSessions() {
  const projects = await fetchJson("/api/projects");
  state.projects = projects.projects || [];
  state.project = projects.activeProject || state.projects[0] || null;
  renderProject();
  await loadSessions();
}

async function loadSessions() {
  if (!state.project) return;
  const payload = await fetchJson("/api/sessions?projectId=" + encodeURIComponent(state.project.id));
  state.sessions = payload.sessions || [];
  if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0]?.id || null;
  }
  if (!state.activeSessionId) {
    await createNewSession({ silent: true });
    return;
  }
  renderSessions();
  await restoreConversation(currentSession());
}

function renderProject() {
  const project = state.project;
  const name = byId("active-project-name");
  const path = byId("active-project-path");
  const cwd = byId("cwd-label");
  const settingsPath = byId("settings-current-project-path");
  const input = byId("project-path-input");
  if (name) name.textContent = project?.name || "当前项目";
  if (path) path.textContent = project?.path || "未选择项目";
  if (cwd) cwd.textContent = project?.path || "~/EGO-Graph";
  if (settingsPath) settingsPath.textContent = project?.path || "未选择项目";
  if (input && !input.value) input.value = project?.path || "";
}

function renderSessions() {
  const list = byId("session-list");
  if (!list) return;
  if (!state.sessions.length) {
    list.innerHTML = '<div class="empty-state">还没有会话</div>';
    return;
  }
  list.replaceChildren(
    ...state.sessions.map((session) => {
      const item = document.createElement("div");
      item.className = "session-item" + (session.id === state.activeSessionId ? " active" : "");

      const open = document.createElement("button");
      open.type = "button";
      open.className = "session-open";
      open.innerHTML =
        '<strong>' + escapeHtml(session.title || "新对话") + '</strong><small>' + escapeHtml(formatRelativeTime(session.updatedAt)) + "</small>";
      open.addEventListener("click", () => selectSession(session.id));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-button";
      del.title = "删除会话";
      del.setAttribute("aria-label", "删除会话");
      del.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></span>';
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteSession(session.id);
      });

      item.append(open, del);
      return item;
    }),
  );
}

async function createNewSession(options = {}) {
  if (!state.project) return null;
  const payload = await fetchJson("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ projectId: state.project.id, title: "新对话" }),
  });
  const session = payload.session;
  state.sessions = [session, ...state.sessions.filter((item) => item.id !== session.id)];
  state.activeSessionId = session.id;
  renderSessions();
  clearConversation();
  if (!options.silent) {
    appendMessage("assistant", "已创建新对话。", { skipPersist: true });
  }
  return session;
}

async function selectSession(sessionId) {
  state.activeSessionId = sessionId;
  renderSessions();
  await restoreConversation(currentSession());
}

async function deleteSession(sessionId) {
  if (!sessionId) return;
  await fetchJson("/api/sessions/" + encodeURIComponent(sessionId), { method: "DELETE" });
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  if (state.activeSessionId === sessionId) state.activeSessionId = state.sessions[0]?.id || null;
  renderSessions();
  if (!state.activeSessionId) {
    await createNewSession({ silent: true });
  } else {
    await restoreConversation(currentSession());
  }
}

function clearConversation() {
  const conversation = byId("conversation");
  if (conversation) {
    conversation.innerHTML =
      '<div class="conversation-empty"><strong>开始新的对话</strong><span>选择项目会话后直接提问，或输入 /help 查看命令。</span></div>';
  }
}

async function restoreConversation(session) {
  clearConversation();
  if (!session) return;
  const payload = await fetchJson("/api/sessions/" + encodeURIComponent(session.id) + "/messages");
  const messages = payload.messages || [];
  if (!messages.length) {
    appendMessage("system", "当前是新对话。你可以直接提问，或输入 /help 查看命令。", { skipPersist: true });
    return;
  }
  messages.forEach((message) => appendMessage(message.role, message.content, { skipPersist: true }));
}

function persistMessage(role, content) {
  const session = currentSession();
  if (!session || !content.trim()) return;
  fetchJson("/api/sessions/" + encodeURIComponent(session.id) + "/messages", {
    method: "POST",
    body: JSON.stringify({ role, content }),
  }).catch((error) => console.warn("message persistence failed", error));
}

function appendMessage(role, body, options = {}) {
  const conversation = byId("conversation");
  if (!conversation) return;
  conversation.querySelector(".conversation-empty")?.remove();
  const row = document.createElement("article");
  row.className = "message-row role-" + role;
  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = role === "assistant" ? "lotus" : role;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  renderMarkdown(bubble, body);
  row.append(label, bubble);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  if (!options.skipPersist && role !== "system") persistMessage(role, String(body || ""));
}

function setThinking(content, expanded = false) {
  const conversation = byId("conversation");
  if (!conversation) return null;
  const details = document.createElement("details");
  details.className = "thinking-block";
  details.open = expanded;
  details.innerHTML = '<summary><span class="status-dot warning"></span>思考过程</summary><div></div>';
  renderMarkdown(details.querySelector("div"), content || "正在整理上下文、检查可用工具并准备回复。");
  const row = document.createElement("article");
  row.className = "message-row role-assistant";
  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = "lotus";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.append(details);
  row.append(label, bubble);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  return details;
}

function createRunSummaryDetails(run) {
  const status = run.status || "unknown";
  return [
    '<div class="detail-card">',
    '<strong>' + escapeHtml(run.id || "run") + "</strong>",
    '<span class="status-text">' + escapeHtml(status) + "</span>",
    '<small>' + escapeHtml(formatRelativeTime(run.updatedAt || run.createdAt)) + "</small>",
    "</div>",
  ].join("");
}

function renderRuns(runs = []) {
  const count = byId("run-count-label");
  if (count) count.textContent = (runs.length || 0) + " runs";
  const list = byId("run-list");
  if (!list) return;
  list.innerHTML = runs.length
    ? runs.map(createRunSummaryDetails).join("")
    : '<div class="empty-state">暂无运行记录</div>';
}

function renderToolList(workbench) {
  const tools = byId("tool-list");
  if (!tools) return;
  const names = workbench?.mcp?.toolNames?.length
    ? workbench.mcp.toolNames
    : ["workspace.read", "workspace.search", "shell.readonly", "ctf.basic", "tools/list"];
  tools.innerHTML = names
    .map((name) => '<div class="tool-item"><span class="status-dot success"></span><strong>' + escapeHtml(name.split(".")[0]) + '</strong><small>' + escapeHtml(name) + "</small></div>")
    .join("");
}

function renderCommands(workbench) {
  const commands = (workbench?.commands?.length ? workbench.commands : ["/help", "/model", "/models", "/plan", "/patch", "/scan", "/memory", "/skills", "/mcp", "/prompt", "/compact", "/status", "/clear"]).slice(0, 14);
  state.commandsRegistry = commands;
  const list = byId("quick-command-list");
  if (!list) return;
  list.innerHTML = commands
    .map((command) => '<button type="button" class="quick-command" data-command="' + escapeHtml(command) + '">' + escapeHtml(command) + "</button>")
    .join("");
}

function detailCard(title, value) {
  return '<div class="detail-card"><small>' + escapeHtml(title) + '</small><strong>' + escapeHtml(value || "暂无") + "</strong></div>";
}

function renderInspector(workbench) {
  const project = state.project;
  const context = byId("inspector-context");
  if (context) {
    context.innerHTML =
      '<div class="detail-list">' +
      detailCard("项目", project?.name || "EGO-Graph") +
      detailCard("路径", project?.path || "") +
      detailCard("模型", workbench?.model?.activeModel || workbench?.model?.model || "未配置") +
      detailCard("存储", workbench?.storage?.sqlite?.exists ? "SQLite 已连接" : "读取中") +
      "</div>";
  }
  const memory = byId("inspector-memory");
  if (memory) {
    const recent = workbench?.storage?.memory?.recent || [];
    memory.innerHTML = recent.length
      ? '<div class="detail-list">' + recent.map((item) => detailCard(item.scope || "memory", item.content || item.id)).join("") + "</div>"
      : '<div class="empty-state">暂无记忆</div>';
  }
  const mcp = byId("inspector-mcp");
  if (mcp) {
    const names = workbench?.mcp?.toolNames || [];
    mcp.innerHTML =
      '<div class="detail-list">' +
      detailCard("状态", workbench?.mcp?.status || "not_configured") +
      detailCard("工具", names.length ? names.join(", ") : "暂无") +
      "</div>";
  }
  const checks = byId("inspector-checks");
  if (checks) checks.innerHTML = '<div class="empty-state">暂无 checks 输出</div>';
  const plan = byId("inspector-plan");
  if (plan) plan.innerHTML = '<div class="empty-state">计划会在生成后显示在这里</div>';
  const diff = byId("inspector-diff");
  if (diff) diff.innerHTML = '<div class="empty-state">Patch Diff 会在批准前显示在这里</div>';
  renderRuns(workbench?.recentRuns || []);
}

function renderWorkbench(workbench) {
  state.workbench = workbench;
  const mode = byId("mode-label");
  const network = byId("network-label");
  const model = byId("model-chip");
  if (mode) mode.textContent = state.activeMode === "patch" ? "生成 Patch" : state.activeMode === "security" ? "安全任务" : "对话";
  if (network) network.textContent = workbench?.mcp?.status === "not_configured" ? "本地" : "连接";
  if (model) model.textContent = workbench?.model?.activeModel || workbench?.model?.model || "未配置";
  renderToolList(workbench);
  renderCommands(workbench);
  renderInspector(workbench);
  renderModelManager(workbench);
  renderSettingsManagers(workbench);
}

function renderModelManager(workbench) {
  const target = byId("model-manager");
  if (!target) return;
  target.innerHTML =
    '<div class="detail-card"><small>当前全局模型</small><strong>' +
    escapeHtml(workbench?.model?.activeModel || workbench?.model?.model || "未配置") +
    '</strong><p>项目切换不会改变这里的模型配置。</p></div>';
}

function renderSettingsManagers(workbench) {
  const mcp = byId("mcp-manager");
  if (mcp) mcp.innerHTML = byId("inspector-mcp")?.innerHTML || '<div class="empty-state">暂无 MCP 配置</div>';
  const skills = byId("skills-manager");
  if (skills) skills.innerHTML = '<div class="detail-card"><small>Skills</small><strong>从 /api/skills 读取</strong><p>可在后续连接保存、删除和启停入口。</p></div>';
  const memory = byId("memory-manager");
  if (memory) memory.innerHTML = byId("inspector-memory")?.innerHTML || '<div class="empty-state">暂无记忆</div>';
  const runs = byId("runs-manager");
  if (runs) runs.innerHTML = (workbench?.recentRuns || []).map(createRunSummaryDetails).join("") || '<div class="empty-state">暂无运行记录</div>';
}

async function refreshStatus() {
  try {
    const payload = await fetchJson("/api/workbench");
    renderWorkbench(payload);
  } catch (error) {
    appendMessage("system", "状态读取失败：" + error.message, { skipPersist: true });
  }
}

async function submitChatGoal(goal) {
  const session = await ensureServerSession();
  if (!session) return;
  appendMessage("user", goal, { skipPersist: true });
  const thinking = setThinking("正在读取当前会话与项目上下文，并准备调用模型生成回复。");
  const button = byId("start-run");
  if (button) button.disabled = true;
  try {
    const payload = await fetchJson("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, message: goal }),
    });
    if (thinking) thinking.open = false;
    appendMessage("assistant", payload.reply || "模型没有返回内容。", { skipPersist: true });
    await loadSessions();
  } catch (error) {
    appendMessage("assistant", "调用失败：" + error.message, { skipPersist: true });
  } finally {
    if (button) button.disabled = false;
  }
}

async function executeCommand(command) {
  const value = command.trim();
  if (!value) return;
  if (value === "/clear") {
    const session = await ensureServerSession();
    await fetchJson("/api/sessions/" + encodeURIComponent(session.id) + "/clear", { method: "POST" });
    clearConversation();
    appendMessage("system", "当前会话已清空。", { skipPersist: true });
    return;
  }
  if (value === "/help") {
    appendMessage("assistant", "可用命令：/status、/clear、/model、/mcp、/skills。普通问题请直接输入。");
    return;
  }
  if (value === "/status") {
    await refreshStatus();
    appendMessage("assistant", "工作台状态已刷新。");
    return;
  }
  if (value === "/model" || value === "/models") {
    openSettings("models");
    return;
  }
  if (value === "/mcp") {
    setInspectorTab("mcp");
    openSettings("mcp");
    return;
  }
  if (value === "/skills") {
    openSettings("skills");
    return;
  }
  appendMessage("assistant", "命令已收到：" + value + "。如果需要执行具体任务，请直接描述目标。");
}

async function openProjectFromInput() {
  const input = byId("project-path-input");
  const targetPath = input?.value.trim();
  if (!targetPath) {
    appendMessage("system", "请先输入目标目录路径。", { skipPersist: true });
    return;
  }
  const button = byId("open-project-button");
  if (button) button.disabled = true;
  try {
    const payload = await fetchJson("/api/projects/open", {
      method: "POST",
      body: JSON.stringify({ path: targetPath }),
    });
    state.projects = payload.projects || [];
    state.project = payload.activeProject || state.projects[0] || null;
    state.activeSessionId = null;
    renderProject();
    await loadSessions();
    await refreshStatus();
  } catch (error) {
    appendMessage("system", "打开目录失败：" + error.message, { skipPersist: true });
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitMission() {
  const input = byId("goal-input");
  const goal = input?.value.trim();
  if (!goal) return;
  if (goal.startsWith("/")) {
    input.value = "";
    await executeCommand(goal);
    return;
  }
  input.value = "";
  await submitChatGoal(goal);
}

function setInspectorTab(tab) {
  state.activeInspectorTab = tab;
  document.querySelectorAll(".inspector-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.inspectorTab === tab);
  });
  document.querySelectorAll(".inspector-panel").forEach((panel) => {
    panel.hidden = panel.id !== "inspector-" + tab;
  });
}

function setMobileSection(section) {
  state.activeMobileSection = section;
  document.body.dataset.mobileSection = section;
  document.querySelectorAll("[data-mobile-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mobileTarget === section);
  });
}

function toggleRail(side) {
  const className = side === "left" ? "rail-left-collapsed" : "rail-right-collapsed";
  const collapsed = document.body.classList.toggle(className);
  document.querySelectorAll('[data-rail-toggle="' + side + '"]').forEach((button) => {
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = collapsed ? "展开侧栏" : "收起侧栏";
  });
  localStorage.setItem("ego.workbench.rails", JSON.stringify({
    left: document.body.classList.contains("rail-left-collapsed"),
    right: document.body.classList.contains("rail-right-collapsed"),
  }));
}

function restoreRails() {
  try {
    const rails = JSON.parse(localStorage.getItem("ego.workbench.rails") || "{}");
    if (rails.left) document.body.classList.add("rail-left-collapsed");
    if (rails.right) document.body.classList.add("rail-right-collapsed");
  } catch {
    // ignore bad preference state
  }
}

function togglePanel(panelId) {
  const panel = document.querySelector('[data-collapsible-panel="' + panelId + '"]');
  const body = panel?.querySelector(".panel-body");
  const button = panel?.querySelector("[data-panel-toggle]");
  if (!body || !button) return;
  const collapsed = !body.hidden;
  body.hidden = collapsed;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.classList.toggle("is-collapsed", collapsed);
  const prefs = loadPanelPreferences();
  prefs[panelId] = collapsed;
  localStorage.setItem("ego.workbench.panels", JSON.stringify(prefs));
}

function loadPanelPreferences() {
  try {
    return JSON.parse(localStorage.getItem("ego.workbench.panels") || "{}");
  } catch {
    return {};
  }
}

function restorePanels() {
  const prefs = loadPanelPreferences();
  Object.entries(prefs).forEach(([panelId, collapsed]) => {
    if (!collapsed) return;
    const panel = document.querySelector('[data-collapsible-panel="' + panelId + '"]');
    const body = panel?.querySelector(".panel-body");
    const button = panel?.querySelector("[data-panel-toggle]");
    if (body) body.hidden = true;
    if (button) {
      button.setAttribute("aria-expanded", "false");
      button.classList.add("is-collapsed");
    }
  });
}

function openSettings(tab = "general") {
  byId("settings-page")?.removeAttribute("hidden");
  document.body.classList.add("settings-open");
  setSettingsTab(tab);
}

function closeSettings() {
  byId("settings-page")?.setAttribute("hidden", "");
  document.body.classList.remove("settings-open");
}

function setSettingsTab(tab) {
  const titles = {
    general: ["常规", "控制工作模式、权限和默认行为。"],
    appearance: ["外观", "调整主题、字体大小和信息密度。"],
    models: ["模型", "全局模型配置，项目切换不会覆盖。"],
    mcp: ["MCP 服务器", "管理工具服务器和桥接状态。"],
    skills: ["Skills", "管理本地与插件 Skills。"],
    memory: ["记忆", "查看和清理工作台记忆。"],
    runs: ["运行记录", "审计运行记录保留在这里，不混入会话列表。"],
  };
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTab === tab);
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
  const [title, subtitle] = titles[tab] || titles.general;
  if (byId("settings-title")) byId("settings-title").textContent = title;
  if (byId("settings-subtitle")) byId("settings-subtitle").textContent = subtitle;
}

function loadUiPreferences() {
  try {
    return { theme: "light", fontScale: "compact", density: "normal", ...JSON.parse(localStorage.getItem("ego.workbench.ui") || "{}") };
  } catch {
    return { theme: "light", fontScale: "compact", density: "normal" };
  }
}

function applyUiPreferences() {
  document.body.dataset.theme = state.uiPreferences.theme || "light";
  document.body.dataset.fontScale = state.uiPreferences.fontScale || "compact";
  document.body.dataset.density = state.uiPreferences.density || "normal";
  if (byId("theme-select")) byId("theme-select").value = state.uiPreferences.theme || "light";
  if (byId("font-scale-select")) byId("font-scale-select").value = state.uiPreferences.fontScale || "compact";
  if (byId("density-select")) byId("density-select").value = state.uiPreferences.density || "normal";
}

function saveUiPreferences() {
  localStorage.setItem("ego.workbench.ui", JSON.stringify(state.uiPreferences));
  applyUiPreferences();
}

function updateClock() {
  const clock = byId("clock-label");
  if (clock) clock.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

async function refreshMetrics() {
  try {
    const metrics = await fetchJson("/api/runtime/metrics");
    if (byId("cpu-label")) byId("cpu-label").textContent = "CPU " + Math.round(metrics.cpuPercent ?? 0) + "%";
    if (byId("memory-label")) byId("memory-label").textContent = "RSS " + Math.round((metrics.rssBytes ?? 0) / 1024 / 1024) + " MB";
  } catch {
    // metrics are best effort only
  }
}

function wireEvents() {
  byId("start-run")?.addEventListener("click", submitMission);
  byId("open-project-button")?.addEventListener("click", openProjectFromInput);
  byId("goal-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMission();
    }
  });
  byId("new-session-button")?.addEventListener("click", () => createNewSession());
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.command) {
      const input = byId("goal-input");
      if (input) {
        input.value = target.dataset.command + " ";
        input.focus();
      }
    }
    if (target.dataset.inspectorTab) setInspectorTab(target.dataset.inspectorTab);
    if (target.dataset.inspectorTabShortcut) setInspectorTab(target.dataset.inspectorTabShortcut);
    if (target.dataset.mobileTarget) setMobileSection(target.dataset.mobileTarget);
    if (target.dataset.railToggle) toggleRail(target.dataset.railToggle);
    if (target.dataset.panelToggle) togglePanel(target.dataset.panelToggle);
    if (target.dataset.settingsOpen !== undefined) openSettings("general");
    if (target.dataset.settingsClose !== undefined) closeSettings();
    if (target.dataset.settingsTab) setSettingsTab(target.dataset.settingsTab);
    if (target.dataset.page) openSettings(target.dataset.page);
  });
  ["theme", "font-scale", "density"].forEach((name) => {
    byId(name + "-select")?.addEventListener("change", (event) => {
      const key = name === "font-scale" ? "fontScale" : name;
      state.uiPreferences[key] = event.target.value;
      saveUiPreferences();
    });
  });
}

async function boot() {
  applyUiPreferences();
  restoreRails();
  restorePanels();
  wireEvents();
  updateClock();
  setInterval(updateClock, 1000);
  refreshMetrics();
  setInterval(refreshMetrics, 5000);
  await loadProjectsAndSessions();
  await refreshStatus();
}

boot().catch((error) => {
  console.error(error);
  appendMessage("system", "工作台启动失败：" + error.message, { skipPersist: true });
});`;
}
