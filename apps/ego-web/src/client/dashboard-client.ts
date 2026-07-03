export function renderDashboardJs(): string {
  return String.raw`const state = {
  workbench: null,
};

const byId = (id) => document.getElementById(id);

function appendMessage(role, body) {
  const list = byId("conversation");
  const item = document.createElement("article");
  item.className = "message " + role;
  const speaker = document.createElement("span");
  speaker.textContent = role === "user" ? "user" : "lotus";
  const text = document.createElement("p");
  text.textContent = body;
  item.append(speaker, text);
  list.append(item);
  list.scrollTop = list.scrollHeight;
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

function renderSessions(sessions) {
  byId("session-list").replaceChildren(...sessions.map((session) => {
    const item = document.createElement("div");
    item.className = "session-item" + (session.active ? " active" : "");
    item.innerHTML = "<span>" + (session.active ? "●" : "○") + "</span><strong></strong><small></small>";
    item.querySelector("strong").textContent = session.title;
    item.querySelector("small").textContent = session.timeLabel;
    return item;
  }));
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
    const item = document.createElement("div");
    item.className = "approval-item";
    const dot = document.createElement("span");
    dot.className = "status-dot planned";
    const label = document.createElement("strong");
    label.textContent = "Patch " + edit.runId;
    const count = document.createElement("small");
    count.textContent = edit.files.length + " files";
    item.title = edit.files.join(", ");
    item.append(dot, label, count);
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
    item.addEventListener("click", () => {
      byId("goal-input").value = command;
      byId("goal-input").focus();
    });
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
    title.textContent = run.runId + " · " + run.status;
    const meta = document.createElement("small");
    meta.textContent = run.scenario + " · " + run.eventCount + " events · " + run.updatedAt;
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

function renderWorkbench(workbench) {
  state.workbench = workbench;
  byId("cwd-label").textContent = workbench.cwd;
  byId("mode-label").textContent = workbench.mode;
  byId("network-label").textContent = workbench.network === "connected" ? "连接" : "本地";
  byId("model-chip").textContent = workbench.model.label;
  byId("cpu-label").textContent = workbench.cpuLabel;
  byId("memory-label").textContent = workbench.memoryLabel;
  byId("clock-label").textContent = workbench.clock;
  byId("run-count").textContent = workbench.recentRuns.length + " runs";
  byId("context-target").textContent = workbench.context.target;
  byId("context-type").textContent = workbench.context.type;
  byId("context-scope").textContent = workbench.context.scope;
  byId("context-priority").textContent = workbench.context.priority;
  byId("ego-home").textContent = workbench.storage.egoHome;
  byId("sqlite-path").textContent = workbench.storage.sqlite;
  byId("trajectory-path").textContent = workbench.storage.trajectories;
  renderSessions(workbench.sessions);
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
}

async function refreshStatus() {
  const response = await fetch("/api/workbench");
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "workbench status failed");
  }
  renderWorkbench(body.workbench);
}

function commandReply(goal) {
  if (goal === "/help") {
    return "可用命令：/scan、/analyze、/report、/threat、/config、/clear。";
  }
  if (goal === "/scan") {
    return "运行受控示例：ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json";
  }
  if (goal === "/analyze") {
    return "建议运行 pnpm typecheck、pnpm build、ego doctor，并检查最新 trajectory。";
  }
  if (goal === "/report") {
    return "报告入口：ego replay --trajectory-id <run-id>，或访问 /runs/:id/report。";
  }
  if (goal === "/threat") {
    return "威胁情报查询需要通过 Policy Gate 和授权范围校验后执行。";
  }
  if (goal === "/config") {
    const workbench = state.workbench;
    return "模型：" + (workbench?.model.label || "deterministic fallback") + "\\nSQLite：" + (workbench?.storage.sqlite || ".ego/ego.sqlite");
  }
  return null;
}

export async function submitMission(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const goal = byId("goal-input").value.trim();
  if (!goal) {
    appendMessage("assistant", "任务目标不能为空。");
    return;
  }

  if (goal === "/clear") {
    byId("conversation").replaceChildren();
    byId("goal-input").value = "";
    return;
  }

  appendMessage("user", goal);
  const localReply = commandReply(goal);
  if (localReply) {
    appendMessage("assistant", localReply);
    byId("goal-input").value = "";
    return;
  }

  button.disabled = true;
  button.textContent = "思考中";

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({ message: goal }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "请求失败");
    }

    const plan = result.plan?.length ? "\\n\\n计划：\\n- " + result.plan.join("\\n- ") : "";
    const commands = result.suggestedCommands?.length
      ? "\\n\\n建议命令：\\n- " + result.suggestedCommands.join("\\n- ")
      : "";
    appendMessage("assistant", result.assistantMessage + plan + commands);
    byId("goal-input").value = "";
    await refreshStatus();
  } catch (error) {
    appendMessage("assistant", "任务处理失败：" + (error instanceof Error ? error.message : String(error)));
  } finally {
    button.disabled = false;
    button.textContent = "发送 (Enter)";
  }
}

byId("mission-form").addEventListener("submit", submitMission);
refreshStatus().catch((error) => {
  appendMessage("assistant", "状态读取失败：" + (error instanceof Error ? error.message : String(error)));
});`;
}
