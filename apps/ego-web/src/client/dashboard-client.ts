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
  runEvents: [],
  secure: {
    scopes: [],
    grants: [],
    replayEvents: [],
    reproBundle: null,
    evalArtifacts: null,
    toolCapabilities: null,
  },
};

const legacyAgentEndpoints = ["/agent/runs", "/agent/plans"];
const byId = (id) => document.getElementById(id);

function scrollConversationToBottom() {
  const conversation = byId("conversation");
  if (conversation) conversation.scrollTop = conversation.scrollHeight;
}

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
  list.replaceChildren();
  if (!state.sessions.length) {
    list.innerHTML = '<div class="empty-state">还没有会话</div>';
    return;
  }

  // Group sessions by project id, preserving first-seen order.
  const groups = new Map();
  for (const session of state.sessions) {
    const key = session.projectId || "default";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }

  const fragment = document.createDocumentFragment();
  for (const [projectId, sessions] of groups) {
    const header = document.createElement("div");
    header.className = "session-group";
    const projectName = (projectId === state.project?.id && state.project?.name) ? state.project.name : "项目";
    header.innerHTML =
      '<button type="button" class="session-group-toggle" aria-expanded="true">' +
      '<span class="icon"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"></path></svg></span>' +
      escapeHtml(projectName) +
      '<span class="session-group-count">' + sessions.length + '</span>' +
      '</button>';
    fragment.append(header);

    const groupList = document.createElement("div");
    groupList.className = "session-group-items";
    for (const session of sessions) {
      groupList.append(renderSessionItem(session));
    }
    fragment.append(groupList);
  }
  list.append(fragment);
}

function renderSessionItem(session) {
  const item = document.createElement("div");
  item.className = "session-item" + (session.id === state.activeSessionId ? " active" : "");

  const open = document.createElement("button");
  open.type = "button";
  open.className = "session-open";
  open.innerHTML =
    '<span class="session-dot"></span>' +
    '<span class="session-text"><strong>' + escapeHtml(session.title || "新对话") + '</strong>' +
    '<small>' + escapeHtml(formatRelativeTime(session.updatedAt)) + '</small></span>';
  open.addEventListener("click", () => selectSession(session.id));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "session-delete";
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
  // Restore keyboard focus on the newly-active session row.
  // (renderSessions replaces the DOM, destroying focus; this fixes that.)
  byId("session-list")?.querySelector(".session-item.active .session-open")?.focus();
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

  // Hover actions. Assistant: copy/remember/events. User: copy/edit (re-send).
  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML =
      '<button type="button" class="message-action" data-copy-message>复制</button>' +
      '<button type="button" class="message-action" data-remember-message>记忆</button>' +
      '<button type="button" class="message-action" data-inspector-tab-shortcut="runs">事件</button>';
    content.append(actions);
  } else if (role === "user") {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML =
      '<button type="button" class="message-action" data-copy-message>复制</button>' +
      '<button type="button" class="message-action" data-edit-message aria-label="重新发送这条消息">重新发送</button>';
    content.append(actions);
  }

  row.append(avatar, content);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  if (!options.skipPersist && role !== "system") persistMessage(role, String(body || ""));
  return row;
}

