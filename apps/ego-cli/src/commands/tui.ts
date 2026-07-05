import { isModelConfigured, loadModelConfig } from "@ego-graph/llm";
import { defaultEgoHome, sqlitePath } from "@ego-graph/storage";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    const model = loadModelConfig({ workspaceRoot: process.cwd() });
    const modelLabel = isModelConfigured(model)
      ? (model.model ?? model.provider)
      : "deterministic fallback";
    console.log("EGO-Graph 紫莲花 Agent Workbench v0.1.0");
    console.log("项目进展：TypeScript monorepo / Agent Runtime / JSONL + SQLite / Web + TUI");
    console.log(`交互对话：运行 ego 进入终端对话式 Agent，当前模型 ${modelLabel}`);
    console.log("Agent Kernel：Terminal chat / Memory / Plan / Patch / Checks");
    console.log(
      "权限等级：默认 read-only，可用 /allow workspace-write 或 /allow shell-readonly 升级",
    );
    console.log("Web Workbench：运行 ego serve 后打开 http://127.0.0.1:4317");
    console.log("终端审批：TUI 内可完成 Plan 审批、Diff 查看、Patch 批准/拒绝、应用和检查");
    console.log(`SQLite：${sqlitePath(defaultEgoHome())}`);
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  const { renderTui } = await import("../tui.js");
  renderTui();
}
