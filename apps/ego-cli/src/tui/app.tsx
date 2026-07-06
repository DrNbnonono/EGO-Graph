/** @jsxImportSource @opentui/solid */
import {
  createTerminalAgentSession,
  type AgentRunEvent,
  type PermissionLevel,
  type TerminalAgentRunState,
  type TerminalAgentSession,
} from "@ego-graph/agent-harness";
import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { TextareaRenderable, TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Setter,
} from "solid-js";
import {
  commandPalette,
  getCommandAvailability,
  getCommandPaletteMatches,
  resolvePaletteInput,
} from "./command-palette.js";
import { DialogFrame, DialogSelect, EmptyDialogHint, TuiDialogProvider, useTuiDialog } from "./dialog.js";
import { splitDiffByFile, getDiffFileStats } from "./diff-view.js";
import { EgoPrompt } from "./ego-prompt.js";
import { createHistoryItems, resolveHistoryReference, type HistoryItem } from "./history-browser.js";
import { TuiRuntimeProvider } from "./runtime.js";
import { TuiThemeProvider, useTuiTheme } from "./theme.js";
import { renderConversationLines } from "./tui-events.js";
import type { TuiRunSession } from "./tui-state.js";

const permissionLevels: PermissionLevel[] = [
  "read-only",
  "workspace-write",
  "shell-readonly",
  "network-low",
  "security-active",
];

const homeCommands = ["/init", "/scan", "/analyze", "/report", "/tools", "/help"] as const;

function keymapCommandName(command: string): string {
  return `ego.command.${command.replace(/^\//, "").replace(/[^a-zA-Z0-9_.:-]+/g, ".")}`;
}

export function EgoTuiApp(props: { onExit: () => void }): JSX.Element {
  const session = createTerminalAgentSession({ workspaceRoot: process.cwd() });
  const [workbench, setWorkbench] = createSignal<WorkbenchState>();
  const [permissionLevel, setPermissionLevel] = createSignal<PermissionLevel>(
    session.getPermissionLevel(),
  );

  onMount(() => {
    void refreshWorkbench(setWorkbench, () => undefined, () => undefined);
  });

  return (
    <TuiThemeProvider>
      <TuiRuntimeProvider
        cwd={process.cwd()}
        session={session}
        workbench={workbench}
        permissionLevel={permissionLevel}
      >
        <TuiDialogProvider>
          <EgoTuiShell
            session={session}
            workbench={workbench}
            setWorkbench={setWorkbench}
            permissionLevel={permissionLevel}
            setPermissionLevel={setPermissionLevel}
            onExit={props.onExit}
          />
        </TuiDialogProvider>
      </TuiRuntimeProvider>
    </TuiThemeProvider>
  );
}