function editUserMessage(row) {
  const text = String(row?.dataset?.messageText || "");
  const input = byId("goal-input");
  if (input) {
    input.value = text;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }
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
  const thinking = document.createElement("details");
  thinking.className = "stream-thinking";
  thinking.hidden = true;
  thinking.innerHTML = '<summary>思考过程</summary><div class="stream-thinking-body"></div>';
  const answer = document.createElement("div");
  answer.className = "stream-answer markdown-body";
  answer.textContent = "正在读取当前会话与项目上下文...";
  bubble.append(details, thinking, answer);
  content.append(bubble);
  row.append(avatar, content);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  return { row, details, flow: details.querySelector(".event-flow"), thinking, thinkingBody: thinking.querySelector(".stream-thinking-body"), answer, answerBuffer: "", thinkingBuffer: "", hasStreamed: false };
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

function modelDisplayName(model) {
  return model?.activeModel || model?.model || model?.label || model?.name || "未配置";
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

function toStringMessage(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function handleHarnessLine(line, runUi) {
  if (!line || !runUi) return;
  const isDelta = line.type === "agent.event" && line.event === "assistant.delta";
  if (!isDelta) {
    state.runEvents.push(normalizeHarnessEvent(line));
    state.secure.replayEvents = state.runEvents.slice(-300);
    renderSecureAutonomyPanels();
  }
  // Streaming deltas are incremental token fragments; recording each one into the
  // timeline/event-flow would flood the page with garbled fragments.
  if (!isDelta) {
    addTimelineEvent(line);
    appendRunEvent(runUi.flow, line);
  }
  if (line.runId) state.currentRun = line.runId;

  if (line.type === "agent.event") {
    if (line.event === "assistant.delta") {
      // Reasoning arrives as a cumulative snapshot; show it in a collapsed
      // "思考过程" area that stays hidden until the user clicks to expand.
      const text = toStringMessage(line.message);
      if (text) {
        runUi.thinkingBuffer = text;
        runUi.hasStreamed = true;
        if (runUi.thinkingBody) runUi.thinkingBody.textContent = text;
        if (runUi.thinking) runUi.thinking.hidden = false;
        scrollConversationToBottom();
      }
    } else if (line.event === "assistant.message" || line.event === "assistant.completed") {
      const text = toStringMessage(line.message);
      if (text) {
        runUi.answerBuffer = text;
        renderMarkdown(runUi.answer, text);
      }
    }
    if (line.event === "permission.requested") {
      setInspectorTab("approvals");
      const approvals = byId("inspector-approvals");
      if (approvals) {
        approvals.innerHTML =
          '<div class="approval-card"><strong>需要批准</strong><p>' +
          escapeHtml(toStringMessage(line.message) || "Agent 请求权限") +
          '</p><button class="confirm-action" type="button" data-approve-run="' +
          escapeHtml(line.runId || "") +
          '">批准继续</button></div>';
      }
    }
  }
  if (line.type === "assistant.final") {
    const finalText = toStringMessage(line.message) || "Agent 没有返回最终文本。";
    renderMarkdown(runUi.answer, finalText);
    runUi.row.dataset.messageText = finalText;
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
    const errorMsg = toStringMessage(line.message) || "未知错误";
    const settingsHint = errorMsg.includes("未配置") || errorMsg.includes("不可达")
      ? '<br><a href="#" data-settings-open style="color:var(--accent);font-weight:600;cursor:pointer;">打开设置配置模型</a>'
      : "";
    runUi.answer.innerHTML = '<div class="error-card"><strong>运行失败</strong><p>' + escapeHtml(errorMsg) + settingsHint + "</p></div>";
  }
  // Follow streaming content (thinking blocks, tool events, deltas).
  scrollConversationToBottom();
}

async function submitChatGoal(goal) {
  const session = await ensureServerSession();
  if (!session) return;
  appendMessage("user", goal, { skipPersist: true });
  state.runEvents = [];
  state.secure.replayEvents = [];
  state.secure.reproBundle = null;
  const runUi = createRunBubble();
  const button = byId("start-run");
  if (button) button.disabled = true;
  try {
    await fetchJson("/api/sessions/" + encodeURIComponent(session.id) + "/policy", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset: permissionModeToLevel() }),
    });
    const response = await fetch("/agent/harness/runs/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        message: goal,
        mode: state.activeMode,
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
        try {
          handleHarnessLine(JSON.parse(raw), runUi);
        } catch {
          // skip malformed JSON lines
        }
      }
    }
    if (buffer.trim()) {
      try {
        handleHarnessLine(JSON.parse(buffer), runUi);
      } catch {
        // skip trailing malformed data
      }
    }
    await refreshSessionListOnly();
    await refreshStatus();
  } catch (error) {
    const msg = error.message || "未知错误";
    const hint = msg.includes("未配置") || msg.includes("不可达") || msg.includes("fetch failed")
      ? '<br><a href="#" onclick="document.querySelector(\'[data-settings-open]\')?.click();return false;" style="color:var(--accent);font-weight:600;">打开设置配置模型</a>'
      : "";
    appendMessage("assistant", msg + hint, { skipPersist: true });
  } finally {
    if (button) button.disabled = false;
  }
}

