export function renderResponsiveCss(): string {
  return String.raw`@media (max-width: 1180px) {
  .workbench {
    width: min(100vw - 20px, 960px);
  }

  .topbar,
  .dashboard-shell {
    grid-template-columns: 1fr;
  }

  .runtime-strip {
    justify-content: flex-start;
  }

  .dashboard-shell {
    grid-template-areas:
      "chat"
      "inspector"
      "threads";
    grid-template-rows: max-content max-content max-content;
    align-content: start;
    height: 100%;
    overflow: auto;
  }

  .rail-gutter {
    display: none;
  }

  .left-rail,
  .center-stage,
  .right-rail {
    position: static;
    overflow: visible;
  }

  .agent-cockpit {
    min-height: 420px;
  }

  .conversation-scroll {
    min-height: 300px;
  }

  .left-rail {
    grid-area: threads;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .center-stage {
    grid-area: chat;
    grid-template-rows: auto auto;
    height: auto;
  }

  .right-rail {
    grid-area: inspector;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
  }

  body.rail-left-collapsed .dashboard-shell,
  body.rail-right-collapsed .dashboard-shell,
  body.rail-left-collapsed.rail-right-collapsed .dashboard-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .workbench {
    width: 100%;
    height: 100dvh;
    min-height: 0;
    margin: 0;
    padding-bottom: 0;
    border-radius: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .topbar {
    gap: 10px;
    padding: 10px 12px;
  }

  .brand,
  .runtime-strip {
    flex-wrap: wrap;
  }

  .mobile-section-nav {
    position: sticky;
    top: 0;
    z-index: 4;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    background: var(--chrome-bg);
    backdrop-filter: blur(14px);
  }

  .mobile-section-nav button {
    padding: 7px 4px;
    font-size: 12px;
  }

  .dashboard-shell {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 10px;
  }

  .left-rail,
  .center-stage,
  .right-rail {
    display: none;
  }

  body[data-mobile-section="threads"] .left-rail,
  body[data-mobile-section="chat"] .center-stage,
  body[data-mobile-section="inspector"] .right-rail {
    display: grid;
  }

  body[data-mobile-section="manage"] .settings-page {
    display: grid;
  }

  .left-rail,
  .right-rail,
  .composer-actions,
  .model-settings-grid,
  .message {
    grid-template-columns: 1fr;
  }

  .center-stage {
    height: 100%;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .agent-cockpit > .panel-heading {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 8px;
  }

  .agent-cockpit > .panel-heading h2 {
    font-size: 14px;
    line-height: 1.35;
  }

  .agent-cockpit > .panel-heading .mode-tabs {
    grid-column: 1 / -1;
    order: 3;
  }

  .agent-cockpit > .panel-heading .status-pill {
    min-width: 48px;
    padding: 0 10px;
    text-align: center;
  }

  body[data-mobile-section="chat"] .execution-timeline {
    display: none;
  }

  .settings-page {
    inset: 0;
    grid-template-columns: 1fr;
    border-radius: 0;
  }

  .settings-sidebar {
    display: flex;
    flex-direction: column;
    max-height: 280px;
    overflow-y: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .settings-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    overflow: visible;
    padding-bottom: 8px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .settings-sidebar .manage-tabs button {
    min-height: 32px;
  }

  .settings-main {
    min-height: 0;
  }

  .settings-page-header,
  .settings-content {
    padding-right: 18px;
    padding-left: 18px;
  }

  .settings-page-header h2 {
    font-size: 22px;
  }

  .choice-grid,
  .settings-row {
    grid-template-columns: 1fr;
  }

  .right-rail {
    max-height: none;
    overflow: auto;
  }

}`;
}
