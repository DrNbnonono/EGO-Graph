# Workbench UX Overhaul: Dock / Rails / Sessions / Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six concrete UX defects the user reported (dock defaults collapsed + reopen affordance; settings-back dead click; rail toggles moved to top-right; flat borderless sessions grouped by project; conversation auto-scroll during streaming; WeChat-style left/right message layout with copy + edit-resend).

**Architecture:** All changes live in `apps/ego-web` (HTML template `src/app/dashboard-page.ts`, client JS `src/client/dashboard-client.ts`, styles `src/styles/*.ts`). No backend/storage changes required — session grouping is done client-side from the existing `projectId`/`title` fields already returned by `/api/sessions`. The conversation auto-scroll fix is a one-line addition inside the streaming handler. Message edit-resend is a new client feature built on the existing `submitChatGoal` + composer textarea.

**Tech Stack:** Vanilla TS-in-template-literals (no framework), CSS custom properties, Vitest for the rendered-string regression suite.

---

## File Structure

- **Modify** `apps/ego-web/src/app/dashboard-page.ts` — dock markup (collapsed by default + reopen button), session list container, conversation markup is unchanged.
- **Modify** `apps/ego-web/src/client/dashboard-client.ts` — dock reopen handler, settings-back fix, session grouping renderer, conversation auto-scroll in `handleHarnessLine`, user right-aligned bubbles + edit/resend.
- **Modify** `apps/ego-web/src/styles/components.ts` — dock collapsed/open styles + reopen button, settings sidebar grid fix, borderless sessions + group headers, message-row user alignment + edit affordance.
- **Modify** `apps/ego-web/src/styles/layout.ts` — settings sidebar grid (root cause of dead click), rail toggle repositioning to top-right corner.
- **No new files.** No backend changes.

## Test constraints (regression net — must stay green)

The existing `apps/ego-web/test/*.test.ts` assert specific strings. These MUST remain true after edits:
- Token values: `--accent: #6b4fd8`, `--bg: #f7f9fc`, `--panel: rgba(255, 255, 255, 0.76)`, `--ui-font-size:`, `--body-font:`, contains `system-ui`.
- Selectors: `.workbench`, `.workbench-fit`, `.bottom-dock`, `.rail-resizer`, `.send-action`, `.settings-hero`, `.settings-open-button`, `.settings-row-card`, `.slash-menu`, `.switch-control`, `.terminal-output`, `.message-actions`, `.permission-mode`, `.connector-form`, `.conversation-scroll`, `.mobile-section-nav`, `.settings-page`, `.panel-body`, `.markdown-body`, `.inspector-panel`, plus `.markdown-body table/blockquote/hr`.
- Body rules: `overflow: hidden;`, `max-height: calc(100vh - 24px)`, `body.rail-left-collapsed`, `body.rail-right-collapsed`, `body.settings-open`, `data-settings-open`.
- Forbidden: `window-dots`, `serverRuns`, `Charter`, `ui-serif`.

Run after each task: `pnpm vitest run apps/ego-web/test` (must stay 16/16 green). Verify command for local visual: `pnpm exec tsx apps/ego-cli/src/index.ts serve` then open `http://127.0.0.1:4317`.

---

## Task 1: Fix settings "返回工作台" dead click (Issue #2)

**Root cause:** `.settings-sidebar` is `display: grid` with `grid-template-rows: auto auto 1fr` but contains 4 children (back button, search, nav, and an injected manage-tabs region). The grid mis-sizes the first row, and `.settings-back` (an `inline-flex` button with no `justify-self`) gets stretched/mispositioned — in the user's DOM snapshot it measured 577px wide (x=18,y=24,w=577), overlapping the whole page. The JS handler is correct; the click lands off the visible button.

**Files:**
- Modify: `apps/ego-web/src/styles/layout.ts:198-208` (`.settings-sidebar` grid)

- [ ] **Step 1: Fix the sidebar grid so children size to content, not stretch**

