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
  slashSelectedIndex: 0,
  permissionMode: localStorage.getItem("ego.workbench.permissionMode") || "ask",
  uiPreferences: loadUiPreferences(),
  railWidths: loadRailWidths(),
  currentRun: null,
};

const legacyAgentEndpoints = ["/agent/runs", "/agent/plans"];
const byId = (id) => document.getElementById(id);

marked.setOptions({ gfm: true, breaks: false });

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

async function refreshSessionListOnly() {
  if (!state.project) return;
  const payload = await fetchJson("/api/sessions?projectId=" + encodeURIComponent(state.project.id));
  state.sessions = payload.sessions || [];
  renderSessions();
}

function renderProject() {
  const project = state.project;
  const values = {
    "active-project-name": project?.name || "当前项目",
    "active-project-path": project?.path || "未选择项目",
    "cwd-label": project?.path || "~/EGO-Graph",
    "settings-current-project-path": project?.path || "未选择项目",
    "new-session-current-path": project?.path || "未选择项目",
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = byId(id);
    if (node) node.textContent = value;
  });
  const projectInput = byId("project-path-input");
  const newSessionInput = byId("new-session-path-input");
  if (projectInput && !projectInput.value) projectInput.value = project?.path || "";
  if (newSessionInput && !newSessionInput.value) newSessionInput.value = project?.path || "";
}

function renderSessions() {
  const list = byId("session-list");
  if (!list) return;
  if (!state.sessions.length) {
    list.innerHTML = '<div class="empty-state">还没有会话</div>';
    return;
  }
  list.replaceChildren(...state.sessions.map(renderSessionItem));
}

function renderSessionItem(session) {
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
  del.innerHTML = '<span class="icon"><svg viewBox="0 0 16 16"><path d="M3 4h10M6 4V3h4v1m-5 2 .5 7h5L11 6"/></svg></span>';
  del.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteSession(session.id);
  });

  item.append(open, del);
  return item;
}

async function createNewSession(options = {}) {
  if (options.path?.trim()) {
    await switchProject(options.path.trim());
  }
  if (!state.project) return null;
  const payload = await fetchJson("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ projectId: state.project.id, title: options.title || "新对话" }),
  });
  const session = payload.session;
  state.sessions = [session, ...state.sessions.filter((item) => item.id !== session.id)];
  state.activeSessionId = session.id;
  renderSessions();
  clearConversation();
  if (!options.silent) appendMessage("system", "已创建新对话。", { skipPersist: true });
  return session;
}

async function switchProject(targetPath) {
  const payload = await fetchJson("/api/projects/open", {
    method: "POST",
    body: JSON.stringify({ path: targetPath }),
  });
  state.projects = payload.projects || [];
  state.project = payload.activeProject || state.projects[0] || null;
  state.activeSessionId = null;
  renderProject();
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
  if (!state.activeSessionId) await createNewSession({ silent: true });
  else await restoreConversation(currentSession());
}

function clearConversation() {
  const conversation = byId("conversation");
  if (!conversation) return;
  conversation.innerHTML =
    '<div class="conversation-empty"><strong>开始新的对话</strong><span>选择工作目录后直接提问，或输入 / 查看命令。</span></div>';
  byId("event-timeline")?.replaceChildren();
  byId("dock-event-list")?.replaceChildren();
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
  messages.forEach((message) => appendMessage(message.role, message.content, { skipPersist: true, runId: message.runId }));
}

function persistMessage(role, content) {
  const session = currentSession();
  if (!session || !String(content || "").trim()) return;
  fetchJson("/api/sessions/" + encodeURIComponent(session.id) + "/messages", {
    method: "POST",
    body: JSON.stringify({ role, content }),
  }).catch((error) => console.warn("message persistence failed", error));
}

function appendMessage(role, body, options = {}) {
  const conversation = byId("conversation");
  if (!conversation) return null;
  conversation.querySelector(".conversation-empty")?.remove();
  const row = document.createElement("article");
  row.className = "message-row role-" + role;
  row.dataset.messageText = String(body || "");
  if (options.runId) row.dataset.runId = options.runId;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = messageAvatarGlyph(role);

  const content = document.createElement("div");
  content.className = "message-content";

  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = messageRoleLabel(role);
  content.append(label);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  renderMarkdown(bubble, body);
  content.append(bubble);

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML =
      '<button type="button" class="message-action" data-copy-message>复制</button>' +
      '<button type="button" class="message-action" data-remember-message>记忆</button>' +
      '<button type="button" class="message-action" data-inspector-tab-shortcut="runs">事件</button>';
    content.append(actions);
  }

  row.append(avatar, content);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  if (!options.skipPersist && role !== "system") persistMessage(role, String(body || ""));
  return row;
}