function EgoTuiShell(props: {
  session: TerminalAgentSession;
  workbench: () => WorkbenchState | undefined;
  setWorkbench: Setter<WorkbenchState | undefined>;
  permissionLevel: () => PermissionLevel;
  setPermissionLevel: Setter<PermissionLevel>;
  onExit: () => void;
}): JSX.Element {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const dialog = useTuiDialog();
  const theme = useTuiTheme();
  const [events, setEvents] = createSignal<AgentRunEvent[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [activeRunId, setActiveRunId] = createSignal<string>();
  const [historyItems, setHistoryItems] = createSignal<HistoryItem[]>([]);
  const [runSessions, setRunSessions] = createSignal<TuiRunSession[]>([]);
  const [replayMode, setReplayMode] = createSignal(false);
  const [thinkingExpanded, setThinkingExpanded] = createSignal(false);
  const [showTimestamps, setShowTimestamps] = createSignal(false);
  const [showScrollbar, setShowScrollbar] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [diffFileIndex, setDiffFileIndex] = createSignal(0);
  const [promptText, setPromptText] = createSignal("");
  const [promptHistory, setPromptHistory] = createSignal<string[]>([]);
  const [historyIndex, setHistoryIndex] = createSignal<number | undefined>();
  const [draftBeforeHistory, setDraftBeforeHistory] = createSignal("");
  const [promptTarget, setPromptTarget] = createSignal<TextareaRenderable>();
  let scroll: ScrollBoxRenderable | undefined;

  const activeRun = createMemo(() => {
    const runId = activeRunId();
    return runId ? props.session.getRunState(runId) : undefined;
  });
  const showSidePanel = createMemo(
    () => events().length > 0 && (sidebarOpen() || dimensions().width > 120),
  );
  const overlaySidebar = createMemo(() => showSidePanel() && dimensions().width <= 120);
  const contentWidth = createMemo(() => dimensions().width - (showSidePanel() && !overlaySidebar() ? 42 : 0) - 2);
  const timelineLines = createMemo(() =>
    renderConversationLines(events(), {
      width: Math.max(40, contentWidth() - 6),
      debug: dialog.state.type === "debug",
      thinkingExpanded: thinkingExpanded(),
    }),
  );

  onMount(() => {
    renderer.setTerminalTitle("EGO-Graph");
    void props.session.hydratePendingRuns().then((runs) => {
      setRunSessions(
        runs.map((run) => ({
          runId: run.runId,
          title: run.message,
          events: [],
          updatedAt: new Date().toISOString(),
        })),
      );
    });
    void refreshWorkbench(
      props.setWorkbench,
      setHistoryItems,
      appendSystemEvent(setEvents),
    );
  });

  onCleanup(() => renderer.setTerminalTitle(""));

  createEffect(() => {
    if (scroll && !scroll.isDestroyed) {
      scroll.scrollTo(scroll.scrollHeight);
    }
  });

  useBindings(() => ({
    commands: [
      {
        name: "app.exit",
        title: "Exit",
        namespace: "palette",
        run: props.onExit,
      },
      {
        name: "command.palette.show",
        title: "Show command palette",
        namespace: "palette",
        run: () => dialog.open({ type: "commands" }),
      },
      {
        name: "dialog.close",
        title: "Close dialog",
        run: () => {
          if (dialog.state.type !== "none") {
            dialog.clear();
            return;
          }
          props.onExit();
        },
      },
      ...commandPalette.map((command) => ({
        name: keymapCommandName(command.name),
        title: command.name,
        desc: command.description,
        category: command.category,
        namespace: "palette",
        run: () => {
          dialog.clear();
          void submitText(command.name);
        },
      })),
    ],
    bindings: [
      { key: "ctrl+p", cmd: "command.palette.show" },
      { key: "escape", cmd: "dialog.close" },
      {
        key: "ctrl+c",
        cmd: () => {
          const input = promptTarget();
          if (input && input.plainText.length > 0) {
            input.setText("");
            setPromptText("");
            return;
          }
          props.onExit();
        },
      },
      { key: "pageup", cmd: () => scroll?.scrollBy(-Math.max(4, Math.floor(dimensions().height / 2))) },
      { key: "pagedown", cmd: () => scroll?.scrollBy(Math.max(4, Math.floor(dimensions().height / 2))) },
      { key: "home", cmd: () => scroll?.scrollTo(0) },
      { key: "end", cmd: () => scroll?.scrollTo(scroll.scrollHeight) },
      { key: "ctrl+o", cmd: () => setThinkingExpanded((value) => !value) },
      { key: "ctrl+b", cmd: () => setSidebarOpen((value) => !value) },
      { key: "ctrl+s", cmd: () => setSidebarOpen((value) => !value) },
      { key: "ctrl+t", cmd: () => setShowTimestamps((value) => !value) },
      { key: "ctrl+r", cmd: () => setShowScrollbar((value) => !value) },
      {
        key: "n",
        cmd: () => {
          if (dialog.state.type === "diff") setDiffFileIndex((value) => value + 1);
        },
      },
      {
        key: "p",
        cmd: () => {
          if (dialog.state.type === "diff") setDiffFileIndex((value) => Math.max(0, value - 1));
        },
      },
    ],
  }));

  async function submitText(value: string): Promise<void> {
    const matches = getCommandPaletteMatches(value).map((command) => command.name);
    const submitted = value.trim().startsWith("/")
      ? resolvePaletteInput(value, matches, 0)
      : value.trim();
    if (!submitted || submitted === "/") {
      dialog.open({ type: "commands", filter: value });
      return;
    }
    const trimmed = submitted.trim();
    setPromptHistory((previous) => [...previous.filter((item) => item !== trimmed), trimmed].slice(-50));
    setHistoryIndex(undefined);
    setDraftBeforeHistory("");
    promptTarget()?.setText("");
    setPromptText("");
    await submitInput({
      submitted,
      session: props.session,
      activeRun: activeRun(),
      activeRunId: activeRunId(),
      setActiveRunId,
      setEvents,
      setBusy,
      setWorkbench: props.setWorkbench,
      setHistoryItems,
      setDialog: (state) => dialog.open(state),
      clearDialog: dialog.clear,
      setDiffFileIndex,
      historyItems: historyItems(),
      runSessions: runSessions(),
      setRunSessions,
      setPermissionLevel: props.setPermissionLevel,
      setReplayMode,
      toggleThinking: () => setThinkingExpanded((previous) => !previous),
      exit: props.onExit,
    });
  }

  function movePromptHistory(delta: -1 | 1): void {
    const history = promptHistory();
    if (history.length === 0) return;
    if (delta < 0) {
      const current = historyIndex();
      const next = current === undefined ? history.length - 1 : Math.max(0, current - 1);
      if (current === undefined) setDraftBeforeHistory(promptText());
      setHistoryIndex(next);
      const value = history[next] ?? "";
      promptTarget()?.setText(value);
      promptTarget()?.gotoBufferEnd();
      setPromptText(value);
      return;
    }
    const current = historyIndex();
    if (current === undefined) return;
    if (current >= history.length - 1) {
      const value = draftBeforeHistory();
      setHistoryIndex(undefined);
      setDraftBeforeHistory("");
      promptTarget()?.setText(value);
      promptTarget()?.gotoBufferEnd();
      setPromptText(value);
      return;
    }
    const next = current + 1;
    const value = history[next] ?? "";
    setHistoryIndex(next);
    promptTarget()?.setText(value);
    promptTarget()?.gotoBufferEnd();
    setPromptText(value);
  }

  return (
    <box width={dimensions().width} height={dimensions().height} backgroundColor={theme.background}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <Show
          when={props.workbench()}
          fallback={
            <box flexGrow={1} alignItems="center" justifyContent="center">
              <text fg={theme.textMuted}>Loading EGO-Graph workspace...</text>
            </box>
          }
        >
          {(workbench) => (
            <Show
              when={events().length > 0}
              fallback={
                <>
                  <HomeRoute
                    workbench={workbench()}
                    permissionLevel={props.permissionLevel()}
                    busy={busy()}
                    promptText={promptText()}
                    promptHistory={promptHistory()}
                    historyIndex={historyIndex()}
                    setPromptText={setPromptText}
                    setPromptTarget={setPromptTarget}
                    onSubmit={submitText}
                    onHistory={movePromptHistory}
                    onClear={() => setEvents([])}
                  />
                  <Footer
                    workbench={workbench()}
                    permissionLevel={props.permissionLevel()}
                    activeRun={activeRun()}
                  />
                </>
              }
            >
              <box flexDirection="row" flexGrow={1} minHeight={0}>
                <box flexGrow={1} width={contentWidth()} minHeight={0}>
                  <SessionRoute
                    ref={(value) => (scroll = value)}
                    lines={timelineLines()}
                    replayMode={replayMode()}
                    showTimestamps={showTimestamps()}
                    showScrollbar={showScrollbar()}
                  />
                </box>
                <Show when={showSidePanel() && !overlaySidebar()}>
                  <SidePanel
                    workbench={props.workbench()}
                    activeRun={activeRun()}
                    permissionLevel={props.permissionLevel()}
                    history={historyItems()}
                    width={42}
                  />
                </Show>
              </box>
              <EgoPrompt
                busy={busy()}
                value={promptText()}
                workbench={workbench()}
                permissionLevel={props.permissionLevel()}
                history={promptHistory()}
                historyIndex={historyIndex()}
                onChange={setPromptText}
                onSubmit={submitText}
                onHistory={movePromptHistory}
                onClear={() => setEvents([])}
                ref={setPromptTarget}
              />
              <Footer
                workbench={workbench()}
                permissionLevel={props.permissionLevel()}
                activeRun={activeRun()}
              />
            </Show>
          )}
        </Show>
      </box>
      <Show when={showSidePanel() && overlaySidebar()}>
        <box position="absolute" right={0} top={0} height={dimensions().height} zIndex={2000}>
          <SidePanel
            workbench={props.workbench()}
            activeRun={activeRun()}
            permissionLevel={props.permissionLevel()}
            history={historyItems()}
            width={42}
          />
        </box>
      </Show>
      <DialogOverlay
        state={dialog.state}
        filter={promptText()}
        activeRun={activeRun()}
        events={events()}
        history={historyItems()}
        diffFileIndex={diffFileIndex()}
        permissionLevel={props.permissionLevel()}
        onClose={dialog.clear}
        onCommand={(command) => void submitText(command)}
      />
    </box>
  );
}

function StatusBar(props: {
  workbench: WorkbenchState | undefined;
  permissionLevel: PermissionLevel;
  busy: boolean;
  thinkingExpanded: boolean;
}): JSX.Element {
  const theme = useTuiTheme();
  const label = createMemo(() =>
    [
      "EGO-Graph",
      props.workbench?.model.label ?? "loading model",
      props.permissionLevel,
      props.busy ? "running" : "ready",
      props.thinkingExpanded ? "details expanded" : "details folded",
      props.workbench?.cwd ?? process.cwd(),
    ].join("  ·  "),
  );
  return (
    <box height={1} flexShrink={0} paddingLeft={1} paddingRight={1} backgroundColor={theme.panel}>
      <text fg={props.busy ? theme.warning : theme.muted}>{label()}</text>
    </box>
  );
}

function HomeRoute(props: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
  busy: boolean;
  promptText: string;
  promptHistory: string[];
  historyIndex: number | undefined;
  setPromptText(value: string): void;
  setPromptTarget(value: TextareaRenderable | undefined): void;
  onSubmit(value: string): Promise<void>;
  onHistory(delta: -1 | 1): void;
  onClear(): void;
}): JSX.Element {
  const dimensions = useTerminalDimensions();
  const theme = useTuiTheme();
  const promptMaxWidth = createMemo(() => Math.max(75, Math.floor(dimensions().width * 0.7)));
  return (
    <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
      <box flexGrow={1} minHeight={0} />
      <box height={4} minHeight={0} flexShrink={1} />
      <box flexShrink={0}>
        <LotusLogo />
      </box>
      <box height={1} minHeight={0} flexShrink={1} />
      <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
        <EgoPrompt
          home
          busy={props.busy}
          value={props.promptText}
          workbench={props.workbench}
          permissionLevel={props.permissionLevel}
          history={props.promptHistory}
          historyIndex={props.historyIndex}
          onChange={props.setPromptText}
          onSubmit={props.onSubmit}
          onHistory={props.onHistory}
          onClear={props.onClear}
          ref={props.setPromptTarget}
        />
      </box>
      <box flexGrow={1} minHeight={0} />
    </box>
  );
}

