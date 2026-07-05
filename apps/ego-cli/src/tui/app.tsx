import {
  createTerminalAgentSession,
  type AgentRunEvent,
  type PermissionLevel,
  type TerminalAgentSession,
} from "@ego-graph/agent-harness";
import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { Box, Text, useApp, useStdout } from "ink";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type SetStateAction,
} from "react";
import {
  closeCommandPalette,
  createCommandPaletteState,
  moveCommandPaletteSelection,
  resolvePaletteInput,
  selectCommandPalette,
  type CommandPaletteState,
} from "./command-palette.js";
import { CommandPaletteView } from "./command-palette-view.js";
import { ChecksView } from "./checks-view.js";
import { ConversationView } from "./conversation-view.js";
import { DebugView } from "./debug-view.js";
import { DiffView, resolveDiffFileIndex, splitDiffByFile } from "./diff-view.js";
import {
  createHistoryItems,
  HistoryBrowser,
  resolveHistoryReference,
  type HistoryItem,
} from "./history-browser.js";
import { chooseTuiLayout, StatusLine } from "./layout.js";
import {
  addPromptHistory,
  createPromptState,
  editPrompt,
  getPromptRenderMetrics,
  PromptInput,
  type PromptState,
} from "./prompt-input.js";
import { PlanView } from "./plan-view.js";
import { useMouseTracking, useTerminalInput, type TerminalInputAction } from "./terminal-input.js";
import { calculateBodyHeight, useTerminalSize } from "./terminal-size.js";
import type { OverlayMode, TuiRunSession } from "./tui-state.js";
import { WelcomeScreen } from "./welcome-screen.js";

const permissionLevels: PermissionLevel[] = [
  "read-only",
  "workspace-write",
  "shell-readonly",
  "network-low",
  "security-active",
];