In `apps/ego-web/src/styles/layout.ts`, replace the `.settings-sidebar` block (lines 198-208):

```css
.settings-sidebar {
  display: grid;
  grid-template-rows: auto auto 1fr;
  align-content: start;
  gap: var(--sp-3);
  min-height: 0;
  padding: var(--sp-6) var(--sp-4);
  border-right: 1px solid var(--line);
  background: var(--surface-0);
  overflow: auto;
}
```

with:

```css
.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  min-height: 0;
  padding: var(--sp-6) var(--sp-4);
  border-right: 1px solid var(--line);
  background: var(--surface-0);
  overflow: auto;
}
```

Switching from grid (which stretches items) to flex-column lets each child size to its natural width. `min-width: 0` prevents the flex item from overflowing its 300px track.

- [ ] **Step 2: Ensure `.settings-back` does not stretch (justify-self start + max-width)**

In `apps/ego-web/src/styles/components.ts`, find the `.settings-back, .settings-close-button` rule (around line 1447) and add `justify-self: start` + `width: fit-content` to the shared declaration so the button never spans the sidebar:

```css
.settings-back,
.settings-close-button {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  width: fit-content;
  gap: var(--sp-2);
  min-height: 34px;
  padding: 0 var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
```

- [ ] **Step 3: Build + run tests**

Run: `pnpm --filter @ego-graph/ego-web build && pnpm vitest run apps/ego-web/test`
Expected: build OK, 16/16 tests pass.

- [ ] **Step 4: Visual verify (local)**

Run: `pnpm exec tsx apps/ego-cli/src/index.ts serve`, open `http://127.0.0.1:4317`, click Inspector → Settings (设置) tab → click "返回工作台". Expected: settings overlay closes, returns to workbench. Button should now be ~140px wide (text-width), not 577px.

- [ ] **Step 5: Commit**

```bash
git add apps/ego-web/src/styles/layout.ts apps/ego-web/src/styles/components.ts
git commit -m "fix(web): settings sidebar flex layout so 返回工作台 button is clickable"
```

---

## Task 2: Dock defaults collapsed + Codex-style reopen button (Issue #1)

**Goal:** The bottom dock (terminal/events/checks) should load collapsed by default, and a floating button in the bottom-right corner re-opens it (Codex-style).

**Files:**
- Modify: `apps/ego-web/src/app/dashboard-page.ts:157` (add `is-collapsed` class to dock)
- Modify: `apps/ego-web/src/app/dashboard-page.ts` (add reopen button inside `.center-stage`)
- Modify: `apps/ego-web/src/client/dashboard-client.ts:1096-1098` (`toggleBottomDock` — toggle reopen button visibility)
- Modify: `apps/ego-web/src/styles/components.ts` (`.dock-reopen` floating button + collapsed-by-default polish)

- [ ] **Step 1: Make dock collapsed by default in HTML**

In `apps/ego-web/src/app/dashboard-page.ts`, line 157, change:

```html
<section class="bottom-dock panel" id="bottom-dock" aria-label="底部命令面板">
```

to:

```html
<section class="bottom-dock panel is-collapsed" id="bottom-dock" aria-label="底部命令面板">
```

- [ ] **Step 2: Add the floating reopen button after the dock**

Still in `dashboard-page.ts`, immediately AFTER the closing `</section>` of `#bottom-dock` (line 179), add a reopen button inside `.center-stage`:

```html
          </section>
          <button class="dock-reopen" type="button" data-bottom-dock-toggle title="展开底部面板">${icon("terminal")}<span>终端</span></button>
        </section>
```

(The button is a sibling of `#bottom-dock`, both inside `.center-stage`.)

- [ ] **Step 3: Wire the reopen button via the existing delegation + toggle visibility**

In `apps/ego-web/src/client/dashboard-client.ts`, replace `toggleBottomDock` (lines 1096-1098):