function renderRuns(runs = []) {
  const count = byId("run-count-label");
  if (count) count.textContent = (runs.length || 0) + " runs";
  const list = byId("report-list");
  if (!list) return;
  list.innerHTML = runs.length
    ? runs.map(createRunSummaryDetails).join("")
    : '<div class="empty-state">暂无运行记录。完成一次运行后会显示证据包入口。</div>';
}

function createRunSummaryDetails(run) {
  const id = run.id || run.runId || "";
  return (
    '<div class="detail-card"><small>' +
    escapeHtml(run.status || "run") +
    '</small><strong>' +
    escapeHtml(id || "run") +
    '</strong><span>' +
    escapeHtml(formatRelativeTime(run.updatedAt || run.createdAt)) +
    '</span><button class="mini-action" type="button" data-load-run="' +
    escapeHtml(id) +
    '">载入证据包</button></div>'
  );
}

function detailCard(title, value) {
  return '<div class="detail-card"><small>' + escapeHtml(title) + '</small><strong>' + escapeHtml(value || "暂无") + "</strong></div>";
}

function normalizeHarnessEvent(line) {
  if (line.type === "agent.event") {
    return {
      type: line.event || "agent.event",
      runId: line.runId || state.currentRun || "web-run",
      sessionId: line.sessionId || currentSession()?.id || "web-session",
      message: toStringMessage(line.message),
      createdAt: line.createdAt,
      payload: line.payload || {},
    };
  }
  return {
    type: line.type || "event",
    runId: line.runId || state.currentRun || "web-run",
    sessionId: line.sessionId || currentSession()?.id || "web-session",
    message: toStringMessage(line.message),
    createdAt: line.createdAt,
    payload: line.payload || {},
  };
}

function eventList() {
  return state.secure.replayEvents?.length ? state.secure.replayEvents : state.runEvents;
}

function latestStrategyGraph() {
  const events = eventList();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const graph = events[index]?.payload?.strategyGraph;
    if (graph) return graph;
  }
  return null;
}

function statusClass(status) {
  if (status === "ok" || status === "passed" || status === "closed") return "status-ok";
  if (status === "blocked" || status === "failed" || status === "violation") return "status-danger";
  if (status === "pending" || status === "warning") return "status-warning";
  return "status-muted";
}

function renderSecureOverview() {
  const scopes = state.secure.scopes || [];
  const activeScopes = scopes.filter((entry) => !entry.scope?.revokedAt);
  const approvals = eventList().filter((event) => event.type === "permission.requested");
  const graph = latestStrategyGraph();
  const p0 = (graph?.evidenceGaps || []).filter((gap) => gap.priority === "p0");
  const closed = p0.filter((gap) => String(gap.verification || "").startsWith("[closed]"));
  const evalArtifacts = state.secure.evalArtifacts || {};
  const scores = [evalArtifacts.contract?.averageScore, evalArtifacts.model?.averageScore].filter((score) => typeof score === "number");
  const bestScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : undefined;
  setOverviewCard("overview-policy", permissionModeToLevel(), "ok");
  setOverviewCard("overview-scopes", String(activeScopes.length), activeScopes.length ? "ok" : "muted");
  setOverviewCard("overview-approvals", String(approvals.length), approvals.length ? "pending" : "ok");
  setOverviewCard("overview-gaps", p0.length ? closed.length + "/" + p0.length : "未知", p0.length && closed.length === p0.length ? "closed" : p0.length ? "pending" : "muted");
  setOverviewCard("overview-eval", bestScore === undefined ? "未运行" : bestScore + "/100", bestScore === undefined ? "muted" : bestScore >= 85 ? "ok" : "warning");
  const detail = byId("overview-eval-detail");
  if (detail) {
    const contractSafetyViolations = evalArtifacts.contract?.safetyViolations?.length ?? 0;
    const modelSafetyViolations = evalArtifacts.model?.safetyViolations?.length ?? 0;
    detail.textContent = [
      evalArtifacts.contract ? "contract " + evalArtifacts.contract.averageScore + " · safetyViolations " + contractSafetyViolations : "contract 未运行",
      evalArtifacts.model ? "model " + evalArtifacts.model.averageScore + " · safetyViolations " + modelSafetyViolations : "model 未运行",
    ].join(" · ");
  }
}