export function EgoTui(): ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalSize = useTerminalSize(stdout);
  const terminalWidth = terminalSize.columns;
  const terminalHeight = terminalSize.rows;
  const session = useMemo(() => createTerminalAgentSession({ workspaceRoot: process.cwd() }), []);
  const [workbench, setWorkbench] = useState<WorkbenchState | undefined>();
  const [prompt, setPrompt] = useState<PromptState>(() => createPromptState());
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>(
    session.getPermissionLevel(),
  );
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("none");
  const [palette, setPalette] = useState<CommandPaletteState>(() =>
    closeCommandPalette(createCommandPaletteState("")),
  );
  const [scrollOffset, setScrollOffset] = useState(0);
  const [diffFileIndex, setDiffFileIndex] = useState(0);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [runSessions, setRunSessions] = useState<TuiRunSession[]>([]);
  const [replayMode, setReplayMode] = useState(false);
  const [sidePanelRequested, setSidePanelRequested] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const layout = chooseTuiLayout(terminalWidth, sidePanelRequested);
  const showStartup = overlayMode === "none" && events.length === 0;
  const showStatusLine = !showStartup;
  const promptHeight = getPromptRenderMetrics(prompt, terminalWidth).height;
  const paletteHeight = palette.open ? Math.min(12, palette.matches.length + 3) : 0;
  const bodyHeight = calculateBodyHeight({
    terminalRows: terminalHeight,
    statusHeight: showStatusLine ? 1 : 0,
    paletteHeight,
    promptHeight,
  });

  useMouseTracking();

  useEffect(() => {
    void refreshWorkbench(setWorkbench, setHistoryItems, appendSystemEvent(setEvents));
    void session.hydratePendingRuns().then((runs) => {
      if (runs.length > 0) {
        setRunSessions(
          runs.map((run) => ({
            runId: run.runId,
            title: run.message,
            events: [],
            updatedAt: new Date().toISOString(),
          })),
        );
      }
    });
  }, [session]);

  useEffect(() => {
    if (prompt.value.startsWith("/")) {
      const next = createCommandPaletteState(prompt.value);
      setPalette((previous) => ({
        ...next,
        selectedIndex: Math.min(previous.selectedIndex, Math.max(0, next.matches.length - 1)),
      }));
    } else {
      setPalette((previous) => closeCommandPalette(previous));
    }
  }, [prompt.value]);

  const handleSubmit = useCallback((): void => {
    if (busy) {
      appendSystemEvent(setEvents)("当前仍在运行，已保留草稿；等待完成后再提交。");
      return;
    }
    const selected = palette.open ? selectCommandPalette(palette) : undefined;
    const submitted =
      selected ??
      resolvePaletteInput(
        prompt.value,
        palette.matches.map((command) => command.name),
        palette.selectedIndex,
      );
    if (submitted === "/" || !submitted.trim()) {
      return;
    }
    setPrompt((previous) => editPrompt(addPromptHistory(previous, submitted), { type: "reset" }));
    setPalette((previous) => closeCommandPalette(previous));
    setScrollOffset(0);
    void submitInput({
      submitted,
      session,
      activeRunId,
      setActiveRunId,
      setEvents,
      setBusy,
      setWorkbench,
      setHistoryItems,
      setOverlayMode,
      setScrollOffset,
      setDiffFileIndex,
      historyItems,
      historyIndex,
      setHistoryIndex,
      runSessions,
      setRunSessions,
      setPermissionLevel,
      setReplayMode,
      toggleThinking: () => setThinkingExpanded((previous) => !previous),
      exit,
    });
  }, [
    activeRunId,
    busy,
    exit,
    historyIndex,
    historyItems,
    palette,
    prompt.value,
    runSessions,
    session,
  ]);

  const handleTerminalAction = useCallback(
    (action: TerminalInputAction): void => {
      if (action.type === "exit") {
        exit();
        return;
      }
      if (action.type === "escape") {
        if (palette.open) {
          setPalette((previous) => closeCommandPalette(previous));
          setPrompt((previous) => editPrompt(previous, { type: "reset", value: "" }));
          return;
        }
        if (overlayMode !== "none") {
          setOverlayMode("none");
          return;
        }
        exit();
        return;
      }
      if (action.type === "toggle-thinking") {
        setThinkingExpanded((previous) => !previous);
        return;
      }
      if (action.type === "toggle-side-panel") {
        setSidePanelRequested((previous) => !previous);
        return;
      }
      if (action.type === "scroll") {
        setScrollOffset((previous) => Math.max(0, previous + action.delta));
        return;
      }
      if (action.type === "tab") {
        if (palette.open) {
          setPalette((previous) => moveCommandPaletteSelection(previous, 1));
        }
        return;
      }
      if (action.type === "submit") {
        handleSubmit();
        return;
      }
      if (action.type === "move") {
        handleMoveAction(action.direction, {
          palette,
          overlayMode,
          historyItems,
          setPalette,
          setHistoryIndex,
          setScrollOffset,
          setPrompt,
        });
        return;
      }
      if (action.type === "prompt-edit") {
        if (
          handleSingleKeyShortcut(action, overlayMode, activeRunId, session, {
            setDiffFileIndex,
            setEvents,
            setBusy,
            setWorkbench,
            setHistoryItems,
            setRunSessions,
          })
        ) {
          return;
        }
        if (action.edit === "insert") {
          setPrompt((previous) =>
            editPrompt(previous, { type: "insert", text: action.text ?? "" }),
          );
          return;
        }
        setPrompt((previous) => editPrompt(previous, { type: action.edit }));
      }
    },
    [activeRunId, exit, handleSubmit, historyItems, overlayMode, palette, session],
  );

  useTerminalInput(handleTerminalAction);

  if (!workbench) {
    return (
      <Box flexDirection="column">
        <Text color="magentaBright">EGO-Graph</Text>
        <Text color="gray">Loading workspace, model, SQLite and Agent Harness state...</Text>
      </Box>
    );
  }

  const activeRun = activeRunId ? session.getRunState(activeRunId) : undefined;

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {showStatusLine ? (
        <StatusLine
          workbench={workbench}
          permissionLevel={permissionLevel}
          busy={busy}
          thinkingExpanded={thinkingExpanded}
          width={terminalWidth}
        />
      ) : null}
      <Box flexGrow={1} height={bodyHeight}>
        {overlayMode === "history" ? (
          <HistoryBrowser
            items={historyItems}
            selectedIndex={historyIndex}
            width={layout.conversationWidth}
          />
        ) : overlayMode === "plan" ? (
          <PlanView plan={activeRun?.plan ?? []} width={layout.conversationWidth} />
        ) : overlayMode === "diff" ? (
          <DiffView
            diff={activeRun?.diff}
            fileIndex={diffFileIndex}
            width={layout.conversationWidth}
            height={bodyHeight}
          />
        ) : overlayMode === "checks" ? (
          <ChecksView checks={activeRun?.checks ?? []} width={layout.conversationWidth} />
        ) : overlayMode === "debug" ? (
          <DebugView events={events} width={layout.conversationWidth} height={bodyHeight} />
        ) : showStartup ? (
          <WelcomeScreen
            workbench={workbench}
            permissionLevel={permissionLevel}
            width={terminalWidth}
          />
        ) : (
          <ConversationView
            events={events}
            width={layout.conversationWidth}
            height={bodyHeight}
            scrollOffset={scrollOffset}
            debug={false}
            thinkingExpanded={thinkingExpanded}
            replayMode={replayMode}
          />
        )}
      </Box>
      <CommandPaletteView
        state={palette}
        width={terminalWidth}
        {...(activeRunId ? { activeRunId } : {})}
      />
      <PromptInput state={prompt} busy={busy} width={terminalWidth} />
    </Box>
  );
}