function LotusLogo(): JSX.Element {
  const theme = useTuiTheme();
  const lines = [
    "        PURPLE LOTUS / 紫莲花        ",
    "             ▄▄   ▄▄             ",
    "          ▄████▄ ▄████▄          ",
    "       ▄████████████████▄       ",
    "    ▄██████▀  ██  ▀██████▄    ",
    "      ▀██▀   ▄██▄   ▀██▀      ",
    "          ▀▄██████▄▀          ",
    "             ▀████▀             ",
  ];
  return (
    <box alignItems="center">
      <For each={lines}>
        {(line, index) => (
          <Show
            when={index() === 0}
            fallback={
              <text fg={theme.primaryDim} selectable={false}>
                {line}
              </text>
            }
          >
            <text fg={theme.primary} attributes={TextAttributes.BOLD} selectable={false}>
              {line}
            </text>
          </Show>
        )}
      </For>
    </box>
  );
}

function SessionRoute(props: {
  ref(value: ScrollBoxRenderable): void;
  lines: string[];
  replayMode: boolean;
  showTimestamps: boolean;
  showScrollbar: boolean;
}): JSX.Element {
  const theme = useTuiTheme();
  return (
    <scrollbox
      ref={props.ref}
      stickyScroll
      stickyStart="bottom"
      flexGrow={1}
      paddingLeft={3}
      paddingRight={2}
      paddingTop={1}
      scrollbarOptions={{ visible: props.showScrollbar }}
    >
      <Show when={props.replayMode}>
        <text fg={theme.warning}>read-only replay mode</text>
      </Show>
      <For each={props.lines}>
        {(line) => (
          <Show
            when={line.startsWith("❯ ")}
            fallback={<text fg={lineColor(line)}>{line || " "}</text>}
          >
            <text fg={lineColor(line)} bg={theme.panelAlt}>
              {line || " "}
            </text>
          </Show>
        )}
      </For>
    </scrollbox>
  );
}