function setOverviewCard(id, value, status) {
  const node = byId(id);
  if (!node) return;
  node.textContent = value;
  const card = node.closest(".secure-overview-card");
  if (card) {
    card.classList.remove("status-ok", "status-warning", "status-danger", "status-muted");
    card.classList.add(statusClass(status));
  }
}

function renderSecureAutonomyPanels() {
  renderSecureOverview();
  renderStrategyPanel();
  renderEvidencePanel();
  renderApprovalPanel();
  renderScopePanel();
  renderToolBatchPanel();
  renderRiskPanel();
  renderReportPanel(state.workbench?.recentRuns || []);
}

function renderStrategyPanel() {
  const target = byId("inspector-strategy");
  if (!target) return;
  const graph = latestStrategyGraph();
  if (!graph) {
    target.innerHTML = '<div class="empty-state">策略图会在运行开始后显示。</div>';
    return;
  }
  const gaps = graph.evidenceGaps || [];
  target.innerHTML =
    '<div class="detail-list">' +
    detailCard("Domain", graph.domain || "general") +
    detailCard("Risk posture", graph.riskPosture || "unknown") +
    detailCard("P0 gaps", gaps.filter((gap) => gap.priority === "p0").length) +
    gaps
      .map((gap) =>
        '<div class="secure-row ' +
        (String(gap.verification || "").startsWith("[closed]") ? "is-ok" : "is-pending") +
        '"><small>' +
        escapeHtml(gap.priority || "gap") +
        '</small><strong>' +
        escapeHtml(gap.question || gap.id) +
        '</strong><span>' +
        escapeHtml(gap.verification || "待验证") +
        "</span></div>",
      )
      .join("") +
    "</div>";
}

function renderEvidencePanel() {
  const target = byId("inspector-evidence");
  if (!target) return;
  const bundle = state.secure.reproBundle;
  const graph = bundle?.evidenceGraph;
  const claimEvents = eventList().filter((event) => event.type === "observation.created" || event.type === "evidence.created");
  const nodes = graph?.nodes || [];
  if (!nodes.length && !claimEvents.length) {
    target.innerHTML = '<div class="empty-state">暂无结构化证据。工具 observation 会在这里沉淀为 claim / artifact。</div>';
    return;
  }
  target.innerHTML =
    '<div class="detail-list">' +
    nodes
      .slice(0, 12)
      .map((node) => detailCard(node.kind || "evidence", node.summary || node.id))
      .join("") +
    claimEvents
      .slice(-8)
      .map((event) => detailCard(event.type, event.message || JSON.stringify(event.payload || {})))
      .join("") +
    "</div>";
}

function renderApprovalPanel() {
  const target = byId("inspector-approvals");
  if (!target) return;
  const grants = state.secure.grants || [];
  const permissionEvents = eventList().filter((event) => event.type === "permission.requested" || event.type === "permission.replied" || event.type === "tool.blocked");
  target.innerHTML =
    '<div class="detail-list">' +
    detailCard("PermissionGrantV2", grants.length) +
    (permissionEvents.length
      ? permissionEvents
          .slice(-12)
          .map((event) => detailCard(event.type, event.message || event.payload?.approvalReason || "approval event"))
          .join("")
      : '<div class="empty-state">暂无待审批工具调用。高风险工具必须使用一次性 OperationApproval。</div>') +
    "</div>";
}

function renderScopePanel() {
  const target = byId("inspector-scope");
  if (!target) return;
  const scopes = state.secure.scopes || [];
  target.innerHTML = scopes.length
    ? '<div class="detail-list">' +
      scopes
        .map((entry) => {
          const scope = entry.scope || {};
          const targetLabel = (scope.targets || []).map((item) => [item.scheme, item.host, (item.ports || []).join(",")].filter(Boolean).join("://")).join(" · ");
          return detailCard(scope.revokedAt ? "revoked scope" : scope.targetType || "scope", targetLabel || scope.scopeId);
        })
        .join("") +
      "</div>"
    : '<div class="empty-state">暂无活跃 SecurityScope。安全任务必须先声明目标、路径、端口、配额和风险等级。</div>';
}

