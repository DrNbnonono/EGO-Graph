#!/usr/bin/env node
/**
 * Hardness CI entry point. Runs every baseline hardness scenario against the
 * real agent loop with a deterministic stub model provider (no network) and
 * prints per-scenario scores plus a suite summary. Exits non-zero if any
 * scenario fails, so CI gates on hardness regression.
 *
 * Usage:
 *   node scripts/hardness-eval.mjs            # full suite
 *   node scripts/hardness-eval.mjs --smoke    # only h0/h1
 */
import { pathToFileURL } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const smoke = process.argv.includes("--smoke");

const harness = await loadHarness();
const scenarios = smoke
  ? harness
      .baselineHardnessScenarios()
      .filter((scenario) => scenario.level === "h0_smoke" || scenario.level === "h1_standard")
  : harness.baselineHardnessScenarios();

console.log(`Running ${scenarios.length} hardness scenario(s)${smoke ? " (smoke)" : ""}...`);
const started = Date.now();
const results = [];
for (const scenario of scenarios) {
  const result = await harness.runHardnessScenario(scenario);
  results.push(result);
  const status = result.score.passed ? "PASS" : "FAIL";
  console.log(
    `  [${status}] ${scenario.id} — score ${result.score.score}/${result.score.maxScore} (missing: ${result.score.missingSignals.join(", ") || "none"})`,
  );
}

const summary = harness.summarizeHardnessSuite(results);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log("");
console.log(`Hardness suite: ${summary.passed}/${summary.total} passed, average score ${summary.averageScore} (${elapsed}s).`);
if (summary.failedScenarios.length > 0) {
  console.log(`Failed scenarios: ${summary.failedScenarios.join(", ")}`);
}

// Write JSON artifact for CI upload and evidence trail.
const report = {
  timestamp: new Date().toISOString(),
  smoke,
  elapsedSeconds: Number(elapsed),
  summary,
  results: results.map((result) => ({
    scenarioId: result.scenario.id,
    level: result.scenario.level,
    domain: result.scenario.domain,
    passed: result.score.passed,
    score: result.score.score,
    maxScore: result.score.maxScore,
    missingSignals: result.score.missingSignals,
  })),
};
const artifactDir = join(root, "hardness-artifacts");
await mkdir(artifactDir, { recursive: true });
await writeFile(
  join(artifactDir, `hardness-report-${smoke ? "smoke" : "full"}.json`),
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(`Artifact written to ${join(artifactDir, `hardness-report-${smoke ? "smoke" : "full"}.json`)}`);

if (summary.failedScenarios.length > 0) {
  process.exit(1);
}

async function loadHarness() {
  const entry = pathToFileURL(`${root}/packages/agent-harness/dist/index.js`).href;
  const mod = await import(entry);
  return {
    baselineHardnessScenarios: () => mod.baselineHardnessScenarios,
    runHardnessScenario: (scenario) => mod.runHardnessScenario(scenario),
    summarizeHardnessSuite: (results) => mod.summarizeHardnessSuite(results),
  };
}