function messageRoleLabel(role) {
  if (role === "assistant") return "lotus";
  if (role === "user") return "你";
  if (role === "system") return "系统";
  return role;
}

function messageAvatarGlyph(role) {
  if (role === "assistant") return "L";
  if (role === "user") return "你";
  if (role === "system") return "!";
  return String(role || "?").slice(0, 1).toUpperCase();
}

function createRunBubble() {
  const conversation = byId("conversation");
  if (!conversation) return null;
  conversation.querySelector(".conversation-empty")?.remove();
  const row = document.createElement("article");
  row.className = "message-row role-assistant run-progress";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "L";
  const content = document.createElement("div");
  content.className = "message-content";
  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = "lotus";
  content.append(label);
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const details = document.createElement("details");
  details.className = "thinking-block";
  details.innerHTML = '<summary><span class="status-dot warning"></span>思考与执行过程</summary><div class="event-flow"></div>';
  const answer = document.createElement("div");
  answer.className = "stream-answer markdown-body";
  answer.textContent = "正在读取当前会话与项目上下文...";
  bubble.append(details, answer);
  content.append(bubble);
  row.append(avatar, content);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  return { row, details, flow: details.querySelector(".event-flow"), answer };
}

function permissionModeToLevel(mode = state.permissionMode) {
  if (mode === "full") return "security-active";
  if (mode === "auto") return "shell-readonly";
  return "read-only";
}

function modeLabel(mode = state.activeMode) {
  if (mode === "patch") return "生成 Patch";
  if (mode === "security") return "安全任务";
  return "对话";
}

function addTimelineEvent(event) {
  const label = event.event || event.type || "event";
  const message = event.message || "";
  const itemHtml =
    '<div class="timeline-row"><strong>' +
    escapeHtml(label) +
    '</strong><span>' +
    escapeHtml(message).slice(0, 140) +
    "</span></div>";
  byId("event-timeline")?.insertAdjacentHTML("beforeend", itemHtml);
  byId("dock-event-list")?.insertAdjacentHTML("beforeend", itemHtml);
}

function appendRunEvent(flow, line) {
  if (!flow) return;
  const row = document.createElement("div");
  row.className = "run-event-line";
  row.innerHTML =
    '<strong>' +
    escapeHtml(line.event || line.type || "event") +
    '</strong><span>' +
    escapeHtml(line.message || JSON.stringify(line.payload || {})) +
    "</span>";
  flow.append(row);
}

function handleHarnessLine(line, runUi) {
  if (!line || !runUi) return;
  addTimelineEvent(line);
  appendRunEvent(runUi.flow, line);
  if (line.runId) state.currentRun = line.runId;

  if (line.type === "agent.event") {
    if (line.event === "assistant.delta" || line.event === "assistant.message" || line.event === "assistant.completed") {
      const text = line.message || "";
      if (text) renderMarkdown(runUi.answer, text);
    }
    if (line.event === "permission.requested") {
      setInspectorTab("checks");
      const checks = byId("inspector-checks");
      if (checks) {
        checks.innerHTML =
          '<div class="approval-card"><strong>需要批准</strong><p>' +
          escapeHtml(line.message || "Agent 请求权限") +
          '</p><button class="confirm-action" type="button" data-approve-run="' +
          escapeHtml(line.runId || "") +
          '">批准继续</button></div>';
      }
    }
  }
  if (line.type === "assistant.final") {
    renderMarkdown(runUi.answer, line.message || "Agent 没有返回最终文本。");
    runUi.row.dataset.messageText = line.message || "";
    runUi.row.dataset.runId = line.runId || "";
    runUi.row.classList.remove("run-progress");
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML =
      '<button type="button" class="message-action" data-copy-message>复制</button>' +
      '<button type="button" class="message-action" data-remember-message>记忆</button>' +
      '<button type="button" class="message-action" data-inspector-tab-shortcut="runs">事件</button>';
    runUi.row.querySelector(".message-content")?.append(actions);
  }
  if (line.type === "error") {
    runUi.answer.innerHTML = '<div class="error-card"><strong>运行失败</strong><p>' + escapeHtml(line.message || "未知错误") + "</p></div>";
  }
}

