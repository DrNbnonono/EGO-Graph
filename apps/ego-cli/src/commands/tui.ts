import { isModelConfigured, loadModelConfig } from "@ego-graph/llm";
import { defaultEgoHome, sqlitePath } from "@ego-graph/storage";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    const model = loadModelConfig();
    const modelLabel = isModelConfigured(model) ? (model.model ?? model.provider) : "deterministic fallback";
    console.log("紫莲花 Agent Workbench v0.1.0");
    console.log("项目进展：TypeScript monorepo / Agent Runtime / JSONL + SQLite / Web + TUI");
    console.log(`交互对话：直接运行 ego 进入终端驾驶舱，模型 ${modelLabel}`);
    console.log("Web 可视化：运行 ego serve 后打开 http://127.0.0.1:4317");
    console.log(`SQLite：${sqlitePath(defaultEgoHome())}`);
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  const { renderTui } = await import("../tui.js");
  renderTui();
}
