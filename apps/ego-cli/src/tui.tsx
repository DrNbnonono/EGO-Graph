import {
  createTerminalAgentSession,
  type AgentRunEvent,
  type EvidenceGapStep,
  type PermissionLevel,
  type TerminalAgentRunState,
  type TerminalAgentSession,
} from "@ego-graph/agent-harness";
import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useState, type ReactElement, type SetStateAction } from "react";

const permissionLevels: PermissionLevel[] = [
  "read-only",
  "workspace-write",
  "shell-readonly",
  "network-low",
  "security-active",
];

type DetailMode = "status" | "plan" | "diff" | "checks" | "debug";

type TuiRunSession = {
  runId: string;
  title: string;
  events: AgentRunEvent[];
  updatedAt: string;
};

const commandPalette = [
  "/help",
  "/model",
  "/models",
  "/status",
  "/permissions",
  "/allow workspace-write",
  "/allow shell-readonly",
  "/allow network-low",
  "/allow security-active",
  "/plan",
  "/plan approve",
  "/plan reject",
  "/patch",
  "/diff",
  "/patch approve",
  "/patch reject",
  "/checks",
  "/scan",
  "/debug",
  "/memory",
  "/memory compact",
  "/skills",
  "/mcp",
  "/prompt",
  "/compact",
  "/sessions",
  "/new",
  "/replay ",
  "/clear",
];

export function getCommandPaletteMatches(input: string): Array<{ name: string }> {
  const trimmed = input.trim();
  return commandPalette
    .filter((command) => trimmed === "/" || command.startsWith(trimmed))
    .map((name) => ({ name }));
}

export function EgoTui(): ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = Math.max(24, stdout.rows ?? 32);
  const bodyHeight = Math.max(10, terminalHeight - 7);
  const session = useMemo(() => createTerminalAgentSession({ workspaceRoot: process.cwd() }), []);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<AgentRunEvent[]>([
    localEvent(
      "欢迎使用 EGO-Graph 终端 Agent。直接输入问题即可对话；需要改代码时我会先给计划和 diff 审批。",
      "assistant.message",
    ),
  ]);
  const [workbench, setWorkbench] = useState<WorkbenchState | undefined>();
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [detailMode, setDetailMode] = useState<DetailMode>("status");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [diffFileIndex, setDiffFileIndex] = useState(0);
  const [runSessions, setRunSessions] = useState<TuiRunSession[]>([]);
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>(
    session.getPermissionLevel(),
  );
  const paletteMatches = input.startsWith("/")
    ? commandPalette.filter((command) => command.startsWith(input) || input === "/")
    : [];

  useEffect(() => {
    void refreshWorkbench(setWorkbench, appendSystemEvent(setEvents));
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
        setEvents((previous) => [
          ...previous,
          localEvent(`已恢复 ${runs.length} 个 pending Agent run，可用 /replay <runId> 查看。`),
        ]);
      }
    });
  }, []);

  useInput((value, key) => {
    if (key.escape || (key.ctrl && value === "c")) {
      exit();
      return;
    }

    if (key.pageUp || key.upArrow) {
      setScrollOffset((previous) => Math.min(previous + 4, Math.max(0, events.length - 1)));
      return;
    }
    if (key.pageDown || key.downArrow) {
      setScrollOffset((previous) => Math.max(0, previous - 4));
      return;
    }

    if (busy) {
      return;
    }

    if (value === "[") {
      setDiffFileIndex((previous) => Math.max(0, previous - 1));
      setDetailMode("diff");
      return;
    }
    if (value === "]") {
      setDiffFileIndex((previous) => previous + 1);
      setDetailMode("diff");
      return;
    }

    if (key.return) {
      const submitted = resolvePaletteInput(input, paletteMatches);
      if (!submitted) {
        return;
      }
      setInput("");
      setScrollOffset(0);
      void submitInput({
        submitted,
        session,
        activeRunId,
        setActiveRunId,
        setEvents,
        setBusy,
        setWorkbench,
        setDetailMode,
        setScrollOffset,
        setDiffFileIndex,
        runSessions,
        setRunSessions,
        setPermissionLevel,
      });
      return;
    }

    if ((value === "y" || value === "n") && activeRunId) {
      const state = session.getRunState(activeRunId);
      if (state?.status === "plan_pending") {
        void runStream(
          value === "y" ? session.approvePlan(activeRunId) : session.rejectPlan(activeRunId),
          setEvents,
          setBusy,
          setWorkbench,
          {
            onEvent(event) {
              updateRunSessions(setRunSessions, event);
            },
          },
        );
        return;
      }
      if (state?.status === "patch_pending") {
        void runStream(
          value === "y" ? session.approvePatch(activeRunId) : session.rejectPatch(activeRunId),
          setEvents,
          setBusy,
          setWorkbench,
          {
            onEvent(event) {
              updateRunSessions(setRunSessions, event);
            },
          },
        );
        return;
      }
    }

    if (key.backspace || key.delete) {
      setInput((previous) => previous.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && value) {
      setInput((previous) => `${previous}${value}`);
    }
  });

  if (!workbench) {
    return (
      <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">EGO-Graph Terminal Agent</Text>
        <Text color="gray">正在读取项目、模型、SQLite 与 Agent Kernel 状态...</Text>
      </Box>
    );
  }

  const activeRun = activeRunId ? session.getRunState(activeRunId) : undefined;

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Header workbench={workbench} permissionLevel={permissionLevel} busy={busy} />
      <Box flexGrow={1} height={bodyHeight} flexDirection="row" gap={1}>
        <ConversationStream
          events={events}
          height={bodyHeight}
          scrollOffset={scrollOffset}
          detailMode={detailMode}
        />
        <RightRail
          workbench={workbench}
          activeRun={activeRun}
          detailMode={detailMode}
          diffFileIndex={diffFileIndex}
          runSessions={runSessions}
        />
      </Box>
      <InputBar input={input} busy={busy} paletteMatches={paletteMatches} />
    </Box>
  );
}