function PromptBar(props: {
  busy: boolean;
  promptText: string;
  setPromptText(value: string): void;
  setPromptTarget(value: TextareaRenderable | undefined): void;
  onSubmit(value: string): Promise<void>;
}): JSX.Element {
  const theme = useTuiTheme();
  let input: TextareaRenderable | undefined;

  onMount(() => {
    setTimeout(() => input?.focus(), 1);
  });

  return (
    <box flexShrink={0} border={["top"]} borderColor={theme.primaryDim} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row">
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          ❯
        </text>
        <textarea
          ref={(value: TextareaRenderable) => {
            input = value;
            props.setPromptTarget(value);
          }}
          width="100%"
          minHeight={1}
          maxHeight={6}
          placeholder="Ask EGO-Graph, or type / for commands"
          placeholderColor={theme.muted}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.primary}
          onContentChange={() => props.setPromptText(input?.plainText ?? "")}
          onSubmit={() => {
            const value = input?.plainText ?? "";
            void props.onSubmit(value);
          }}
        />
      </box>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={props.busy ? theme.warning : theme.muted}>
          {props.busy ? "running · esc closes dialogs · ctrl+o toggles details" : "? shortcuts · ctrl+p commands"}
        </text>
        <text fg={theme.muted}>enter submit · shift/ctrl+enter newline</text>
      </box>
    </box>
  );
}

function SidePanel(props: {
  workbench: WorkbenchState | undefined;
  activeRun: TerminalAgentRunState | undefined;
  permissionLevel: PermissionLevel;
  history: HistoryItem[];
  width: number;
}): JSX.Element {
  const theme = useTuiTheme();
  return (
    <box
      width={props.width}
      height="100%"
      flexShrink={0}
      backgroundColor={theme.backgroundPanel}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
    >
      <scrollbox flexGrow={1} scrollbarOptions={{ visible: false }}>
        <box flexShrink={0} gap={1} paddingRight={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Session
          </text>
          <text fg={theme.textMuted}>{props.activeRun?.runId ?? "local"}</text>
          <text fg={theme.textMuted}>{props.workbench?.cwd ?? process.cwd()}</text>
          <box height={1} />
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Runtime
          </text>
          <text fg={theme.textMuted}>model {props.workbench?.model.label ?? "loading"}</text>
          <text fg={theme.textMuted}>permission {props.permissionLevel}</text>
          <text fg={theme.textMuted}>tools {props.workbench?.tools.length ?? 0}</text>
          <text fg={theme.textMuted}>mcp {props.workbench?.mcp.status ?? "unknown"}</text>
          <text fg={theme.textMuted}>network {props.workbench?.network ?? "unknown"}</text>
          <box height={1} />
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Active Run
          </text>
          <text fg={props.activeRun ? theme.primary : theme.textMuted}>{props.activeRun?.status ?? "idle"}</text>
          <text fg={theme.textMuted}>{props.activeRun?.phase ?? "waiting for prompt"}</text>
          <Show when={props.activeRun?.plan?.length}>
            <text fg={theme.warning}>{props.activeRun?.plan?.length ?? 0} plan steps</text>
          </Show>
          <Show when={props.activeRun?.diff}>
            <text fg={theme.info}>diff pending</text>
          </Show>
          <Show when={props.activeRun?.checks?.length}>
            <text fg={theme.success}>{props.activeRun?.checks?.length ?? 0} checks</text>
          </Show>
          <box height={1} />
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Recent
          </text>
          <For each={props.history.slice(0, 8)}>
            {(item) => <text fg={theme.textMuted}>{`${item.index}. ${item.status} ${item.title}`}</text>}
          </For>
        </box>
      </scrollbox>
      <box flexShrink={0} gap={1} paddingTop={1}>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.success }}>•</span> <b>EGO</b>
          <span style={{ fg: theme.text }}>
            <b>-Graph</b>
          </span>{" "}
          <span>v0.1.0</span>
        </text>
      </box>
    </box>
  );
}

function Footer(props: {
  workbench: WorkbenchState | undefined;
  permissionLevel: PermissionLevel;
  activeRun: TerminalAgentRunState | undefined;
}): JSX.Element {
  const theme = useTuiTheme();
  const mcpConnected = () => props.workbench?.mcp.status === "connected";
  const pending = () => props.activeRun?.status === "plan_pending" || props.activeRun?.status === "patch_pending";
  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0} paddingLeft={1} paddingRight={1}>
      <text fg={theme.textMuted}>cwd {props.workbench?.cwd ?? process.cwd()}</text>
      <box gap={2} flexDirection="row" flexShrink={0}>
        <Show when={pending()}>
          <text fg={theme.warning}>△ permission</text>
        </Show>
        <text fg={theme.text}>
          <span style={{ fg: theme.success }}>•</span> {props.permissionLevel}
        </text>
        <text fg={theme.text}>
          <span style={{ fg: mcpConnected() ? theme.success : theme.textMuted }}>⊙ </span>
          {props.workbench?.mcp.status ?? "MCP"}
        </text>
        <text fg={theme.textMuted}>/status</text>
      </box>
    </box>
  );
}