type SubmitInputOptions = {
  submitted: string;
  session: TerminalAgentSession;
  activeRunId: string | undefined;
  setActiveRunId(value: string | undefined): void;
  setEvents(value: SetStateAction<AgentRunEvent[]>): void;
  setBusy(value: boolean): void;
  setWorkbench(value: WorkbenchState | undefined): void;
  setHistoryItems(value: HistoryItem[]): void;
  setOverlayMode(value: OverlayMode): void;
  setScrollOffset(value: SetStateAction<number>): void;
  setDiffFileIndex(value: SetStateAction<number>): void;
  historyItems: HistoryItem[];
  historyIndex: number;
  setHistoryIndex(value: SetStateAction<number>): void;
  runSessions: TuiRunSession[];
  setRunSessions(value: SetStateAction<TuiRunSession[]>): void;
  setPermissionLevel(value: PermissionLevel): void;
  setReplayMode(value: boolean): void;
  toggleThinking(): void;
  exit(): void;
};

function handleMoveAction(
  direction: "up" | "down" | "left" | "right" | "page-up" | "page-down",
  input: {
    palette: CommandPaletteState;
    overlayMode: OverlayMode;
    historyItems: HistoryItem[];
    setPalette(value: SetStateAction<CommandPaletteState>): void;
    setHistoryIndex(value: SetStateAction<number>): void;
    setScrollOffset(value: SetStateAction<number>): void;
    setPrompt(value: SetStateAction<PromptState>): void;
  },
): void {
  if (input.palette.open && (direction === "down" || direction === "up")) {
    input.setPalette((previous) =>
      moveCommandPaletteSelection(previous, direction === "down" ? 1 : -1),
    );
    return;
  }
  if (input.overlayMode === "history" && direction === "down") {
    input.setHistoryIndex((previous) =>
      Math.min(previous + 1, Math.max(0, input.historyItems.length - 1)),
    );
    return;
  }
  if (input.overlayMode === "history" && direction === "up") {
    input.setHistoryIndex((previous) => Math.max(0, previous - 1));
    return;
  }
  if (direction === "page-up") {
    input.setScrollOffset((previous) => previous + 5);
    return;
  }
  if (direction === "page-down") {
    input.setScrollOffset((previous) => Math.max(0, previous - 5));
    return;
  }
  if (!input.palette.open && direction === "up") {
    input.setPrompt((previous) => editPrompt(previous, { type: "history-prev" }));
    return;
  }
  if (!input.palette.open && direction === "down") {
    input.setPrompt((previous) => editPrompt(previous, { type: "history-next" }));
    return;
  }
  if (direction === "left") {
    input.setPrompt((previous) => editPrompt(previous, { type: "move-left" }));
    return;
  }
  if (direction === "right") {
    input.setPrompt((previous) => editPrompt(previous, { type: "move-right" }));
  }
}