async function submitChatGoal(goal) {
  const session = await ensureServerSession();
  if (!session) return;
  appendMessage("user", goal, { skipPersist: true });
  const runUi = createRunBubble();
  const button = byId("start-run");
  if (button) button.disabled = true;
  try {
    const response = await fetch("/agent/harness/runs/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        message: goal,
        mode: state.activeMode,
        permissionLevel: permissionModeToLevel(),
      }),
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || response.statusText || "Agent stream failed");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const raw of lines) {
        if (!raw.trim()) continue;
        handleHarnessLine(JSON.parse(raw), runUi);
      }
    }
    if (buffer.trim()) handleHarnessLine(JSON.parse(buffer), runUi);
    await refreshSessionListOnly();
    await refreshStatus();
  } catch (error) {
    appendMessage("assistant", "模型调用失败：" + error.message, { skipPersist: true });
  } finally {
    if (button) button.disabled = false;
  }
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

function createRunSummaryDetails(run) {
  return (
    '<div class="detail-card"><small>' +
    escapeHtml(run.status || "run") +
    '</small><strong>' +
    escapeHtml(run.id || run.runId || "run") +
    '</strong><span>' +
    escapeHtml(formatRelativeTime(run.updatedAt || run.createdAt)) +
    "</span></div>"
  );
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
      detailCard("模式", modeLabel()) +
      detailCard("权限", permissionModeToLevel()) +
      detailCard("模型", workbench?.model?.activeModel || workbench?.model?.model || "未配置") +
      "</div>";
  }
  const checks = byId("inspector-checks");
  if (checks && !checks.innerHTML.trim()) checks.innerHTML = '<div class="empty-state">暂无检查输出</div>';
  const plan = byId("inspector-plan");
  if (plan && !plan.innerHTML.trim()) plan.innerHTML = '<div class="empty-state">计划会在生成后显示在这里。</div>';
  const diff = byId("inspector-diff");
  if (diff && !diff.innerHTML.trim()) diff.innerHTML = '<div class="empty-state">Patch Diff 会在批准前显示在这里。</div>';
  renderRuns(workbench?.recentRuns || []);
}

function renderWorkbench(payload) {
  const workbench = payload.workbench || payload;
  state.workbench = workbench;
  if (byId("mode-label")) byId("mode-label").textContent = modeLabel();
  if (byId("network-label")) byId("network-label").textContent = workbench?.mcp?.status === "not_configured" ? "本地" : "连接";
  if (byId("model-chip")) byId("model-chip").textContent = workbench?.model?.activeModel || workbench?.model?.model || "未配置";
  renderCommands(workbench);
  renderInspector(workbench);
  renderModelManager(workbench);
  renderSettingsManagers(workbench);
}

function renderCommands(workbench) {
  const defaults = ["/help", "/model", "/models", "/plan", "/patch", "/scan", "/memory", "/skills", "/mcp", "/prompt", "/compact", "/status", "/clear"];
  state.commandsRegistry = (workbench?.commands?.length ? workbench.commands : defaults).slice(0, 14);
}

const commandDescriptions = {
  "/help": "显示可用命令",
  "/status": "刷新工作台状态",
  "/model": "打开模型设置",
  "/models": "打开模型设置",
  "/mcp": "管理 MCP 服务器",
  "/skills": "管理 Skills",
  "/memory": "查看记忆",
  "/plan": "切换到计划视图",
  "/patch": "切换到 Patch 模式",
  "/scan": "切换到安全任务模式",
  "/prompt": "查看系统提示入口",
  "/compact": "压缩当前上下文",
  "/clear": "清空当前会话",
};

function commandLabel(command) {
  return commandDescriptions[command] || "执行 " + command;
}

function filteredCommands(query = "") {
  const commands = state.commandsRegistry.length ? state.commandsRegistry : Object.keys(commandDescriptions);
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized === "/") return commands.slice(0, 10);
  return commands.filter((command) => command.toLowerCase().includes(normalized)).slice(0, 10);
}

function openSlashMenu(query = "/") {
  state.slashSelectedIndex = 0;
  renderSlashMenu(query);
  const menu = byId("slash-menu");
  if (menu) menu.hidden = false;
}

function closeSlashMenu() {
  const menu = byId("slash-menu");
  if (menu) menu.hidden = true;
}

