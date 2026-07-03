import { runCodingAgentTurn } from "@ego-graph/agent";
import { readWorkbenchState, type WorkbenchState } from "@ego-graph/workbench";
import { Box, Text, render, useApp, useInput } from "ink";
import { useEffect, useState, type ReactElement } from "react";

type DialogMessage = {
  speaker: "lotus" | "user" | "system";
  text: string;
};

const initialMessages: DialogMessage[] = [
  {
    speaker: "lotus",
    text: "欢迎使用紫莲花 Agent Workbench。输入 /help 查看命令，或直接描述安全分析任务。",
  },
];

export function EgoTui(): ReactElement {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DialogMessage[]>(initialMessages);
  const [workbench, setWorkbench] = useState<WorkbenchState | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readWorkbenchState({ workspaceRoot: process.cwd() })
      .then(setWorkbench)
      .catch((error: unknown) => {
        setMessages((previous) => [
          ...previous,
          {
            speaker: "system",
            text: `Workbench 状态读取失败：${error instanceof Error ? error.message : String(error)}`,
          },
        ]);
      });
  }, []);

  useInput((value, key) => {
    if (busy) {
      return;
    }

    if (key.escape || (key.ctrl && value === "c")) {
      exit();
      return;
    }

    if (key.return) {
      const submitted = input.trim();
      if (!submitted) {
        return;
      }
      setInput("");
      void submitInput(submitted);
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

  async function submitInput(submitted: string): Promise<void> {
    setMessages((previous) => [...previous, { speaker: "user", text: submitted }]);

    if (submitted === "/clear") {
      setMessages(initialMessages);
      return;
    }

    const commandReply = replyForCommand(submitted, workbench);
    if (commandReply) {
      setMessages((previous) => [...previous, { speaker: "lotus", text: commandReply }]);
      return;
    }

    setBusy(true);
    try {
      const turn = await runCodingAgentTurn({ message: submitted, workspaceRoot: process.cwd() });
      setMessages((previous) => [
        ...previous,
        {
          speaker: "lotus",
          text: [
            turn.assistantMessage,
            "",
            "计划:",
            ...turn.plan.map((item) => `- ${item}`),
            "",
            "建议命令:",
            ...turn.suggestedCommands.map((command) => `- ${command}`),
          ].join("\n"),
        },
      ]);
      setWorkbench(await readWorkbenchState({ workspaceRoot: process.cwd() }));
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          speaker: "system",
          text: `任务处理失败：${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!workbench) {
    return (
      <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">紫莲花 Agent Workbench</Text>
        <Text color="gray">正在读取项目、模型、SQLite 与轨迹状态...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} gap={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={1} justifyContent="space-between">
        <Text color="magentaBright">
          {workbench.title} {workbench.version}  {workbench.cwd}
        </Text>
        <Text>
          模式: <Text color="magentaBright">{workbench.mode}</Text>  网络:{" "}
          <Text color={workbench.network === "connected" ? "green" : "yellow"}>
            {workbench.network === "connected" ? "连接" : "本地"}
          </Text>{" "}
          模型: <Text color="cyan">{workbench.model.label}</Text>  {workbench.cpuLabel}  {" "}
          {workbench.memoryLabel}  {workbench.clock}
        </Text>
      </Box>

      <Box flexDirection="row" gap={1}>
        <LeftSidebar workbench={workbench} />
        <MainConsole messages={messages} input={input} busy={busy} workbench={workbench} />
        <RightSidebar workbench={workbench} />
      </Box>

      <Box borderStyle="single" borderColor="magenta" paddingX={1} justifyContent="space-between">
        <Text color="magentaBright">/</Text>
        <Box gap={1}>
          {workbench.quickCommands.map((command) => (
            <Text key={command} color="magenta">
              {command}
            </Text>
          ))}
        </Box>
        <Text color="gray">提示: 输入 /help 查看所有命令</Text>
      </Box>
    </Box>
  );
}

export function renderTui(): void {
  render(<EgoTui />);
}

function replyForInput(input: string): string {
  return replyForCommand(input) ?? `已收到任务目标：${input}`;
}

function LeftSidebar({ workbench }: { workbench: WorkbenchState }): ReactElement {
  return (
    <Box flexDirection="column" width={28} gap={1}>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">会话 / 任务</Text>
        {workbench.sessions.map((session) => (
          <Text key={session.id} color={session.active ? "magentaBright" : "gray"}>
            {session.active ? ">" : " "} {session.title} {session.timeLabel}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">工具集</Text>
        {workbench.tools.map((tool) => (
          <Text key={tool.name}>
            <Text color={tool.status === "ready" ? "green" : tool.status === "planned" ? "yellow" : "gray"}>
              ●
            </Text>{" "}
            {tool.name} <Text color="gray">{tool.command}</Text>
          </Text>
        ))}
        <Text color="magenta">+ 管理工具</Text>
      </Box>
    </Box>
  );
}

function MainConsole({
  messages,
  input,
  busy,
  workbench,
}: {
  messages: DialogMessage[];
  input: string;
  busy: boolean;
  workbench: WorkbenchState;
}): ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Box flexDirection="column" alignItems="center">
        <Text color="magentaBright">          /\          </Text>
        <Text color="magentaBright">     /\  /  \  /\     </Text>
        <Text color="magentaBright">    /  \/ 紫 \/  \    </Text>
        <Text color="magentaBright">    \  /\ 莲 /\  /    </Text>
        <Text color="magentaBright">     \/  \__/  \/     </Text>
        <Text color="magentaBright">挑战杯Agent开发</Text>
        <Text color="gray">= 智能网络安全AI代理 · 发现 · 分析 · 响应 · 加固 =</Text>
      </Box>
      <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">对话控制台</Text>
        {messages.slice(-6).map((message, index) => (
          <Box key={`${message.speaker}-${index}`} flexDirection="column">
            <Text color={speakerColor(message.speaker)}>{speakerLabel(message.speaker)}:</Text>
            <Text>{message.text}</Text>
          </Box>
        ))}
        <Text color="gray">SQLite: {workbench.storage.sqlite}</Text>
      </Box>
      <Box borderStyle="round" borderColor="magentaBright" paddingX={1} flexDirection="column">
        <Text color="gray">在此输入安全分析需求或命令...</Text>
        <Text color="magentaBright">
          {"> "}
          {input || (busy ? "分析中..." : "输入 /help、/scan 或自然语言任务")}
        </Text>
      </Box>
    </Box>
  );
}

function RightSidebar({ workbench }: { workbench: WorkbenchState }): ReactElement {
  return (
    <Box flexDirection="column" width={34} gap={1}>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">上下文</Text>
        <Text>目标: {workbench.context.target}</Text>
        <Text>类型: {workbench.context.type}</Text>
        <Text>范围: {workbench.context.scope}</Text>
        <Text>优先级: {workbench.context.priority}</Text>
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">文件</Text>
        {workbench.files.slice(0, 4).map((file) => (
          <Text key={file.path}>
            {file.label} <Text color="gray">{file.sizeLabel}</Text>
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">日志</Text>
        {workbench.logs.slice(0, 4).map((log) => (
          <Text key={`${log.time}-${log.message}`} color="gray">
            [{log.time}] {log.message}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">审批 / 执行</Text>
        {workbench.approvals.map((item) => (
          <Text key={item.label}>
            {item.label} <Text color="magentaBright">{item.count}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function replyForCommand(input: string, workbench?: WorkbenchState): string | undefined {
  const normalized = input.toLowerCase();
  if (normalized === "/help") {
    return [
      "可用命令：",
      "/scan 生成受控 web_pentest 扫描命令",
      "/analyze 查看项目分析建议",
      "/report 查看报告与 replay 入口",
      "/threat 查看威胁情报接入状态",
      "/config 查看模型与存储配置",
      "/clear 清屏",
    ].join("\n");
  }
  if (normalized === "/scan" || normalized === "run") {
    return "运行受控示例：ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json";
  }
  if (normalized === "/analyze") {
    return "建议先运行 pnpm typecheck、pnpm build，再用 ego doctor 检查模型、SQLite、轨迹目录和工具可用性。";
  }
  if (normalized === "/report") {
    return "报告入口：ego replay --trajectory-id <run-id>，或启动 ego serve 后访问 /runs/:id/report。";
  }
  if (normalized === "/threat") {
    return "威胁情报工具目前以受控接口展示状态；真实外部查询需经过 Policy Gate 与 scope 检查。";
  }
  if (normalized === "/config" || normalized === "doctor") {
    return [
      `模型: ${workbench?.model.label ?? "deterministic fallback"}`,
      `SQLite: ${workbench?.storage.sqlite ?? ".ego/ego.sqlite"}`,
      "完整检查: ego doctor",
    ].join("\n");
  }
  if (normalized === "serve" || normalized.includes("web")) {
    return "启动 Web Workbench：运行 ego serve，然后打开 http://127.0.0.1:4317。";
  }
  return undefined;
}

function speakerLabel(speaker: DialogMessage["speaker"]): string {
  return speaker === "user" ? "user" : speaker === "system" ? "system" : "lotus";
}

function speakerColor(speaker: DialogMessage["speaker"]): "cyan" | "magentaBright" | "yellow" {
  if (speaker === "user") {
    return "cyan";
  }
  if (speaker === "system") {
    return "yellow";
  }
  return "magentaBright";
}
