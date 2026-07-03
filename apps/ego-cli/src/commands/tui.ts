import { renderTui } from "../tui.js";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    // 中文注释：CI 下输出静态文本，确保测试和日志系统无需交互也能读取入口信息。
    console.log("紫莲花 EGO-Graph");
    console.log("项目进展：CLI / TUI / Web 可视化 / MiniMax M3 / Replay 已接入");
    console.log("交互对话：直接运行 ego 进入终端驾驶舱");
    console.log("Web 可视化：运行 ego serve 后打开 http://127.0.0.1:4317");
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  renderTui();
}
