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
  top: 8px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 22px;
  height: 54px;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--muted);
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.12);
}

.left-rail-toggle {
  right: -18px;
}

.right-rail-toggle {
  left: -18px;
}

.rail-gutter:hover {
  color: var(--accent);
  border-color: var(--line-strong);
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
  grid-template-columns: minmax(0, 1fr) minmax(132px, auto);
  gap: 8px;
  align-items: center;
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
}`;
}