function renderSlashMenu(query) {
  const menu = byId("slash-menu");
  if (!menu) return;
  const inputValue = query ?? byId("goal-input")?.value ?? "/";
  const matches = filteredCommands(inputValue);
  if (!inputValue.trim().startsWith("/") || !matches.length) {
    menu.hidden = true;
    menu.replaceChildren();
    return;
  }
  menu.innerHTML =
    '<div class="slash-menu-header"><strong>命令</strong><span>Enter 选择，继续输入可筛选</span></div>' +
    matches
      .map(
        (command, index) =>
          '<button type="button" class="slash-command-option ' +
          (index === state.slashSelectedIndex ? "active" : "") +
          '" data-command="' +
          escapeHtml(command) +
          '"><code>' +
          escapeHtml(command) +
          "</code><span>" +
          escapeHtml(commandLabel(command)) +
          "</span></button>",
      )
      .join("");
  menu.hidden = false;
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
    appendMessage("assistant", "| 命令 | 作用 |\n| --- | --- |\n| /status | 刷新状态 |\n| /patch | 进入 Patch 模式 |\n| /scan | 进入安全任务模式 |\n| /mcp | 打开 MCP 设置 |\n| /skills | 打开 Skills 设置 |\n| /clear | 清空当前会话 |", { skipPersist: true });
    return;
  }
  if (value === "/status") {
    await refreshStatus();
    appendMessage("assistant", "工作台状态已刷新。", { skipPersist: true });
    return;
  }
  if (value === "/patch") {
    setMode("patch");
    return;
  }
  if (value === "/scan") {
    setMode("security");
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
  if (value === "/memory") {
    setInspectorTab("memory");
    await loadMemoryPanel();
    return;
  }
  appendMessage("assistant", "命令已收到：" + value + "。如果需要执行具体任务，请直接描述目标。", { skipPersist: true });
}

async function submitMission() {
  const input = byId("goal-input");
  const goal = input?.value.trim();
  if (!goal) return;
  closeSlashMenu();
  input.value = "";
  if (goal.startsWith("/")) {
    await executeCommand(goal);
    return;
  }
  await submitChatGoal(goal);
}

function setMode(mode) {
  state.activeMode = mode;
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  if (byId("mode-label")) byId("mode-label").textContent = modeLabel(mode);
  if (mode === "patch") setInspectorTab("plan");
  if (mode === "security") setInspectorTab("checks");
  renderInspector(state.workbench);
}

function setInspectorTab(tab) {
  state.activeInspectorTab = tab;
  document.querySelectorAll(".inspector-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.inspectorTab === tab);
  });
  document.querySelectorAll(".inspector-panel").forEach((panel) => {
    panel.hidden = panel.id !== "inspector-" + tab;
  });
  if (tab === "memory") loadMemoryPanel();
  if (tab === "mcp") loadMcpInspector();
  if (tab === "runs") renderRuns(state.workbench?.recentRuns || []);
}

async function loadMemoryPanel() {
  const target = byId("inspector-memory");
  if (!target) return;
  target.innerHTML = '<div class="empty-state">正在读取记忆...</div>';
  try {
    const payload = await fetchJson("/api/memory");
    const memories = payload.memories || [];
    target.innerHTML = memories.length
      ? '<div class="detail-list">' + memories.map((item) => detailCard(item.scope || "memory", item.content || item.id)).join("") + "</div>"
      : '<div class="empty-state">暂无记忆</div>';
  } catch (error) {
    target.innerHTML = '<div class="empty-state">记忆读取失败：' + escapeHtml(error.message) + "</div>";
  }
}

async function loadMcpInspector() {
  const target = byId("inspector-mcp");
  if (!target) return;
  target.innerHTML = '<div class="empty-state">正在读取 MCP...</div>';
  try {
    const payload = await fetchJson("/api/mcp/servers");
    const servers = payload.servers || [];
    target.innerHTML =
      '<div class="detail-list">' +
      detailCard("状态", servers.length ? "configured" : "not_configured") +
      detailCard("服务器", servers.length ? servers.map((server) => server.name).join(", ") : "暂无") +
      '</div><button class="settings-open-button" type="button" data-settings-open data-page="mcp">管理 MCP</button>';
  } catch (error) {
    target.innerHTML = '<div class="empty-state">MCP 读取失败：' + escapeHtml(error.message) + "</div>";
  }
}

function renderModelManager(workbench) {
  const target = byId("model-manager");
  if (!target) return;
  target.innerHTML =
    '<div class="detail-card"><small>当前全局模型</small><strong>' +
    escapeHtml(workbench?.model?.activeModel || workbench?.model?.model || "未配置") +
    "</strong><p>项目切换不会改变这里的模型配置。</p></div>";
}

function renderSettingsManagers(workbench) {
  if (byId("mcp-manager")) loadMcpSettings();
  if (byId("skills-manager")) loadSkillsSettings();
  const memory = byId("memory-manager");
  if (memory) memory.innerHTML = byId("inspector-memory")?.innerHTML || '<div class="empty-state">暂无记忆</div>';
  const runs = byId("runs-manager");
  if (runs) runs.innerHTML = (workbench?.recentRuns || []).map((run) => detailCard(run.status || "run", run.id || run.runId)).join("") || '<div class="empty-state">暂无运行记录</div>';
}

