export function renderDashboardJs(): string {
  return String.raw`const state = {
  workbench: null,
  activePatch: null,
  activeMode: "chat",
  sessions: loadSessions(),
  activeSessionId: null,
  modelFormDirty: false,
};

const providerProfiles = {
  disabled: {
    provider: "disabled",
    baseUrl: "",
    chatPath: "/v1/chat/completions",
    model: "",
    wireApi: "openai-chat-completions",
  },
  "openai-compatible": {
    provider: "openai-compatible",
    baseUrl: "",
    chatPath: "/v1/chat/completions",
    model: "",
    wireApi: "openai-chat-completions",
  },
  deepseek: {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    chatPath: "/v1/chat/completions",
    model: "deepseek-chat",
    wireApi: "openai-chat-completions",
  },
  minimax: {
    provider: "minimax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    chatPath: "/v1/messages",
    model: "MiniMax-M3",
    wireApi: "anthropic-messages",
  },
};

const byId = (id) => document.getElementById(id);

function ensureSession() {
  if (state.activeSessionId && state.sessions.some((session) => session.id === state.activeSessionId)) {
    return state.sessions.find((session) => session.id === state.activeSessionId);
  }
  const session = {
    id: "session-" + Date.now(),
    title: "新会话",
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  saveSessions();
  renderLocalSessions();
  return session;
}

function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem("ego.workbench.sessions") || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem("ego.workbench.sessions", JSON.stringify(state.sessions.slice(0, 8)));
}

function appendMessage(role, body, options = {}) {
  const list = byId("conversation");
  const item = document.createElement("article");
  item.className = "message " + role;
  const speaker = document.createElement("span");
  speaker.textContent = role === "user" ? "user" : role === "tool" ? "tool" : "lotus";
  const text = document.createElement(options.pre ? "pre" : "p");
  text.textContent = body;
  item.append(speaker, text);
  list.append(item);
  list.scrollTop = list.scrollHeight;

  if (!options.skipPersist) {
    const session = ensureSession();
    session.messages.push({ role, body, pre: Boolean(options.pre), at: new Date().toISOString() });
    session.updatedAt = new Date().toISOString();
    if (role === "user" && session.title === "新会话") {
      session.title = body.slice(0, 18) || "新会话";
    }
    saveSessions();
    renderLocalSessions();
  }
}

function restoreConversation(session) {
  const list = byId("conversation");
  list.replaceChildren();
  for (const message of session.messages || []) {
    appendMessage(message.role, message.body, { pre: message.pre, skipPersist: true });
  }
  if (!session.messages || session.messages.length === 0) {
    appendMessage("assistant", "新会话已创建。选择“对话”可直接问模型；选择“生成 Patch”才会进入审批写入流程。", { skipPersist: true });
  }
}

function fillList(id, items) {
  const list = byId(id);
  if (!list) return;
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));
}

function renderLocalSessions() {
  const list = byId("session-list");
  if (!list) return;
  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = "session-item active";
  newButton.innerHTML = "<span>+</span><strong>新会话</strong><small>创建</small>";
  newButton.addEventListener("click", createNewSession);

  const localItems = state.sessions.map((session) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "session-item" + (session.id === state.activeSessionId ? " active" : "");
    const icon = document.createElement("span");
    icon.textContent = session.id === state.activeSessionId ? "*" : "-";
    const title = document.createElement("strong");
    title.textContent = session.title || "新会话";
    const time = document.createElement("small");
    time.textContent = relativeTime(session.updatedAt);
    item.append(icon, title, time);
    item.addEventListener("click", () => {
      state.activeSessionId = session.id;
      restoreConversation(session);
      renderLocalSessions();
    });
    return item;
  });

  const serverRuns = (state.workbench?.recentRuns || []).slice(0, 3).map((run) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "session-item";
    const icon = document.createElement("span");
    icon.textContent = "run";
    const title = document.createElement("strong");
    title.textContent = run.scenario || run.runId;
    const time = document.createElement("small");
    time.textContent = run.status;
    item.append(icon, title, time);
    item.addEventListener("click", () => {
      appendMessage("assistant", "已选择运行记录 " + run.runId + "。可使用 /report 查看报告入口。");
    });
    return item;
  });

  list.replaceChildren(newButton, ...localItems, ...serverRuns);
}

function createNewSession() {
  const session = {
    id: "session-" + Date.now(),
    title: "新会话",
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  state.sessions.unshift(session);
  state.sessions = state.sessions.slice(0, 8);
  state.activeSessionId = session.id;
  saveSessions();
  restoreConversation(session);
  renderLocalSessions();
  byId("goal-input").focus();
}

function renderTools(tools) {
  byId("tool-list").replaceChildren(...tools.map((tool) => {
    const item = document.createElement("div");
    item.className = "tool-item";
    const dot = document.createElement("span");
    dot.className = "status-dot " + tool.status;
    const name = document.createElement("strong");
    name.textContent = tool.name;
    const command = document.createElement("small");
    command.textContent = tool.command;
    item.append(dot, name, command);
    return item;
  }));
}

function renderFiles(files) {
  byId("file-list").replaceChildren(...files.map((file) => {
    const item = document.createElement("div");
    item.className = "file-item";
    const dot = document.createElement("span");
    dot.className = "status-dot " + (file.status === "ready" ? "" : "planned");
    const name = document.createElement("strong");
    name.textContent = file.label;
    const size = document.createElement("small");
    size.textContent = file.sizeLabel;
    item.title = file.path;
    item.append(dot, name, size);
    return item;
  }));
}

function renderLogs(logs) {
  byId("log-list").replaceChildren(...logs.map((log) => {
    const item = document.createElement("div");
    item.className = "log-item";
    const time = document.createElement("span");
    time.textContent = "[" + log.time + "]";
    const message = document.createElement("span");
    message.textContent = log.message;
    item.append(time, message);
    return item;
  }));
}

function renderApprovals(approvals, pendingEdits) {
  const approvalItems = approvals.map((approval) => {
    const item = document.createElement("div");
    item.className = "approval-item";
    const dot = document.createElement("span");
    dot.className = "status-dot " + (approval.count > 0 ? "planned" : "offline");
    const label = document.createElement("strong");
    label.textContent = approval.label;
    const count = document.createElement("small");
    count.textContent = String(approval.count);
    item.append(dot, label, count);
    return item;
  });
  const editItems = pendingEdits.map((edit) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "approval-item approval-button";
    const dot = document.createElement("span");
    dot.className = "status-dot planned";
    const label = document.createElement("strong");
    label.textContent = "Patch " + edit.runId;
    const count = document.createElement("small");
    count.textContent = edit.files.length + " files";
    item.title = edit.files.join(", ");
    item.append(dot, label, count);
    item.addEventListener("click", () => {
      loadDiffForPendingEdit(edit).catch((error) => {
        appendMessage("assistant", "读取 Patch diff 失败：" + formatError(error));
      });
    });
    return item;
  });
  byId("approval-list").replaceChildren(...approvalItems, ...editItems);
}

function renderQuickCommands(commands) {
  byId("quick-command-list").replaceChildren(...commands.map((command) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "quick-command";
    item.textContent = command;
    item.addEventListener("click", () => executeCommand(command));
    return item;
  }));
}

function renderRuns(runs) {
  const list = byId("run-list");
  if (!list) return;
  if (!runs.length) {
    list.innerHTML = '<p class="empty">暂无运行记录</p>';
    return;
  }

  list.replaceChildren(...runs.map((run) => {
    const card = document.createElement("article");
    card.className = "run-card";
    const title = document.createElement("strong");
    title.textContent = run.runId + " | " + run.status;
    const meta = document.createElement("small");
    meta.textContent = run.scenario + " | " + run.eventCount + " events | " + run.updatedAt;
    card.append(title, meta);
    return card;
  }));
}

function renderCommands(commands) {
  const list = byId("command-list");
  if (!list) return;
  list.replaceChildren(...commands.map((command) => {
    const item = document.createElement("div");
    item.className = "command-item";
    const code = document.createElement("code");
    code.textContent = command;
    item.append(code);
    return item;
  }));
}

function renderMcp(mcp) {
  const list = byId("mcp-list");
  if (!list) return;
  const status = document.createElement("div");
  status.className = "mcp-item";
  const code = document.createElement("code");
  code.textContent = "MCP: " + mcp.status;
  const meta = document.createElement("small");
  meta.textContent = mcp.capabilities.join(", ");
  status.append(code, meta);
  list.replaceChildren(status);
}

function renderModelSettings(model, options = {}) {
  const form = byId("model-settings-form");
  if (!options.force && state.modelFormDirty && form?.contains(document.activeElement)) return;
  const provider = byId("model-provider");
  const baseUrl = byId("model-base-url");
  const modelName = byId("model-name");
  const apiKey = byId("model-api-key");
  const chatPath = byId("model-chat-path");
  const wireApi = byId("model-wire-api");
  const source = byId("model-source");
  const note = byId("model-settings-note");
  if (!provider || !baseUrl || !modelName || !apiKey || !chatPath || !wireApi) return;

  provider.value = model.provider || "disabled";
  baseUrl.value = model.baseUrl || "";
  modelName.value = model.name === "deterministic" ? "" : model.name || "";
  chatPath.value = model.chatPath || "";
  wireApi.value = model.wireApi || "openai-chat-completions";
  apiKey.value = "";
  apiKey.placeholder = model.apiKeyConfigured
    ? "API Key 已保存，留空则保持不变"
    : "API Key，保存到本地 .ego/config.json";
  if (source) {
    source.textContent = model.source || "none";
    source.title = model.sourcePath || model.source || "none";
  }
  if (note && !state.modelFormDirty) {
    note.textContent = model.apiKeyConfigured
      ? "已检测到本地密钥；保存时留空 API Key 会保持原值。"
      : "API Key 仅写入本地 .ego/config.json。";
  }
}

function applyProviderProfile(providerName) {
  const profile = providerProfiles[providerName] || providerProfiles.disabled;
  byId("model-base-url").value = profile.baseUrl || "";
  byId("model-chat-path").value = profile.chatPath;
  byId("model-wire-api").value = profile.wireApi;
  if (profile.model) {
    byId("model-name").value = profile.model;
  }
  state.modelFormDirty = true;
}

function renderDiffPreview(result) {
  const preview = byId("diff-preview");
  const approve = byId("approve-button");
  const title = byId("approval-preview-title");
  const files = byId("approval-files");
  if (!preview) return;

  if (!result || !result.diff) {
    preview.textContent = "在“生成 Patch”模式提交修改任务后，diff 会出现在这里。";
    if (title) title.textContent = "暂无待审批 Patch";
    if (files) files.replaceChildren();
    state.activePatch = null;
    if (approve) approve.disabled = true;
    return;
  }

  state.activePatch = {
    runId: result.runId,
    approvalId: result.approvalId,
    status: result.status,
  };
  preview.textContent = result.diff;
  if (title) title.textContent = result.status === "applied" ? "Patch 已应用" : "待审批 Patch: " + result.runId;
  if (files) {
    files.replaceChildren(...(result.files || result.editPreview?.files || []).map((file) => {
      const chip = document.createElement("span");
      chip.className = "approval-file-chip";
      chip.textContent = file;
      return chip;
    }));
  }
  if (approve) {
    approve.disabled = result.status !== "pending_approval";
  }
}

function renderChecks(checks) {
  const list = byId("check-list");
  if (!list) return;
  if (!checks || checks.length === 0) {
    list.innerHTML = '<p class="empty">暂无 checks 输出</p>';
    return;
  }

  list.replaceChildren(...checks.map((check) => {
    const item = document.createElement("div");
    item.className = "check-item " + check.status;
    const title = document.createElement("strong");
    title.textContent = check.name + " | " + check.status;
    const meta = document.createElement("small");
    meta.textContent = check.command + " | exit " + check.exitCode;
    item.append(title, meta);
    return item;
  }));
}

async function loadDiffForPendingEdit(edit) {
  const response = await fetch("/agent/runs/" + encodeURIComponent(edit.runId) + "/diff");
  const diff = await response.text();
  if (!response.ok) {
    throw new Error(diff || "diff request failed");
  }
  renderDiffPreview({
    runId: edit.runId,
    approvalId: "approval-" + edit.previewId,
    status: "pending_approval",
    diff,
    files: edit.files,
  });
}

async function approvePendingPatch() {
  if (!state.activePatch) return;
  const approve = byId("approve-button");
  if (approve) {
    approve.disabled = true;
    approve.textContent = "Applying";
  }

  try {
    const response = await fetch("/agent/runs/" + encodeURIComponent(state.activePatch.runId) + "/approve", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({ approvalId: state.activePatch.approvalId }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "approve failed");
    }

    renderDiffPreview({ ...result, status: "applied" });
    renderChecks(result.checks || []);
    appendMessage("assistant", "Patch 已审批并应用，checks 已写入审计链。");
    await refreshStatus();
  } catch (error) {
    appendMessage("assistant", "审批失败：" + formatError(error));
    if (approve) approve.disabled = false;
  } finally {
    if (approve) {
      approve.textContent = "Approve";
    }
  }
}

function renderWorkbench(workbench) {
  state.workbench = workbench;
  byId("cwd-label").textContent = workbench.cwd;
  byId("mode-label").textContent = modeLabel(state.activeMode);
  byId("network-label").textContent = workbench.network === "connected" ? "连接" : "本地";
  byId("model-chip").textContent = workbench.model.label;
  byId("cpu-label").textContent = workbench.cpuLabel;
  byId("memory-label").textContent = workbench.memoryLabel;
  byId("run-count").textContent = workbench.recentRuns.length + " runs";
  byId("context-target").textContent = workbench.context.target;
  byId("context-type").textContent = workbench.context.type;
  byId("context-scope").textContent = workbench.context.scope;
  byId("context-priority").textContent = workbench.context.priority;
  byId("ego-home").textContent = workbench.storage.egoHome;
  byId("sqlite-path").textContent = workbench.storage.sqlite;
  byId("trajectory-path").textContent = workbench.storage.trajectories;
  renderLocalSessions();
  renderTools(workbench.tools);
  renderFiles(workbench.files);
  renderLogs(workbench.logs);
  renderApprovals(workbench.approvals, workbench.pendingEdits || []);
  renderQuickCommands(workbench.quickCommands);
  fillList("completed-list", workbench.progress.completed);
  fillList("active-list", workbench.progress.active);
  fillList("next-list", workbench.progress.next);
  renderRuns(workbench.recentRuns);
  renderCommands(workbench.commands);
  renderMcp(workbench.mcp);
  renderModelSettings(workbench.model);

  if (!state.activePatch) {
    renderChecks(workbench.lastChecks || []);
  }
  if (!state.activePatch && workbench.pendingEdits && workbench.pendingEdits.length > 0) {
    loadDiffForPendingEdit(workbench.pendingEdits[0]).catch(() => {
      const preview = byId("diff-preview");
      if (preview) preview.textContent = "存在待审批 Patch，点击审批列表读取 diff。";
    });
  } else if (!state.activePatch && (!workbench.pendingEdits || workbench.pendingEdits.length === 0)) {
    renderDiffPreview(null);
  }
}

async function refreshStatus() {
  const response = await fetch("/api/workbench");
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "workbench status failed");
  }
  renderWorkbench(body.workbench);
}

async function submitModelSettings(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const note = byId("model-settings-note");
  const provider = byId("model-provider").value;
  const hasModelFields = Boolean(
    byId("model-base-url").value.trim() ||
    byId("model-name").value.trim() ||
    byId("model-api-key").value.trim(),
  );
  if (provider === "disabled" && hasModelFields) {
    if (note) note.textContent = "disabled 不能同时保存 Base URL、模型名或 API Key。请选择真实 provider 或清空这些字段。";
    return;
  }
  const payload = compactObject({
    provider,
    baseUrl: byId("model-base-url").value.trim(),
    model: byId("model-name").value.trim(),
    apiKey: byId("model-api-key").value.trim(),
    chatPath: byId("model-chat-path").value.trim(),
    wireApi: byId("model-wire-api").value,
  });

  if (button) {
    button.disabled = true;
    button.textContent = "保存中";
  }

  try {
    const response = await fetch("/api/config/model", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "model config save failed");
    }
    state.modelFormDirty = false;
    if (note) note.textContent = "模型配置已保存到本地 .ego/config.json。";
    appendMessage("assistant", "模型配置已保存。对话模式会调用 /chat；生成 Patch 模式会调用 /agent/runs 并等待审批。");
    renderModelSettings(result.model, { force: true });
    await refreshStatus();
  } catch (error) {
    if (note) note.textContent = "模型配置保存失败：" + formatError(error);
    appendMessage("assistant", "模型配置保存失败：" + formatError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "保存模型配置";
    }
  }
}

async function testModelSettings() {
  const button = byId("model-test-button");
  const note = byId("model-settings-note");
  if (button) {
    button.disabled = true;
    button.textContent = "测试中";
  }
  try {
    const response = await fetch("/api/config/model/test", { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "model test failed");
    }
    if (note) {
      note.textContent = result.status === "connected"
        ? "模型连接成功：" + (result.model?.name || "")
        : "模型测试：" + (result.message || result.status);
    }
    appendMessage("assistant", "模型测试结果：" + result.status + (result.message ? "\n" + result.message : ""));
  } catch (error) {
    if (note) note.textContent = "模型测试失败：" + formatError(error);
    appendMessage("assistant", "模型测试失败：" + formatError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "测试连接";
    }
  }
}

async function executeCommand(command) {
  if (command === "/clear") {
    const session = ensureSession();
    session.messages = [];
    session.updatedAt = new Date().toISOString();
    saveSessions();
    restoreConversation(session);
    renderDiffPreview(null);
    renderChecks([]);
    return;
  }
  if (command === "/config") {
    byId("model-provider")?.focus();
    appendMessage("assistant", commandReply(command));
    return;
  }
  if (command === "/scan") {
    appendMessage("user", "/scan");
    await runSecurityFixture();
    return;
  }
  const reply = commandReply(command);
  if (reply) {
    appendMessage("user", command);
    appendMessage("assistant", reply);
  }
}

function commandReply(goal) {
  if (goal === "/help") {
    return "可用命令：/scan 运行受控 web_pentest 示例，/analyze 刷新分析状态，/report 查看最近报告入口，/threat 查看威胁情报边界，/config 聚焦模型设置，/clear 清空当前会话。";
  }
  if (goal === "/analyze") {
    refreshStatus().catch(() => {});
    return "已刷新 Workbench 状态。继续深入分析时可以在对话模式提问，或切换到生成 Patch 模式提出明确修改。";
  }
  if (goal === "/report") {
    const run = state.workbench?.recentRuns?.[0];
    return run ? "最近报告入口：/runs/" + run.runId + "/report" : "暂无运行记录。先执行 /scan 或 ego run 生成报告。";
  }
  if (goal === "/threat") {
    return "威胁情报、扫描和外部工具调用必须经过 Policy Gate、授权范围和审计链；当前 Web 只暴露受控示例入口。";
  }
  if (goal === "/config") {
    const workbench = state.workbench;
    const pending = workbench?.pendingEdits?.length || 0;
    return "模型：" + (workbench?.model.label || "deterministic fallback") +
      "\n模型配置来源：" + (workbench?.model.source || "none") +
      "\nSQLite：" + (workbench?.storage.sqlite || ".ego/ego.sqlite") +
      "\n待审批 Patch：" + pending;
  }
  return null;
}

async function runSecurityFixture() {
  appendMessage("assistant", "正在运行受控 web_pentest 示例，所有结果会写入 trajectory 与 SQLite。");
  const response = await fetch("/runs", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({ runId: "web-ui-run-" + Date.now() }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    appendMessage("assistant", "安全任务失败：" + (result.error || "unknown error"));
    return;
  }
  appendMessage("tool", "runId: " + result.runId + "\nstatus: " + result.status + "\nevidence: " + (result.evidence || []).length + "\nreport: " + result.reportPath, { pre: true });
  await refreshStatus();
}

export async function submitMission(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const goal = byId("goal-input").value.trim();
  const runId = byId("run-id-input").value.trim();
  if (!goal) {
    appendMessage("assistant", "任务目标不能为空。");
    return;
  }

  if (goal.startsWith("/")) {
    await executeCommand(goal);
    byId("goal-input").value = "";
    return;
  }

  appendMessage("user", goal);
  button.disabled = true;
  button.textContent = state.activeMode === "patch" ? "生成 Patch" : "思考中";

  try {
    if (state.activeMode === "patch") {
      await submitPatchGoal(goal, runId);
    } else if (state.activeMode === "security") {
      appendMessage("assistant", "安全任务模式会优先使用受控场景入口。当前将运行 web_pentest fixture；主动扫描真实目标前必须确认授权范围。");
      await runSecurityFixture();
    } else {
      await submitChatGoal(goal);
    }
    byId("goal-input").value = "";
    await refreshStatus();
  } catch (error) {
    appendMessage("assistant", "任务处理失败：" + formatError(error));
  } finally {
    button.disabled = false;
    button.textContent = "发送 (Enter)";
  }
}

async function submitChatGoal(goal) {
  const response = await fetch("/chat", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({ message: goal }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "请求失败");
  }
  const commands = result.suggestedCommands?.length
    ? "\n\n建议命令：\n- " + result.suggestedCommands.join("\n- ")
    : "";
  appendMessage("assistant", (result.reply || result.assistantMessage || "已处理。") + commands);
}

async function submitPatchGoal(goal, runId) {
  const response = await fetch("/agent/runs", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      message: goal,
      autoPropose: true,
      ...(runId ? { runId } : {}),
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "请求失败");
  }

  const plan = result.plan?.length ? "\n\n计划：\n- " + result.plan.join("\n- ") : "";
  let statusLine = "";
  if (result.status === "pending_approval") {
    statusLine = "\n\n已生成候选 Patch，请在右侧审批栏确认 diff 后点击 Approve。";
    renderDiffPreview(result);
  } else if (result.status === "needs_model") {
    statusLine = "\n\n模型未配置，已保持只读，不创建待审批 Patch。";
    renderDiffPreview(null);
  } else if (result.status === "blocked") {
    statusLine = "\n\n任务被策略或模型输出阻断，未创建待审批 Patch。";
    renderDiffPreview(null);
  }
  renderChecks(result.checks || []);
  appendMessage("assistant", (result.assistantMessage || "已处理。") + statusLine + plan);
}

function setMode(mode) {
  state.activeMode = mode;
  byId("mode-label").textContent = modeLabel(mode);
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  const input = byId("goal-input");
  if (mode === "patch") {
    input.placeholder = "描述你要修改的文件或功能，系统会生成 diff 并等待右侧审批...";
  } else if (mode === "security") {
    input.placeholder = "描述授权安全任务，或使用 /scan 运行受控 web_pentest 示例...";
  } else {
    input.placeholder = "在此输入你的问题，模型可用时会调用 /chat 进行只读回复...";
  }
}

function modeLabel(mode) {
  if (mode === "patch") return "生成 Patch";
  if (mode === "security") return "安全任务";
  return "对话";
}

function tickClock() {
  const clock = byId("clock-label");
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  }
}

function relativeTime(value) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + "分钟前";
  const hours = Math.round(minutes / 60);
  return hours < 24 ? hours + "小时前" : Math.round(hours / 24) + "天前";
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
}

byId("mission-form").addEventListener("submit", submitMission);
byId("model-settings-form")?.addEventListener("submit", submitModelSettings);
byId("model-settings-form")?.addEventListener("input", () => {
  state.modelFormDirty = true;
});
byId("model-provider")?.addEventListener("change", (event) => {
  applyProviderProfile(event.currentTarget.value);
});
byId("model-test-button")?.addEventListener("click", () => {
  testModelSettings().catch((error) => appendMessage("assistant", "模型测试失败：" + formatError(error)));
});
byId("approve-button")?.addEventListener("click", () => {
  approvePendingPatch().catch((error) => {
    appendMessage("assistant", "审批失败：" + formatError(error));
  });
});
document.querySelectorAll(".mode-tab").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode || "chat"));
});
byId("goal-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    byId("mission-form").requestSubmit();
  }
});
ensureSession();
setMode("chat");
tickClock();
setInterval(tickClock, 1000);
refreshStatus().catch((error) => {
  appendMessage("assistant", "状态读取失败：" + formatError(error));
});
setInterval(() => {
  refreshStatus().catch((error) => {
    console.warn("workbench refresh failed", error);
  });
}, 3000);`;
}