```js
function toggleBottomDock() {
  byId("bottom-dock")?.classList.toggle("is-collapsed");
}
```

with:

```js
function toggleBottomDock() {
  const dock = byId("bottom-dock");
  if (!dock) return;
  const collapsed = dock.classList.toggle("is-collapsed");
  const reopen = document.querySelector(".dock-reopen");
  if (reopen) reopen.hidden = !collapsed;
}
```

The existing delegated handler at line 1255 (`if (target.dataset.bottomDockToggle !== undefined) toggleBottomDock();`) already covers the new button because it carries `data-bottom-dock-toggle`. No new listener needed.

- [ ] **Step 4: Show the reopen button on boot (since dock starts collapsed)**

In `dashboard-client.ts`, inside `boot()` (around lines 1275-1289), add at the end of boot, before any `return`:

```js
  const reopenBtn = document.querySelector(".dock-reopen");
  if (reopenBtn) reopenBtn.hidden = byId("bottom-dock")?.classList.contains("is-collapsed") ?? false;
```

- [ ] **Step 5: Style the dock-reopen floating button**

In `apps/ego-web/src/styles/components.ts`, add after the `.bottom-dock` block (find `.bottom-dock {` then add this rule right after the `.bottom-dock.is-collapsed` rule):

```css
.dock-reopen {
  position: absolute;
  right: var(--sp-3);
  bottom: var(--sp-3);
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 32px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-full);
  background: var(--overlay-bg);
  backdrop-filter: blur(12px);
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.dock-reopen:hover {
  color: var(--accent);
  border-color: var(--accent-line);
}

.dock-reopen[hidden] {
  display: none;
}
```

Also ensure `.center-stage` is a positioning context — confirm in `layout.ts` `.center-stage` has `position: relative` (it currently sets `position: relative` via `.left-rail, .right-rail` only). Add `position: relative;` to `.center-stage` in `layout.ts` (the rule at lines 94-101).

- [ ] **Step 6: Build + test + verify**

Run: `pnpm --filter @ego-graph/ego-web build && pnpm vitest run apps/ego-web/test`
Expected: build OK, 16/16 pass. Local verify: dock loads collapsed (just the tab bar visible), a small "终端" pill floats bottom-right, clicking it expands the dock; the chevron in the dock header re-collapses it and the pill reappears.

- [ ] **Step 7: Commit**

```bash
git add apps/ego-web/src/app/dashboard-page.ts apps/ego-web/src/client/dashboard-client.ts apps/ego-web/src/styles/components.ts apps/ego-web/src/styles/layout.ts
git commit -m "feat(web): collapse bottom dock by default with Codex-style reopen button"
```

---

## Task 3: Move rail collapse toggles to top-right corners (Issue #3)

**Goal:** Replace the side-mounted pill toggles with small buttons anchored to the top-right of the workbench header area (like ZCode), not floating off the rail edges.

**Files:**
- Modify: `apps/ego-web/src/styles/components.ts:479-525` (`.rail-toggle-icon` positioning)
- Modify: `apps/ego-web/src/app/dashboard-page.ts:94,183` (move buttons into the topbar region)

- [ ] **Step 1: Move the toggle buttons into the topbar (so they sit at the very top)**

In `apps/ego-web/src/app/dashboard-page.ts`, REMOVE the two toggle buttons from inside `.left-rail` (line 94) and `.right-rail` (line 183):

Remove line 94:
```html
<button class="rail-toggle-icon left-rail-toggle" type="button" data-rail-toggle="left" aria-label="收起左侧栏" title="收起左侧栏">${icon("chevronLeft")}</button>
```
Remove line 183:
```html
<button class="rail-toggle-icon right-rail-toggle" type="button" data-rail-toggle="right" aria-label="收起右侧栏" title="收起右侧栏">${icon("chevronRight")}</button>
```