async function loadMcpSettings() {
  const target = byId("mcp-manager");
  if (!target) return;
  target.innerHTML = '<div class="empty-state">正在读取 MCP 配置...</div>';
  try {
    const payload = await fetchJson("/api/mcp/servers");
    const servers = payload.servers || [];
    target.innerHTML = servers.length
      ? servers
          .map(
            (server) =>
              '<div class="connector-item"><div><strong>' +
              escapeHtml(server.name) +
              '</strong><small>' +
              escapeHtml(server.transport || "stdio") +
              " · " +
              escapeHtml(server.command || server.url || "") +
              '</small></div><span class="connector-status ' +
              (server.enabled === false ? "muted" : "online") +
              '">' +
              (server.enabled === false ? "disabled" : "enabled") +
              '</span><button type="button" class="message-action" data-test-mcp="' +
              escapeHtml(server.name) +
              '">测试</button><button type="button" class="message-action danger" data-delete-mcp="' +
              escapeHtml(server.name) +
              '">删除</button></div>',
          )
          .join("")
      : '<div class="empty-state">暂无 MCP。填写上方表单即可接入。</div>';
  } catch (error) {
    target.innerHTML = '<div class="empty-state">MCP 读取失败：' + escapeHtml(error.message) + "</div>";
  }
}

async function loadSkillsSettings() {
  const target = byId("skills-manager");
  if (!target) return;
  target.innerHTML = '<div class="empty-state">正在读取 Skills...</div>';
  try {
    const payload = await fetchJson("/api/skills");
    const skills = payload.skills || [];
    target.innerHTML = skills.length
      ? skills
          .map(
            (skill) =>
              '<div class="connector-item"><div><strong>' +
              escapeHtml(skill.name) +
              '</strong><small>' +
              escapeHtml(skill.description || skill.source || "") +
              '</small></div><span class="connector-status ' +
              (skill.enabled === false ? "muted" : "online") +
              '">' +
              escapeHtml(skill.enabled === false ? "disabled" : skill.version || "enabled") +
              '</span>' +
              (skill.source === "local"
                ? '<button type="button" class="message-action danger" data-delete-skill="' + escapeHtml(skill.name) + '">删除</button>'
                : "") +
              "</div>",
          )
          .join("")
      : '<div class="empty-state">暂无 Skills。填写上方表单即可注册本地 Skill。</div>';
  } catch (error) {
    target.innerHTML = '<div class="empty-state">Skills 读取失败：' + escapeHtml(error.message) + "</div>";
  }
}

async function saveMcpServer(event) {
  event?.preventDefault();
  const name = byId("mcp-server-name")?.value.trim();
  const transport = byId("mcp-server-transport")?.value || "stdio";
  const commandOrUrl = byId("mcp-server-command")?.value.trim();
  const args = (byId("mcp-server-args")?.value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!name || !commandOrUrl) {
    appendMessage("system", "请先填写 MCP 名称和命令 / URL。", { skipPersist: true });
    return;
  }
  await fetchJson("/api/mcp/servers", {
    method: "POST",
    body: JSON.stringify({
      name,
      transport,
      ...(transport === "http" ? { url: commandOrUrl } : { command: commandOrUrl, args }),
      enabled: true,
    }),
  });
  appendMessage("system", "MCP 服务器已保存：" + name, { skipPersist: true });
  await loadMcpSettings();
  await refreshStatus();
}

async function testMcpServerFromForm() {
  const name = byId("mcp-server-name")?.value.trim();
  if (!name) {
    appendMessage("system", "请先输入要测试的 MCP 名称。", { skipPersist: true });
    return;
  }
  const payload = await fetchJson("/api/mcp/servers/" + encodeURIComponent(name) + "/test", { method: "POST" });
  appendMessage("assistant", "MCP 测试结果：" + (payload.ok ? "connected" : payload.error || "failed"), { skipPersist: true });
}

async function saveSkill(event) {
  event?.preventDefault();
  const name = byId("skill-name")?.value.trim();
  const description = byId("skill-description")?.value.trim();
  const entry = byId("skill-entry")?.value.trim();
  const version = byId("skill-version")?.value.trim() || "0.1.0";
  const capabilities = (byId("skill-capabilities")?.value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!name || !description || !entry) {
    appendMessage("system", "请填写 Skill 名称、描述和入口。", { skipPersist: true });
    return;
  }
  await fetchJson("/api/skills", {
    method: "POST",
    body: JSON.stringify({ name, version, description, entry, capabilities, enabled: true }),
  });
  appendMessage("system", "Skill 已保存：" + name, { skipPersist: true });
  await loadSkillsSettings();
}