function renderToolBatchPanel() {
  const target = byId("inspector-tools");
  if (!target) return;
  const toolEventTypes = ["tool.requested", "tool.started", "tool.completed", "tool.failed", "tool.timeout", "tool.cancelled", "tool.blocked"];
  const events = eventList().filter((event) => toolEventTypes.includes(event.type) || event.type.startsWith("scheduler."));
  const capabilities = state.secure.toolCapabilities?.capabilities || [];
  const capabilityRows = capabilities.length
    ? capabilities.map((item) => {
        const status = item.status || "unavailable";
        const css = status === "verified" ? "is-ok" : status === "ready" || status === "degraded" ? "is-pending" : "is-danger";
        const detail = [item.source, item.version, item.binaryPath].filter(Boolean).join(" · ");
        return '<div class="secure-row ' + css + '"><small>' + escapeHtml(status) + '</small><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(detail) + "</span></div>";
      }).join("")
    : '<div class="empty-state">尚未完成真实工具探测。</div>';
  const eventRows = events.length
    ? events
        .slice(-16)
        .map((event) => {
          const tool = event.payload?.tool?.name || event.payload?.tool || event.payload?.toolName || event.type;
          const status = event.type.includes("blocked") ? "blocked" : event.type.includes("completed") ? "completed" : event.type;
          return '<div class="secure-row ' + (status === "blocked" ? "is-danger" : status === "completed" ? "is-ok" : "is-pending") + '"><small>' + escapeHtml(status) + '</small><strong>' + escapeHtml(tool) + '</strong><span>' + escapeHtml(event.message || "") + "</span></div>";
        })
        .join("")
    : '<div class="empty-state">暂无工具批次。只读工具可并行，写入/网络/审批任务串行。</div>';
  target.innerHTML = '<div class="detail-list">' + capabilityRows + eventRows + "</div>";
}

function renderRiskPanel() {
  const target = byId("inspector-risk");
  if (!target) return;
  const risks = state.secure.reproBundle?.residualRisks || [];
  const blocked = eventList().filter((event) => event.type === "tool.blocked" || event.type === "run.blocked");
  target.innerHTML =
    '<div class="detail-list">' +
    (risks.length
      ? risks.map((risk) => detailCard(risk.severity || "risk", risk.description || risk.id)).join("")
      : '<div class="empty-state">暂无残余风险。未解决问题会随证据包记录。</div>') +
    blocked.slice(-6).map((event) => detailCard(event.type, event.message || "blocked")).join("") +
    "</div>";
}

function renderReportPanel(runs = []) {
  const target = byId("report-list");
  if (!target) return;
  const bundle = state.secure.reproBundle;
  const evalArtifacts = state.secure.evalArtifacts || {};
  const contractSafetyViolations = evalArtifacts.contract?.safetyViolations?.length ?? 0;
  const modelSafetyViolations = evalArtifacts.model?.safetyViolations?.length ?? 0;
  const evalCards =
    detailCard("Web IDOR 场景", evalArtifacts.contract ? "contract " + evalArtifacts.contract.averageScore + "/100 · safetyViolations " + contractSafetyViolations : "未运行") +
    detailCard("Incident Response 场景", evalArtifacts.model ? "model " + evalArtifacts.model.averageScore + "/100 · safetyViolations " + modelSafetyViolations : "未运行");
  const bundleCard = bundle
    ? detailCard("当前证据包", (bundle.toolInvocations?.length || 0) + " tools · " + (bundle.evidenceGraph?.nodes?.length || 0) + " evidence nodes")
    : "";
  target.innerHTML =
    '<div class="scenario-grid">' +
    '<div class="scenario-card"><small>本地 IDOR</small><strong>Alice/Bob 订单越权验证</strong><span>loopback /api scope，最多 20 次请求，只读复现。</span></div>' +
    '<div class="scenario-card"><small>应急响应 ZIP</small><strong>198.51.100.23 -> shell.php -> 203.0.113.9</strong><span>安全 ZIP 摄取，区分 SSH 噪声，输出 IOC 与恢复建议。</span></div>' +
    "</div><div class=\"detail-list\">" +
    evalCards +
    bundleCard +
    (runs.length ? runs.slice(0, 6).map(createRunSummaryDetails).join("") : "") +
    "</div>";
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
      detailCard("模型", modelDisplayName(workbench?.model)) +
      "</div>";
  }
  renderSecureAutonomyPanels();
}

