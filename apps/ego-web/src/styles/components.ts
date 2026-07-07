export function renderComponentsCss(): string {
  return String.raw`.window-dots {
  display: flex;
  gap: 8px;
}

.window-dots span {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: var(--danger);
}

.window-dots span:nth-child(2) {
  background: var(--warning);
}

.window-dots span:nth-child(3) {
  background: var(--success);
}

.brand-logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
  filter: drop-shadow(0 0 12px rgba(169, 120, 255, 0.48));
}

.design-chip,
.status-pill,
.mode-tab,
.inspector-tab,
.mobile-section-nav button,
.quick-command,
.manage-tabs button {
  min-height: 30px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--muted);
}

.design-chip {
  padding: 5px 9px;
  color: var(--cyan);
}

.panel {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(172, 139, 255, 0.2);
}

.panel-heading h2,
.kernel-group strong,
.manage-card strong {
  color: var(--text);
}

.ghost,
.link-button {
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.settings-page-header .ghost {
  white-space: nowrap;
}

.rail-toggle {
  position: absolute;
  top: 10px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 24px;
  height: 42px;
  min-height: 0;
  border: 1px solid rgba(172, 139, 255, 0.2);
  border-radius: 999px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.left-rail-toggle {
  right: -13px;
}

.right-rail-toggle {
  left: -13px;
}

.rail-toggle:hover {
  border-color: var(--line-strong);
  color: var(--text);
}

body.rail-left-collapsed .left-rail-toggle,
body.rail-right-collapsed .right-rail-toggle {
  background: rgba(169, 120, 255, 0.14);
  color: var(--cyan);
}

.session-list,
.tool-list,
.file-list,
.log-list,
.approval-list,
.kernel-list {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.session-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 6px;
}

.session-item,
.tool-item,
.file-item,
.approval-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  text-align: left;
}

.session-delete {
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  background: var(--panel);
  cursor: pointer;
}

.session-delete:hover {
  border-color: rgba(239, 111, 145, 0.52);
  color: var(--danger);
}

button.session-item,
button.approval-item,
.mode-tab,
.inspector-tab,
.mobile-section-nav button,
.quick-command,
.manage-tabs button {
  cursor: pointer;
}

.session-item.active,
.mode-tab.active,
.inspector-tab.active,
.mobile-section-nav button.active,
.manage-tabs button.active {
  border-color: var(--line-strong);
  background: var(--panel-strong);
  color: var(--text);
}

.settings-sidebar .manage-tabs button {
  justify-content: start;
  min-height: 36px;
  padding: 0 12px;
  border-color: transparent;
  border-radius: 999px;
  text-align: left;
}

.settings-back {
  justify-self: start;
  min-height: 34px;
  padding: 0 8px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}

.settings-search {
  display: grid;
  gap: 6px;
}

.settings-search span,
.settings-group-label {
  color: var(--muted);
  font-size: 12px;
}

.settings-search input {
  min-height: 36px;
  border-radius: 999px;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 8px currentColor;
}

.status-dot.planned {
  background: var(--warning);
}

.status-dot.offline {
  background: var(--muted);
  box-shadow: none;
}

.agent-cockpit {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.mode-tabs,
.inspector-tabs,
.manage-tabs,
#quick-command-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.mode-tab,
.inspector-tab,
.manage-tabs button {
  padding: 5px 10px;
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
  gap: 12px;
  min-height: 0;
  padding: 14px;
}

.message {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
}

.message span {
  color: var(--cyan);
  font-family: var(--mono-font);
  font-size: 12px;
  font-weight: 700;
}

.empty-thread {
  display: grid;
  gap: 4px;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  background: var(--control-bg);
}

.message p,
.message pre,
.message-body,
.thinking-details,
.timeline-row,
.kernel-group,
.manage-card,
.plan-preview,
.diff-preview,
.check-item {
  border: 1px solid rgba(172, 139, 255, 0.22);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
}

.message p,
.message pre,
.message-body {
  margin: 0;
  overflow: auto;
  padding: 11px 13px;
  color: var(--text);
  line-height: 1.55;
  white-space: pre-wrap;
}

.message.system p,
.message.system .message-body {
  border-color: rgba(231, 183, 95, 0.34);
  color: var(--muted);
}

.message-content {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.message-body {
  white-space: normal;
}

.message pre,
code,
.quick-command,
.command-item,
.diff-preview,
.plan-preview,
.approval-file-chip,
.status-pill,
.design-chip {
  font-family: var(--mono-font);
}

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
  font-weight: 760;
  line-height: 1.35;
}

.markdown-body h1 {
  font-size: 20px;
}

.markdown-body h2 {
  font-size: 17px;
}

.markdown-body h3 {
  font-size: 15px;
}

.markdown-body ul,
.markdown-body ol {
  margin: 0;
  padding-left: 1.35rem;
}

.markdown-body li + li {
  margin-top: 0.35rem;
}

.markdown-body code {
  padding: 0.08rem 0.32rem;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--code-bg);
  color: var(--accent);
  font-size: 0.92em;
}

.markdown-body pre {
  margin: 0;
  overflow: auto;
  padding: 11px 13px;
  border: 1px solid rgba(172, 139, 255, 0.2);
  border-radius: var(--radius-sm);
  background: var(--code-bg);
}

.markdown-body pre code {
  padding: 0;
  border: 0;
  background: transparent;
}

.markdown-body a {
  color: var(--cyan);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.thinking-details {
  padding: 8px 11px;
  color: var(--muted);
}

.thinking-details summary {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cyan);
  cursor: pointer;
  font-family: var(--mono-font);
  font-size: 12px;
}

.thinking-details summary::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--warning);
  box-shadow: 0 0 10px rgba(231, 183, 95, 0.55);
}

.thinking-details[open] summary {
  margin-bottom: 8px;
}

.thinking-details ul {
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 1rem;
}

.execution-timeline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 14px 14px;
  border-top: 1px solid rgba(172, 139, 255, 0.18);
}

.timeline-strip {
  display: flex;
  min-height: 34px;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  padding: 8px 14px 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}

.timeline-row {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px;
}

.timeline-row span,
.context-list dd,
.log-item,
.kernel-group small,
.kernel-item,
.manage-page,
#model-settings-note {
  color: var(--muted);
}

.composer {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: 0 16px 40px rgba(4, 6, 18, 0.22);
}

textarea,
input,
select {
  width: 100%;
  border: 1px solid rgba(172, 139, 255, 0.34);
  border-radius: var(--radius-sm);
  outline: none;
  background: var(--input-bg);
  color: var(--text);
}

textarea {
  min-height: 84px;
  max-height: 220px;
  padding: 12px;
  resize: none;
}

input,
select {
  min-height: 38px;
  padding: 0 11px;
}

.composer-actions,
.model-settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 10px;
}

button[type="submit"],
.model-save-button,
.approve-action:not(:disabled) {
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent), var(--cyan));
  color: var(--button-text-on-accent);
  cursor: pointer;
  font-weight: 800;
}

button[type="submit"],
.model-save-button,
.model-test-button {
  min-height: 38px;
}

.model-test-button {
  border: 1px solid rgba(93, 214, 232, 0.42);
  border-radius: var(--radius-sm);
  background: rgba(93, 214, 232, 0.1);
  color: var(--cyan);
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.slash-palette {
  position: absolute;
  right: 12px;
  bottom: calc(100% + 8px);
  left: 12px;
  z-index: 5;
  display: grid;
  gap: 4px;
  max-height: 280px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--workbench-bg);
  box-shadow: var(--shadow);
}

.slash-palette[hidden],
.inspector-panel[hidden] {
  display: none;
}

.slash-command-option {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: left;
}

.slash-command-option.active,
.slash-command-option:hover {
  border-color: var(--line);
  background: var(--panel-strong);
}

.context-list {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 12px;
}

.context-list div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px;
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.approval-preview {
  display: grid;
  gap: 8px;
  padding: 0 12px 12px;
}

.approval-preview-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding-top: 6px;
}

.approve-action {
  min-width: 96px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}

.approval-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.approval-file-chip {
  max-width: 100%;
  overflow: hidden;
  padding: 4px 7px;
  border: 1px solid rgba(172, 139, 255, 0.24);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-preview,
.diff-preview {
  overflow-wrap: anywhere;
  padding: 10px 12px;
  color: var(--muted);
  font-size: 12px;
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
  gap: 8px;
}

.check-item {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
}

.check-item.passed {
  border-color: rgba(101, 217, 154, 0.42);
}

.check-item.failed {
  border-color: rgba(239, 111, 145, 0.52);
}

.model-settings-form,
.ui-settings-form,
.manage-page {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.settings-section {
  max-width: 860px;
}

.settings-section + .settings-section,
.settings-section + .panel-heading {
  margin-top: 26px;
}

.settings-option-row {
  display: grid;
  gap: 12px;
  padding: 14px 0;
}

.settings-option-row + .settings-option-row {
  border-top: 1px solid var(--line);
}

.settings-option-row small {
  display: block;
  color: var(--muted);
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.choice-card {
  display: grid;
  gap: 4px;
  min-height: 78px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--control-bg);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.choice-card.active {
  border-color: rgba(54, 139, 247, 0.42);
  background: var(--panel-strong);
  box-shadow: inset 0 0 0 1px rgba(54, 139, 247, 0.18);
}

.settings-status-pill {
  justify-self: start;
  padding: 5px 10px;
  border-radius: 999px;
  color: var(--success);
  background: rgba(28, 166, 106, 0.1);
}

.settings-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.settings-row label {
  color: var(--muted);
}

.settings-hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.settings-close-button {
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--control-bg);
  color: var(--text);
  cursor: pointer;
}

.settings-close-button:hover {
  background: var(--panel-strong);
}

.settings-group-title h3 {
  margin: 0;
}

.settings-group-title p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.settings-row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
}

.settings-row-card + .settings-row-card {
  border-top: 1px solid var(--line);
}

.settings-row-card small {
  display: block;
  color: var(--muted);
}

.switch-control {
  appearance: none;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--line);
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
}

.switch-control::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--control-bg);
  transition: transform 0.15s;
}

.switch-control:checked {
  background: rgba(54, 139, 247, 0.7);
}

.switch-control:checked::after {
  transform: translateX(16px);
}

.project-change-button {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.project-change-button:hover {
  background: var(--panel-strong);
}

.project-picker-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-path-row {
  display: flex;
  gap: 8px;
}

.project-path-row input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--control-bg);
  color: var(--text);
}

.inherit-chip {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: rgba(54, 139, 247, 0.1);
  color: rgba(54, 139, 247, 0.9);
}

.manage-card {
  padding: 9px 10px;
}

.quick-command {
  padding: 7px 12px;
}

.bolt {
  color: var(--accent);
  font-size: 22px;
  font-weight: 900;
}

.status-toast {
  position: absolute;
  right: 24px;
  bottom: 84px;
  z-index: 20;
  max-width: min(420px, calc(100vw - 48px));
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text);
  background: var(--workbench-bg);
  box-shadow: var(--shadow);
}

.status-toast[hidden] {
  display: none;
}

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

.rail-gutter {
  position: absolute;
  top: 10px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 18px;
  height: 46px;
  min-height: 0;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--muted);
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  opacity: 0.76;
  transition: opacity 140ms ease, transform 140ms ease, background 140ms ease;
}

.left-rail-toggle {
  right: -13px;
}

.right-rail-toggle {
  left: -13px;
}

.rail-gutter:hover {
  color: var(--accent);
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.96);
  opacity: 1;
  transform: translateY(-1px);
}

.panel-body[hidden] {
  display: none;
}

.panel-toggle,
.icon-button {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-height: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.panel-toggle:hover,
.icon-button:hover {
  border-color: var(--line);
  color: var(--accent);
  background: var(--control-bg);
}

.panel-toggle.is-collapsed .icon {
  transform: rotate(180deg);
}

.project-card,
.session-item,
.tool-item,
.detail-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--control-bg);
}

.project-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin: 10px 12px;
  padding: 10px;
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

.new-session-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: calc(100% - 24px);
  margin: 0 12px 10px;
  min-height: 38px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--panel-strong);
  color: var(--text);
  font-weight: 650;
  cursor: pointer;
}

.new-session-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.session-list,
.tool-list,
.detail-list {
  display: grid;
  gap: 8px;
  padding: 0 12px 12px;
}

.session-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 44px;
  padding: 4px;
}

.session-item.active {
  border-color: var(--line-strong);
  background: var(--panel-strong);
}

.session-open {
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.session-open small,
.project-card small,
.tool-item small,
.detail-card small,
.muted {
  color: var(--muted);
}

.tool-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--muted);
  box-shadow: 0 0 10px currentColor;
}

.status-dot.success {
  background: var(--success);
  color: var(--success);
}

.status-dot.warning {
  background: var(--warning);
  color: var(--warning);
}

.run-chip {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.run-chip:hover {
  color: var(--accent);
  border-color: var(--line-strong);
}

.command-strip {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  color: var(--muted);
}

.permission-mode-list {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.permission-mode {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 48px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--control-bg);
  color: var(--muted);
  text-align: left;
  cursor: pointer;
}

.permission-mode strong,
.permission-mode small {
  display: block;
}

.permission-mode strong {
  color: var(--text);
}

.permission-mode.active {
  border-color: rgba(47, 125, 246, 0.34);
  background: rgba(47, 125, 246, 0.06);
  color: var(--accent);
}

.composer {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.composer textarea,
.composer input,
.settings-search,
.settings-card select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text);
}

.composer textarea {
  min-height: 84px;
  resize: vertical;
  padding: 12px;
}

.composer input,
.settings-search,
.settings-card select {
  min-height: 38px;
  padding: 0 12px;
}

.composer-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(132px, auto);
  gap: 8px;
  align-items: center;
}

.composer-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.composer-tool-button {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}

.composer-tool-button:hover,
.composer-tool-button:focus-visible {
  border-color: var(--line-strong);
  color: var(--accent);
  background: var(--accent-soft);
}

.slash-trigger {
  color: var(--accent);
  font-size: 18px;
  font-weight: 800;
}

.primary-action {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent), var(--cyan));
  color: var(--button-text-on-accent);
  font-weight: 720;
  cursor: pointer;
}

.primary-action:hover {
  filter: brightness(1.03);
}

.send-action {
  min-width: 132px;
  border-color: rgba(22, 133, 167, 0.18);
  border-radius: 9px;
  background: linear-gradient(180deg, #202733 0%, #151a23 100%);
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 8px 18px rgba(15, 23, 42, 0.12);
}

.send-action span {
  margin-left: 4px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 11px;
  font-weight: 650;
}

.send-action:hover {
  filter: none;
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 10px 22px rgba(15, 23, 42, 0.16);
}

.slash-menu {
  position: absolute;
  left: 12px;
  bottom: calc(100% + 8px);
  z-index: 8;
  width: min(520px, calc(100% - 24px));
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
}

.slash-menu[hidden] {
  display: none;
}

.slash-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.slash-menu-header strong {
  color: var(--text);
}

.slash-command-option {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  background: transparent;
  color: var(--muted);
  text-align: left;
  cursor: pointer;
}

.slash-command-option code {
  color: var(--accent);
}

.slash-command-option.active,
.slash-command-option:hover {
  background: rgba(47, 125, 246, 0.07);
  color: var(--text);
}

.settings-panel-entry {
  display: grid;
  justify-items: start;
  gap: 12px;
  margin: 14px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel-strong);
  color: var(--muted);
}

.settings-open-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--control-bg);
  color: var(--text);
  font-weight: 650;
  cursor: pointer;
}

.settings-open-button:hover {
  border-color: rgba(107, 79, 216, 0.34);
  background: var(--accent-soft);
  color: var(--accent);
}

.primary-action:disabled {
  cursor: wait;
  opacity: 0.62;
}

.slash-mark {
  color: var(--accent);
  font-size: 20px;
  font-weight: 800;
}

.quick-command-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.quick-command {
  white-space: nowrap;
  min-height: 28px;
  padding: 4px 10px;
}

.message-row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 18px;
  padding: 14px 16px;
}

.conversation-empty {
  display: grid;
  place-content: center;
  gap: 8px;
  min-height: 100%;
  padding: 28px;
  color: var(--muted);
  text-align: center;
}

.conversation-empty strong {
  color: var(--text);
  font-size: 16px;
}

.message-role {
  color: var(--cyan);
  font-family: var(--mono-font);
  font-weight: 700;
  font-size: 12px;
}

.message-bubble {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
}

.message-content {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
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
  gap: 5px;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
}

.message-action:hover {
  border-color: var(--line);
  background: var(--control-bg);
  color: var(--text);
}

.message-action.danger:hover {
  border-color: rgba(229, 72, 103, 0.28);
  color: var(--danger);
  background: rgba(229, 72, 103, 0.06);
}

.thinking-block summary {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  cursor: pointer;
}

.detail-card {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
}

.detail-card strong,
.detail-card p {
  overflow-wrap: anywhere;
}

.empty-state {
  padding: 12px;
  color: var(--muted);
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
  padding: 7px 9px;
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.markdown-body th {
  background: var(--panel-strong);
}

.markdown-body blockquote {
  margin: 10px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--accent);
  color: var(--muted);
  background: var(--accent-soft);
}

.markdown-body hr {
  height: 1px;
  margin: 14px 0;
  border: 0;
  background: var(--line);
}

.markdown-body p,
.markdown-body li {
  overflow-wrap: anywhere;
}

body[data-font-scale="compact"] {
  --ui-font-size: 12.5px;
}

body[data-font-scale="large"] {
  --ui-font-size: 14px;
}

body[data-density="compact"] {
  --gap: 9px;
}

body[data-density="comfortable"] {
  --gap: 16px;
}

.project-card {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.project-change-button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}

.project-change-button:hover {
  border-color: var(--line-strong);
  color: var(--accent);
  background: var(--accent-soft);
}

.settings-back,
.settings-close-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.settings-back:hover,
.settings-close-button:hover {
  border-color: var(--line);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text);
}

.settings-search {
  min-height: 38px;
  margin: 8px 0 6px;
  border-color: rgba(15, 23, 42, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.settings-nav {
  gap: 3px;
}

.settings-nav button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-height: 36px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #465468;
  text-align: left;
  cursor: pointer;
}

.settings-nav button.active {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.82);
  color: var(--text);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}

.settings-nav button:hover:not(.active) {
  background: rgba(255, 255, 255, 0.45);
}

.settings-hero {
  display: grid;
  gap: 5px;
}

.settings-hero span {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.settings-page-header h2 {
  font-size: 25px;
  letter-spacing: 0;
}

.settings-page-header p,
.settings-group-title p {
  color: var(--muted);
}

.settings-section {
  width: min(860px, 100%);
  margin: 0 auto;
}

.settings-section h3,
.settings-group-title h3 {
  font-size: 15px;
  margin: 0;
}

.settings-group-title {
  display: grid;
  gap: 4px;
  margin: 22px 0 10px;
}

.settings-group-title:first-child {
  margin-top: 0;
}

.settings-card {
  display: grid;
  gap: 0;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}

.preference-card select {
  width: min(220px, 100%);
}

.connector-form {
  padding: 14px;
}

.connector-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.connector-form-grid label {
  display: grid;
  gap: 6px;
}

.connector-form-grid label.wide {
  grid-column: 1 / -1;
}

.connector-form-grid span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.connector-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.connector-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.connector-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
  min-height: 50px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.76);
}

.connector-item strong,
.connector-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connector-item small {
  color: var(--muted);
}

.connector-status {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.connector-status.online {
  color: var(--success);
  background: rgba(28, 166, 106, 0.1);
}

.connector-status.muted {
  color: var(--muted);
  background: rgba(107, 114, 128, 0.1);
}

.settings-row-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
}

.settings-row-card + .settings-row-card {
  border-top: 1px solid var(--line);
}

.settings-row-card strong,
.settings-row-card small {
  display: block;
}

.settings-row-card small {
  margin-top: 3px;
  color: var(--muted);
}

.project-picker-card {
  padding: 0;
}

.project-path-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--line);
}

.project-path-row input {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--input-bg);
  color: var(--text);
}

.secondary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: #111827;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.secondary-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.13);
}

.inherit-chip {
  padding: 5px 9px;
  border-radius: 999px;
  color: var(--success);
  background: rgba(28, 166, 106, 0.1);
  font-size: 12px;
  font-weight: 700;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 10px 0 22px;
}

.option-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 14px;
  min-height: 76px;
  padding: 15px 16px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.76);
  cursor: pointer;
}

.option-card input {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  width: 18px;
  height: 18px;
  margin: 0;
  appearance: none;
  border: 1px solid rgba(15, 23, 42, 0.22);
  border-radius: 999px;
  background: #fff;
}

.option-card input:checked {
  border: 5px solid #2f7df6;
}

.option-card:has(input:checked) {
  border-color: rgba(47, 125, 246, 0.28);
  background: rgba(47, 125, 246, 0.06);
}

.option-card span {
  color: var(--text);
  font-weight: 700;
}

.option-card small {
  color: var(--muted);
}

.switch-control {
  width: 38px;
  height: 22px;
  margin: 0;
  appearance: none;
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 999px;
  background: #d9e1ea;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.switch-control::before {
  content: "";
  display: block;
  width: 18px;
  height: 18px;
  margin: 1px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
  transition: transform 160ms ease;
}

.switch-control:checked {
  border-color: rgba(47, 125, 246, 0.28);
  background: #2f7df6;
}

.switch-control:checked::before {
  transform: translateX(16px);
}

.visually-hidden-control,
.switch-control {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

.option-card {
  grid-template-columns: minmax(0, 1fr) 22px;
}

.option-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.option-mark {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 999px;
  background:
    radial-gradient(circle at center, transparent 0 42%, transparent 43%),
    #fff;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
}

.option-card input:checked ~ .option-mark {
  border-color: rgba(47, 125, 246, 0.5);
  background:
    radial-gradient(circle at center, #2f7df6 0 38%, transparent 39%),
    #fff;
  box-shadow: 0 0 0 4px rgba(47, 125, 246, 0.1);
}

.switch-visual {
  position: relative;
  width: 38px;
  height: 22px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 999px;
  background: #dce4ee;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
  transition: background 160ms ease, border-color 160ms ease;
}

.switch-visual::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.18);
  transition: transform 160ms ease;
}

.switch-control:checked + .switch-visual {
  border-color: rgba(47, 125, 246, 0.38);
  background: #2f7df6;
}

.switch-control:checked + .switch-visual::after {
  transform: translateX(16px);
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(238, 244, 250, 0.54);
  backdrop-filter: blur(12px);
}

.dialog-backdrop[hidden] {
  display: none;
}

.new-session-sheet {
  width: min(560px, calc(100vw - 36px));
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.18);
}

.new-session-sheet header,
.new-session-sheet footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.new-session-sheet header {
  border-bottom: 1px solid var(--line);
}

.new-session-sheet footer {
  border-top: 1px solid var(--line);
  background: rgba(248, 250, 252, 0.82);
}

.sheet-kicker {
  display: block;
  margin-bottom: 4px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
}

.new-session-sheet h2 {
  font-size: 19px;
}

.new-session-sheet p {
  margin-top: 5px;
  color: var(--muted);
}

.sheet-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}

.new-session-body {
  display: grid;
  gap: 12px;
  padding: 18px 20px;
}

.field-stack {
  display: grid;
  gap: 7px;
}

.field-stack span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.field-stack input {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text);
}

.directory-choice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(47, 125, 246, 0.24);
  border-radius: 12px;
  background: rgba(47, 125, 246, 0.06);
  color: var(--text);
  text-align: left;
  cursor: pointer;
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

.soft-action,
.confirm-action {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  font-weight: 700;
  cursor: pointer;
}

.soft-action {
  border: 1px solid var(--line);
  background: var(--control-bg);
  color: var(--muted);
}

.confirm-action {
  border: 1px solid transparent;
  background: #111827;
  color: #fff;
}

.confirm-action:disabled,
.secondary-action:disabled {
  cursor: wait;
  opacity: 0.58;
}

.rail-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: 8px;
  cursor: col-resize;
  opacity: 0;
}

.rail-resizer:hover,
.rail-resizer:focus-visible {
  opacity: 1;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.rail-resizer-left {
  right: -10px;
}

.rail-resizer-right {
  left: -10px;
}

.bottom-dock {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 190px;
  overflow: hidden;
}

.bottom-dock.is-collapsed {
  min-height: 44px;
  grid-template-rows: auto 0;
}

.bottom-dock.is-collapsed .dock-body {
  display: none;
}

.dock-tabs,
.dock-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dock-tab {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}

.dock-tab.active {
  border-color: var(--line-strong);
  color: var(--text);
}

.dock-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--muted);
  cursor: pointer;
}

.dock-body {
  display: grid;
  min-height: 0;
}

.dock-panel {
  min-height: 0;
  overflow: hidden;
}

.dock-panel[hidden] {
  display: none;
}

.terminal-output {
  min-height: 120px;
  max-height: 220px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  border-top: 1px solid var(--line);
  background: var(--code-bg);
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 12px;
  white-space: pre-wrap;
}

.terminal-command-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 10px;
}

/* Workbench v2 polish: compact Codex-like controls and real interaction surfaces. */
.rail-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: 6px;
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

.rail-resizer:hover {
  opacity: 1;
  background: rgba(47, 125, 246, 0.18);
}

.rail-toggle-icon {
  position: absolute;
  top: 12px;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 24px;
  height: 48px;
  min-height: 0;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--muted);
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.09);
  backdrop-filter: blur(12px);
}

.rail-toggle-icon:hover {
  border-color: rgba(47, 125, 246, 0.24);
  color: var(--accent);
  background: #fff;
}

.left-rail-toggle {
  right: -18px;
}

.right-rail-toggle {
  left: -18px;
}

body.rail-left-collapsed .left-rail-toggle,
body.rail-right-collapsed .right-rail-toggle {
  position: static;
  align-self: start;
  justify-self: center;
  margin-top: 12px;
  box-shadow: none;
}

.session-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.session-panel .panel-body {
  min-height: 0;
  overflow: auto;
}

.permission-trigger {
  width: auto;
  min-width: 84px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
}

.permission-menu {
  position: absolute;
  left: 12px;
  bottom: 56px;
  z-index: 10;
  display: grid;
  gap: 6px;
  width: min(330px, calc(100% - 24px));
  padding: 8px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.16);
}

.permission-menu[hidden] {
  display: none;
}

.permission-menu .permission-mode {
  min-height: 48px;
  padding: 9px 10px;
  border-radius: 10px;
}

.bottom-dock {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 150px;
  max-height: 260px;
  overflow: hidden;
}

.bottom-dock.is-collapsed {
  min-height: 42px;
  max-height: 42px;
}

.bottom-dock.is-collapsed .dock-panel {
  display: none;
}

.dock-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
}

.dock-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dock-tab,
.dock-close {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.dock-tab.active,
.dock-tab:hover,
.dock-close:hover {
  border-color: var(--line);
  background: var(--control-bg);
  color: var(--text);
}

.dock-panel {
  min-height: 0;
  overflow: auto;
  padding: 10px;
}

.terminal-output {
  min-height: 78px;
  max-height: 150px;
  margin: 0 0 8px;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  background: #0f1720;
  color: #e6edf3;
  font-family: var(--mono-font);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.terminal-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.event-flow {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.run-event-line {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}

.run-event-line strong {
  color: var(--accent);
  font-family: var(--mono-font);
  font-size: 11px;
}

.run-event-line span {
  color: var(--muted);
  overflow-wrap: anywhere;
}

.stream-answer {
  margin-top: 10px;
}

.approval-card,
.error-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(231, 183, 95, 0.34);
  border-radius: 10px;
  background: rgba(231, 183, 95, 0.08);
}

.error-card {
  border-color: rgba(229, 72, 103, 0.28);
  background: rgba(229, 72, 103, 0.06);
}

.send-action {
  background: #111827;
}

.send-action:hover {
  background: #0b1220;
}

.inspector-panel {
  padding: 10px;
}

.inspector-panel .detail-list {
  padding: 0;
}

.dock-list {
  display: grid;
  gap: 8px;
}

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
  .bottom-dock {
    max-height: 220px;
  }

  .composer-row,
  .terminal-input-row {
    grid-template-columns: 1fr;
  }

  .permission-menu {
    bottom: 102px;
  }
}`;
}
