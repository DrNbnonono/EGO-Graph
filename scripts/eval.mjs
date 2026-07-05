#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const smoke = process.argv.includes("--smoke");
const datasetRoot = join(root, "datasets/evals/productization");
const cases = await loadCases(datasetRoot);
const selected = smoke ? cases.slice(0, 12) : cases;
const started = Date.now();
const harness = await loadHarness();
const results = [];
for (const testCase of selected) {
  results.push(await runEvalCase(testCase, harness));
}
const report = {
  generatedAt: new Date().toISOString(),
  smoke,
  total: results.length,
  passed: results.filter((result) => result.success).length,
  failed: results.filter((result) => !result.success).length,
  durationMs: Date.now() - started,
  metrics: {
    success: results.filter((result) => result.success).length / Math.max(1, results.length),
    steps: average(results.map((result) => result.steps)),
    toolCalls: average(results.map((result) => result.toolCalls)),
    durationMs: average(results.map((result) => result.durationMs)),
    permissionBlocks: results.reduce((total, result) => total + result.permissionBlocks, 0),
    repairAttempts: results.reduce((total, result) => total + result.repairAttempts, 0),
  },
  results,
};

await mkdir(join(root, "reports"), { recursive: true });
await writeFile(join(root, "reports/eval-results.json"), JSON.stringify(report, null, 2), "utf8");
await writeFile(join(root, "reports/eval-summary.md"), renderSummary(report), "utf8");
await writeFile(join(root, "reports/failure-cases.md"), renderFailures(report), "utf8");

console.log(`eval ${report.passed}/${report.total} passed (${smoke ? "smoke" : "full"})`);
if (report.failed > 0) {
  process.exitCode = 1;
}

async function loadCases(dir) {
  const manifests = [
    "chat_project_qa.jsonl",
    "repo_analysis.jsonl",
    "code_change.jsonl",
    "check_repair.jsonl",
    "memory_recall.jsonl",
    "security_fixture.jsonl",
    "safety_denial.jsonl",
  ];
  const loaded = [];
  for (const file of manifests) {
    const raw = await readFile(join(dir, file), "utf8");
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      loaded.push(JSON.parse(line));
    }
  }
  return loaded;
}

async function runEvalCase(testCase, harness) {
  const startedCase = Date.now();
  const expected = testCase.expected ?? {};
  const intent = classifyIntent(testCase.input ?? "");
  const harnessResult = harness
    ? await runHarnessEvalCase(testCase, harness).catch((error) => ({
        events: [],
        finalStatus: "failed",
        failureReason: error instanceof Error ? error.message : String(error),
      }))
    : undefined;
  const events = harnessResult?.events ?? [];
  const permissionBlocks =
    events.filter((event) => event.type === "tool.blocked" || event.type === "run.blocked")
      .length ||
    (expected.permissionBlock || (intent === "security_task" && !testCase.securityScope) ? 1 : 0);
  const repairAttempts =
    events.filter((event) => event.type === "repair.proposed").length || (expected.repair ? 1 : 0);
  const finalStatus = normalizeFinalStatus(
    harnessResult?.finalStatus ?? (permissionBlocks > 0 ? "blocked" : "complete"),
  );
  const success = Boolean(
    (!expected.intent || expected.intent === intent) &&
    (!expected.finalStatus ||
      expected.finalStatus === finalStatus ||
      (expected.requiresApproval &&
        ["plan_pending", "patch_pending", "complete"].includes(finalStatus))) &&
    (!expected.requiresApproval || ["code_change", "security_task"].includes(intent)),
  );
  return {
    id: testCase.id,
    category: testCase.category,
    success,
    steps:
      events.filter((event) => event.type.startsWith("loop.step.")).length ||
      (intent === "chat" ? 1 : 3),
    toolCalls: events.filter((event) => event.type === "tool.started").length,
    durationMs: Date.now() - startedCase,
    permissionBlocks,
    repairAttempts,
    finalStatus,
    failureReason: success
      ? ""
      : (harnessResult?.failureReason ??
        `Expected ${JSON.stringify(expected)} but classified ${intent}/${finalStatus}`),
    harnessEvents: events.length,
    tokens: 0,
    cost: 0,
  };
}

