export function renderDashboardCss(): string {
  return String.raw`:root {
  color-scheme: dark;
  --bg: #05070f;
  --panel: rgba(16, 13, 31, 0.82);
  --panel-strong: rgba(32, 21, 58, 0.9);
  --line: rgba(178, 94, 255, 0.32);
  --line-strong: rgba(210, 121, 255, 0.72);
  --text: #f4ecff;
  --muted: #9d91b7;
  --lotus: #c35cff;
  --violet: #7d3cff;
  --cyan: #6de8ff;
  --green: #64f39a;
  --amber: #ffd166;
  --danger: #ff6b8f;
  --radius: 8px;
  font-family: "Cascadia Code", "SFMono-Regular", "Microsoft YaHei UI", monospace;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 50% -20%, rgba(180, 66, 255, 0.28), transparent 42%),
    linear-gradient(180deg, #080b18 0%, #03040a 100%);
  color: var(--text);
}

button,
input,
textarea {
  font: inherit;
}

.stars {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.42;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at center, black, transparent 75%);
}

.workbench {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(1540px, calc(100vw - 36px));
  min-height: calc(100vh - 36px);
  margin: 18px auto;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: rgba(5, 7, 15, 0.78);
  box-shadow: 0 0 60px rgba(125, 60, 255, 0.22), inset 0 0 64px rgba(195, 92, 255, 0.05);
  backdrop-filter: blur(18px);
}

.topbar {
  display: grid;
  grid-template-columns: auto minmax(260px, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 50px;
  padding: 0 18px;
  border-bottom: 1px solid var(--line);
}

.window-dots {
  display: flex;
  gap: 9px;
}

.window-dots span {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--danger);
}

.window-dots span:nth-child(2) {
  background: #ffd166;
}

.window-dots span:nth-child(3) {
  background: #64f39a;
}

.brand,
.runtime-strip {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  color: var(--muted);
}

.brand strong {
  color: var(--lotus);
}

.brand-orbit {
  width: 12px;
  height: 12px;
  border: 1px solid var(--lotus);
  border-radius: 999px;
  box-shadow: 0 0 12px var(--lotus);
}

.runtime-strip {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
}

.runtime-strip b,
.runtime-chip.ready {
  color: var(--green);
}

.dashboard-shell {
  display: grid;
  grid-template-columns: 250px minmax(420px, 1fr) 320px;
  gap: 14px;
  min-height: 0;
  padding: 14px;
}

.left-rail,
.right-rail,
.center-stage {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: inset 0 0 24px rgba(195, 92, 255, 0.04);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(178, 94, 255, 0.2);
}

.panel-heading.compact {
  min-height: 42px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  color: var(--lotus);
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.05;
  text-shadow: 0 0 26px rgba(195, 92, 255, 0.7);
}

h2 {
  font-size: 15px;
  color: var(--text);
}

.ghost,
.link-button {
  border: 0;
  background: transparent;
  color: var(--lotus);
  cursor: pointer;
}

.session-list,
.tool-list,
.file-list,
.log-list,
.approval-list {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.session-item,
.tool-item,
.file-item,
.approval-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--muted);
}

.session-item.active {
  border-color: var(--line-strong);
  background: rgba(195, 92, 255, 0.13);
  color: var(--text);
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--green);
  box-shadow: 0 0 10px currentColor;
}

.status-dot.planned {
  background: var(--amber);
}

.status-dot.offline {
  background: var(--muted);
  box-shadow: none;
}

.hero-lockup {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 18px 0 4px;
  text-align: center;
}

.lotus-mark {
  display: grid;
  place-items: center;
  width: 180px;
  height: 136px;
  border: 0;
  background: radial-gradient(circle, rgba(195, 92, 255, 0.24), transparent 70%);
}

.lotus-image {
  width: 170px;
  height: 120px;
  object-fit: contain;
  filter: drop-shadow(0 0 26px rgba(195, 92, 255, 0.78));
}

.hero-lockup p,
.intro-panel p,
.context-list dd,
.log-item {
  color: var(--muted);
}

.intro-panel {
  padding: 14px 18px;
  line-height: 1.7;
}

.console-panel {
  min-height: 270px;
}

.conversation {
  display: grid;
  gap: 12px;
  max-height: 310px;
  overflow: auto;
  padding: 14px;
}

.message {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
}

.message span {
  color: var(--lotus);
  font-weight: 700;
}

.message p,
.message pre {
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  padding: 11px 13px;
  border: 1px solid rgba(178, 94, 255, 0.28);
  border-radius: 6px;
  background: rgba(10, 8, 20, 0.86);
  color: var(--text);
  line-height: 1.55;
}

.message.user p {
  border-color: rgba(109, 232, 255, 0.45);
}

.composer {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: rgba(14, 9, 28, 0.9);
  box-shadow: 0 0 24px rgba(195, 92, 255, 0.16);
}

textarea,
input {
  width: 100%;
  border: 1px solid rgba(178, 94, 255, 0.36);
  border-radius: 6px;
  outline: none;
  background: rgba(5, 7, 15, 0.9);
  color: var(--text);
}

textarea {
  min-height: 78px;
  resize: vertical;
  padding: 12px;
}

input {
  height: 38px;
  padding: 0 11px;
}

textarea:focus,
input:focus {
  border-color: var(--lotus);
  box-shadow: 0 0 0 3px rgba(195, 92, 255, 0.16);
}

.composer-actions {
  display: grid;
  grid-template-columns: 1fr 150px;
  gap: 10px;
}

button[type="submit"] {
  border: 0;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--lotus), var(--cyan));
  color: #070912;
  cursor: pointer;
  font-weight: 800;
}

button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.context-list {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 12px 14px;
}

.context-list div {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 10px;
}

dt {
  color: var(--text);
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.log-item {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 8px;
  font-size: 12px;
}

.quickbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  min-height: 50px;
  padding: 0 18px;
  border-top: 1px solid var(--line);
  color: var(--muted);
}

#quick-command-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-command {
  padding: 7px 14px;
  border-radius: 6px;
  background: rgba(195, 92, 255, 0.14);
  color: #d9b4ff;
}

.bolt {
  color: var(--lotus);
  font-weight: 900;
  font-size: 24px;
}

.sr-compatible {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.empty {
  color: var(--muted);
}

@media (max-width: 1100px) {
  .workbench {
    width: min(100vw - 20px, 760px);
  }

  .topbar,
  .dashboard-shell,
  .quickbar {
    grid-template-columns: 1fr;
  }

  .runtime-strip {
    justify-content: flex-start;
  }

  .left-rail,
  .right-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .workbench {
    width: 100%;
    min-height: 100vh;
    margin: 0;
    border-radius: 0;
  }

  .left-rail,
  .right-rail,
  .composer-actions {
    grid-template-columns: 1fr;
  }

  .message {
    grid-template-columns: 1fr;
  }

  .lotus-mark {
    width: 140px;
    height: 100px;
  }

  .lotus-image {
    width: 132px;
    height: 92px;
  }
}`;
}