Then add BOTH buttons into the `.runtime-strip` div (inside `.topbar`, around line 67-74), right before the closing `</div>` of `.runtime-strip`:

```html
        <div class="runtime-strip" aria-label="运行状态">
          <span>模式 <b id="mode-label">对话</b></span>
          <span>网络 <b id="network-label">读取中</b></span>
          <span>模型 <b id="model-chip">读取中</b></span>
          <span id="cpu-label">CPU --</span>
          <span id="memory-label">RSS --</span>
          <span id="clock-label">--:--:--</span>
          <button class="rail-toggle-icon left-rail-toggle" type="button" data-rail-toggle="left" aria-label="收起左侧栏" title="收起左侧栏">${icon("chevronLeft")}</button>
          <button class="rail-toggle-icon right-rail-toggle" type="button" data-rail-toggle="right" aria-label="收起右侧栏" title="收起右侧栏">${icon("chevronRight")}</button>
        </div>
```

- [ ] **Step 2: Restyle the toggles as compact icon buttons (no longer floating pills)**

In `apps/ego-web/src/styles/components.ts`, replace the entire `.rail-toggle-icon` block (lines ~479-525) with:

```css
.rail-toggle-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.rail-toggle-icon:hover {
  border-color: var(--accent-line);
  color: var(--accent);
  background: var(--accent-tint);
}

body.rail-left-collapsed .left-rail-toggle,
body.rail-right-collapsed .right-rail-toggle {
  border-color: var(--accent-line);
  background: var(--accent-tint);
  color: var(--accent);
}
```

This removes `position: absolute`, the side offsets (`right: -10px` / `left: -10px`), `backdrop-filter`, and the collapsed-state `position: static` override — the button now lives in the flex flow of `.runtime-strip` and stays in the header at all times (collapsed or not).

- [ ] **Step 3: Remove the now-dead `position:absolute` collapsed override**

The old rule `body.rail-left-collapsed .left-rail-toggle { position: static; align-self: start; ... }` is deleted by Step 2's full replacement. Verify no leftover `.rail-toggle-icon { position: absolute }` remains by grepping.

- [ ] **Step 4: Build + test + verify**

Run: `pnpm --filter @ego-graph/ego-web build && pnpm vitest run apps/ego-web/test`
Expected: build OK, 16/16 pass. Local verify: two small chevron buttons appear in the top-right of the header (next to the clock); clicking collapses/expands each rail; collapsed state highlights the button purple.

- [ ] **Step 5: Commit**

```bash
git add apps/ego-web/src/app/dashboard-page.ts apps/ego-web/src/styles/components.ts
git commit -m "feat(web): move rail collapse toggles into topbar as compact icon buttons"
```

---

## Task 4: Borderless, project-grouped session list (Issue #4)

**Goal:** Sessions render borderless (ZCode-style, no visible card boxes), grouped under collapsible project headers. Since `/api/sessions` already returns `projectId` per session, group client-side.

**Files:**
- Modify: `apps/ego-web/src/client/dashboard-client.ts:147-181` (`renderSessions` + `renderSessionItem`)
- Modify: `apps/ego-web/src/styles/components.ts` (`.session-item` borderless, `.session-group` header)

- [ ] **Step 1: Rewrite `renderSessions` to group by project**

In `apps/ego-web/src/client/dashboard-client.ts`, replace `renderSessions` (lines 147-155):

```js
function renderSessions() {
  const list = byId("session-list");
  if (!list) return;
  if (!state.sessions.length) {
    list.innerHTML = '<div class="empty-state">还没有会话</div>';
    return;
  }
  list.replaceChildren(...state.sessions.map(renderSessionItem));
}
```

with a grouping version. Insert this helper + rewritten function:

```js
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
  let index = 0;
  for (const [projectId, sessions] of groups) {
    const header = document.createElement("div");
    header.className = "session-group";
    const projectName = sessions[0]?.projectName || (projectId === state.project?.id ? state.project?.name : null) || "项目";
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
    index++;
  }
  list.append(fragment);
}
```