export function renderTui(): void {
  render(<EgoTui />);
}

async function submitInput(input: {
  submitted: string;
  session: TerminalAgentSession;
  activeRunId: string | undefined;
  setActiveRunId(value: string | undefined): void;
  setEvents(value: SetStateAction<AgentRunEvent[]>): void;
  setBusy(value: boolean): void;
  setWorkbench(value: WorkbenchState | undefined): void;
  setDetailMode(value: DetailMode): void;
  setScrollOffset(value: SetStateAction<number>): void;
  setDiffFileIndex(value: SetStateAction<number>): void;
  runSessions: TuiRunSession[];
  setRunSessions(value: SetStateAction<TuiRunSession[]>): void;
  setPermissionLevel(value: PermissionLevel): void;
}): Promise<void> {
  const normalized = input.submitted.toLowerCase();

  if (normalized === "/clear") {
    input.setEvents([]);
    input.setScrollOffset(0);
    return;
  }
  if (normalized === "/new") {
    input.setActiveRunId(undefined);
    input.setEvents([localEvent("新会话已创建。直接输入自然语言即可开始新的终端 Agent 对话。")]);
    input.setDetailMode("status");
    input.setScrollOffset(0);
    return;
  }
  if (normalized === "/help") {
    input.setEvents((previous) => [...previous, localEvent(helpText())]);
    input.setDetailMode("status");
    return;
  }
  if (normalized === "/status") {
    input.setDetailMode("status");
    return;
  }
  if (normalized === "/model" || normalized === "/models") {
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        [
          `当前权限: ${input.session.getPermissionLevel()}；模型管理面板可通过 ego serve 打开。`,
          "终端内模型切换后续会接入完整 selector；当前请使用 Web Workbench 的 Models 页面管理 profile。",
        ].join("\n"),
      ),
    ]);
    input.setDetailMode("status");
    return;
  }
  if (normalized === "/skills") {
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        "Skills 状态请查看右侧 Skills 计数；完整启用/禁用管理在 ego serve 的 Skills 页面。",
      ),
    ]);
    input.setDetailMode("status");
    return;
  }
  if (normalized === "/mcp") {
    const mcpEvents = await input.session.discoverMcpTools();
    input.setEvents((previous) => [...previous, ...mcpEvents].slice(-160));
    input.setDetailMode("debug");
    await refreshWorkbench(input.setWorkbench, appendSystemEvent(input.setEvents));
    return;
  }
  if (normalized === "/prompt") {
    input.setEvents((previous) => [
      ...previous,
      localEvent("System Prompt 位于 .ego/system-prompt.md；完整预览和编辑请打开 ego serve。"),
    ]);
    input.setDetailMode("status");
    return;
  }
  if (normalized === "/compact") {
    const compacted = await input.session.compactMemory();
    input.setEvents((previous) => [...previous, ...compacted].slice(-160));
    input.setDetailMode("debug");
    await refreshWorkbench(input.setWorkbench, appendSystemEvent(input.setEvents));
    return;
  }
  if (normalized === "/scan") {
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        "安全扫描需要先说明授权目标、范围、风险等级和允许动作；当前不提供未授权公网扫描或漏洞利用自动化。",
      ),
    ]);
    input.setDetailMode("status");
    return;
  }
  if (normalized === "/debug") {
    input.setDetailMode("debug");
    return;
  }
  if (normalized === "/sessions") {
    input.setEvents((previous) => [
      ...previous,
      localEvent(
        input.runSessions.length > 0
          ? [
              "终端会话：",
              ...input.runSessions
                .slice(0, 8)
                .map((session, index) => `${index + 1}. ${session.runId} ${session.title}`),
              "使用 /switch <runId> 或 /replay <runId> 切换。",
            ].join("\n")
          : "暂无活动 run。",
      ),
    ]);
    input.setDetailMode("status");
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
      input.setEvents((previous) => [
        ...previous,
        localEvent(`未知权限等级: ${requested}. 可选: ${permissionLevels.join(", ")}`),
      ]);
      return;
    }
    input.session.setPermissionLevel(requested);
    input.setPermissionLevel(requested);
    input.setEvents((previous) => [...previous, localEvent(`权限等级已切换为 ${requested}`)]);
    return;
  }
  if (normalized === "/diff" || normalized === "/patch") {
    input.setDetailMode("diff");
    return;
  }
  if (normalized === "/checks") {
    input.setDetailMode("checks");
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
    input.setEvents((previous) => [...previous, ...memoryEvents].slice(-160));
    input.setDetailMode("debug");
    await refreshWorkbench(input.setWorkbench, appendSystemEvent(input.setEvents));
    return;
  }
  if (normalized === "/plan approve" && input.activeRunId) {
    input.setDetailMode("diff");
    await runStream(
      input.session.approvePlan(input.activeRunId),
      input.setEvents,
      input.setBusy,
      input.setWorkbench,
      {
        onEvent(event) {
          updateRunSessions(input.setRunSessions, event);
        },
      },
    );
    return;
  }
  if (normalized === "/plan reject" && input.activeRunId) {
    await runStream(
      input.session.rejectPlan(input.activeRunId),
      input.setEvents,
      input.setBusy,
      input.setWorkbench,
      {
        onEvent(event) {
          updateRunSessions(input.setRunSessions, event);
        },
      },
    );
    return;
  }
  if (normalized === "/patch approve" && input.activeRunId) {
    input.setDetailMode("checks");
    await runStream(
      input.session.approvePatch(input.activeRunId),
      input.setEvents,
      input.setBusy,
      input.setWorkbench,
      {
        onEvent(event) {
          updateRunSessions(input.setRunSessions, event);
        },
      },
    );
    return;
  }
  if (normalized === "/patch reject" && input.activeRunId) {
    await runStream(
      input.session.rejectPatch(input.activeRunId),
      input.setEvents,
      input.setBusy,
      input.setWorkbench,
      {
        onEvent(event) {
          updateRunSessions(input.setRunSessions, event);
        },
      },
    );
    return;
  }
  if (normalized.startsWith("/switch ") || normalized.startsWith("/replay ")) {
    const runId = input.submitted.replace(/^\/(?:switch|replay)\s+/, "").trim();
    const replay = await input.session.replayRun(runId);
    input.setActiveRunId(runId);
    input.setEvents(replay.length > 0 ? replay : [localEvent(`未找到 run: ${runId}`)]);
    input.setDetailMode("status");
    input.setScrollOffset(0);
    return;
  }

  input.setDetailMode("status");
  await runStream(
    input.session.submitMessage(input.submitted),
    input.setEvents,
    input.setBusy,
    input.setWorkbench,
    {
      onEvent(event) {
        if (event.type === "user.message" || event.type === "run.started") {
          input.setActiveRunId(event.runId);
        }
        updateRunSessions(input.setRunSessions, event);
      },
    },
  );
}