function DialogOverlay(props: {
  state: ReturnType<typeof useTuiDialog>["state"];
  filter: string;
  activeRun: TerminalAgentRunState | undefined;
  events: AgentRunEvent[];
  history: HistoryItem[];
  diffFileIndex: number;
  permissionLevel: PermissionLevel;
  onClose(): void;
  onCommand(command: string): void;
}): JSX.Element {
  return (
    <Show when={props.state.type !== "none"}>
      <Show when={props.state.type === "commands"}>
        <CommandDialog
          filter={props.state.type === "commands" ? props.state.filter ?? props.filter : ""}
          activeRun={props.activeRun}
          onCommand={props.onCommand}
        />
      </Show>
      <Show when={props.state.type === "help"}>
        <TextDialog title="Help" lines={helpText().split("\n")} />
      </Show>
      <Show when={props.state.type === "permissions"}>
        <PermissionsDialog current={props.permissionLevel} onCommand={props.onCommand} />
      </Show>
      <Show when={props.state.type === "plan"}>
        <PlanDialog plan={props.activeRun?.plan ?? []} />
      </Show>
      <Show when={props.state.type === "diff"}>
        <DiffDialog diff={props.activeRun?.diff} fileIndex={props.diffFileIndex} />
      </Show>
      <Show when={props.state.type === "checks"}>
        <ChecksDialog checks={props.activeRun?.checks ?? []} />
      </Show>
      <Show when={props.state.type === "history"}>
        <HistoryDialog history={props.history} onCommand={props.onCommand} />
      </Show>
      <Show when={props.state.type === "debug"}>
        <DebugDialog events={props.events} />
      </Show>
    </Show>
  );
}

function CommandDialog(props: {
  filter: string;
  activeRun: TerminalAgentRunState | undefined;
  onCommand(command: string): void;
}): JSX.Element {
  const commands = createMemo(() => {
    const query = props.filter.trim().startsWith("/") ? props.filter : "/";
    return getCommandPaletteMatches(query);
  });
  return (
    <DialogSelect
      title="Commands"
      placeholder={props.filter || "Filter commands"}
      options={commands().map((command) => {
        const availability = getCommandAvailability(command, { activeRun: props.activeRun });
        const option = {
          title: command.name,
          value: command.name,
          category: command.category,
          disabled: false,
          onSelect: () => {
            if (availability.available) props.onCommand(command.name);
          },
        };
        return {
          ...option,
          ...(availability.available || availability.reason
            ? { description: availability.available ? command.description : availability.reason }
            : {}),
          ...(command.shortcut ? { footer: command.shortcut } : {}),
        };
      })}
    />
  );
}

function PermissionsDialog(props: {
  current: PermissionLevel;
  onCommand(command: string): void;
}): JSX.Element {
  const theme = useTuiTheme();
  return (
    <DialogFrame title="Permissions">
      <For each={permissionLevels}>
        {(level) => (
          <box flexDirection="row" onMouseUp={() => props.onCommand(`/allow ${level}`)}>
            <text fg={level === props.current ? theme.success : theme.text}>{level.padEnd(20)}</text>
            <text fg={theme.muted}>{permissionDescription(level)}</text>
          </box>
        )}
      </For>
    </DialogFrame>
  );
}

function PlanDialog(props: { plan: TerminalAgentRunState["plan"] }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <DialogFrame title="Plan">
      <Show when={props.plan && props.plan.length > 0} fallback={<EmptyDialogHint>No pending plan.</EmptyDialogHint>}>
        <For each={props.plan}>
          {(step, index) => (
            <box paddingBottom={1}>
              <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                {index() + 1}. {step.title}
              </text>
              <text fg={theme.muted}>{step.expectedResult}</text>
              <text fg={theme.muted}>{step.riskNote}</text>
            </box>
          )}
        </For>
        <text fg={theme.muted}>/plan approve · /plan reject</text>
      </Show>
    </DialogFrame>
  );
}

function DiffDialog(props: { diff: string | undefined; fileIndex: number }): JSX.Element {
  const theme = useTuiTheme();
  const files = createMemo(() => (props.diff ? splitDiffByFile(props.diff) : []));
  const active = createMemo(() => {
    const list = files();
    return list[Math.min(props.fileIndex, Math.max(0, list.length - 1))];
  });
  return (
    <DialogFrame title="Diff">
      <Show when={active()} fallback={<EmptyDialogHint>No pending diff.</EmptyDialogHint>}>
        {(file) => {
          const stats = getDiffFileStats(file().lines);
          return (
            <box flexGrow={1} minHeight={0}>
              <text fg={theme.primary}>
                {file().header}  +{stats.additions} -{stats.deletions}
              </text>
              <scrollbox scrollbarOptions={{ visible: false }} flexGrow={1}>
                <For each={file().lines}>
                  {(line) => <text fg={diffLineColor(line)}>{line || " "}</text>}
                </For>
              </scrollbox>
              <text fg={theme.muted}>n/p file · /patch approve · /patch reject</text>
            </box>
          );
        }}
      </Show>
    </DialogFrame>
  );
}

function ChecksDialog(props: { checks: TerminalAgentRunState["checks"] }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <DialogFrame title="Checks">
      <Show when={props.checks && props.checks.length > 0} fallback={<EmptyDialogHint>No checks yet.</EmptyDialogHint>}>
        <For each={props.checks}>
          {(check) => (
            <box>
              <text fg={check.exitCode === 0 ? theme.success : theme.danger}>{check.command}</text>
              <text fg={theme.muted}>exit {check.exitCode}</text>
            </box>
          )}
        </For>
      </Show>
    </DialogFrame>
  );
}