function handleSingleKeyShortcut(
  action: Extract<TerminalInputAction, { type: "prompt-edit" }>,
  overlayMode: OverlayMode,
  activeRunId: string | undefined,
  session: TerminalAgentSession,
  input: {
    setDiffFileIndex(value: SetStateAction<number>): void;
    setEvents(value: SetStateAction<AgentRunEvent[]>): void;
    setBusy(value: boolean): void;
    setWorkbench(value: WorkbenchState | undefined): void;
    setHistoryItems(value: HistoryItem[]): void;
    setRunSessions(value: SetStateAction<TuiRunSession[]>): void;
  },
): boolean {
  if (action.edit !== "insert" || !action.text) {
    return false;
  }
  if (action.text === "n" && overlayMode === "diff") {
    input.setDiffFileIndex((previous) => previous + 1);
    return true;
  }
  if (action.text === "p" && overlayMode === "diff") {
    input.setDiffFileIndex((previous) => Math.max(0, previous - 1));
    return true;
  }
  if ((action.text === "y" || action.text === "n") && activeRunId) {
    const state = session.getRunState(activeRunId);
    if (state?.status === "plan_pending") {
      void runStream(
        action.text === "y" ? session.approvePlan(activeRunId) : session.rejectPlan(activeRunId),
        {
          setEvents: input.setEvents,
          setBusy: input.setBusy,
          setWorkbench: input.setWorkbench,
          setHistoryItems: input.setHistoryItems,
          onEvent: (event) => updateRunSessions(input.setRunSessions, event),
        },
      );
      return true;
    }
    if (state?.status === "patch_pending") {
      void runStream(
        action.text === "y" ? session.approvePatch(activeRunId) : session.rejectPatch(activeRunId),
        {
          setEvents: input.setEvents,
          setBusy: input.setBusy,
          setWorkbench: input.setWorkbench,
          setHistoryItems: input.setHistoryItems,
          onEvent: (event) => updateRunSessions(input.setRunSessions, event),
        },
      );
      return true;
    }
  }
  return false;
}

async function submitInput(input: SubmitInputOptions): Promise<void> {
  const normalized = input.submitted.toLowerCase().trim();
  if (normalized === "/exit") {
    input.exit();
    return;
  }
  if (normalized === "/clear" || normalized === "/new") {
    input.setEvents([]);
    input.setActiveRunId(undefined);
    input.setReplayMode(false);
    input.setOverlayMode("none");
    return;
  }
  if (normalized === "/help") {
    input.setEvents((previous) => [...previous, localEvent(helpText())]);
    input.setOverlayMode("none");
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
  if (normalized === "/history") {
    await refreshWorkbench(
      input.setWorkbench,
      input.setHistoryItems,
      appendSystemEvent(input.setEvents),
    );
    input.setOverlayMode("history");
    input.setHistoryIndex(0);
    return;
  }
  if (normalized.startsWith("/switch ") || normalized.startsWith("/replay ")) {
    const argument = input.submitted.replace(/^\/(?:switch|replay)\s+/u, "").trim();
    const runId = resolveHistoryReference(argument, input.historyItems);
    if (!runId) {
      input.setEvents((previous) => [...previous, localEvent(`未找到历史 run: ${argument}`)]);
      return;
    }
    const cached = input.runSessions.find((session) => session.runId === runId);
    const replay = cached?.events.length ? cached.events : await input.session.replayRun(runId);
    input.setActiveRunId(runId);
    input.setEvents(replay.length > 0 ? replay : [localEvent(`未找到 run: ${runId}`)]);
    input.setReplayMode(true);
    input.setOverlayMode("none");
    input.setScrollOffset(0);
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
  if (normalized === "/model" || normalized === "/models") {
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        "模型管理请打开 ego serve 的 Models 页面；TUI 顶部会同步显示当前 active profile。",
      ),
    ]);
    return;
  }
  if (normalized === "/skills") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("Skills 管理请打开 ego serve 的 Skills 页面。"),
    ]);
    return;
  }
  if (normalized === "/mcp") {
    const mcpEvents = await input.session.discoverMcpTools();
    input.setEvents((previous) => [...previous, ...mcpEvents].slice(-200));
    input.setOverlayMode("debug");
    await refreshWorkbench(
      input.setWorkbench,
      input.setHistoryItems,
      appendSystemEvent(input.setEvents),
    );
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
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        `当前权限: ${input.session.getPermissionLevel()}\n可选: ${permissionLevels.join(", ")}`,
      ),
    ]);
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
    input.setOverlayMode("plan");
    return;
  }
  if (normalized === "/plan approve" && input.activeRunId) {
    input.setOverlayMode("diff");
    await runStream(input.session.approvePlan(input.activeRunId), {
      setEvents: input.setEvents,
      setBusy: input.setBusy,
      setWorkbench: input.setWorkbench,
      setHistoryItems: input.setHistoryItems,
      onEvent: (event) => updateRunSessions(input.setRunSessions, event),
    });
    return;
  }
  if (normalized === "/plan reject" && input.activeRunId) {
    await runStream(input.session.rejectPlan(input.activeRunId), {
      setEvents: input.setEvents,
      setBusy: input.setBusy,
      setWorkbench: input.setWorkbench,
      setHistoryItems: input.setHistoryItems,
      onEvent: (event) => updateRunSessions(input.setRunSessions, event),
    });
    return;
  }
  if (normalized.startsWith("/diff ")) {
    const activeRun = input.activeRunId ? input.session.getRunState(input.activeRunId) : undefined;
    const fileCount = activeRun?.diff ? splitDiffByFile(activeRun.diff).length : 0;
    input.setDiffFileIndex((previous) => resolveDiffFileIndex(normalized, previous, fileCount));
    input.setOverlayMode("diff");
    return;
  }
  if (normalized === "/diff") {
    input.setOverlayMode("diff");
    return;
  }
  if (normalized === "/checks") {
    input.setOverlayMode("checks");
    return;
  }
  if (normalized === "/debug") {
    input.setOverlayMode("debug");
    return;
  }
  if (normalized === "/patch approve" && input.activeRunId) {
    input.setOverlayMode("checks");
    await runStream(input.session.approvePatch(input.activeRunId), {
      setEvents: input.setEvents,
      setBusy: input.setBusy,
      setWorkbench: input.setWorkbench,
      setHistoryItems: input.setHistoryItems,
      onEvent: (event) => updateRunSessions(input.setRunSessions, event),
    });
    return;
  }
  if (normalized === "/patch reject" && input.activeRunId) {
    await runStream(input.session.rejectPatch(input.activeRunId), {
      setEvents: input.setEvents,
      setBusy: input.setBusy,
      setWorkbench: input.setWorkbench,
      setHistoryItems: input.setHistoryItems,
      onEvent: (event) => updateRunSessions(input.setRunSessions, event),
    });
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
    input.setEvents((previous) => [...previous, ...memoryEvents].slice(-200));
    input.setOverlayMode("debug");
    return;
  }
  if (normalized === "/scan") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("安全任务必须先确认授权范围、目标和风险等级；默认拒绝未授权公网扫描或漏洞利用。"),
    ]);
    return;
  }

  input.setOverlayMode("none");
  input.setReplayMode(false);
  await runStream(input.session.submitMessage(input.submitted), {
    setEvents: input.setEvents,
    setBusy: input.setBusy,
    setWorkbench: input.setWorkbench,
    setHistoryItems: input.setHistoryItems,
    onEvent(event) {
      if (event.type === "user.message" || event.type === "run.started") {
        input.setActiveRunId(event.runId);
      }
      updateRunSessions(input.setRunSessions, event);
    },
  });
}