async function runStream(
  stream: AsyncIterable<AgentRunEvent>,
  setEvents: (value: SetStateAction<AgentRunEvent[]>) => void,
  setBusy: (value: boolean) => void,
  setWorkbench: (value: WorkbenchState | undefined) => void,
  hooks: { onEvent?(event: AgentRunEvent): void } = {},
): Promise<void> {
  setBusy(true);
  try {
    for await (const event of stream) {
      hooks.onEvent?.(event);
      setEvents((previous) => [...previous, event].slice(-160));
    }
    await refreshWorkbench(setWorkbench, appendSystemEvent(setEvents));
  } catch (error) {
    setEvents((previous) => [
      ...previous,
      localEvent(`任务处理失败：${error instanceof Error ? error.message : String(error)}`),
    ]);
  } finally {
    setBusy(false);
  }
}

function Header({
  workbench,
  permissionLevel,
  busy,
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
  busy: boolean;
}): ReactElement {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text color="magentaBright">
        EGO-Graph · {workbench.model.label} · {permissionLevel} · {workbench.cwd}
      </Text>
      <Text color={busy ? "yellow" : "gray"}>
        {busy ? "运行中" : "就绪"} · {workbench.cpuLabel} · {workbench.memoryLabel}
      </Text>
    </Box>
  );
}