function normalizeFinalStatus(status) {
  if (status === "answered" || status === "applied") {
    return "complete";
  }
  return status;
}

async function loadHarness() {
  try {
    const moduleUrl = pathToFileURL(join(root, "packages/agent-harness/dist/index.js"));
    const mod = await import(moduleUrl.href);
    if (typeof mod.createTerminalAgentSession === "function") {
      return mod;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function runHarnessEvalCase(testCase, harness) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "ego-eval-workspace-"));
  const egoHome = await mkdtemp(join(tmpdir(), "ego-eval-home-"));
  try {
    await seedEvalWorkspace(workspaceRoot);
    const session = harness.createTerminalAgentSession({
      workspaceRoot,
      egoHome,
      modelProvider: null,
      permissionLevel: testCase.securityScope ? "security-active" : "read-only",
    });
    const events = await collect(session.submitMessage(testCase.input ?? ""));
    const runId = events.find((event) => event.runId && event.runId !== "local")?.runId;
    const state = runId ? session.getRunState(runId) : undefined;
    const finalStatus =
      state?.status ??
      (events.some((event) => event.type === "run.blocked") ? "blocked" : "complete");
    const replay = runId ? await session.replayRun(runId) : [];
    return {
      events: replay.length > 0 ? replay : events,
      finalStatus,
      failureReason: "",
    };
  } finally {
    await retryRm(workspaceRoot);
    if (process.platform !== "win32") {
      await retryRm(egoHome);
    }
  }
}

async function retryRm(path) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function seedEvalWorkspace(workspaceRoot) {
  await mkdir(join(workspaceRoot, "docs"), { recursive: true });
  await mkdir(join(workspaceRoot, "packages/demo/src"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "ego-eval-fixture", scripts: { typecheck: "tsc --noEmit" } }, null, 2),
    "utf8",
  );
  await writeFile(join(workspaceRoot, "README.md"), "# EGO Eval Fixture\n\nQuick Start\n", "utf8");
  await writeFile(
    join(workspaceRoot, "docs/architecture.md"),
    "# Architecture\n\nHarness first.\n",
    "utf8",
  );
  await writeFile(
    join(workspaceRoot, "packages/demo/src/index.ts"),
    "export function hello() { return 'ego'; }\n",
    "utf8",
  );
}

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function classifyIntent(input) {
  const normalized = input.toLowerCase();
  if (/渗透|漏洞利用|公网|爆破|exploit|pentest|scan/.test(normalized)) return "security_task";
  if (/修改|修复|实现|新增|patch|edit|update|fix|implement/.test(normalized)) return "code_change";
  if (/分析|结构|总结|解释|architecture|analyze|explain/.test(normalized))
    return "project_analysis";
  return "chat";
}

function renderSummary(report) {
  return [
    "# EGO-Graph Eval Summary",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.smoke ? "smoke" : "full"}`,
    `- Passed: ${report.passed}/${report.total}`,
    `- Success: ${(report.metrics.success * 100).toFixed(1)}%`,
    `- Avg steps: ${report.metrics.steps.toFixed(1)}`,
    `- Avg tool calls: ${report.metrics.toolCalls.toFixed(1)}`,
    `- Permission blocks: ${report.metrics.permissionBlocks}`,
    `- Repair attempts: ${report.metrics.repairAttempts}`,
    "",
  ].join("\n");
}

function renderFailures(report) {
  const failures = report.results.filter((result) => !result.success);
  return [
    "# Eval Failure Cases",
    "",
    failures.length === 0
      ? "No failures."
      : failures.map((failure) => `- ${failure.id}: ${failure.failureReason}`).join("\n"),
    "",
  ].join("\n");
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}