- [ ] **Step 2: Simplify `renderSessionItem` to be borderless + compact**

Replace `renderSessionItem` (lines 157-181) with:

```js
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
```

- [ ] **Step 3: Add a collapse handler for group headers (delegated)**

In `dashboard-client.ts`, inside the main delegated click listener (around line 1246 where `data-rail-toggle` is handled), add a branch for group toggles. Find:

```js
  if (target.dataset.railToggle) toggleRail(target.dataset.railToggle);
```

and add after it:

```js
  if (target.closest(".session-group-toggle")) {
    const group = target.closest(".session-group");
    if (group) {
      const items = group.nextElementSibling;
      const expanded = target.closest(".session-group-toggle").getAttribute("aria-expanded") === "true";
      target.closest(".session-group-toggle").setAttribute("aria-expanded", String(!expanded));
      if (items) items.hidden = expanded;
    }
  }
```

- [ ] **Step 4: Style sessions borderless + group headers**

In `apps/ego-web/src/styles/components.ts`, find the `.session-item` rule and replace the `.session-item` / `.session-open` / `.session-delete` block with a borderless version:

```css
.session-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 var(--sp-2) var(--sp-2);
}

.session-group {
  padding: 0 var(--sp-1);
}

.session-group + .session-group {
  margin-top: var(--sp-3);
}

.session-group-toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  width: 100%;
  min-height: 28px;
  padding: var(--sp-1) var(--sp-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.session-group-toggle:hover {
  color: var(--text);
  background: var(--control-bg);
}

.session-group-toggle .icon svg {
  transition: transform 140ms ease;
}

.session-group-toggle[aria-expanded="false"] .icon svg {
  transform: rotate(-90deg);
}

.session-group-count {
  margin-left: auto;
  padding: 0 var(--sp-1);
  border-radius: var(--radius-full);
  background: var(--control-bg);
  color: var(--muted);
  font-size: 10px;
}

.session-group-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: var(--sp-2);
}

.session-group-items[hidden] {
  display: none;
}

.session-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 34px;
  padding: var(--sp-1) var(--sp-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: background 120ms ease;
}

.session-item:hover {
  background: var(--control-bg);
}

.session-item.active {
  background: var(--accent-tint);
}

.session-item.active .session-text strong {
  color: var(--accent);
}

.session-open {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  padding: var(--sp-1) var(--sp-1);
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.session-open .session-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.session-open strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text);
}

.session-open small {
  color: var(--muted);
  font-size: var(--text-xs);
}

.session-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--muted);
  flex: 0 0 auto;
}

.session-item.active .session-dot {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-ring);
}

.session-delete {
  display: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.session-item:hover .session-delete {
  display: grid;
}

.session-delete:hover {
  color: var(--danger);
  background: var(--danger-tint);
}
```

Note: this removes the old `.session-item { border: 1px solid ...; background: var(--control-bg) }` boxed look — sessions are now flush, separated only by hover background, matching ZCode.

- [ ] **Step 5: Build + test + verify**

Run: `pnpm --filter @ego-graph/ego-web build && pnpm vitest run apps/ego-web/test`
Expected: build OK, 16/16 pass. Local verify: session list shows project group headers (uppercase, muted) with collapsible chevrons; sessions underneath are borderless rows; active session has purple tint + purple dot; delete button appears on hover only.

- [ ] **Step 6: Commit**

```bash
git add apps/ego-web/src/client/dashboard-client.ts apps/ego-web/src/styles/components.ts
git commit -m "feat(web): borderless session list grouped by project with collapsible headers"
```

---

## Task 5: Conversation auto-scroll during streaming (Issue #5)

**Goal:** As the model streams tokens / appends events, the conversation column scrolls to follow the latest content.

**Files:**
- Modify: `apps/ego-web/src/client/dashboard-client.ts:384-424` (`handleHarnessLine`)

