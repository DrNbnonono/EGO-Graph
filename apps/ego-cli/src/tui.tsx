import {
  createTerminalAgentSession,
  type AgentRunEvent,
  type EvidenceGapStep,
  type PermissionLevel,
  type TerminalAgentSession,
  type TerminalAgentRunState,
} from "@ego-graph/terminal-agent";
import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { Box, Text, render, useApp, useInput } from "ink";
import { useEffect, useMemo, useState, type ReactElement, type SetStateAction } from "react";

const permissionLevels: PermissionLevel[] = [
  "read-only",
  "workspace-write",
  "shell-readonly",
  "network-low",
  "security-active",
];

type DetailMode = "timeline" | "plan" | "diff" | "checks" | "commands";

type TuiRunSession = {
  runId: string;
  title: string;
  events: AgentRunEvent[];
  updatedAt: string;
};

const commandPalette = [
  "/help",
  "/permissions",
  "/allow workspace-write",
  "/allow shell-readonly",
  "/allow security-active",
  "/plan approve",
  "/plan reject",
  "/diff",
  "/next",
  "/prev",
  "/file next",
  "/file prev",
  "/patch approve",
  "/patch reject",
  "/checks",
  "/sessions",
  "/new",
  "/replay ",
  "/clear",
];

export function EgoTui(): ReactElement {
  const { exit } = useApp();
  const session = useMemo(() => createTerminalAgentSession({ workspaceRoot: process.cwd() }), []);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<AgentRunEvent[]>([
    {
      type: "run.started",
      runId: "welcome",
      sessionId: "welcome",
      message: "欢迎使用 EGO-Graph Terminal Agent。输入自然语言任务，或输入 /help 查看命令。",
      createdAt: new Date().toISOString(),
      payload: {},
    },
  ]);
  const [workbench, setWorkbench] = useState<WorkbenchState | undefined>();
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [detailMode, setDetailMode] = useState<DetailMode>("timeline");
  const [detailPage, setDetailPage] = useState(0);
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
  }, []);

  useInput((value, key) => {
    if (key.escape || (key.ctrl && value === "c")) {
      exit();
      return;
    }

    if (busy) {
      return;
    }

    if (key.upArrow) {
      setDetailPage((previous) => Math.max(0, previous - 1));
      return;
    }
    if (key.downArrow) {
      setDetailPage((previous) => previous + 1);
      return;
    }
    if (value === "[") {
      setDiffFileIndex((previous) => Math.max(0, previous - 1));
      setDetailPage(0);
      setDetailMode("diff");
      return;
    }
    if (value === "]") {
      setDiffFileIndex((previous) => previous + 1);
      setDetailPage(0);
      setDetailMode("diff");
      return;
    }

    if (key.return) {
      const submitted = resolvePaletteInput(input, paletteMatches);
      if (!submitted) {
        return;
      }
      setInput("");
      void submitInput({
        submitted,
        session,
        activeRunId,
        setActiveRunId,
        setEvents,
        setBusy,
        setWorkbench,
        setDetailMode,
        setDetailPage,
        setDiffFileIndex,
        runSessions,
        setRunSessions,
        setPermissionLevel,
      });
      return;
    }

    if (value === "y" && activeRunId) {
      const state = session.getRunState(activeRunId);
      if (state?.status === "plan_pending") {
        void runStream(session.approvePlan(activeRunId), setEvents, setBusy, setWorkbench, {
          onEvent(event) {
            updateRunSessions(setRunSessions, event);
          },
        });
        return;
      }
      if (state?.status === "patch_pending") {
        void runStream(session.approvePatch(activeRunId), setEvents, setBusy, setWorkbench, {
          onEvent(event) {
            updateRunSessions(setRunSessions, event);
          },
        });
        return;
      }
    }
    if (value === "n" && activeRunId) {
      const state = session.getRunState(activeRunId);
      if (state?.status === "plan_pending") {
        void runStream(session.rejectPlan(activeRunId), setEvents, setBusy, setWorkbench, {
          onEvent(event) {
            updateRunSessions(setRunSessions, event);
          },
        });
        return;
      }
      if (state?.status === "patch_pending") {
        void runStream(session.rejectPatch(activeRunId), setEvents, setBusy, setWorkbench, {
          onEvent(event) {
            updateRunSessions(setRunSessions, event);
          },
        });
        return;
      }
    }
    if (value === "d") {
      setDetailMode("diff");
      return;
    }
    if (value === "c") {
      setDetailMode("checks");
      return;
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
        <Text color="gray">正在读取项目、模型、SQLite 与轨迹状态...</Text>
      </Box>
    );
  }

  const activeRun = activeRunId ? session.getRunState(activeRunId) : undefined;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} gap={1}>
      <Header workbench={workbench} permissionLevel={permissionLevel} />
      <Box flexDirection="row" gap={1}>
        <LeftSidebar workbench={workbench} permissionLevel={permissionLevel} />
        <MainConsole
          events={events}
          input={input}
          busy={busy}
          workbench={workbench}
          activeRun={activeRun}
          detailPage={detailPage}
          paletteMatches={paletteMatches}
        />
        <RightSidebar
          workbench={workbench}
          activeRun={activeRun}
          detailMode={detailMode}
          detailPage={detailPage}
          diffFileIndex={diffFileIndex}
          runSessions={runSessions}
        />
      </Box>
      <Footer />
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
  setDetailPage(value: SetStateAction<number>): void;
  setDiffFileIndex(value: SetStateAction<number>): void;
  runSessions: TuiRunSession[];
  setRunSessions(value: SetStateAction<TuiRunSession[]>): void;
  setPermissionLevel(value: PermissionLevel): void;
}): Promise<void> {
  const normalized = input.submitted.toLowerCase();

  if (normalized === "/clear") {
    input.setEvents([]);
    input.setDetailPage(0);
    return;
  }
  if (normalized === "/new") {
    input.setActiveRunId(undefined);
    input.setEvents([localEvent("新会话已创建。输入自然语言任务开始新的终端 Agent run。")]);
    input.setDetailMode("timeline");
    input.setDetailPage(0);
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
          : "暂无活动 run。完成一次任务后可在 /sessions 中查看。",
      ),
    ]);
    input.setDetailMode("commands");
    return;
  }
  if (normalized === "/help") {
    input.setEvents((previous) => [...previous, localEvent(helpText())]);
    input.setDetailMode("commands");
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
  if (normalized === "/diff") {
    input.setDetailMode("diff");
    input.setDetailPage(0);
    return;
  }
  if (normalized === "/checks") {
    input.setDetailMode("checks");
    input.setDetailPage(0);
    return;
  }
  if (normalized === "/next") {
    input.setDetailPage((previous) => previous + 1);
    return;
  }
  if (normalized === "/prev") {
    input.setDetailPage((previous) => Math.max(0, previous - 1));
    return;
  }
  if (normalized === "/file next") {
    input.setDiffFileIndex((previous) => previous + 1);
    input.setDetailPage(0);
    input.setDetailMode("diff");
    return;
  }
  if (normalized === "/file prev") {
    input.setDiffFileIndex((previous) => Math.max(0, previous - 1));
    input.setDetailPage(0);
    input.setDetailMode("diff");
    return;
  }
  if (normalized === "/plan approve" && input.activeRunId) {
    input.setDetailMode("diff");
    input.setDetailPage(0);
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
    input.setDetailPage(0);
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
  if (normalized.startsWith("/switch ")) {
    const selector = input.submitted.replace("/switch ", "").trim();
    const index = Number.parseInt(selector, 10);
    const runId =
      Number.isInteger(index) && index > 0
        ? (input.runSessions[index - 1]?.runId ?? selector)
        : selector;
    const replay = await input.session.replayRun(runId);
    input.setActiveRunId(runId);
    input.setEvents(replay.length > 0 ? replay : [localEvent(`未找到 run: ${runId}`)]);
    input.setDetailMode("timeline");
    input.setDetailPage(0);
    return;
  }
  if (normalized.startsWith("/replay ")) {
    const runId = input.submitted.replace("/replay ", "").trim();
    const replay = await input.session.replayRun(runId);
    input.setActiveRunId(runId);
    input.setEvents(replay.length > 0 ? replay : [localEvent(`未找到 run: ${runId}`)]);
    input.setDetailMode("timeline");
    input.setDetailPage(0);
    return;
  }

  input.setDetailMode("timeline");
  input.setDetailPage(0);
  await runStream(
    input.session.startTask(input.submitted),
    input.setEvents,
    input.setBusy,
    input.setWorkbench,
    {
      onEvent(event) {
        if (event.type === "run.started") {
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
      setEvents((previous) => [...previous, event].slice(-80));
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
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
}): ReactElement {
  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} justifyContent="space-between">
      <Text color="magentaBright">
        {workbench.title} {workbench.version} {workbench.cwd}
      </Text>
      <Text>
        权限: <Text color="yellow">{permissionLevel}</Text> 模型:{" "}
        <Text color="cyan">{workbench.model.label}</Text> {workbench.cpuLabel}{" "}
        {workbench.memoryLabel} {workbench.clock}
      </Text>
    </Box>
  );
}

function LeftSidebar({
  workbench,
  permissionLevel,
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
}): ReactElement {
  return (
    <Box flexDirection="column" width={30} gap={1}>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">会话 / 任务</Text>
        {workbench.sessions.map((session) => (
          <Text key={session.id} color={session.active ? "magentaBright" : "gray"}>
            {session.active ? ">" : " "} {session.title} {session.timeLabel}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">权限等级</Text>
        {permissionLevels.map((level) => (
          <Text key={level} color={level === permissionLevel ? "yellow" : "gray"}>
            {level === permissionLevel ? "●" : "○"} {level}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">基础工具</Text>
        <Text>workspace.list/read/grep</Text>
        <Text>memory.recall / evidence.write</Text>
        <Text>shell.readonly / checks</Text>
        <Text color="gray">security-active: reserved</Text>
      </Box>
    </Box>
  );
}

function MainConsole({
  events,
  input,
  busy,
  workbench,
  activeRun,
  detailPage,
  paletteMatches,
}: {
  events: AgentRunEvent[];
  input: string;
  busy: boolean;
  workbench: WorkbenchState;
  activeRun: TerminalAgentRunState | undefined;
  detailPage: number;
  paletteMatches: string[];
}): ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="magentaBright">Terminal Agent Run Stream</Text>
          <Text color="gray">
            {activeRun ? `${activeRun.runId} · ${activeRun.status}` : "idle"} · page{" "}
            {detailPage + 1}
          </Text>
        </Box>
        {events.slice(-16).map((event, index) => (
          <Box
            key={`${event.runId}-${event.type}-${event.createdAt}-${index}`}
            flexDirection="column"
          >
            <Text color={eventColor(event.type)}>
              {eventIcon(event.type)} {event.type}{" "}
              <Text color="gray">{shortTime(event.createdAt)}</Text>
            </Text>
            <Text>{event.message}</Text>
          </Box>
        ))}
        <Text color="gray">SQLite: {workbench.storage.sqlite}</Text>
      </Box>
      <Box borderStyle="round" borderColor="magentaBright" paddingX={1} flexDirection="column">
        {paletteMatches.length > 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">Command Palette</Text>
            {paletteMatches.slice(0, 6).map((command, index) => (
              <Text key={command} color={index === 0 ? "magentaBright" : "gray"}>
                {index === 0 ? ">" : " "} {command}
              </Text>
            ))}
          </Box>
        ) : null}
        <Text color="gray">
          输入自然语言任务，或 /help、/allow shell-readonly、/plan approve、/patch approve
        </Text>
        <Text color="magentaBright">
          {"> "}
          {input || (busy ? "运行中..." : "等待输入")}
        </Text>
      </Box>
    </Box>
  );
}

function RightSidebar({
  workbench,
  activeRun,
  detailMode,
  detailPage,
  diffFileIndex,
  runSessions,
}: {
  workbench: WorkbenchState;
  activeRun: TerminalAgentRunState | undefined;
  detailMode: DetailMode;
  detailPage: number;
  diffFileIndex: number;
  runSessions: TuiRunSession[];
}): ReactElement {
  return (
    <Box flexDirection="column" width={42} gap={1}>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">审批 / 执行</Text>
        <Text>
          当前面板: {detailMode} p{detailPage + 1}
        </Text>
        <Text>Plan: {activeRun?.status === "plan_pending" ? "等待审批 y/n" : "无待审批"}</Text>
        <Text>Patch: {activeRun?.status === "patch_pending" ? "等待审批 y/n" : "无待审批"}</Text>
        <Text color="gray">快捷键: y/n approve · d diff · c checks · ↑↓ page · [] file</Text>
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">详情</Text>
        {renderDetail(activeRun, detailMode, detailPage, diffFileIndex, runSessions)}
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">Agent Kernel</Text>
        <Text>Memory: {workbench.memory.total} items</Text>
        <Text>Plan: {workbench.plans.draftCount} draft</Text>
        <Text>Skills: {workbench.skills.length} loaded</Text>
        <Text>
          MCP: {workbench.mcp.status} / {workbench.mcp.transport}
        </Text>
      </Box>
    </Box>
  );
}

function renderDetail(
  activeRun: TerminalAgentRunState | undefined,
  detailMode: DetailMode,
  detailPage: number,
  diffFileIndex: number,
  runSessions: TuiRunSession[],
): ReactElement {
  if (!activeRun) {
    if (detailMode === "commands") {
      return <CommandDetail runSessions={runSessions} />;
    }
    return <Text color="gray">暂无活动 run。输入任务开始。</Text>;
  }
  if (detailMode === "diff") {
    return <DiffDetail diff={activeRun.diff} fileIndex={diffFileIndex} page={detailPage} />;
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
            {check.status} {check.command} exit={check.exitCode}
          </Text>
        ))}
      </Box>
    );
  }
  if (detailMode === "commands") {
    return <CommandDetail runSessions={runSessions} />;
  }
  return <PlanDetail plan={activeRun.plan ?? []} page={detailPage} />;
}

function PlanDetail({ plan, page }: { plan: EvidenceGapStep[]; page: number }): ReactElement {
  if (plan.length === 0) {
    return <Text color="gray">暂无 evidence-gap plan。</Text>;
  }
  const step = plan[Math.min(page, plan.length - 1)]!;
  return (
    <Box flexDirection="column">
      <Text color="yellow">
        {page + 1}/{plan.length} {step.title}
      </Text>
      <Text>已知: {step.knownEvidence.join(" | ")}</Text>
      <Text>缺口: {step.missingEvidence.join(" | ")}</Text>
      <Text>工具理由: {step.toolChoiceRationale}</Text>
      <Text>预期: {step.expectedResult}</Text>
      <Text color="gray">停止: {step.stopCondition}</Text>
      <Text color="gray">风险: {step.riskNote}</Text>
    </Box>
  );
}

function DiffDetail({
  diff,
  fileIndex,
  page,
}: {
  diff: string | undefined;
  fileIndex: number;
  page: number;
}): ReactElement {
  if (!diff) {
    return <Text color="gray">暂无 pending diff。</Text>;
  }
  const files = splitDiffByFile(diff);
  const safeFileIndex = Math.min(fileIndex, Math.max(0, files.length - 1));
  const file = files[safeFileIndex] ?? { header: "diff", lines: diff.split("\n") };
  const pageSize = 22;
  const pageCount = Math.max(1, Math.ceil(file.lines.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  return (
    <Box flexDirection="column">
      <Text color="yellow">
        File {safeFileIndex + 1}/{files.length} · page {safePage + 1}/{pageCount}
      </Text>
      <Text color="magentaBright">{file.header}</Text>
      {file.lines.slice(safePage * pageSize, safePage * pageSize + pageSize).map((line, index) => {
        const color = diffLineColor(line);
        return color ? (
          <Text key={`${safeFileIndex}-${safePage}-${index}`} color={color}>
            {line || " "}
          </Text>
        ) : (
          <Text key={`${safeFileIndex}-${safePage}-${index}`}>{line || " "}</Text>
        );
      })}
    </Box>
  );
}

function CommandDetail({ runSessions }: { runSessions: TuiRunSession[] }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="yellow">命令面板</Text>
      {commandPalette.slice(0, 12).map((command) => (
        <Text key={command}>{command}</Text>
      ))}
      <Text color="yellow">最近会话</Text>
      {runSessions.length === 0 ? (
        <Text color="gray">暂无 run session。</Text>
      ) : (
        runSessions.slice(0, 5).map((session, index) => (
          <Text key={session.runId}>
            {index + 1}. {session.runId} {session.title}
          </Text>
        ))
      )}
    </Box>
  );
}

function Footer(): ReactElement {
  return (
    <Box borderStyle="single" borderColor="magenta" paddingX={1} justifyContent="space-between">
      <Text color="magentaBright">/help</Text>
      <Text color="magenta">/permissions /allow workspace-write /allow shell-readonly</Text>
      <Text color="magenta">/plan approve /diff /patch approve /checks /replay &lt;runId&gt;</Text>
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
    "/next /prev 翻页",
    "/file next|prev 切换 diff 文件",
    "/new 新会话",
    "/sessions 查看最近 run",
    "/switch <runId> 切换/回放 run",
    "/replay <runId> 回放 Hermes 轨迹",
    "/clear 清屏",
  ].join("\n");
}

function localEvent(message: string): AgentRunEvent {
  return {
    type: "reflection.created",
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
  if (type.includes("blocked") || type.includes("rejected")) {
    return "red";
  }
  if (type.includes("approval") || type.includes("plan") || type.includes("patch")) {
    return "yellow";
  }
  if (type.includes("tool") || type.includes("check")) {
    return "cyan";
  }
  if (type.includes("evidence")) {
    return "green";
  }
  if (type.includes("reflection")) {
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
  return "agent";
}

function shortTime(value: string): string {
  return value.slice(11, 19);
}

function resolvePaletteInput(input: string, matches: string[]): string {
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

function splitDiffByFile(diff: string): Array<{ header: string; lines: string[] }> {
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
