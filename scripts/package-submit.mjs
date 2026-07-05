#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("reports", { recursive: true });
await writeFile(
  "reports/submission-manifest.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      include: ["README.md", "docs/", "apps/", "packages/", "datasets/evals/productization/"],
      exclude: [".ego/", ".zread/", "dist/", "node_modules/", "reports/eval-results.json"],
    },
    null,
    2,
  ),
  "utf8",
);
console.log("wrote reports/submission-manifest.json");