function HistoryDialog(props: {
  history: HistoryItem[];
  onCommand(command: string): void;
}): JSX.Element {
  const theme = useTuiTheme();
  return (
    <DialogFrame title="History">
      <Show when={props.history.length > 0} fallback={<EmptyDialogHint>No persisted runs yet.</EmptyDialogHint>}>
        <For each={props.history}>
          {(item) => (
            <box flexDirection="row" onMouseUp={() => props.onCommand(`/replay ${item.index}`)}>
              <text fg={theme.text}>{`${item.index}. `.padEnd(4)}</text>
              <text fg={theme.primaryDim}>{item.status.padEnd(12)}</text>
              <text fg={theme.muted}>{item.title}</text>
            </box>
          )}
        </For>
      </Show>
    </DialogFrame>
  );
}

function DebugDialog(props: { events: AgentRunEvent[] }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <DialogFrame title="Debug Events">
      <scrollbox scrollbarOptions={{ visible: false }} flexGrow={1}>
        <For each={props.events.slice(-80)}>
          {(event) => (
            <text fg={theme.muted}>
              {event.type} · {event.phase ?? "none"} · {event.message}
            </text>
          )}
        </For>
      </scrollbox>
    </DialogFrame>
  );
}

function TextDialog(props: { title: string; lines: string[] }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <DialogFrame title={props.title}>
      <For each={props.lines}>{(line) => <text fg={theme.text}>{line}</text>}</For>
    </DialogFrame>
  );
}

type SubmitInputOptions = {
  submitted: string;
  session: TerminalAgentSession;
  activeRun: TerminalAgentRunState | undefined;
  activeRunId: string | undefined;
  setActiveRunId: Setter<string | undefined>;
  setEvents: Setter<AgentRunEvent[]>;
  setBusy: Setter<boolean>;
  setWorkbench: Setter<WorkbenchState | undefined>;
  setHistoryItems: Setter<HistoryItem[]>;
  setDialog(state: Exclude<ReturnType<typeof useTuiDialog>["state"], { type: "none" }>): void;
  clearDialog(): void;
  setDiffFileIndex: Setter<number>;
  historyItems: HistoryItem[];
  runSessions: TuiRunSession[];
  setRunSessions: Setter<TuiRunSession[]>;
  setPermissionLevel: Setter<PermissionLevel>;
  setReplayMode: Setter<boolean>;
  toggleThinking(): void;
  exit(): void;
};

