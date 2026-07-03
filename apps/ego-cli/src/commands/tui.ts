import {renderTui} from "../tui.js";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    console.log("紫莲花 EGO-Graph");
    console.log("Evidence-Guided Orchestration Graph");
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  renderTui();
}
