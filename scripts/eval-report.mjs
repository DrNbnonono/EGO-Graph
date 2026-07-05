#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const path = process.argv[2] ?? "reports/eval-results.json";
const report = JSON.parse(await readFile(path, "utf8"));
console.log(`EGO-Graph eval: ${report.passed}/${report.total} passed`);
console.log(
  `success=${(report.metrics.success * 100).toFixed(1)}% avgSteps=${report.metrics.steps.toFixed(1)} avgTools=${report.metrics.toolCalls.toFixed(1)}`,
);