async function deleteMcpServer(name) {
  await fetchJson("/api/mcp/servers/" + encodeURIComponent(name), { method: "DELETE" });
  await loadMcpSettings();
  await refreshStatus();
}

async function deleteSkill(name) {
  await fetchJson("/api/skills/" + encodeURIComponent(name), { method: "DELETE" });
  await loadSkillsSettings();
}

async function runTerminalCommand() {
  const input = byId("terminal-command-input");
  const output = byId("terminal-output");
  const command = input?.value.trim();
  if (!command || !output) return;
  const session = await ensureServerSession();
  output.textContent += "\n$ " + command + "\n";
  input.value = "";
  try {
    const response = await fetch("/api/terminal/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        command,
        cwd: state.project?.path,
        permissionLevel: permissionModeToLevel(),
      }),
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || response.statusText || "command failed");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const raw of lines) appendTerminalLine(raw, output);
    }
    if (buffer.trim()) appendTerminalLine(buffer, output);
  } catch (error) {
    output.textContent += "Error: " + error.message + "\n";
  } finally {
    output.scrollTop = output.scrollHeight;
  }
}

function appendTerminalLine(raw, output) {
  if (!raw.trim()) return;
  const line = JSON.parse(raw);
  if (line.type === "terminal.stdout" || line.type === "terminal.stderr") output.textContent += line.text;
  if (line.type === "terminal.completed") output.textContent += "\n[exit " + line.exitCode + "]\n";
  if (line.type === "terminal.error") output.textContent += "\n[error] " + line.message + "\n";
}

async function refreshStatus() {
  try {
    const payload = await fetchJson("/api/workbench");
    renderWorkbench(payload);
  } catch (error) {
    appendMessage("system", "状态读取失败：" + error.message, { skipPersist: true });
  }
}

async function refreshMetrics() {
  try {
    const metrics = await fetchJson("/api/runtime/metrics");
    if (byId("cpu-label")) byId("cpu-label").textContent = "CPU " + Math.round(metrics.cpuPercent ?? 0) + "%";
    if (byId("memory-label")) byId("memory-label").textContent = "RSS " + Math.round((metrics.rssBytes ?? 0) / 1024 / 1024) + " MB";
  } catch {
    // best effort
  }
}

function openProjectFromInput() {
  const input = byId("project-path-input");
  const targetPath = input?.value.trim();
  if (!targetPath) return;
  switchProject(targetPath)
    .then(loadSessions)
    .then(refreshStatus)
    .catch((error) => appendMessage("system", "打开目录失败：" + error.message, { skipPersist: true }));
}

function openNewSessionDialog() {
  const dialog = byId("new-session-dialog");
  const pathInput = byId("new-session-path-input");
  const titleInput = byId("new-session-title-input");
  if (pathInput) pathInput.value = state.project?.path || "";
  if (titleInput) titleInput.value = "";
  dialog?.removeAttribute("hidden");
  setTimeout(() => pathInput?.focus(), 0);
}

function closeNewSessionDialog() {
  byId("new-session-dialog")?.setAttribute("hidden", "");
}

async function createSessionFromDialog() {
  const path = byId("new-session-path-input")?.value.trim();
  const title = byId("new-session-title-input")?.value.trim() || "新对话";
  const button = byId("confirm-new-session");
  if (button) button.disabled = true;
  try {
    await createNewSession({ path, title, silent: true });
    closeNewSessionDialog();
  } catch (error) {
    appendMessage("system", "创建会话失败：" + error.message, { skipPersist: true });
  } finally {
    if (button) button.disabled = false;
  }
}