function ConversationStream({
  events,
  height,
  scrollOffset,
  detailMode,
}: {
  events: AgentRunEvent[];
  height: number;
  scrollOffset: number;
  detailMode: DetailMode;
}): ReactElement {
  const visibleCount = Math.max(6, height - 2);
  const end = Math.max(0, events.length - scrollOffset);
  const start = Math.max(0, end - visibleCount);
  const visibleEvents = events.slice(start, end);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {visibleEvents.map((event, index) => (
        <ConversationEvent
          key={`${event.runId}-${event.type}-${event.createdAt}-${start + index}`}
          event={event}
          showDebug={detailMode === "debug"}
        />
      ))}
      {scrollOffset > 0 ? (
        <Text color="gray">已向上滚动 {scrollOffset} 条；PageDown/↓ 返回底部。</Text>
      ) : null}
    </Box>
  );
}

function ConversationEvent({
  event,
  showDebug,
}: {
  event: AgentRunEvent;
  showDebug: boolean;
}): ReactElement {
  if (event.type === "user.message") {
    return (
      <Box marginBottom={1}>
        <Text color="cyan">› </Text>
        <Text>{truncate(event.message, 180)}</Text>
      </Box>
    );
  }

  if (event.type === "assistant.message") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="magentaBright">lotus</Text>
        {event.message
          .split("\n")
          .slice(0, 8)
          .map((line, index) => (
            <Text key={`${event.createdAt}-${index}`}>{truncate(line, 180)}</Text>
          ))}
      </Box>
    );
  }

  if (event.type === "model.failed" && !showDebug) {
    return <CollapsedEvent event={event} message={event.message} color="yellow" />;
  }

  if (event.type.includes("tool") || event.type.includes("evidence")) {
    return <CollapsedEvent event={event} message={event.message} color="gray" />;
  }

  if (showDebug && event.payload.debug) {
    return (
      <Box flexDirection="column">
        <CollapsedEvent event={event} message={event.message} color={eventColor(event.type)} />
        <Text color="gray">{truncate(String(event.payload.debug), 220)}</Text>
      </Box>
    );
  }

  return <CollapsedEvent event={event} message={event.message} color={eventColor(event.type)} />;
}

function CollapsedEvent({
  event,
  message,
  color,
}: {
  event: AgentRunEvent;
  message: string;
  color: "green" | "yellow" | "cyan" | "magentaBright" | "red" | "gray";
}): ReactElement {
  return (
    <Text color={color}>
      {eventIcon(event.type)} {shortTime(event.createdAt)} {truncate(message, 160)}
    </Text>
  );
}

function RightRail({
  workbench,
  activeRun,
  detailMode,
  diffFileIndex,
  runSessions,
}: {
  workbench: WorkbenchState;
  activeRun: TerminalAgentRunState | undefined;
  detailMode: DetailMode;
  diffFileIndex: number;
  runSessions: TuiRunSession[];
}): ReactElement {
  return (
    <Box flexDirection="column" width={38} paddingX={1}>
      <Text color="magentaBright">状态</Text>
      <Text>Plan: {activeRun?.status === "plan_pending" ? "等待 y/n 或 /plan approve" : "无"}</Text>
      <Text>
        Patch: {activeRun?.status === "patch_pending" ? "等待 y/n 或 /patch approve" : "无"}
      </Text>
      <Text>Phase: {activeRun?.phase ?? "idle"}</Text>
      <Text>Repair: {activeRun?.repairAttempts ?? 0}/2</Text>
      <Text>Memory: {workbench.memory.total}</Text>
      <Text>Skills: {workbench.skills.length}</Text>
      <Text>MCP: {workbench.mcp.status}</Text>
      <Box marginTop={1} flexDirection="column">
        {renderDetail(activeRun, detailMode, diffFileIndex, runSessions)}
      </Box>
    </Box>
  );
}