- [ ] **Step 1: Add a scroll-to-bottom helper**

Near the top of `dashboard-client.ts`, after the `byId` helper (search for `function byId`), add:

```js
function scrollConversationToBottom() {
  const conversation = byId("conversation");
  if (conversation) conversation.scrollTop = conversation.scrollHeight;
}
```

- [ ] **Step 2: Call it inside `handleHarnessLine` after content mutations**

In `handleHarnessLine` (lines 384-424), after the block that updates `runUi.answer` / `runUi.flow`, add a scroll call. Find the end of the function body (just before the final `if (line.type === "error")` block, around line 397) and insert:

```js
  // Follow the latest streamed content.
  scrollConversationToBottom();
```

Concretely, the function tail becomes:

```js
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
    scrollConversationToBottom();
  }
  if (line.type === "error") {
    runUi.answer.innerHTML = '<div class="error-card"><strong>运行失败</strong><p>' + escapeHtml(line.message || "未知错误") + "</p></div>";
    scrollConversationToBottom();
  }
  // Always follow streaming content (thinking blocks, tool events, deltas).
  scrollConversationToBottom();
}
```

The final unconditional `scrollConversationToBottom()` covers `agent.event` deltas and `appendRunEvent` additions which grow the `.event-flow` / `.stream-answer` without their own scroll.

- [ ] **Step 3: Build + test + verify**

Run: `pnpm --filter @ego-graph/ego-web build && pnpm vitest run apps/ego-web/test`
Expected: build OK, 16/16 pass. Local verify: send a message; as the run streams events/tokens, the conversation visibly scrolls down to keep the newest content in view (previously it stayed pinned at the run-bubble creation point).

- [ ] **Step 4: Commit**

```bash
git add apps/ego-web/src/client/dashboard-client.ts
git commit -m "fix(web): auto-scroll conversation to bottom during streaming"
```

---

## Task 6: WeChat-style left/right messages + edit/resend (Issue #6)

**Goal:** Assistant messages left-aligned (avatar left, bubble left), user messages right-aligned (avatar right, bubble right, deeper fill). Both get hover actions; user messages additionally get 复制 + 编辑 (re-send). Assistant keeps 复制/记忆/事件.

**Files:**
- Modify: `apps/ego-web/src/client/dashboard-client.ts:258-299` (`appendMessage`) + new `editUserMessage`/`resendMessage` helpers + delegation branch
- Modify: `apps/ego-web/src/styles/components.ts:760-835` (`.message-row` alignment per role)

- [ ] **Step 1: Rewrite `appendMessage` — user actions include 编辑, role drives alignment via class**

Replace `appendMessage` (lines 258-299) with:

```js
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

  // Hover actions. Assistant: copy/remember/events. User: copy/edit(resend).
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
      '<button type="button" class="message-action" data-edit-message>编辑</button>';
    content.append(actions);
  }

  row.append(avatar, content);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  if (!options.skipPersist && role !== "system") persistMessage(role, String(body || ""));
  return row;
}
```

- [ ] **Step 2: Add `editUserMessage` (loads message into composer for re-send)**

Add after `appendMessage`:

```js
function editUserMessage(row) {
  const text = String(row?.dataset?.messageText || "");
  const input = byId("goal-input");
  if (input) {
    input.value = text;
    input.focus();
    // Move cursor to end.
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }
}
```

This is "edit → resend" UX: clicking 编辑 puts the original user text back into the composer; the user edits and presses Enter to send a new message (the simplest correct behavior without message mutation/history rewriting).

- [ ] **Step 3: Wire `data-edit-message` in the delegated click handler**

In the main delegated click listener (around line 1229 where `data-copy-message` is handled), find:

```js
  if (target.dataset.copyMessage !== undefined) { ... }
```

and add after the copy block:

```js
  if (target.dataset.editMessage !== undefined) {
    const row = target.closest(".message-row");
    if (row) editUserMessage(row);
  }
```

