import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createModelBackedPlanner,
  createTrajectoryEvent,
  runMission,
  type AgentPlanner,
  type TaskSpecInput,
} from "@ego-graph/core";
import { createChatModelProvider, loadModelConfig } from "@ego-graph/llm";
import { loadOverlay } from "@ego-graph/overlays";
import {
  extractReportDecisions,
  extractReportObservations,
  extractReportPolicyDecisions,
  renderMarkdownReport,
} from "@ego-graph/report";
import { isScenarioName, type ScenarioName } from "@ego-graph/shared";
import {
  CompositeTrajectoryStore,
  defaultEgoHome,
  JsonlTrajectoryStore,
  reportDir,
  sqlitePath,
  SqliteEgoStore,
  trajectoryDir,
} from "@ego-graph/storage";

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
  const egoHome = defaultEgoHome();
  const sqliteStore = new SqliteEgoStore(sqlitePath(egoHome));
  const store = new CompositeTrajectoryStore([
    new JsonlTrajectoryStore(trajectoryDir(egoHome)),
    sqliteStore,
  ]);
  const planner = loadPlannerFromEnv();

  const result = await runMission({
    workspaceRoot: process.cwd(),
    task,
    overlay,
    trajectoryStore: store,
    runId,
    ...(planner ? { planner } : {}),
  });

  const report = renderMarkdownReport({
    runId: result.runId,
    scenario: task.scenario,
    goal: task.goal,
    status: result.status,
    scope: task.targets,
    evidence: result.evidence,
    decisions: extractReportDecisions(result.events),
    observations: extractReportObservations(result.events),
    policyDecisions: extractReportPolicyDecisions(result.events),
  });
  const reports = reportDir(egoHome);
  await mkdir(reports, { recursive: true });
  const reportPath = join(reports, `${result.runId}.md`);
  await writeFile(reportPath, report, "utf8");
  await store.append(
    createTrajectoryEvent(result.runId, "report.created", "Report written", { reportPath }),
  );
  await sqliteStore.saveReport({
    runId: result.runId,
    markdown: report,
    reportPath,
    createdAt: new Date().toISOString(),
  });
  await sqliteStore.upsertRun({
    runId: result.runId,
    scenario: task.scenario,
    status: result.status,
    eventCount: result.events.length + 1,
    reportPath,
    updatedAt: new Date().toISOString(),
  });

  console.log(`EGO-Graph run ${result.runId} ${result.status}`);
  console.log(`Report ${reportPath}`);
  console.log(report);
}

function loadPlannerFromEnv(): AgentPlanner | undefined {
  const provider = createChatModelProvider(loadModelConfig());
  return provider ? createModelBackedPlanner(provider) : undefined;
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
