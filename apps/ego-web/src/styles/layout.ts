export function renderLayoutCss(): string {
  return String.raw`.workbench {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(1560px, calc(100vw - 32px));
  max-height: calc(100vh - 24px);
  height: calc(100vh - 24px);
  min-height: 0;
  margin: 12px auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface-1);
  box-shadow: var(--shadow);
}

.workbench-fit {
  height: calc(100vh - 24px);
  max-height: calc(100vh - 24px);
  grid-template-rows: auto auto minmax(0, 1fr);
}

/* Topbar = the one glass accent surface (blur + translucent chrome). */
.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-4);
  min-height: 56px;
  padding: 0 var(--sp-5);
  border-bottom: 1px solid var(--line);
  background: var(--chrome-bg);
  backdrop-filter: blur(20px) saturate(140%);
}

.brand,
.runtime-strip {
  display: flex;
  align-items: center;
  min-width: 0;
}

.brand {
  gap: var(--sp-3);
}

.brand strong {
  color: var(--text);
  font-family: var(--display-font);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.014em;
}

.brand small,
.runtime-strip {
  color: var(--muted);
  font-size: var(--text-sm);
}

.runtime-strip {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--sp-4);
}

.runtime-strip b {
  color: var(--success);
  font-weight: var(--weight-semibold);
}

.dashboard-shell {
  display: grid;
  grid-template-columns: var(--left-rail-width) minmax(460px, 1fr) var(--right-rail-width);
  gap: var(--gap);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: var(--gap);
  background: var(--surface-0);
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
  position: relative;
  grid-template-rows: minmax(0, 1fr) auto auto;
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
  border-top: 1px solid var(--line);
  background: var(--surface-1);
  box-shadow: var(--shadow-lg);
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
  gap: var(--sp-3);
  padding: var(--sp-10) var(--sp-18) var(--sp-6);
  border-bottom: 1px solid var(--line);
  background: var(--chrome-bg);
  backdrop-filter: blur(16px);
}

.settings-page-header h2 {
  font-family: var(--display-font);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  letter-spacing: -0.02em;
}

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

.settings-nav {
  display: grid;
  align-content: start;
  gap: var(--sp-1);
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
  padding: var(--sp-8) var(--sp-18) var(--sp-14);
}`;
}