function setPermissionMode(mode) {
  state.permissionMode = mode;
  localStorage.setItem("ego.workbench.permissionMode", mode);
  document.querySelectorAll("[data-permission-mode]").forEach((button) => {
    const active = button.dataset.permissionMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const trigger = byId("permission-trigger");
  if (trigger) {
    trigger.textContent = mode === "full" ? "完全访问" : mode === "auto" ? "替我批准" : "请求批准";
    trigger.setAttribute("aria-expanded", "false");
  }
  const menu = byId("permission-menu");
  if (menu) menu.hidden = true;
  renderInspector(state.workbench);
}

function togglePermissionMenu() {
  const menu = byId("permission-menu");
  const trigger = byId("permission-trigger");
  if (!menu) return;
  menu.hidden = !menu.hidden;
  trigger?.setAttribute("aria-expanded", String(!menu.hidden));
}

function handleAttachmentSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  appendMessage("system", "已选择附件：" + files.map((file) => file.name).join("、") + "。当前版本先保留入口，后续可接入上传和工作区引用。", { skipPersist: true });
  event.target.value = "";
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
  localStorage.setItem("ego.workbench.rails", JSON.stringify({
    left: document.body.classList.contains("rail-left-collapsed"),
    right: document.body.classList.contains("rail-right-collapsed"),
  }));
  document.querySelectorAll('[data-rail-toggle="' + side + '"]').forEach((button) => {
    button.setAttribute("aria-expanded", String(!collapsed));
  });
}

function restoreRails() {
  try {
    const rails = JSON.parse(localStorage.getItem("ego.workbench.rails") || "{}");
    if (rails.left) document.body.classList.add("rail-left-collapsed");
    if (rails.right) document.body.classList.add("rail-right-collapsed");
  } catch {}
}

function loadRailWidths() {
  try {
    return { left: 268, right: 330, ...JSON.parse(localStorage.getItem("ego.workbench.railWidths") || "{}") };
  } catch {
    return { left: 268, right: 330 };
  }
}

function applyRailWidths() {
  document.documentElement.style.setProperty("--left-rail-width", state.railWidths.left + "px");
  document.documentElement.style.setProperty("--right-rail-width", state.railWidths.right + "px");
}

function initRailResize() {
  document.querySelectorAll("[data-rail-resizer]").forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      const side = resizer.dataset.railResizer;
      const startX = event.clientX;
      const startWidth = state.railWidths[side];
      resizer.setPointerCapture(event.pointerId);
      const onMove = (moveEvent) => {
        const delta = side === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        const next = Math.max(48, Math.min(480, startWidth + delta));
        state.railWidths[side] = next;
        if (side === "left") document.body.classList.toggle("rail-left-collapsed", next < 120);
        if (side === "right") document.body.classList.toggle("rail-right-collapsed", next < 120);
        applyRailWidths();
      };
      const onUp = () => {
        localStorage.setItem("ego.workbench.railWidths", JSON.stringify(state.railWidths));
        resizer.removeEventListener("pointermove", onMove);
        resizer.removeEventListener("pointerup", onUp);
      };
      resizer.addEventListener("pointermove", onMove);
      resizer.addEventListener("pointerup", onUp);
    });
  });
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
}

function setDockTab(tab) {
  document.querySelectorAll(".dock-tab").forEach((button) => button.classList.toggle("active", button.dataset.dockTab === tab));
  document.querySelectorAll(".dock-panel").forEach((panel) => {
    panel.hidden = panel.id !== "dock-" + tab;
  });
}

