import { Box, Text, render, useApp, useInput } from "ink";
import { useState, type ReactElement } from "react";

type DialogMessage = {
  speaker: "EGO" | "你";
  text: string;
};

const initialMessages: DialogMessage[] = [
  {
    speaker: "EGO",
    text: "这里是 EGO-Graph 终端驾驶舱。输入 run、serve、doctor 或任意任务目标，我会给出下一步操作。",
  },
];

export function EgoTui(): ReactElement {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DialogMessage[]>(initialMessages);

  // 中文注释：Ink 当前不引入额外输入组件，直接用 useInput 维护一个轻量对话框。
  useInput((value, key) => {
    if (key.escape || (key.ctrl && value === "c")) {
      exit();
      return;
    }

    if (key.return) {
      const submitted = input.trim();
      if (!submitted) {
        return;
      }
      setMessages((previous) => [
        ...previous,
        { speaker: "你", text: submitted },
        { speaker: "EGO", text: replyForInput(submitted) },
      ]);
      setInput("");
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

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magentaBright">紫莲花 EGO-Graph</Text>
        <Text>Evidence-Guided Orchestration Graph</Text>
        <Text color="green">
          项目进展：MVP Agent Runtime 已具备 CLI / TUI / Web / MiniMax M3 / Replay
        </Text>
      </Box>

      <Box flexDirection="row" gap={1}>
        <Box
          borderStyle="single"
          borderColor="cyan"
          paddingX={1}
          flexDirection="column"
          width="50%"
        >
          <Text color="cyan">交互对话</Text>
          {messages.slice(-5).map((message, index) => (
            <Text key={`${message.speaker}-${index}`}>
              {message.speaker}: {message.text}
            </Text>
          ))}
          <Text color="yellow">{`> ${input || "输入任务目标或命令"}`}</Text>
        </Box>

        <Box
          borderStyle="single"
          borderColor="green"
          paddingX={1}
          flexDirection="column"
          width="50%"
        >
          <Text color="green">Web 可视化</Text>
          <Text>ego serve</Text>
          <Text>http://127.0.0.1:4317</Text>
          <Text color="green">常用任务</Text>
          <Text>ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json</Text>
          <Text>{"ego replay --trajectory-id <run-id>"}</Text>
          <Text>ego doctor</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function renderTui(): void {
  render(<EgoTui />);
}

function replyForInput(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized === "serve" || normalized.includes("web")) {
    return "启动 Web 可视化：运行 ego serve，然后打开 http://127.0.0.1:4317。";
  }
  if (normalized === "run" || normalized.includes("web_pentest")) {
    return "运行受控示例：ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json。";
  }
  if (normalized === "doctor") {
    return "检查环境：ego doctor 会展示 Node、EGO_HOME、SQLite 和模型配置状态。";
  }
  return `已收到任务目标：${input}。当前建议先在 Web 驾驶舱中发送任务，或使用 ego run 执行受控场景。`;
}
