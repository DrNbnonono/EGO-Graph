#!/usr/bin/env node
/**
 * EGO-Graph One-Click Demo
 *
 * Runs a complete agent workflow against a fixture workspace, generates a
 * defense report, and prints the location. Designed for contest judges to
 * verify the agent's autonomous execution capability with zero configuration.
 *
 * Usage:
 *   node scripts/demo.mjs              # full demo (code change + repair)
 *   node scripts/demo.mjs --security   # security audit demo
 *   node scripts/demo.mjs --report     # generate defense report only
 *
 * Prerequisites: pnpm build (or the script will build automatically).
 */
import { pathToFileURL } from "node:url";
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

const root = process.cwd();
const mode = process.argv.includes("--security") ? "security" : "code_change";
const reportOnly = process.argv.includes("--report");

console.log("EGO-Graph Demo — mode:", mode);

// Step 1: Ensure build exists
const distPath = join(root, "packages/agent-harness/dist/index.js");
try {
  await access(distPath);
} catch {
  console.log("Building project (first run)...");
  await execa(
    "corepack",
    ["pnpm", "-r", "--sort", "--workspace-concurrency=1", "build"],
    { stdio: "inherit", env: { ...process.env, CI: "true" } },
  );
}

// Step 2: Create fixture workspace
const workspace = await mkdtemp(join(tmpdir(), "ego-demo-workspace-"));
const egoHome = await mkdtemp(join(tmpdir(), "ego-demo-home-"));

if (mode === "code_change") {
  await writeFile(join(workspace, "package.json"), '{"name":"demo-app","version":"1.0.0"}', "utf8");
  await writeFile(join(workspace, "README.md"), "hello world\n", "utf8");
} else {
  await writeFile(join(workspace, "package.json"), JSON.stringify({
    name: "demo-security-app",
    dependencies: { lodash: "4.17.20", express: "4.17.0" },
  }, null, 2), "utf8");
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(
    join(workspace, "src/server.js"),
    "app.get('/search', (req, res) => res.send(req.query.q)); // XSS\n",
    "utf8",
  );
}

console.log("Fixture workspace:", workspace);

// Step 3: Run agent
const harness = await loadHarness();
const events = mode === "security"
  ? await harness.runSecurityDemo(workspace, egoHome)
  : await harness.runCodeChangeDemo(workspace, egoHome);

console.log(`Agent run completed: ${events.length} events`);
const runId = events[0]?.runId ?? "demo";
const completed = events.find((e) => e.type === "run.completed");
const blocked = events.find((e) => e.type === "run.blocked");
console.log(`Status: ${completed ? "completed" : blocked ? "blocked" : "unknown"}`);

// Step 4: Generate defense report
const report = await harness.generateReport(events);
const reportDir = join(root, "reports");
await mkdir(reportDir, { recursive: true });
const reportPath = join(reportDir, `demo-${mode}-${runId}.md`);
await writeFile(reportPath, report, "utf8");
console.log(`Defense report: ${reportPath}`);

// Step 5: Save event transcript
const transcriptPath = join(reportDir, `demo-${mode}-${runId}.jsonl`);
await writeFile(
  transcriptPath,
  events.map((e) => JSON.stringify(e)).join("\n"),
  "utf8",
);
console.log(`Event transcript: ${transcriptPath}`);

// Step 6: Summary
console.log("\n=== Demo Summary ===");
console.log(`Mode: ${mode}`);
console.log(`Events: ${events.length}`);
console.log(`Run ID: ${runId}`);
console.log(`Report: ${reportPath}`);
console.log(`Transcript: ${transcriptPath}`);
if (!reportOnly) {
  console.log("\nTo view the web dashboard: ego serve");
  console.log("To replay: ego replay " + runId);
}

// Cleanup
await rm(workspace, { recursive: true, force: true });

async function loadHarness() {
  const entry = pathToFileURL(join(root, "packages/agent-harness/dist/index.js")).href;
  const mod = await import(entry);
  const reportMod = await import(pathToFileURL(join(root, "packages/report/dist/index.js")).href);

  return {
    async runCodeChangeDemo(workspaceRoot, home) {
      const { createTerminalAgentSession } = mod;
      const session = createTerminalAgentSession({
        workspaceRoot,
        egoHome: home,
        permissionLevel: "shell-readonly",
        modelProvider: {
          name: "demo",
          model: "demo-stub",
          async complete() {
            return JSON.stringify({
              rationale: "Demo: update README.",
              editPlan: {
                goal: "update readme",
                operations: [
                  { type: "replace_text", path: "README.md", oldText: "hello world", newText: "hello lotus" },
                ],
              },
            });
          },
        },
        checkCommands: [{ name: "node-version", command: process.execPath, args: ["--version"] }],
      });

      const events = [];
      for await (const event of session.startTask("把 README 里的 hello world 改成 hello lotus")) {
        events.push(event);
      }
      const runId = events[0]?.runId;
      if (runId) {
        for await (const event of session.approvePlan(runId)) {
          events.push(event);
        }
        for await (const event of session.approvePatch(runId)) {
          events.push(event);
        }
      }
      return events;
    },

    async runSecurityDemo(workspaceRoot, home) {
      const { createTerminalAgentSession } = mod;
      const { SqliteEgoStore, sqlitePath } = await import(pathToFileURL(join(root, "packages/storage/dist/index.js")).href);
      const store = new SqliteEgoStore(sqlitePath(home));
      try {
        await store.saveMemory({
          id: "demo-security-scope",
          scope: "project",
          kind: "security_scope",
          content: "Demo security scope",
          summary: "Allow dependency audit",
          rawContent: JSON.stringify({
            allowedActions: ["inspect"],
            forbiddenActions: [],
            riskLevel: "high",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          source: "demo",
          tags: ["security", "demo"],
          references: [],
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } finally {
        store.close();
      }

      const session = createTerminalAgentSession({
        workspaceRoot,
        egoHome: home,
        permissionLevel: "security-active",
        modelProvider: null,
      });

      const events = [];
      for await (const event of session.startTask("做一次依赖漏洞审计")) {
        events.push(event);
      }
      return events;
    },

    async generateReport(events) {
      const { buildReproBundleFromEvents, renderDefenseReport } = reportMod;
      const bundle = buildReproBundleFromEvents({ events });
      return renderDefenseReport({
        bundle,
        metadata: {
          scenario: mode,
          model: "demo-stub",
          author: "EGO-Graph Demo",
        },
      });
    },
  };
}