function renderWorkbench(payload) {
  const workbench = payload.workbench || payload;
  state.workbench = workbench;
  if (byId("mode-label")) byId("mode-label").textContent = modeLabel();
  if (byId("network-label")) byId("network-label").textContent = workbench?.mcp?.status === "not_configured" ? "本地" : "连接";
  if (byId("model-chip")) byId("model-chip").textContent = modelDisplayName(workbench?.model);
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
  if (mode === "patch") setInspectorTab("strategy");
  if (mode === "security") setInspectorTab("scope");
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
  if (tab === "report") renderReportPanel(state.workbench?.recentRuns || []);
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
  if (byId("model-config-form")) {
    renderModelProfiles({ model: workbench?.model || {} });
    return;
  }
  target.innerHTML =
    '<div class="detail-card"><small>当前全局模型</small><strong>' +
    escapeHtml(modelDisplayName(workbench?.model)) +
    "</strong><p>项目切换不会改变这里的模型配置。</p></div>";
}

async function loadModelSettings() {
  const status = byId("model-config-status");
  if (status) status.textContent = "正在读取模型配置...";
  try {
    const payload = await fetchJson("/api/config/model");
    applyModelConfigToForm(payload.model || payload);
    renderModelProfiles(payload);
    if (status) {
      const model = payload.model || payload;
      status.textContent = model.apiKeyConfigured
        ? "已保存 API Key：" + (model.apiKeyPreview || "已配置")
        : "尚未保存 API Key。保存前无法调用模型。";
    }
  } catch (error) {
    renderModelProfiles({ error: error.message });
    if (status) status.textContent = "模型配置读取失败：" + error.message;
  }
}

function applyModelConfigToForm(model) {
  const provider = model?.provider || "disabled";
  const preset = modelProviderPreset(provider);
  setFieldValue("model-provider-select", provider);
  setFieldValue("model-name-input", model?.model || preset.model || "");
  setFieldValue("model-base-url-input", model?.baseUrl || preset.baseUrl || "");
  setFieldValue("model-chat-path-input", model?.chatPath || preset.chatPath || "/v1/chat/completions");
  setFieldValue("model-wire-api-select", model?.wireApi || preset.wireApi || "openai-chat-completions");
  setFieldValue("model-max-tokens-input", String(model?.maxTokens || preset.maxTokens || 4096));
  setFieldValue("model-api-key-input", "");
}

function setFieldValue(id, value) {
  const field = byId(id);
  if (field) field.value = value;
}

function modelProviderPreset(provider) {
  const presets = {
    disabled: { chatPath: "/v1/chat/completions", wireApi: "openai-chat-completions", maxTokens: 4096 },
    "openai-compatible": { chatPath: "/v1/chat/completions", wireApi: "openai-chat-completions", maxTokens: 4096 },
    deepseek: {
      baseUrl: "https://api.deepseek.com",
      chatPath: "/v1/chat/completions",
      model: "deepseek-chat",
      wireApi: "openai-chat-completions",
      maxTokens: 4096,
    },
    minimax: {
      baseUrl: "https://api.minimaxi.com/anthropic",
      chatPath: "/v1/messages",
      model: "MiniMax-M3",
      wireApi: "anthropic-messages",
      maxTokens: 4096,
    },
  };
  return presets[provider] || presets.disabled;
}

function applyModelProviderPreset() {
  const provider = byId("model-provider-select")?.value || "disabled";
  const preset = modelProviderPreset(provider);
  if (!byId("model-name-input")?.value) setFieldValue("model-name-input", preset.model || "");
  setFieldValue("model-base-url-input", preset.baseUrl || "");
  setFieldValue("model-chat-path-input", preset.chatPath || "/v1/chat/completions");
  setFieldValue("model-wire-api-select", preset.wireApi || "openai-chat-completions");
  setFieldValue("model-max-tokens-input", String(preset.maxTokens || 4096));
}

function collectModelConfigFromForm() {
  const provider = byId("model-provider-select")?.value || "disabled";
  if (provider === "disabled") {
    return { provider: "disabled" };
  }
  const apiKey = byId("model-api-key-input")?.value.trim();
  const maxTokens = Number(byId("model-max-tokens-input")?.value || 4096);
  return {
    provider,
    baseUrl: byId("model-base-url-input")?.value.trim(),
    chatPath: byId("model-chat-path-input")?.value.trim() || "/v1/chat/completions",
    wireApi: byId("model-wire-api-select")?.value || "openai-chat-completions",
    model: byId("model-name-input")?.value.trim(),
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
    ...(apiKey ? { apiKey } : {}),
  };
}

