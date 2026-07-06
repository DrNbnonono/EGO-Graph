/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { createSignal, onMount, Show } from "solid-js";
import type { WorkbenchState } from "@ego-graph/workbench";
import { EgoTuiApp } from "../../src/tui/app.js";
import { DialogSelect, TuiDialogProvider, useTuiDialog } from "../../src/tui/dialog.js";
import { EgoPrompt } from "../../src/tui/ego-prompt.js";
import { TuiRuntimeProvider } from "../../src/tui/runtime.js";
import { TuiThemeProvider } from "../../src/tui/theme.js";

const promptWorkbench = {
  model: { label: "deterministic fallback" },
  mcp: { status: "not_configured" },
  network: "local-only",
  tools: [{ name: "Workspace" }, { name: "Shell" }, { name: "MCP" }],
} as WorkbenchState;

async function settlePrompt(setup: Awaited<ReturnType<typeof createTestRenderer>>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await setup.renderOnce();
}

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

test("EgoPrompt submits plain input with Enter", async () => {
  const setup = await createTestRenderer({ width: 100, height: 16, useThread: false });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const submitted: string[] = [];
  let renderTask: Promise<void> | undefined;

  try {
    const PromptHarness = () => {
      const [value, setValue] = createSignal("");
      return (
        <KeymapProvider keymap={keymap}>
          <TuiThemeProvider>
            <EgoPrompt
              value={value()}
              busy={false}
              workbench={promptWorkbench}
              permissionLevel="read-only"
              history={[]}
              historyIndex={undefined}
              onChange={setValue}
              onSubmit={async (input) => {
                submitted.push(input);
              }}
              onHistory={() => undefined}
              onClear={() => setValue("")}
            />
          </TuiThemeProvider>
        </KeymapProvider>
      );
    };

    renderTask = render(() => <PromptHarness />, setup.renderer);
    await settlePrompt(setup);
    await setup.mockInput.typeText("hello");
    setup.mockInput.pressEnter();
    await settlePrompt(setup);

    expect(submitted).toEqual(["hello"]);
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask?.catch(() => undefined);
  }
});

test("EgoPrompt lets slash command suggestions move with arrows and submit", async () => {
  const setup = await createTestRenderer({ width: 100, height: 18, useThread: false });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const submitted: string[] = [];
  let renderTask: Promise<void> | undefined;

  try {
    const PromptHarness = () => {
      const [value, setValue] = createSignal("");
      return (
        <KeymapProvider keymap={keymap}>
          <TuiThemeProvider>
            <EgoPrompt
              value={value()}
              busy={false}
              workbench={promptWorkbench}
              permissionLevel="read-only"
              history={[]}
              historyIndex={undefined}
              onChange={setValue}
              onSubmit={async (input) => {
                submitted.push(input);
              }}
              onHistory={() => undefined}
              onClear={() => setValue("")}
            />
          </TuiThemeProvider>
        </KeymapProvider>
      );
    };

    renderTask = render(() => <PromptHarness />, setup.renderer);
    await settlePrompt(setup);
    await setup.mockInput.typeText("/");
    await settlePrompt(setup);
    expect(setup.captureCharFrame()).toContain("/help");

    setup.mockInput.pressArrow("down");
    await settlePrompt(setup);
    setup.mockInput.pressEnter();
    await settlePrompt(setup);

    expect(submitted).toEqual(["/status"]);
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask?.catch(() => undefined);
  }
});

test("DialogSelect command panel moves with arrows and submits with Enter", async () => {
  const setup = await createTestRenderer({ width: 90, height: 22, useThread: false });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const submitted: string[] = [];
  let renderTask: Promise<void> | undefined;

  try {
    const DialogHarness = () => {
      const dialog = useTuiDialog();
      onMount(() => dialog.open({ type: "commands" }));
      return (
        <Show when={dialog.state.type !== "none"}>
          <DialogSelect
            title="Commands"
            options={[
              { title: "/help", value: "/help", category: "Help", description: "Show help." },
              { title: "/status", value: "/status", category: "Session", description: "Show status." },
            ]}
            onSelect={(option) => submitted.push(String(option.value))}
          />
        </Show>
      );
    };

    renderTask = render(
      () => (
        <KeymapProvider keymap={keymap}>
          <TuiThemeProvider>
            <TuiDialogProvider>
              <DialogHarness />
            </TuiDialogProvider>
          </TuiThemeProvider>
        </KeymapProvider>
      ),
      setup.renderer,
    );
    await settlePrompt(setup);
    expect(setup.captureCharFrame()).toContain("/help");

    setup.mockInput.pressArrow("down");
    await settlePrompt(setup);
    setup.mockInput.pressEnter();
    await settlePrompt(setup);

    expect(submitted).toEqual(["/status"]);
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask?.catch(() => undefined);
  }
});

test("DialogSelect scrolls the command list with the selected row", async () => {
  const setup = await createTestRenderer({ width: 80, height: 14, useThread: false });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  let renderTask: Promise<void> | undefined;

  try {
    const DialogHarness = () => {
      const dialog = useTuiDialog();
      onMount(() => dialog.open({ type: "commands" }));
      return (
        <Show when={dialog.state.type !== "none"}>
          <DialogSelect
            title="Commands"
            options={Array.from({ length: 18 }, (_, index) => ({
              title: `/cmd${index}`,
              value: `/cmd${index}`,
              category: "Commands",
              description: `Command ${index}`,
            }))}
          />
        </Show>
      );
    };

    renderTask = render(
      () => (
        <KeymapProvider keymap={keymap}>
          <TuiThemeProvider>
            <TuiDialogProvider>
              <DialogHarness />
            </TuiDialogProvider>
          </TuiThemeProvider>
        </KeymapProvider>
      ),
      setup.renderer,
    );
    await settlePrompt(setup);

    for (let index = 0; index < 11; index++) {
      setup.mockInput.pressArrow("down");
      await settlePrompt(setup);
    }

    expect(setup.captureCharFrame()).toContain("/cmd11");
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
    expect(frame).toContain("dir");
    expect(frame).not.toContain("PURPLE LOTUS");
    expect(frame).not.toContain("紫莲花");
    expect(frame).not.toContain("Tips for getting started");
    expect(frame).not.toContain("Memory usage");
    expect(frame).not.toContain("5 tools");
    expect(frame).not.toContain("deterministic fallback");
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy();
    await renderTask;
  }
});