async function submitInput(input: SubmitInputOptions): Promise<void> {
  const normalized = input.submitted.toLowerCase().trim();
  const command = commandPalette.find((candidate) => candidate.name === normalized);
  if (command) {
    const availability = getCommandAvailability(command, { activeRun: input.activeRun });
    if (!availability.available) {
      input.setEvents((previous) => [
        ...previous,
        localEvent(`${command.name} 暂不可用：${availability.reason ?? "unavailable"}`),
      ]);
      return;
    }
  }
  if (normalized === "/exit") {
    input.exit();
    return;
  }
  if (normalized === "/clear" || normalized === "/new") {
    input.setEvents([]);
    input.setActiveRunId(undefined);
    input.setReplayMode(false);
    input.clearDialog();
    return;
  }
  if (normalized === "/help") {
    input.setDialog({ type: "help" });
    return;
  }
  if (normalized === "/thinking") {
    input.toggleThinking();
    input.setEvents((previous) => [...previous, localEvent("思考/工具过程显示状态已切换。")]);
    return;
  }
  if (normalized === "/status") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("状态显示在顶部栏；使用 /debug 查看完整事件 payload。"),
    ]);
    return;
  }
  if (normalized === "/init") {
    await refreshWorkbench(input.setWorkbench, input.setHistoryItems, appendSystemEvent(input.setEvents));
    input.setEvents((previous) => [
      ...previous,
      localEvent("工作区已就绪。可以直接输入自然语言任务，或使用 /scan 查看授权要求。"),
    ]);
    return;
  }
  if (normalized === "/history") {
    await refreshWorkbench(input.setWorkbench, input.setHistoryItems, appendSystemEvent(input.setEvents));
    input.setDialog({ type: "history" });
    return;
  }
  if (normalized.startsWith("/switch ") || normalized.startsWith("/replay ")) {
    const argument = input.submitted.replace(/^\/(?:switch|replay)\s+/u, "").trim();
    const finalRunId = resolveHistoryReference(argument, input.historyItems) ?? argument;
    const cached = input.runSessions.find((session) => session.runId === finalRunId);
    const replay = cached?.events.length ? cached.events : await input.session.replayRun(finalRunId);
    input.setActiveRunId(finalRunId);
    input.setEvents(replay.length > 0 ? replay : [localEvent(`未找到 run: ${finalRunId}`)]);
    input.setReplayMode(true);
    input.clearDialog();
    return;
  }
  if (normalized === "/sessions") {
    const lines =
      input.runSessions.length > 0
        ? input.runSessions.map((run, index) => `${index + 1}. ${run.title} · ${run.runId}`)
        : ["当前进程还没有缓存的 run。"];
    input.setEvents((previous) => [...previous, localEvent(lines.join("\n"))]);
    return;
  }
  if (normalized === "/cancel") {
    if (!input.activeRunId) {
      input.setEvents((previous) => [...previous, localEvent("No active run to cancel.")]);
      return;
    }
    const cancelled = input.session.cancel(input.activeRunId);
    input.setEvents((previous) => [
      ...previous,
      localEvent(cancelled ? `Cancel requested for ${input.activeRunId}.` : `Run is not active: ${input.activeRunId}`),
    ]);
    return;
  }
  if (normalized.startsWith("/btw")) {
    if (!input.activeRunId) {
      input.setEvents((previous) => [...previous, localEvent("No active run for btw injection.")]);
      return;
    }
    const message = input.submitted.replace(/^\/btw\s*/iu, "").trim();
    if (!message) {
      input.setEvents((previous) => [...previous, localEvent("Usage: /btw <message>")]);
      return;
    }
    const queued = input.session.btw(input.activeRunId, message);
    input.setEvents((previous) => [
      ...previous,
      localEvent(queued ? `Queued btw for ${input.activeRunId}.` : `Run is not active: ${input.activeRunId}`),
    ]);
    return;
  }
  if (normalized === "/policy") {
    const policy = await input.session.getPolicy();
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        [
          `maxSteps=${policy.maxSteps}`,
          `maxToolCalls=${policy.maxToolCalls}`,
          `maxConcurrentToolCalls=${policy.maxConcurrentToolCalls}`,
          `tokenBudgetPerTurn=${policy.tokenBudgetPerTurn}`,
        ].join("\n"),
      ),
    ]);
    return;
  }
  if (normalized.startsWith("/policy set")) {
    const parsed = parsePolicyOverrides(input.submitted.replace(/^\/policy\s+set\s*/iu, ""));
    if (Object.keys(parsed).length === 0) {
      input.setEvents((previous) => [...previous, localEvent("Usage: /policy set maxSteps=8 maxToolCalls=12")]);
      return;
    }
    const policy = await input.session.setPolicy(parsed);
    input.setEvents((previous) => [...previous, localEvent(`Policy updated: ${JSON.stringify(policy)}`)]);
    return;
  }
  if (normalized === "/model" || normalized === "/models") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("模型管理请打开 ego serve 的 Models 页面；TUI 顶部会同步显示当前 active profile。"),
    ]);
    return;
  }
  if (normalized === "/skills") {
    input.setEvents((previous) => [...previous, localEvent("Skills 管理请打开 ego serve 的 Skills 页面。")]);
    return;
  }
  if (normalized === "/mcp" || normalized === "/tools") {
    const mcpEvents = await input.session.discoverMcpTools();
    input.setEvents((previous) => [...previous, ...mcpEvents].slice(-240));
    input.setDialog({ type: "debug" });
    await refreshWorkbench(input.setWorkbench, input.setHistoryItems, appendSystemEvent(input.setEvents));
    return;
  }
  if (normalized === "/prompt") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("System Prompt 位于 .ego/system-prompt.md；Web Workbench 可查看最终注入 prompt。"),
    ]);
    return;
  }
  if (normalized === "/permissions") {
    input.setDialog({ type: "permissions" });
    return;
  }
  if (normalized.startsWith("/allow ")) {
    const requested = normalized.replace("/allow ", "").trim() as PermissionLevel;
    if (!permissionLevels.includes(requested)) {
      input.setEvents((previous) => [...previous, localEvent(`未知权限等级: ${requested}`)]);
      return;
    }
    input.session.setPermissionLevel(requested);
    input.setPermissionLevel(requested);
    input.setEvents((previous) => [...previous, localEvent(`权限等级已切换为 ${requested}`)]);
    return;
  }
  if (normalized === "/plan") {
    input.setDialog({ type: "plan" });
    return;
  }
  if (normalized === "/plan approve" && input.activeRunId) {
    input.setDialog({ type: "diff" });
    await runStream(input.session.approvePlan(input.activeRunId), input);
    return;
  }
  if (normalized === "/plan reject" && input.activeRunId) {
    await runStream(input.session.rejectPlan(input.activeRunId), input);
    return;
  }
  if (normalized.startsWith("/diff ")) {
    const fileCount = input.activeRun?.diff ? splitDiffByFile(input.activeRun.diff).length : 0;
    input.setDiffFileIndex((previous) => resolveDiffFileIndex(normalized, previous, fileCount));
    input.setDialog({ type: "diff" });
    return;
  }
  if (normalized === "/diff") {
    input.setDialog({ type: "diff" });
    return;
  }
  if (normalized === "/checks") {
    input.setDialog({ type: "checks" });
    return;
  }
  if (normalized === "/debug") {
    input.setDialog({ type: "debug" });
    return;
  }
  if (normalized === "/patch approve" && input.activeRunId) {
    input.setDialog({ type: "checks" });
    await runStream(input.session.approvePatch(input.activeRunId), input);
    return;
  }
  if (normalized === "/patch reject" && input.activeRunId) {
    await runStream(input.session.rejectPatch(input.activeRunId), input);
    return;
  }
  if (normalized === "/memory" || normalized.startsWith("/memory ")) {
    const parts = input.submitted.trim().split(/\s+/u);
    const action = parts[1] ?? "recall";
    const argument = parts.slice(2).join(" ");
    const memoryEvents =
      action === "compact"
        ? await input.session.compactMemory(argument || undefined)
        : action === "archive" && argument
          ? await input.session.archiveMemory(argument)
          : action === "forget" && argument
            ? await input.session.forgetMemory(argument)
            : await input.session.recallMemory(argument || "project");
    input.setEvents((previous) => [...previous, ...memoryEvents].slice(-240));
    input.setDialog({ type: "debug" });
    return;
  }
  if (normalized === "/scan") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("安全任务必须先确认授权范围、目标和风险等级；默认拒绝未授权公网扫描或漏洞利用。"),
    ]);
    return;
  }
  if (normalized === "/analyze") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("证据分析：先整理事实、假设和缺口；如需工具执行，会进入 plan / permission / diff 流程。"),
    ]);
    return;
  }
  if (normalized === "/report") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("报告生成：汇总事实、执行记录、风险和结论；需要落盘时会先生成可审查 patch。"),
    ]);
    return;
  }

  input.clearDialog();
  input.setReplayMode(false);
  await runStream(input.session.submitMessage(input.submitted), {
    ...input,
    onEvent(event) {
      if (event.type === "user.message" || event.type === "run.started") {
        input.setActiveRunId(event.runId);
      }
      updateRunSessions(input.setRunSessions, event);
    },
  });
}