function InputBar({
  input,
  busy,
  paletteMatches,
}: {
  input: string;
  busy: boolean;
  paletteMatches: string[];
}): ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
      {paletteMatches.length > 0 ? (
        <Text color="yellow">
          {paletteMatches
            .slice(0, 5)
            .map((command, index) => `${index === 0 ? ">" : ""}${command}`)
            .join("  ")}
        </Text>
      ) : (
        <Text color="gray">输入自然语言，或 /help /allow shell-readonly /plan approve /debug</Text>
      )}
      <Text color="magentaBright">{`> ${input || (busy ? "思考中..." : "")}`}</Text>
    </Box>
  );
}

function renderDetail(
  activeRun: TerminalAgentRunState | undefined,
  detailMode: DetailMode,
  diffFileIndex: number,
  runSessions: TuiRunSession[],
): ReactElement {
  if (detailMode === "debug") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Debug</Text>
        <Text color="gray">主界面默认隐藏 JSON/Zod/SQLite 细节。</Text>
        <Text color="gray">使用 /replay &lt;runId&gt; 查看审计轨迹。</Text>
      </Box>
    );
  }
  if (!activeRun) {
    return <CommandDetail runSessions={runSessions} />;
  }
  if (detailMode === "diff") {
    return <DiffDetail diff={activeRun.diff} fileIndex={diffFileIndex} />;
  }
  if (detailMode === "checks") {
    if (!activeRun.checks?.length) {
      return <Text color="gray">暂无 checks 输出。</Text>;
    }
    return (
      <Box flexDirection="column">
        {activeRun.checks.map((check) => (
          <Text
            key={`${check.name}-${check.createdAt}`}
            color={check.status === "passed" ? "green" : "red"}
          >
            {check.status} {truncate(check.command, 28)}
          </Text>
        ))}
      </Box>
    );
  }
  if (detailMode === "plan") {
    return <PlanDetail plan={activeRun.plan ?? []} />;
  }
  return <CommandDetail runSessions={runSessions} />;
}

function PlanDetail({ plan }: { plan: EvidenceGapStep[] }): ReactElement {
  if (plan.length === 0) {
    return <Text color="gray">暂无 plan。</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text color="yellow">当前计划</Text>
      {plan.slice(0, 4).map((step, index) => (
        <Text key={step.id}>
          {index + 1}. {truncate(step.title, 30)}
        </Text>
      ))}
    </Box>
  );
}

function DiffDetail({
  diff,
  fileIndex,
}: {
  diff: string | undefined;
  fileIndex: number;
}): ReactElement {
  if (!diff) {
    return <Text color="gray">暂无 pending diff。</Text>;
  }
  const files = splitDiffByFile(diff);
  const safeFileIndex = Math.min(fileIndex, Math.max(0, files.length - 1));
  const file = files[safeFileIndex] ?? { header: "diff", lines: diff.split("\n") };
  return (
    <Box flexDirection="column">
      <Text color="yellow">
        Diff {safeFileIndex + 1}/{files.length}
      </Text>
      <Text color="magentaBright">{truncate(file.header, 34)}</Text>
      {file.lines.slice(0, 12).map((line, index) => {
        const color = diffLineColor(line);
        return color ? (
          <Text key={`${safeFileIndex}-${index}`} color={color}>
            {truncate(line || " ", 34)}
          </Text>
        ) : (
          <Text key={`${safeFileIndex}-${index}`}>{truncate(line || " ", 34)}</Text>
        );
      })}
    </Box>
  );
}

function CommandDetail({ runSessions }: { runSessions: TuiRunSession[] }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="yellow">常用命令</Text>
      {commandPalette.slice(0, 7).map((command) => (
        <Text key={command}>{truncate(command, 34)}</Text>
      ))}
      <Text color="yellow">最近会话</Text>
      {runSessions.length === 0 ? (
        <Text color="gray">暂无 run。</Text>
      ) : (
        runSessions.slice(0, 4).map((session, index) => (
          <Text key={session.runId}>
            {index + 1}. {truncate(session.title, 28)}
          </Text>
        ))
      )}
    </Box>
  );
}

