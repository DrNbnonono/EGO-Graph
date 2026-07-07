/** @jsxImportSource @opentui/solid */
export { getCommandPaletteMatches, resolvePaletteInput } from "./command-palette.js";
export { resolveDiffFileIndex, splitDiffByFile } from "./diff-view.js";
export { displayWidth, truncateDisplay } from "./cjk.js";
export { wrapDisplay } from "./text-wrap.js";
export { normalizeTerminalInput, parseMouseWheel } from "./terminal-input.js";
export { createTerminalSize } from "./terminal-size.js";

type RendererLike = {
  isDestroyed: boolean;
  setTerminalTitle(title: string): void;
  destroy(): void;
  once(event: "destroy", callback: () => void): void;
};

function destroyRenderer(renderer: Pick<RendererLike, "isDestroyed" | "setTerminalTitle" | "destroy">): void {
  renderer.setTerminalTitle("");
  if (!renderer.isDestroyed) {
    renderer.destroy();
  }
}

function isOpenTuiNativeLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return message.includes("node:ffi") || message.includes("bun-ffi-structs") || message.includes("FFI");
}

function printOpenTuiFallback(): void {
  console.log("EGO-Graph PURPLE LOTUS TUI");
  console.log("OpenTUI native backend is unavailable in this Node runtime.");
  console.log("Falling back to readline-based interactive terminal.");
}

async function startReadlineFallbackTerminal(): Promise<void> {
  printOpenTuiFallback();
  const { createTerminalAgentSession } = await import("@ego-graph/agent-harness");
  const { resolveWorkspaceRoot, resolveWorkspaceEgoHome } = await import("../workspace-root.js");
  const { startReadlineFallback } = await import("./readline-fallback.js");
  const workspaceRoot = resolveWorkspaceRoot();
  const egoHome = resolveWorkspaceEgoHome(workspaceRoot);
  const session = createTerminalAgentSession({ workspaceRoot, egoHome });
  await startReadlineFallback({ session, workspaceRoot });
}

export async function renderTui(): Promise<void> {
  try {
    const [
      { createCliRenderer },
      { createDefaultOpenTuiKeymap },
      { KeymapProvider },
      { render },
      { EgoTuiApp },
    ] = await Promise.all([
      import("@opentui/core"),
      import("@opentui/keymap/opentui"),
      import("@opentui/keymap/solid"),
      import("@opentui/solid"),
      import("./app.js"),
    ]);

    const renderer = await createCliRenderer({
      externalOutputMode: "passthrough",
      targetFps: 60,
      gatherStats: false,
      exitOnCtrlC: false,
      useKittyKeyboard: {},
      autoFocus: false,
      openConsoleOnError: false,
      useMouse: true,
    });
    const keymap = createDefaultOpenTuiKeymap(renderer);
    const shutdown = new Promise<void>((resolve) => (renderer as RendererLike).once("destroy", resolve));
    const onSighup = () => destroyRenderer(renderer);

    process.on("SIGHUP", onSighup);
    try {
      await render(
        () => (
          <KeymapProvider keymap={keymap}>
            <EgoTuiApp onExit={() => destroyRenderer(renderer)} />
          </KeymapProvider>
        ),
        renderer,
      );
      await shutdown;
    } finally {
      process.off("SIGHUP", onSighup);
      destroyRenderer(renderer);
    }
  } catch (error) {
    if (isOpenTuiNativeLoadError(error)) {
      await startReadlineFallbackTerminal();
      return;
    }
    throw error;
  }
}