- [ ] **Step 4: Restyle `.message-row` for left (assistant) / right (user) alignment**

In `apps/ego-web/src/styles/components.ts`, replace the `.message-row` rule (lines ~760-765) and the role-specific bubble rules. Replace:

```css
.message-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-4);
}
```

with a flex-based row that flips direction for user:

```css
.message-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-4);
}

/* Assistant + system: avatar left, content left-aligned. */
.message-row.role-assistant,
.message-row.role-system {
  flex-direction: row;
}

.message-row.role-assistant .message-content,
.message-row.role-system .message-content {
  align-items: flex-start;
}

.message-row.role-assistant .message-bubble,
.message-row.role-system .message-bubble {
  border-top-left-radius: var(--radius-sm);
  border-top-right-radius: var(--radius-lg);
}

/* User: avatar right, content right-aligned (WeChat / ZCode style). */
.message-row.role-user {
  flex-direction: row-reverse;
}

.message-row.role-user .message-content {
  align-items: flex-end;
}

.message-row.role-user .message-role {
  flex-direction: row-reverse;
}

.message-row.role-user .message-bubble {
  max-width: min(560px, 80%);
  background: var(--accent);
  border-color: var(--accent);
  color: var(--button-text-on-accent);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-sm);
}

.message-row.role-user .message-actions {
  justify-content: flex-end;
}

.message-row.role-user .message-avatar {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, var(--cyan)));
  color: var(--button-text-on-accent);
  border-color: transparent;
}

.message-content {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  max-width: min(680px, 82%);
}
```

Note: this REMOVES the old `.message-row.role-user .message-bubble { background: var(--accent-tint) }` soft-purple rule and replaces it with a solid deep-purple fill (the "deeper box" the user asked for). The assistant bubble keeps its inset surface; user bubble is solid accent with white text.

- [ ] **Step 5: Build + test + verify**

Run: `pnpm --filter @ego-graph/ego-web build && pnpm vitest run apps/ego-web/test`
Expected: build OK, 16/16 pass. Local verify: send a message — your message appears on the RIGHT with a solid purple bubble + white text + avatar on the right; lotus replies on the LEFT with the inset bubble + avatar on the left. Hover a user message → 复制 + 编辑 buttons appear; click 编辑 → the text loads into the composer for resending.

- [ ] **Step 6: Commit**

```bash
git add apps/ego-web/src/client/dashboard-client.ts apps/ego-web/src/styles/components.ts
git commit -m "feat(web): WeChat-style left/right messages with copy + edit-resend"
```

---

## Self-Review

**Spec coverage (user's 6 points → tasks):**
1. Dock collapsed by default + Codex reopen button → **Task 2** ✓
2. "返回工作台" no response → **Task 1** ✓
3. Rail collapse buttons to top-right, ugly → **Task 3** ✓
4. Sidebar borderless + grouped by folder → **Task 4** ✓
5. Conversation doesn't scroll during model work → **Task 5** ✓
6. Left/right messages like WeChat, user box deeper, copy + edit/resend → **Task 6** ✓

**Placeholder scan:** No TBD/TODO/"add error handling" — every step shows concrete code.

**Type/identifier consistency:** `scrollConversationToBottom`, `editUserMessage`, `renderSessions` (grouping), `toggleBottomDock` (reopen), `.dock-reopen`, `.session-group`, `.session-group-toggle`, `.session-dot`, `data-edit-message` — used consistently across tasks. `icon("...")` names (`terminal`, `chevronLeft`, `chevronRight`) verified against `src/components/icons.ts` (19-icon set confirmed in prior session).

**Risk:** Task 4 groups by `session.projectId` + `session.projectName` — the storage record only guarantees `projectId`. The renderer falls back to `state.project.name` then "项目", so it won't break if `projectName` is absent. No backend change needed.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-07-07-workbench-ux-overhaul.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