function helpText(): string {
  return [
    "可用命令：",
    "/permissions 查看权限等级",
    "/allow <level> 切换权限：read-only/workspace-write/shell-readonly/network-low/security-active",
    "/plan approve|reject 审批或拒绝计划",
    "/diff 查看 pending Patch diff",
    "/patch approve|reject 批准或拒绝 Patch",
    "/checks 查看检查结果",
    "/memory recall|compact|archive|forget 管理长期记忆",
    "/debug 显示调试摘要",
    "/sessions 查看最近 run",
    "/replay <runId> 回放 Hermes 轨迹",
    "/clear 清屏",
  ].join("\n");
}

function localEvent(
  message: string,
  type: AgentRunEvent["type"] = "assistant.message",
): AgentRunEvent {
  return {
    type,
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

async function refreshWorkbench(
  setWorkbench: (value: WorkbenchState | undefined) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    setWorkbench(await readWorkbenchState({ workspaceRoot: process.cwd() }));
  } catch (error) {
    onError(`Workbench 状态读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function eventColor(
  type: AgentRunEvent["type"],
): "green" | "yellow" | "cyan" | "magentaBright" | "red" | "gray" {
  if (type.includes("blocked") || type.includes("rejected") || type.includes("failed")) {
    return "red";
  }
  if (type.includes("approval") || type.includes("plan") || type.includes("patch")) {
    return "yellow";
  }
  if (type.includes("repair") || type.includes("memory")) {
    return "yellow";
  }
  if (type.includes("tool") || type.includes("check")) {
    return "cyan";
  }
  if (type.includes("evidence")) {
    return "green";
  }
  if (type.includes("reflection") || type.includes("assistant")) {
    return "magentaBright";
  }
  return "gray";
}

function eventIcon(type: AgentRunEvent["type"]): string {
  if (type.includes("tool")) {
    return "tool";
  }
  if (type.includes("evidence")) {
    return "evidence";
  }
  if (type.includes("plan")) {
    return "plan";
  }
  if (type.includes("patch")) {
    return "patch";
  }
  if (type.includes("check")) {
    return "check";
  }
  if (type.includes("repair")) {
    return "repair";
  }
  if (type.includes("memory")) {
    return "memory";
  }
  if (type.includes("model")) {
    return "model";
  }
  return "agent";
}

function shortTime(value: string): string {
  return value.slice(11, 19);
}

export function resolvePaletteInput(input: string, matches: string[]): string {
  const trimmed = input.trim();
  if (trimmed === "/" && matches[0]) {
    return matches[0];
  }
  return trimmed;
}

function updateRunSessions(
  setRunSessions: (value: SetStateAction<TuiRunSession[]>) => void,
  event: AgentRunEvent,
): void {
  if (event.runId === "local" || event.runId === "welcome") {
    return;
  }
  setRunSessions((previous) => {
    const existing = previous.find((session) => session.runId === event.runId);
    const updated: TuiRunSession = {
      runId: event.runId,
      title: readSessionTitle(event),
      events: [...(existing?.events ?? []), event].slice(-120),
      updatedAt: event.createdAt,
    };
    return [updated, ...previous.filter((session) => session.runId !== event.runId)].slice(0, 12);
  });
}

function readSessionTitle(event: AgentRunEvent): string {
  const userMessage = event.payload.userMessage;
  if (typeof userMessage === "string" && userMessage.length > 0) {
    return userMessage.slice(0, 30);
  }
  return event.message.slice(0, 30);
}

export function splitDiffByFile(diff: string): Array<{ header: string; lines: string[] }> {
  const lines = diff.split("\n");
  const files: Array<{ header: string; lines: string[] }> = [];
  let current: { header: string; lines: string[] } | undefined;
  for (const line of lines) {
    if (line.startsWith("--- a/")) {
      if (current) {
        files.push(current);
      }
      current = { header: line.replace("--- a/", ""), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { header: "diff", lines: [line] };
    }
  }
  if (current) {
    files.push(current);
  }
  return files.length > 0 ? files : [{ header: "diff", lines }];
}

function diffLineColor(line: string): "green" | "red" | "cyan" | "gray" | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "green";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "red";
  }
  if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) {
    return "cyan";
  }
  if (!line.trim()) {
    return "gray";
  }
  return undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}