function parsePolicyOverrides(value: string): Record<string, number> {
  const allowed = new Set(["maxSteps", "maxToolCalls", "maxConcurrentToolCalls", "tokenBudgetPerTurn"]);
  const overrides: Record<string, number> = {};
  for (const part of value.trim().split(/\s+/u)) {
    const [key, raw] = part.split("=");
    if (!key || !raw || !allowed.has(key)) {
      continue;
    }
    const number = Number(raw);
    if (Number.isFinite(number) && number > 0) {
      overrides[key] = number;
    }
  }
  return overrides;
}

async function runStream(
  stream: AsyncIterable<AgentRunEvent>,
  input: Pick<
    SubmitInputOptions,
    "setEvents" | "setBusy" | "setWorkbench" | "setHistoryItems"
  > & {
    onEvent?(event: AgentRunEvent): void;
  },
): Promise<void> {
  input.setBusy(true);
  try {
    for await (const event of stream) {
      input.onEvent?.(event);
      input.setEvents((previous) => [...previous, event].slice(-240));
    }
    await refreshWorkbench(input.setWorkbench, input.setHistoryItems, appendSystemEvent(input.setEvents));
  } catch (error) {
    input.setEvents((previous) => [
      ...previous,
      localEvent(`任务处理失败：${error instanceof Error ? error.message : String(error)}`),
    ]);
  } finally {
    input.setBusy(false);
  }
}

async function refreshWorkbench(
  setWorkbench: Setter<WorkbenchState | undefined>,
  setHistoryItems: Setter<HistoryItem[]>,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const state = await readWorkbenchState({ workspaceRoot: process.cwd() });
    setWorkbench(state);
    setHistoryItems(createHistoryItems(state.recentRuns));
  } catch (error) {
    onError(`Workbench 状态读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function updateRunSessions(setRunSessions: Setter<TuiRunSession[]>, event: AgentRunEvent): void {
  if (event.runId === "local") return;
  setRunSessions((previous) => {
    const existing = previous.find((session) => session.runId === event.runId);
    const updated: TuiRunSession = {
      runId: event.runId,
      title: readSessionTitle(event),
      events: [...(existing?.events ?? []), event].slice(-160),
      updatedAt: event.createdAt,
    };
    return [updated, ...previous.filter((session) => session.runId !== event.runId)].slice(0, 12);
  });
}

function readSessionTitle(event: AgentRunEvent): string {
  const userMessage = event.payload.userMessage;
  return typeof userMessage === "string" && userMessage.length > 0
    ? userMessage.slice(0, 40)
    : event.message.slice(0, 40);
}

function localEvent(message: string): AgentRunEvent {
  return {
    type: "assistant.message",
    runId: "local",
    sessionId: "local",
    message,
    createdAt: new Date().toISOString(),
    payload: {},
  };
}

function appendSystemEvent(setEvents: Setter<AgentRunEvent[]>): (message: string) => void {
  return (message: string) => setEvents((previous) => [...previous, localEvent(message)]);
}

function helpText(): string {
  return [
    "可用命令：",
    "/init 初始化工作区状态",
    "/scan 查看授权扫描要求",
    "/analyze 进入证据分析工作流",
    "/report 查看报告生成工作流",
    "/tools 或 /mcp 发现工具",
    "/permissions 查看权限边界",
    "/plan approve|reject 审批计划",
    "/patch approve|reject 审批 patch",
    "/diff next|prev 浏览 diff",
    "/memory recall|compact|archive|forget 管理记忆",
    "/debug 查看事件流",
    "/clear 清屏",
    "/exit 退出",
  ].join("\n");
}

function commandDescription(command: string): string {
  return commandPalette.find((item) => item.name === command)?.description ?? "";
}

function permissionDescription(level: PermissionLevel): string {
  switch (level) {
    case "read-only":
      return "只读分析，默认安全边界";
    case "workspace-write":
      return "允许经审批的工作区 patch";
    case "shell-readonly":
      return "允许只读 shell 检查";
    case "network-low":
      return "允许低风险网络请求";
    case "security-active":
      return "允许明确授权的安全工具";
  }
}

function lineColor(line: string) {
  const theme = useTuiTheme();
  if (line.startsWith("❯ ")) return theme.text;
  if (line.startsWith("plan")) return theme.warning;
  if (line.startsWith("patch")) return theme.info;
  if (line.startsWith("tool")) return theme.primaryDim;
  if (line.startsWith("✓")) return theme.success;
  return theme.muted;
}

function diffLineColor(line: string) {
  const theme = useTuiTheme();
  if (line.startsWith("+") && !line.startsWith("+++")) return theme.success;
  if (line.startsWith("-") && !line.startsWith("---")) return theme.danger;
  if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) return theme.info;
  return theme.text;
}

function resolveDiffFileIndex(command: string, current: number, fileCount: number): number {
  const maxIndex = Math.max(0, fileCount - 1);
  const normalized = command.trim().toLowerCase();
  if (normalized === "/diff next") return Math.min(current + 1, maxIndex);
  if (normalized === "/diff prev") return Math.max(current - 1, 0);
  if (normalized === "/diff first") return 0;
  if (normalized === "/diff last") return maxIndex;
  const page = Number(normalized.replace("/diff", "").trim());
  return Number.isInteger(page) && page > 0 ? Math.min(page - 1, maxIndex) : current;
}
