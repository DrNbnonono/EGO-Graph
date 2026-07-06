import { isModelConfigured, loadModelConfig } from "@ego-graph/llm";
import { defaultEgoHome, sqlitePath } from "@ego-graph/storage";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    const model = loadModelConfig({ workspaceRoot: process.cwd() });
    const modelLabel = isModelConfigured(model)
      ? (model.model ?? model.provider)
      : "deterministic fallback";
    console.log("EGO-Graph Purple Lotus Agent Workbench v0.1.0");
    console.log("Project: TypeScript monorepo / Agent Runtime / JSONL + SQLite / Web + TUI");
    console.log(`Interactive TUI: run ego to enter terminal agent mode, model: ${modelLabel}`);
    console.log("Agent Kernel: Terminal chat / Memory / Plan / Patch / Checks");
    console.log(
      "Permissions: default read-only; use /allow workspace-write or /allow shell-readonly",
    );
    console.log("Web Workbench: run ego serve and open http://127.0.0.1:4317");
    console.log(
      "Terminal approvals: review Plan, inspect Diff, approve/reject Patch, apply and check",
    );
    console.log(`SQLite: ${sqlitePath(defaultEgoHome())}`);
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  const { renderTui } = await import("../tui.js");
  await renderTui();
}