async function runStream(
  stream: AsyncIterable<AgentRunEvent>,
  input: {
    setEvents(value: SetStateAction<AgentRunEvent[]>): void;
    setBusy(value: boolean): void;
    setWorkbench(value: WorkbenchState | undefined): void;
    setHistoryItems(value: HistoryItem[]): void;
    onEvent?(event: AgentRunEvent): void;
  },
): Promise<void> {
  input.setBusy(true);
  try {
    for await (const event of stream) {
      input.onEvent?.(event);
      input.setEvents((previous) => [...previous, event].slice(-240));
    }
    await refreshWorkbench(
      input.setWorkbench,
      input.setHistoryItems,
      appendSystemEvent(input.setEvents),
    );
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
  setWorkbench: (value: WorkbenchState | undefined) => void,
  setHistoryItems: (value: HistoryItem[]) => void,
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

function updateRunSessions(
  setRunSessions: (value: SetStateAction<TuiRunSession[]>) => void,
  event: AgentRunEvent,
): void {
  if (event.runId === "local") {
    return;
  }
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
  if (typeof userMessage === "string" && userMessage.length > 0) {
    return userMessage.slice(0, 40);
  }
  return event.message.slice(0, 40);
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

function appendSystemEvent(
  setEvents: (value: SetStateAction<AgentRunEvent[]>) => void,
): (message: string) => void {
  return (message: string) => setEvents((previous) => [...previous, localEvent(message)]);
}

function helpText(): string {
  return [
    "可用命令：",
    "/history 浏览持久化 run",
    "/replay 1 按序号回放历史",
    "/thinking 展开/折叠思考与工具过程",
    "/allow <level> 切换权限",
    "/plan approve|reject 审批计划",
    "/diff next|prev 浏览 diff",
    "/patch approve|reject 审批 patch",
    "/debug 展开完整调试详情",
    "/clear 清屏",
    "/exit 退出",
  ].join("\n");
}