function renderModelProfiles(payload) {
  const target = byId("model-manager");
  if (!target) return;
  const model = payload?.model || payload || {};
  if (payload?.error) {
    target.innerHTML = '<div class="empty-state">模型配置读取失败：' + escapeHtml(payload.error) + "</div>";
    return;
  }
  target.innerHTML =
    '<div class="connector-item model-summary"><div><strong>' +
    escapeHtml(modelDisplayName(model)) +
    '</strong><small>' +
    escapeHtml((model.provider || "disabled") + " · " + (model.source || "workspace")) +
    '</small></div><span class="connector-status ' +
    (model.apiKeyConfigured ? "online" : "muted") +
    '">' +
    (model.apiKeyConfigured ? "key saved" : "missing key") +
    "</span></div>";
}

async function saveModelConfig(event) {
  event?.preventDefault();
  const status = byId("model-config-status");
  if (status) status.textContent = "正在保存模型配置...";
  try {
    const payload = await fetchJson("/api/config/model", {
      method: "POST",
      body: JSON.stringify(collectModelConfigFromForm()),
    });
    applyModelConfigToForm(payload.model || payload);
    renderModelProfiles(payload);
    if (status) status.textContent = "模型配置已保存。";
    await refreshStatus();
  } catch (error) {
    if (status) status.textContent = "模型配置保存失败：" + error.message;
  }
}

async function testModelConfig() {
  const status = byId("model-config-status");
  if (status) status.textContent = "正在测试模型连接...";
  try {
    const payload = await fetchJson("/api/config/model/test", { method: "POST" });
    if (status) {
      status.textContent =
        payload.status === "connected"
          ? "模型连接成功。"
          : "模型连接失败：" + (payload.message || payload.error || "unknown");
    }
  } catch (error) {
    if (status) status.textContent = "模型连接失败：" + error.message;
  }
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
    const argv = parseStructuredArgv(command);
    if (argv.length === 0) return;
    await fetchJson("/api/sessions/" + encodeURIComponent(session.id) + "/policy", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset: permissionModeToLevel() }),
    });
    const readonlyPrograms = new Set(["ls", "pwd", "cat", "head", "tail", "grep", "rg", "find", "wc", "file", "stat", "du", "df", "which", "where", "tree", "sort", "cut", "sed", "git", "uname", "hostname", "whoami", "date", "uptime", "free", "top", "ps"]);
    const tool = readonlyPrograms.has(argv[0].toLowerCase()) ? "shell.readonly" : "shell.write";
    let payload = await fetchJson("/api/tool-calls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        tool,
        input: { program: argv[0], args: argv.slice(1) },
      }),
    });
    if (payload.status === "pending_approval") {
      if (!window.confirm("该工具调用需要一次性审批。是否执行此精确调用？")) {
        await fetchJson("/api/tool-calls/" + encodeURIComponent(payload.call.id) + "/deny", { method: "POST" });
        output.textContent += "[denied]\n";
        return;
      }
      payload = await fetchJson("/api/tool-calls/" + encodeURIComponent(payload.call.id) + "/approve", { method: "POST" });
    }
    const result = payload.result || payload;
    const toolOutput = result.output || result.result?.output || {};
    if (toolOutput.stdout) output.textContent += toolOutput.stdout;
    if (toolOutput.stderr) output.textContent += toolOutput.stderr;
    output.textContent += "\n[" + (payload.status || result.status || "complete") + "]\n";
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
    await loadSecureAutonomyState();
  } catch (error) {
    appendMessage("system", "状态读取失败：" + error.message, { skipPersist: true });
  }
}

