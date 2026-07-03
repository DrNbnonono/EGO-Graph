import {readFile} from "node:fs/promises";
import {runMission, type TaskSpecInput} from "@ego-graph/core";
import {loadOverlay} from "@ego-graph/overlays";
import {renderMarkdownReport} from "@ego-graph/report";
import {isScenarioName, type ScenarioName} from "@ego-graph/shared";
import {JsonlTrajectoryStore, trajectoryDir} from "@ego-graph/storage";

export type RunCommandOptions = {
  scenario: string;
  task?: string;
  input?: string;
  runId?: string;
};

export async function handleRunCommand(options: RunCommandOptions): Promise<void> {
  if (!isScenarioName(options.scenario)) {
    throw new Error(`Unknown scenario: ${options.scenario}`);
  }

  const scenario: ScenarioName = options.scenario;
  const overlay = loadOverlay(scenario);
  const task = await loadTask(options, scenario, overlay.defaultTarget);
  const runId = options.runId ?? `run-${Date.now()}`;
  const store = new JsonlTrajectoryStore(trajectoryDir());

  const result = await runMission({
    workspaceRoot: process.cwd(),
    task,
    overlay,
    trajectoryStore: store,
    runId,
  });

  const report = renderMarkdownReport({
    runId: result.runId,
    scenario: task.scenario,
    goal: task.goal,
    status: result.status,
    evidence: result.evidence,
  });

  console.log(`EGO-Graph run ${result.runId} ${result.status}`);
  console.log(report);
}

async function loadTask(
  options: RunCommandOptions,
  scenario: ScenarioName,
  defaultTarget: string,
): Promise<TaskSpecInput> {
  if (options.input) {
    return JSON.parse(await readFile(options.input, "utf8")) as TaskSpecInput;
  }

  return {
    scenario,
    goal: options.task ?? "Assess the controlled fixture for exposed admin hints",
    targets: [defaultTarget],
    constraints: ["authorized-fixture-only"],
  };
}
