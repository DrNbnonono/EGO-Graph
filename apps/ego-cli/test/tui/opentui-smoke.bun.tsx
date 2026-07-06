/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { EgoTuiApp } from "../../src/tui/app.js";
import { TuiDialogProvider } from "../../src/tui/dialog.js";
import { TuiRuntimeProvider } from "../../src/tui/runtime.js";
import { TuiThemeProvider } from "../../src/tui/theme.js";

test("OpenTUI Solid test renderer renders through keymap provider", async () => {
  const setup = await createTestRenderer({ width: 60, height: 12, useThread: false });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  let renderTask: Promise<void> | undefined;

  try {
    renderTask = render(
      () => (
        <KeymapProvider keymap={keymap}>
          <box>
            <text>EGO probe</text>
          </box>
        </KeymapProvider>
      ),
      setup.renderer,
    );
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("EGO probe");
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask?.catch(() => undefined);
  }
});

test("EGO TUI providers render a child frame", async () => {
  const setup = await createTestRenderer({ width: 60, height: 12, useThread: false });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  let renderTask: Promise<void> | undefined;

  try {
    renderTask = render(
      () => (
        <KeymapProvider keymap={keymap}>
          <TuiThemeProvider>
            <TuiRuntimeProvider
              cwd="/tmp/ego"
              session={{} as never}
              workbench={() => undefined}
              permissionLevel={() => "read-only"}
            >
              <TuiDialogProvider>
                <box>
                  <text>EGO providers</text>
                </box>
              </TuiDialogProvider>
            </TuiRuntimeProvider>
          </TuiThemeProvider>
        </KeymapProvider>
      ),
      setup.renderer,
    );
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("EGO providers");
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask?.catch(() => undefined);
  }
});

test("opencode-style home renders logo, prompt, and footer in OpenTUI", async () => {
  const setup = await createTestRenderer({
    width: 120,
    height: 36,
    useThread: false,
    consoleMode: "disabled",
  });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  let renderTask: Promise<void> | undefined;

  try {
    renderTask = render(
      () => (
        <KeymapProvider keymap={keymap}>
          <EgoTuiApp onExit={() => setup.renderer.destroy()} />
        </KeymapProvider>
      ),
      setup.renderer,
    );

    let frame = setup.captureCharFrame();
    for (let attempt = 0; attempt < 30 && !frame.includes("Ask EGO-Graph"); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await setup.renderOnce();
      frame = setup.captureCharFrame();
    }
    expect(frame).toContain("EGO-Graph");
    expect(frame).toContain("Ask EGO-Graph");
    expect(frame).toContain("/help");
    expect(frame).toContain("cwd");
    expect(frame).not.toContain("Tips for getting started");
    expect(frame).not.toContain("Memory usage");
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask;
  }
});
