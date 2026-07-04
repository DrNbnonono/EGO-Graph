import { isModelConfigured, loadModelConfig } from "@ego-graph/llm";
import { defaultEgoHome, sqlitePath } from "@ego-graph/storage";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    const model = loadModelConfig({ workspaceRoot: process.cwd() });
    const modelLabel = isModelConfigured(model)
      ? (model.model ?? model.provider)
      : "deterministic fallback";
    console.log("紫莲花 Agent Workbench v0.1.0");
    console.log("项目进展：TypeScript monorepo / Agent Runtime / JSONL + SQLite / Web + TUI");
    console.log(`交互对话：直接运行 ego 进入终端驾驶舱，模型 ${modelLabel}`);
    console.log("Agent Kernel：Memory / Plan / Skills / MCP stdio-v1 / web.search");
    console.log("Web Workbench：运行 ego serve 后打开 http://127.0.0.1:4317");
    console.log("Patch 审批：TUI 仅显示状态，打开 ego serve 查看 Plan、diff 并 Approve");
    console.log(`SQLite：${sqlitePath(defaultEgoHome())}`);
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  const { renderTui } = await import("../tui.js");
  renderTui();
}