async function loadSecureAutonomyState() {
  const session = currentSession();
  const sessionId = session?.id || "";
  const [scopes, grants, evalArtifacts, toolCapabilities] = await Promise.all([
    loadSecurityScopes(sessionId),
    loadPermissionGrants(),
    loadEvalArtifacts(),
    loadToolCapabilities(),
  ]);
  state.secure.scopes = scopes;
  state.secure.grants = grants;
  state.secure.evalArtifacts = evalArtifacts;
  state.secure.toolCapabilities = toolCapabilities;
  if (state.currentRun) {
    state.secure.replayEvents = await loadRunReplay(state.currentRun);
    state.secure.reproBundle = await loadReproBundle(state.currentRun);
  }
  renderSecureAutonomyPanels();
}

async function loadSecurityScopes(sessionId) {
  try {
    const url = sessionId ? "/api/security-scopes?sessionId=" + encodeURIComponent(sessionId) : "/api/security-scopes";
    const payload = await fetchJson(url);
    return payload.scopes || [];
  } catch {
    return [];
  }
}

async function loadPermissionGrants() {
  try {
    const payload = await fetchJson("/api/permission-grants");
    return payload.grants || [];
  } catch {
    return [];
  }
}

async function loadRunReplay(runId) {
  if (!runId) return [];
  try {
    const payload = await fetchJson("/agent/harness/runs/" + encodeURIComponent(runId) + "/replay");
    return payload.events || [];
  } catch {
    return state.runEvents.slice(-300);
  }
}

async function loadReproBundle(runId) {
  if (!runId) return null;
  try {
    const payload = await fetchJson("/api/runs/" + encodeURIComponent(runId) + "/repro-bundle");
    return payload.bundle || null;
  } catch {
    return null;
  }
}

async function loadEvalArtifacts() {
  try {
    const payload = await fetchJson("/api/eval-artifacts");
    return payload.artifacts || null;
  } catch {
    return null;
  }
}

async function loadToolCapabilities() {
  try {
    return await fetchJson("/api/tool-capabilities");
  } catch {
    return null;
  }
}

async function loadRunEvidenceBundle(runId) {
  if (!runId) return;
  state.currentRun = runId;
  state.secure.replayEvents = await loadRunReplay(runId);
  state.secure.reproBundle = await loadReproBundle(runId);
  renderSecureAutonomyPanels();
  setInspectorTab("evidence");
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

function syncDockReopen() {
  const collapsed = byId("bottom-dock")?.classList.contains("is-collapsed") ?? false;
  const reopen = document.querySelector(".dock-reopen");
  if (reopen) reopen.hidden = !collapsed;
  const toggle = document.querySelector(".terminal-toggle");
  if (toggle) toggle.setAttribute("aria-pressed", String(!collapsed));
}

function toggleBottomDock() {
  const dock = byId("bottom-dock");
  if (!dock) return;
  dock.classList.toggle("is-collapsed");
  syncDockReopen();
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
  if (tab === "models") loadModelSettings();
  if (tab === "mcp") loadMcpSettings();
  if (tab === "skills") loadSkillsSettings();
}

function parseStructuredArgv(command) {
  if (/[|;&<>\x60]|\$\(|[\r\n]/.test(command)) {
    throw new Error("不支持 shell 运算符；请输入单个程序及其参数。");
  }
  const args = [];
  let current = "";
  let quote = "";
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) { args.push(current); current = ""; }
    } else {
      current += char;
    }
  }
  if (quote) throw new Error("命令包含未闭合的引号。");
  if (current) args.push(current);
  return args;
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
  byId("model-config-form")?.addEventListener("submit", saveModelConfig);
  byId("test-model-config")?.addEventListener("click", testModelConfig);
  byId("model-provider-select")?.addEventListener("change", applyModelProviderPreset);
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
    if (target.dataset.editMessage !== undefined) {
      const row = target.closest(".message-row");
      if (row) editUserMessage(row);
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
     if (target.dataset.loadRun) loadRunEvidenceBundle(target.dataset.loadRun);
     if (target.dataset.mobileTarget) setMobileSection(target.dataset.mobileTarget);
    if (target.dataset.railToggle) toggleRail(target.dataset.railToggle);
    if (target.classList?.contains("session-group-toggle")) {
      const toggle = target;
      const items = toggle.closest(".session-group")?.nextElementSibling;
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      if (items) items.hidden = expanded;
    }
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
  syncDockReopen();
}

boot().catch((error) => {
  console.error(error);
  appendMessage("system", "工作台启动失败：" + error.message, { skipPersist: true });
});`;
}
