export function renderLayoutCss(): string {
  return String.raw`.workbench {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1560px, calc(100vw - 32px));
  height: calc(100vh - 24px);
  min-height: 0;
  margin: 12px auto;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--workbench-bg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.workbench-fit {
  height: calc(100vh - 24px);
  max-height: calc(100vh - 24px);
  grid-template-rows: auto minmax(0, 1fr);
}

.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 54px;
  padding: 0 18px;
  border-bottom: 1px solid var(--line);
  background: var(--chrome-bg);
}

.brand,
.runtime-strip {
  display: flex;
  align-items: center;
  min-width: 0;
}

.brand {
  gap: 12px;
}

.brand strong {
  color: var(--text);
  font-family: var(--display-font);
  font-size: 15px;
  font-weight: 760;
}

.brand small,
.runtime-strip {
  color: var(--muted);
  font-size: 12px;
}

.runtime-strip {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}

.runtime-strip b {
  color: var(--success);
}

.dashboard-shell {
  display: grid;
  grid-template-columns: var(--left-rail-width) minmax(460px, 1fr) var(--right-rail-width);
  gap: var(--gap);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: var(--gap);
  transition: grid-template-columns 160ms ease;
}

.workbench-fit .dashboard-shell {
  height: 100%;
}

.left-rail,
.center-stage,
.right-rail {
  display: grid;
  align-content: stretch;
  gap: var(--gap);
  min-width: 0;
  min-height: 0;
}

.center-stage {
  grid-template-rows: minmax(0, 1fr) auto;
}

.left-rail,
.right-rail {
  position: relative;
  overflow: visible;
}

.left-rail .panel,
.right-rail .panel {
  min-height: 0;
  overflow: auto;
}

.inspector-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.inspector-panel {
  min-height: 0;
  overflow: auto;
}

body.rail-left-collapsed .dashboard-shell {
  grid-template-columns: var(--collapsed-rail-width) minmax(460px, 1fr) var(--right-rail-width);
}

body.rail-right-collapsed .dashboard-shell {
  grid-template-columns: var(--left-rail-width) minmax(460px, 1fr) var(--collapsed-rail-width);
}

body.rail-left-collapsed.rail-right-collapsed .dashboard-shell {
  grid-template-columns: var(--collapsed-rail-width) minmax(460px, 1fr) var(--collapsed-rail-width);
}

body.rail-left-collapsed .left-rail .panel,
body.rail-right-collapsed .right-rail .panel {
  display: none;
}

.mobile-section-nav {
  display: none;
}

.sr-compatible {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.settings-page {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--workbench-bg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.settings-page[hidden] {
  display: none;
}

body.settings-open .dashboard-shell {
  opacity: 0;
  pointer-events: none;
}

.settings-page-header,
.settings-page-layout {
  min-width: 0;
}

.settings-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 40px 56px 18px;
  border-bottom: 1px solid var(--line);
}

.settings-page-header h2 {
  font-family: var(--display-font);
  font-size: 26px;
}

.settings-sidebar {
  display: grid;
  grid-template-rows: auto auto auto auto auto auto auto;
  align-content: start;
  gap: 10px;
  min-height: 0;
  padding: 18px 12px;
  border-right: 1px solid var(--line);
  background: rgba(226, 234, 242, 0.58);
  overflow: auto;
}

.settings-nav {
  display: grid;
  align-content: start;
  gap: 4px;
}

.settings-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.settings-content {
  min-height: 0;
  overflow: auto;
  padding: 28px 56px 56px;
}`;
}