function toggleBottomDock() {
  const dock = byId("bottom-dock");
  if (!dock) return;
  const collapsed = dock.classList.toggle("is-collapsed");
  const reopen = document.querySelector(".dock-reopen");
  if (reopen) reopen.hidden = !collapsed;
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
  document.querySelectorAll("[data-settings-tab]").forEach((button) => button.classList.toggle("active", button.dataset.settingsTab === tab));
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
  const pair = titles[tab] || titles.general;
  if (byId("settings-title")) byId("settings-title").textContent = pair[0];
  if (byId("settings-subtitle")) byId("settings-subtitle").textContent = pair[1];
  if (tab === "mcp") loadMcpSettings();
  if (tab === "skills") loadSkillsSettings();
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

function wireEvents() {
  byId("start-run")?.addEventListener("click", submitMission);
  byId("permission-trigger")?.addEventListener("click", togglePermissionMenu);
  byId("open-project-button")?.addEventListener("click", openProjectFromInput);
  byId("mcp-server-form")?.addEventListener("submit", saveMcpServer);
  byId("test-mcp-server")?.addEventListener("click", testMcpServerFromForm);
  byId("skill-form")?.addEventListener("submit", saveSkill);
  byId("attachment-button")?.addEventListener("click", () => byId("attachment-input")?.click());
  byId("attachment-input")?.addEventListener("change", handleAttachmentSelection);
  byId("run-terminal-command")?.addEventListener("click", runTerminalCommand);
  byId("terminal-command-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runTerminalCommand();
  });
  byId("slash-trigger")?.addEventListener("click", () => {
    const input = byId("goal-input");
    if (input && !input.value.trim().startsWith("/")) input.value = "/";
    input?.focus();
    openSlashMenu(input?.value || "/");
  });
  byId("goal-input")?.addEventListener("input", (event) => {
    const value = event.target.value;
    if (value.trim().startsWith("/")) openSlashMenu(value);
    else closeSlashMenu();
  });
  byId("goal-input")?.addEventListener("keydown", (event) => {
    const menu = byId("slash-menu");
    if (menu && !menu.hidden && ["ArrowDown", "ArrowUp", "Escape", "Enter"].includes(event.key)) {
      event.preventDefault();
      const matches = filteredCommands(event.currentTarget.value);
      if (event.key === "Escape") return closeSlashMenu();
      if (event.key === "Enter") {
        const trimmed = event.currentTarget.value.trim();
        if (trimmed !== "/" && Object.prototype.hasOwnProperty.call(commandDescriptions, trimmed)) {
          closeSlashMenu();
          submitMission();
          return;
        }
        const selected = matches[Math.min(state.slashSelectedIndex, Math.max(0, matches.length - 1))];
        if (selected) event.currentTarget.value = selected + " ";
        closeSlashMenu();
        return;
      }
      if (matches.length) {
        state.slashSelectedIndex = (state.slashSelectedIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        renderSlashMenu(event.currentTarget.value);
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMission();
    }
  });
  byId("new-session-button")?.addEventListener("click", openNewSessionDialog);
  byId("confirm-new-session")?.addEventListener("click", createSessionFromDialog);
  byId("use-current-project")?.addEventListener("click", () => {
    const input = byId("new-session-path-input");
    if (input) input.value = state.project?.path || "";
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.command) {
      const input = byId("goal-input");
      if (input) {
        input.value = target.dataset.command + " ";
        input.focus();
      }
      closeSlashMenu();
    }
    if (target.dataset.copyMessage !== undefined) {
      const row = target.closest(".message-row");
      navigator.clipboard?.writeText(row?.dataset.messageText || "");
      target.textContent = "已复制";
      setTimeout(() => (target.textContent = "复制"), 1200);
    }
    if (target.dataset.rememberMessage !== undefined) {
      setInspectorTab("memory");
      loadMemoryPanel();
    }
    if (target.dataset.permissionMode) setPermissionMode(target.dataset.permissionMode);
    if (target.dataset.testMcp) testNamedMcp(target.dataset.testMcp);
    if (target.dataset.deleteMcp) deleteMcpServer(target.dataset.deleteMcp);
    if (target.dataset.deleteSkill) deleteSkill(target.dataset.deleteSkill);
    if (target.dataset.inspectorTab) setInspectorTab(target.dataset.inspectorTab);
    if (target.dataset.inspectorTabShortcut) setInspectorTab(target.dataset.inspectorTabShortcut);
    if (target.dataset.mobileTarget) setMobileSection(target.dataset.mobileTarget);
    if (target.dataset.railToggle) toggleRail(target.dataset.railToggle);
    if (target.dataset.panelToggle) togglePanel(target.dataset.panelToggle);
    if (target.dataset.mode) setMode(target.dataset.mode);
    if (target.dataset.settingsOpen !== undefined) openSettings(target.dataset.page || "general");
    if (target.dataset.settingsClose !== undefined) closeSettings();
    if (target.dataset.settingsTab) setSettingsTab(target.dataset.settingsTab);
    if (target.dataset.newSessionOpen !== undefined) openNewSessionDialog();
    if (target.dataset.newSessionClose !== undefined) closeNewSessionDialog();
    if (target.dataset.dockTab) setDockTab(target.dataset.dockTab);
    if (target.dataset.bottomDockToggle !== undefined) toggleBottomDock();
  });
  ["theme", "font-scale", "density"].forEach((name) => {
    byId(name + "-select")?.addEventListener("change", (event) => {
      const key = name === "font-scale" ? "fontScale" : name;
      state.uiPreferences[key] = event.target.value;
      saveUiPreferences();
    });
  });
}

async function testNamedMcp(name) {
  try {
    const payload = await fetchJson("/api/mcp/servers/" + encodeURIComponent(name) + "/test", { method: "POST" });
    appendMessage("assistant", "MCP 测试结果：" + (payload.ok ? "connected" : payload.error || "failed"), { skipPersist: true });
  } catch (error) {
    appendMessage("system", "MCP 测试失败：" + error.message, { skipPersist: true });
  }
}

async function boot() {
  applyUiPreferences();
  applyRailWidths();
  restoreRails();
  initRailResize();
  wireEvents();
  setPermissionMode(state.permissionMode);
  updateClock();
  setInterval(updateClock, 1000);
  refreshMetrics();
  setInterval(refreshMetrics, 5000);
  await loadProjectsAndSessions();
  await refreshStatus();
  console.debug("legacy endpoints kept for compatibility", legacyAgentEndpoints);
  const reopenBtn = document.querySelector(".dock-reopen");
  if (reopenBtn) reopenBtn.hidden = byId("bottom-dock")?.classList.contains("is-collapsed") ?? false;
}

boot().catch((error) => {
  console.error(error);
  appendMessage("system", "工作台启动失败：" + error.message, { skipPersist: true });
});`;
}
