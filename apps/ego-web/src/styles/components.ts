export function renderComponentsCss(): string {
  return String.raw`/* ============================================================
   EGO-Graph Workbench — components
   Flat solid base + glass reserved for overlays/topbar/send.
   Single accent (purple) + cyan for secondary labels.
   ============================================================ */

/* ---------- Brand ---------- */
.brand-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px var(--accent-ring));
  border-radius: var(--radius-sm);
}

.design-chip {
  padding: 3px var(--sp-2);
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-full);
  background: var(--accent-tint);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.01em;
}

/* ---------- Panels & headings ---------- */
.panel {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  min-height: 46px;
  padding: 0 var(--sp-4);
  border-bottom: 1px solid var(--line);
}

.panel-heading h2 {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.panel-body[hidden] {
  display: none;
}

.inspector-heading,
.kernel-group strong,
.manage-card strong,
.project-card strong,
.session-open strong {
  color: var(--text);
}

/* ---------- Generic buttons ---------- */
.ghost,
.link-button {
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.ghost:hover,
.link-button:hover {
  text-decoration: underline;
}

.settings-page-header .ghost {
  white-space: nowrap;
}

.primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 38px;
  padding: 0 var(--sp-4);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--cyan)));
  color: var(--button-text-on-accent);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  box-shadow: 0 4px 12px var(--accent-ring), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
}

.primary-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px var(--accent-ring), inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.primary-action:active {
  transform: translateY(0);
}

.primary-action:disabled {
  cursor: wait;
  opacity: 0.6;
  transform: none;
}

.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 38px;
  padding: 0 var(--sp-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.secondary-action:hover {
  transform: translateY(-1px);
  border-color: var(--accent-ring);
  box-shadow: var(--shadow-md);
}

.secondary-action:disabled {
  cursor: wait;
  opacity: 0.55;
  transform: none;
}

.soft-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 38px;
  padding: 0 var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--muted);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.soft-action:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

.confirm-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 38px;
  padding: 0 var(--sp-4);
  border: 1px solid var(--warning-line);
  border-radius: var(--radius);
  background: var(--warning-tint);
  color: var(--warning);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.confirm-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px var(--warning-line);
}

.confirm-action:disabled {
  cursor: wait;
  opacity: 0.55;
  transform: none;
}

.approve-action:not(:disabled) {
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--cyan)));
  color: var(--button-text-on-accent);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}

.model-save-button {
  min-height: 38px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--cyan)));
  color: var(--button-text-on-accent);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}

.model-save-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.model-test-button {
  min-height: 38px;
  border: 1px solid var(--accent-line);
  border-radius: var(--radius);
  background: var(--cyan-tint);
  color: var(--cyan);
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

button[type="submit"] {
  min-height: 38px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--cyan)));
  color: var(--button-text-on-accent);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}

/* ---------- Send action (single definition — purple glass gradient) ---------- */
.send-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-width: 132px;
  min-height: 38px;
  padding: 0 var(--sp-4);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 40%, var(--cyan)) 100%);
  color: var(--button-text-on-accent);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  box-shadow: 0 8px 22px var(--accent-ring), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
}

.send-action span {
  margin-left: var(--sp-1);
  color: rgba(255, 255, 255, 0.72);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}

.send-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px var(--accent-ring), inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.send-action:active {
  transform: translateY(0);
}

.send-action:disabled {
  cursor: wait;
  opacity: 0.6;
  transform: none;
}

/* ---------- Status dots & pills ---------- */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--muted);
  box-shadow: 0 0 8px currentColor;
  flex: 0 0 auto;
}

.status-dot.success {
  background: var(--success);
  color: var(--success);
}

.status-dot.warning,
.status-dot.planned {
  background: var(--warning);
  color: var(--warning);
}

.status-dot.offline {
  background: var(--muted);
  box-shadow: none;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 3px var(--sp-2);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

/* ---------- Tabs (mode / inspector / dock / manage) ---------- */
.mode-tabs,
.inspector-tabs,
.manage-tabs,
#quick-command-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.mode-tab,
.inspector-tab,
.manage-tabs button,
.quick-command,
.mobile-section-nav button,
.status-pill {
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.mode-tab,
.inspector-tab,
.manage-tabs button {
  padding: 5px var(--sp-3);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.quick-command {
  padding: 4px var(--sp-3);
  white-space: nowrap;
  font-size: var(--text-sm);
}

.mode-tab:hover,
.inspector-tab:hover,
.manage-tabs button:hover,
.quick-command:hover {
  color: var(--text);
  background: var(--control-bg);
}

.mode-tab.active,
.inspector-tab.active,
.manage-tabs button.active,
.mobile-section-nav button.active,
.quick-command.active {
  border-color: var(--accent-line);
  background: var(--accent-tint);
  color: var(--accent);
}

.mode-tab.active,
.inspector-tab.active {
  font-weight: var(--weight-semibold);
}

.settings-sidebar .manage-tabs button {
  justify-content: start;
  min-height: 36px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius);
  text-align: left;
}

.run-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: 28px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.run-chip:hover {
  color: var(--accent);
  border-color: var(--accent-line);
}

/* ---------- Icon primitives ---------- */
.icon {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-button,
.panel-toggle {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-height: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.icon-button:hover,
.panel-toggle:hover {
  border-color: var(--line);
  color: var(--accent);
  background: var(--control-bg);
}

.panel-toggle.is-collapsed .icon {
  transform: rotate(180deg);
}

/* ---------- Rails & resizers ---------- */
.rail-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: 8px;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 140ms ease, background 140ms ease;
}

.rail-resizer-left {
  right: calc(var(--gap) * -0.5);
}

.rail-resizer-right {
  left: calc(var(--gap) * -0.5);
}

.rail-resizer:hover,
.rail-resizer:focus-visible {
  opacity: 1;
  background: var(--accent-tint);
}

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
  color: var(--accent);
}

/* ---------- Sessions / project card ---------- */
.session-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.session-panel .panel-body {
  min-height: 0;
  overflow: auto;
}

.tool-list,
.detail-list,
.file-list,
.log-list,
.approval-list,
.kernel-list {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3);
}

.tool-list,
.detail-list {
  padding: 0 var(--sp-3) var(--sp-3);
}

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

.project-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--sp-3);
  align-items: center;
  margin: var(--sp-3) var(--sp-3) var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-inset);
}

.project-card strong,
.project-card small,
.session-open strong,
.session-open small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card small,
.session-open small,
.tool-item small,
.detail-card small,
.connector-item small,
.muted {
  color: var(--muted);
}

.project-change-button {
  min-height: 28px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--muted);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.project-change-button:hover {
  border-color: var(--accent-line);
  color: var(--accent);
  background: var(--accent-tint);
}

.new-session-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  width: calc(100% - 24px);
  margin: 0 var(--sp-3) var(--sp-3);
  min-height: 38px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.new-session-button:hover {
  border-color: var(--accent);
  border-style: solid;
  color: var(--accent);
  background: var(--accent-tint);
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

.session-item:hover .session-delete,
.session-item:focus-within .session-delete {
  display: grid;
}

.session-delete:hover {
  color: var(--danger);
  background: var(--danger-tint);
}

.tool-item,
.file-item,
.approval-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--sp-2);
  align-items: center;
  min-height: 34px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-1);
}

.kernel-item,
.kernel-group small,
.manage-page,
.log-item,
#model-settings-note {
  color: var(--muted);
}

/* ---------- Agent cockpit / conversation ---------- */
.agent-cockpit {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.agent-thread {
  min-height: 0;
}

.conversation-scroll {
  height: 100%;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.conversation {
  display: grid;
  align-content: start;
  gap: var(--sp-4);
  min-height: 0;
  padding: var(--sp-4);
}

.conversation-empty,
.empty-thread,
.empty-state {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-6);
  color: var(--muted);
  text-align: center;
}

.conversation-empty {
  place-content: center;
  min-height: 100%;
}

.conversation-empty strong {
  color: var(--text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
}

.empty-thread {
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  background: var(--control-bg);
}

.empty-state {
  padding: var(--sp-3);
}

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

/* Right-align label + bubble inside the column. justify-items is the grid equivalent
   of align-items-on-flex; the original align-items: flex-end was a no-op. */
.message-row.role-user .message-content {
  justify-items: end;
}

/* Cap the user bubble tighter than the assistant's to keep the chat-bubble silhouette.
   The previous max-width on .message-bubble was dead (lost specificity tie with
   .message-content defined later); placing the cap here works. */
.message-row.role-user .message-content .message-bubble {
  max-width: min(560px, 80%);
  background: var(--accent);
  border-color: var(--accent);
  color: var(--button-text-on-accent);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-sm);
}

/* Note: the dead flex-direction: row-reverse on .message-role was removed --
   the role label is a single text child, nothing to flip. */

.message-row.role-user .message-actions {
  justify-content: flex-end;
}

.message-row.role-user .message-avatar {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, var(--cyan)));
  color: var(--button-text-on-accent);
  border-color: transparent;
}

/* Message avatar: circular, brand ring for assistant, neutral for user. */
.message-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--accent-tint);
  color: var(--accent);
  border: 1px solid var(--accent-line);
  font-family: var(--mono-font);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  flex: 0 0 auto;
}

.message-row.role-assistant .message-avatar,
.message-row.role-system .message-avatar {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--cyan)));
  color: var(--button-text-on-accent);
  border-color: transparent;
  box-shadow: 0 4px 12px var(--accent-ring);
}

.message-role {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--muted);
  font-family: var(--mono-font);
  font-weight: var(--weight-semibold);
  font-size: var(--text-xs);
  margin-bottom: var(--sp-1);
}

.message-role::first-letter {
  text-transform: uppercase;
}

.message-row.role-assistant .message-role {
  color: var(--accent);
}

.message-content {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  max-width: min(680px, 82%);
}

.message-bubble {
  min-width: 0;
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-inset);
  color: var(--text);
  border-top-left-radius: var(--radius-sm);
}

.message-row.role-system .message-bubble {
  background: var(--warning-tint);
  border-color: var(--warning-line);
  color: var(--muted);
}

.message-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: 26px;
  opacity: 0;
  transition: opacity 140ms ease;
}

.message-row:hover .message-actions,
.message-actions:focus-within {
  opacity: 1;
}

.message-action {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: 26px;
  padding: 0 var(--sp-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: var(--text-xs);
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.message-action:hover {
  border-color: var(--line);
  background: var(--control-bg);
  color: var(--text);
}

.message-action.danger:hover {
  border-color: var(--danger-line);
  color: var(--danger);
  background: var(--danger-tint);
}

.thinking-block summary,
.thinking-details summary {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--muted);
  cursor: pointer;
  font-family: var(--mono-font);
  font-size: var(--text-sm);
}

.thinking-block summary::before,
.thinking-details summary::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--warning);
  box-shadow: 0 0 8px var(--warning-line);
  flex: 0 0 auto;
}

.thinking-details {
  padding: var(--sp-2) var(--sp-3);
  color: var(--muted);
}

.thinking-details[open] summary {
  margin-bottom: var(--sp-2);
}

.event-flow {
  display: grid;
  gap: var(--sp-1);
  margin-top: var(--sp-2);
}

.run-event-line {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: var(--sp-2);
  padding: var(--sp-1) 0;
  border-top: 1px solid var(--line);
}

.run-event-line strong {
  color: var(--accent);
  font-family: var(--mono-font);
  font-size: var(--text-xs);
}

.run-event-line span {
  color: var(--muted);
  overflow-wrap: anywhere;
}

.stream-answer {
  margin-top: var(--sp-2);
}

.run-progress .message-role::after {
  content: "· 思考中";
  color: var(--warning);
}

/* legacy message grid */
.message {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--sp-3);
}

.message span {
  color: var(--cyan);
  font-family: var(--mono-font);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
}

.message p,
.message pre,
.message-body {
  margin: 0;
  overflow: auto;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-inset);
  color: var(--text);
  line-height: 1.55;
  white-space: pre-wrap;
}

.message.system p,
.message.system .message-body {
  border-color: var(--warning-line);
  color: var(--muted);
}

/* ---------- Timeline strip ---------- */
.timeline-strip {
  display: flex;
  min-height: 34px;
  gap: var(--sp-2);
  align-items: center;
  overflow-x: auto;
  padding: var(--sp-2) var(--sp-4);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: var(--text-sm);
}

.timeline-row {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
}

.execution-timeline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--line);
}

/* ---------- Composer ---------- */
.composer {
  position: relative;
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.composer-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(132px, auto);
  gap: var(--sp-2);
  align-items: center;
}

.composer-tools {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

.composer-tool-button {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  min-height: 0;
  padding: 0 var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-1);
  color: var(--muted);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.composer-tool-button:hover,
.composer-tool-button:focus-visible {
  border-color: var(--accent-line);
  color: var(--accent);
  background: var(--accent-tint);
}

.composer-actions,
.model-settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: var(--sp-3);
}

textarea,
input,
select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  outline: none;
  background: var(--input-bg);
  color: var(--text);
}

textarea {
  min-height: 84px;
  max-height: 220px;
  padding: var(--sp-3);
  resize: none;
  line-height: 1.6;
}

input,
select {
  min-height: 38px;
  padding: 0 var(--sp-3);
}

.composer textarea,
.composer input,
.settings-search,
.settings-card select,
.field-stack input,
.project-path-row input {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text);
}

.composer textarea {
  min-height: 84px;
  resize: vertical;
  padding: var(--sp-3);
}

.composer input,
.settings-search,
.settings-card select,
.project-path-row input,
.field-stack input {
  min-height: 38px;
  padding: 0 var(--sp-3);
}

/* ---------- Slash command palette (glass overlay) ---------- */
.slash-menu,
.slash-palette {
  position: absolute;
  z-index: 8;
  left: var(--sp-3);
  bottom: calc(100% + var(--sp-2));
  width: min(520px, calc(100% - 24px));
  max-height: min(420px, calc(100vh - 360px));
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--overlay-bg);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-pop);
}

.slash-menu[hidden],
.slash-palette[hidden],
.inspector-panel[hidden] {
  display: none;
}

.slash-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slash-menu-header strong {
  color: var(--text);
}

.slash-command-option {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: center;
  width: 100%;
  min-height: 38px;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.slash-command-option code,
.slash-command-option strong {
  color: var(--accent);
  font-family: var(--mono-font);
}

.slash-command-option.active,
.slash-command-option:hover {
  background: var(--accent-tint);
  color: var(--text);
}

.slash-trigger,
.slash-mark {
  color: var(--accent);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
}

.quick-command-list {
  display: flex;
  gap: var(--sp-1);
  overflow-x: auto;
  scrollbar-width: thin;
}

/* ---------- Permission menu (glass overlay) ---------- */
.permission-trigger {
  width: auto;
  min-width: 92px;
  padding: 0 var(--sp-3);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.permission-menu {
  position: absolute;
  left: var(--sp-3);
  bottom: 56px;
  z-index: 10;
  display: grid;
  gap: var(--sp-1);
  width: min(330px, calc(100% - 24px));
  padding: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--overlay-bg);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-pop);
}

.permission-menu[hidden] {
  display: none;
}

.permission-mode-list {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3);
}

.permission-mode {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: center;
  min-height: 48px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-1);
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}

.permission-mode strong,
.permission-mode small {
  display: block;
}

.permission-mode strong {
  color: var(--text);
}

.permission-mode:hover {
  border-color: var(--line-strong);
}

.permission-mode.active {
  border-color: var(--accent-line);
  background: var(--accent-tint);
  color: var(--accent);
}

.permission-mode.active strong {
  color: var(--accent);
}

.permission-menu .permission-mode {
  min-height: 48px;
  padding: var(--sp-2) var(--sp-3);
}

/* ---------- Inspector & context ---------- */
.inspector-panel {
  padding: var(--sp-3);
}

.inspector-panel .detail-list {
  padding: 0;
}

.detail-list {
  display: grid;
  gap: var(--sp-2);
}

.detail-card {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-1);
}

.detail-card strong,
.detail-card p {
  overflow-wrap: anywhere;
}

.context-list {
  display: grid;
  gap: var(--sp-2);
  margin: 0;
  padding: var(--sp-3);
}

.context-list div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--sp-3);
}

.context-list dd,
dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
}

/* ---------- Approval / checks ---------- */
.approval-card,
.error-card {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--warning-line);
  border-radius: var(--radius);
  background: var(--warning-tint);
  color: var(--text);
}

.error-card {
  border-color: var(--danger-line);
  background: var(--danger-tint);
}

.approval-preview {
  display: grid;
  gap: var(--sp-2);
  padding: 0 var(--sp-3) var(--sp-3);
}

.approval-preview-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sp-2);
  align-items: center;
  padding-top: var(--sp-1);
}

.approve-action {
  min-width: 96px;
  min-height: 32px;
  padding: var(--sp-1) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.approval-files {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.approval-file-chip {
  max-width: 100%;
  overflow: hidden;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-family: var(--mono-font);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-preview,
.diff-preview {
  overflow-wrap: anywhere;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-inset);
  color: var(--muted);
  font-family: var(--mono-font);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.diff-preview {
  min-height: 150px;
  max-height: 360px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
}

.check-list {
  display: grid;
  gap: var(--sp-2);
}

.check-item {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.check-item.passed {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}

.check-item.failed {
  border-color: var(--danger-line);
}

/* ---------- Settings ---------- */
.settings-open-button {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 34px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-1);
  color: var(--text);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.settings-open-button:hover {
  border-color: var(--accent-line);
  background: var(--accent-tint);
  color: var(--accent);
}

.settings-back,
.settings-close-button {
  display: inline-flex;
  align-items: center;
  /* width: fit-content defeats the flex cross-axis stretch that made this span the sidebar. */
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

.settings-back:hover,
.settings-close-button:hover {
  border-color: var(--line);
  background: var(--control-bg);
  color: var(--text);
}

.settings-search {
  min-height: 38px;
  margin: var(--sp-2) 0 var(--sp-1);
  border-radius: var(--radius-full);
  border-color: var(--line);
}

.settings-search span,
.settings-group-label,
.settings-search input {
  color: var(--muted);
  font-size: var(--text-sm);
}

.settings-nav button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--sp-3);
  min-height: 38px;
  padding: 0 var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.settings-nav button:hover:not(.active) {
  background: var(--control-bg);
  color: var(--text);
}

.settings-nav button.active {
  border-color: var(--accent-line);
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: var(--weight-semibold);
}

.settings-hero {
  display: grid;
  gap: var(--sp-1);
}

.settings-hero span,
.settings-kicker {
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-page-header p,
.settings-group-title p {
  color: var(--muted);
  max-width: 720px;
}

.settings-section {
  width: min(860px, 100%);
  margin: 0 auto;
  padding-bottom: var(--sp-8);
}

.settings-section + .settings-section {
  margin-top: var(--sp-8);
}

.settings-section > h3,
.settings-section .settings-group-title {
  margin: 0 0 var(--sp-4);
}

.settings-section > .settings-card + h3,
.project-picker-card + h3 {
  margin-top: var(--sp-8);
}

.settings-group-title {
  display: grid;
  gap: var(--sp-1);
  margin: var(--sp-6) 0 var(--sp-3);
}

.settings-group-title:first-child {
  margin-top: 0;
}

.settings-group-title h3,
.settings-section h3 {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  margin: 0;
}

.settings-card {
  display: grid;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.settings-row-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4);
}

.settings-row-card + .settings-row-card {
  border-top: 1px solid var(--line);
}

.settings-row-card strong,
.settings-row-card small,
.settings-row-card span {
  display: block;
}

.settings-row-card small {
  margin-top: 3px;
  color: var(--muted);
  font-size: var(--text-sm);
}

.settings-option-row {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4) 0;
}

.settings-option-row + .settings-option-row {
  border-top: 1px solid var(--line);
}

.settings-option-row small {
  display: block;
  color: var(--muted);
}

.settings-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: center;
}

.settings-row label {
  color: var(--muted);
}

.settings-status-pill {
  justify-self: start;
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--radius-full);
  color: var(--success);
  background: var(--success-tint);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

.settings-panel-entry {
  display: grid;
  justify-items: start;
  gap: var(--sp-3);
  margin: var(--sp-4);
  padding: var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-inset);
  color: var(--muted);
}

.settings-button,
.copy-action,
.memory-action,
.event-action,
.permission-trigger,
.slash-trigger,
.attach-action {
  border-radius: var(--radius);
}

.model-settings-form,
.ui-settings-form,
.manage-page {
  display: grid;
  gap: var(--sp-2);
  padding: var(--sp-3);
}

/* ---------- Option / choice cards (radio) ---------- */
.choice-grid,
.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}

.option-grid {
  margin: var(--sp-3) 0 var(--sp-6);
}

.choice-card,
.option-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22px;
  gap: var(--sp-1) var(--sp-4);
  min-height: 76px;
  padding: var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.choice-card.active,
.option-card:has(input:checked) {
  border-color: var(--accent-line);
  background: var(--accent-tint);
  box-shadow: var(--ring);
}

.choice-card span,
.option-card span {
  color: var(--text);
  font-weight: var(--weight-semibold);
}

.choice-card small,
.option-card small {
  color: var(--muted);
}

.option-card input,
.visually-hidden-control {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

.option-mark {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-full);
  background: var(--surface-1);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.option-card input:checked ~ .option-mark {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-tint);
}

/* ---------- Switch (single definition) ---------- */
.switch-control {
  appearance: none;
  width: 38px;
  height: 22px;
  margin: 0;
  border-radius: var(--radius-full);
  background: var(--line-strong);
  position: relative;
  cursor: pointer;
  transition: background 160ms ease;
}

.switch-control::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--surface-1);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2);
  transition: transform 160ms ease;
}

.switch-control:checked {
  background: var(--accent);
}

.switch-control:checked::before {
  transform: translateX(16px);
}

.switch-visual {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--line-strong);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
  transition: background 160ms ease;
}

.switch-visual::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: var(--surface-1);
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.18);
  transition: transform 160ms ease;
}

.switch-control:checked + .switch-visual {
  background: var(--accent);
}

.switch-control:checked + .switch-visual::after {
  transform: translateX(16px);
}

/* ---------- Connectors (MCP) ---------- */
.connector-form {
  padding: var(--sp-4);
}

.connector-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}

.connector-form-grid label {
  display: grid;
  gap: var(--sp-1);
}

.connector-form-grid label.wide {
  grid-column: 1 / -1;
}

.connector-form-grid span {
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.connector-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
}

.connector-list {
  display: grid;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}

.connector-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: var(--sp-2);
  align-items: center;
  min-height: 50px;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.connector-item strong,
.connector-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connector-status {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

.connector-status.online {
  color: var(--success);
  background: var(--success-tint);
}

.connector-status.muted {
  color: var(--muted);
  background: var(--control-bg);
}

/* ---------- Project picker (settings > general) ---------- */
.project-picker-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  margin-bottom: var(--sp-2);
}

.project-path-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-top: 1px solid var(--line);
}

.project-path-row:first-child {
  border-top: 0;
}

.inherit-chip {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-full);
  color: var(--success);
  background: var(--success-tint);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

.preference-card select {
  width: min(220px, 100%);
}

/* ---------- Dialog: new session (glass) ---------- */
.dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: var(--sp-6);
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
  backdrop-filter: blur(12px);
}

.dialog-backdrop[hidden] {
  display: none;
}

.new-session-sheet {
  width: min(560px, calc(100vw - 36px));
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--overlay-bg);
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-pop);
}

.new-session-sheet header,
.new-session-sheet footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-5);
}

.new-session-sheet header {
  border-bottom: 1px solid var(--line);
}

.new-session-sheet footer {
  border-top: 1px solid var(--line);
  background: var(--surface-inset);
}

.sheet-kicker {
  display: block;
  margin-bottom: var(--sp-1);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.new-session-sheet h2 {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
}

.new-session-sheet p {
  margin-top: var(--sp-1);
  color: var(--muted);
}

.sheet-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-1);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}

.sheet-close:hover {
  border-color: var(--accent-line);
  color: var(--accent);
}

.new-session-body {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-5);
}

.field-stack {
  display: grid;
  gap: var(--sp-1);
}

.field-stack span {
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.field-stack input {
  min-height: 40px;
  padding: 0 var(--sp-3);
}

.directory-choice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.directory-choice:hover {
  border-color: var(--accent-line);
  background: var(--accent-tint);
}

.directory-choice small,
.directory-choice strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-choice small {
  color: var(--muted);
}

/* ---------- Bottom dock / terminal ---------- */
.bottom-dock {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 132px;
  max-height: 232px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.bottom-dock.is-collapsed {
  min-height: 42px;
  max-height: 42px;
}

.bottom-dock.is-collapsed .dock-panel,
.bottom-dock.is-collapsed .dock-body {
  display: none;
}

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

.dock-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-height: 40px;
  padding: var(--sp-1) var(--sp-3);
  border-bottom: 1px solid var(--line);
}

.dock-tabs,
.dock-toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.dock-tabs {
  gap: var(--sp-1);
}

.dock-tab,
.dock-close {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: 30px;
  padding: 0 var(--sp-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.dock-tab.active,
.dock-tab:hover,
.dock-close:hover {
  border-color: var(--line);
  background: var(--control-bg);
  color: var(--text);
}

.dock-body {
  display: grid;
  min-height: 0;
}

.dock-panel {
  min-height: 0;
  overflow: auto;
  padding: var(--sp-3);
}

.dock-panel[hidden] {
  display: none;
}

.dock-list {
  display: grid;
  gap: var(--sp-2);
}

/* Terminal = the one intentionally-dark surface, kept for legibility. */
.terminal-output {
  min-height: 64px;
  max-height: 124px;
  margin: 0 0 var(--sp-2);
  overflow: auto;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #0f1720;
  color: #e6edf3;
  font-family: var(--mono-font);
  font-size: var(--text-sm);
  line-height: 1.55;
  white-space: pre-wrap;
}

.terminal-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sp-2);
}

/* ---------- Toast / misc ---------- */
.status-toast {
  position: absolute;
  right: var(--sp-6);
  bottom: 84px;
  z-index: 20;
  max-width: min(420px, calc(100vw - 48px));
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-full);
  color: var(--text);
  background: var(--overlay-bg);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-lg);
}

.status-toast[hidden] {
  display: none;
}

.command-strip {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-3);
  padding-top: var(--sp-2);
  color: var(--muted);
}

.command-item {
  font-family: var(--mono-font);
}

.bolt {
  color: var(--accent);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
}

.manage-card {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

/* ---------- Markdown body ---------- */
.markdown-body {
  overflow-wrap: anywhere;
}

.markdown-body > * + * {
  margin-top: 0.78em;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3 {
  color: var(--text);
  font-family: var(--display-font);
  font-weight: var(--weight-bold);
  line-height: 1.35;
  letter-spacing: -0.014em;
}

.markdown-body h1 {
  font-size: var(--text-2xl);
}

.markdown-body h2 {
  font-size: var(--text-xl);
}

.markdown-body h3 {
  font-size: var(--text-lg);
}

.markdown-body ul,
.markdown-body ol {
  margin: 0;
  padding-left: 1.35rem;
}

.markdown-body li + li {
  margin-top: 0.35rem;
}

.markdown-body p,
.markdown-body li {
  overflow-wrap: anywhere;
}

.markdown-body code {
  padding: 0.08rem 0.32rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--code-bg);
  color: var(--accent);
  font-family: var(--mono-font);
  font-size: 0.9em;
}

.markdown-body pre {
  margin: 0;
  overflow: auto;
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--code-bg);
}

.markdown-body pre code {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}

.markdown-body a {
  color: var(--cyan);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body table {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: auto;
  border-collapse: collapse;
}

.markdown-body th,
.markdown-body td {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.markdown-body th {
  background: var(--surface-inset);
  font-weight: var(--weight-semibold);
}

.markdown-body blockquote {
  margin: var(--sp-3) 0;
  padding: var(--sp-2) var(--sp-3);
  border-left: 3px solid var(--accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--muted);
  background: var(--accent-tint);
}

/* User bubble uses a solid --accent background; markdown inside it must be readable.
   Scope these overrides so they only apply inside .message-row.role-user. */
.message-row.role-user .markdown-body {
  color: var(--button-text-on-accent);
}

.message-row.role-user .markdown-body h1,
.message-row.role-user .markdown-body h2,
.message-row.role-user .markdown-body h3 {
  color: var(--button-text-on-accent);
}

.message-row.role-user .markdown-body a {
  color: color-mix(in srgb, var(--button-text-on-accent) 75%, var(--cyan));
  text-decoration: underline;
}

.message-row.role-user .markdown-body blockquote {
  border-left-color: var(--button-text-on-accent);
  background: color-mix(in srgb, var(--accent) 65%, black);
  color: var(--button-text-on-accent);
}

.message-row.role-user .markdown-body code {
  background: color-mix(in srgb, var(--button-text-on-accent) 18%, var(--accent));
  border-color: color-mix(in srgb, var(--button-text-on-accent) 30%, var(--accent));
  color: var(--button-text-on-accent);
}

.markdown-body hr {
  height: 1px;
  margin: var(--sp-4) 0;
  border: 0;
  background: var(--line);
}

/* ---------- Responsive refinements living with the component layer ---------- */
@media (max-width: 1180px) {
  .rail-resizer,
  .rail-toggle-icon {
    display: none;
  }

  .center-stage {
    grid-template-rows: minmax(420px, auto) auto auto;
  }
}

@media (max-width: 720px) {
  .center-stage {
    height: auto;
    grid-template-rows: auto auto auto;
  }

  .agent-cockpit {
    min-height: 340px;
    max-height: 420px;
  }

  .conversation-scroll {
    min-height: 220px;
  }

  .composer {
    background: var(--surface-1);
  }

  .bottom-dock {
    min-height: 128px;
    max-height: 210px;
  }

  .composer-row,
  .terminal-input-row {
    grid-template-columns: 1fr;
  }

  .slash-menu {
    left: var(--sp-2);
    width: calc(100% - 16px);
    max-height: 260px;
  }

  .permission-menu {
    bottom: 102px;
  }
}`;
}
