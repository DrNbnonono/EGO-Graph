import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEgoStore, sqlitePath } from "@ego-graph/storage";
import { describe, expect, it } from "vitest";
import { createTerminalAgentSession, type AgentRunEvent } from "../src/index.js";

/**
 * End-to-end workflow tests that exercise the full agent chain:
 *   need-understanding → plan → tool-call → patch → checks → repair → report
 *
 * Each test asserts trajectory events at every phase, not just the final
 * outcome, so regressions in intermediate stages are caught.
 */

const fakeProvider = (content: string) => ({
  name: "fake",
  model: "fake-model",
  async complete(): Promise<string> {
    return content;
  },
});

const queuedProvider = (contents: string[]) => {
  const queue = [...contents];
  return {
    name: "fake",
    model: "fake-model",
    async complete(): Promise<string> {
      return queue.shift() ?? contents.at(-1) ?? "{}";
    },
  };
};

async function collect(iterable: AsyncIterable<AgentRunEvent>): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function eventTypes(events: AgentRunEvent[]): string[] {
  return events.map((event) => event.type);
}

describe("e2e: full agent workflow", () => {
  it("completes the full chain: need → plan → patch → checks → run.completed", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-e2e-full-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-e2e-full-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
      ),
      checkCommands: [{ name: "node-version", command: process.execPath, args: ["--version"] }],
    });

    // Phase 1: Need understanding + context + plan
    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    expect(eventTypes(started)).toContain("user.message");
    expect(eventTypes(started)).toContain("run.started");
    expect(eventTypes(started)).toContain("context.loaded");
    expect(eventTypes(started)).toContain("memory.recalled");
    expect(eventTypes(started)).toContain("plan.proposed");
    expect(session.getRunState(runId)?.status).toBe("plan_pending");

    // Phase 2: Plan approval → patch generation
    const planned = await collect(session.approvePlan(runId));
    expect(eventTypes(planned)).toContain("plan.approved");
    expect(eventTypes(planned)).toContain("patch.proposed");
    expect(session.getRunState(runId)?.status).toBe("patch_pending");
    expect(session.getRunState(runId)?.diff).toContain("+lotus");
    // File not yet written — patch is only proposed, not applied
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");

    // Phase 3: Patch approval → apply → checks → completion
    const applied = await collect(session.approvePatch(runId));
    expect(eventTypes(applied)).toContain("patch.approved");
    expect(eventTypes(applied)).toContain("patch.applied");
    expect(eventTypes(applied)).toContain("check.started");
    expect(eventTypes(applied)).toContain("check.completed");
    expect(eventTypes(applied)).toContain("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");

    // Phase 4: Final report content
    const completed = applied.find((event) => event.type === "run.completed");
    expect(completed?.message).toContain("Checks passed");
  });

  it("completes the full repair cycle: check fails → repair proposed → re-approve → checks pass", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-e2e-repair-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-e2e-repair-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    // Check command: fails when README doesn't contain "fixed", passes when it does.
    // This simulates a real test that validates the patch content.
    const contentCheck = [
      "-e",
      "const fs=require('fs');try{const c=fs.readFileSync('README.md','utf8');"
        + "if(!c.includes('fixed')){console.error('content missing fixed marker');process.exit(1)}}"
        + "catch(e){console.error(e.message);process.exit(1)}",
    ];

    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: queuedProvider([
        // Response 1: evidence-gap plan (for generateEvidenceGapPlan)
        JSON.stringify({
          plan: [
            {
              id: "context",
              title: "Read README",
              knownEvidence: ["README exists"],
              missingEvidence: ["Need exact change"],
              toolChoiceRationale: "Read first",
              expectedResult: "Context ready",
              stopCondition: "Context loaded",
              riskNote: "Read-only",
            },
            {
              id: "patch",
              title: "Edit README",
              knownEvidence: ["Context available"],
              missingEvidence: ["Approval"],
              toolChoiceRationale: "Use WorkspaceEditPlan",
              expectedResult: "Diff preview",
              stopCondition: "Approved",
              riskNote: "Workspace write",
            },
          ],
        }),
        // Response 2: initial edit plan (writes "lotus" — check will fail)
        JSON.stringify({
          rationale: "Initial edit.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
        // Response 3: repair edit plan (writes "lotus fixed" — check will pass)
        JSON.stringify({
          rationale: "Repair: add fixed marker.",
          editPlan: {
            goal: "repair readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "lotus", newText: "lotus fixed" },
            ],
          },
        }),
      ]),
      checkCommands: [{ name: "content-check", command: process.execPath, args: contentCheck }],
    });

    // Phase 1: Need understanding + plan
    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    expect(eventTypes(started)).toContain("run.started");
    expect(eventTypes(started)).toContain("context.loaded");
    expect(eventTypes(started)).toContain("plan.proposed");

    // Phase 2: Plan approval → patch generation
    const planned = await collect(session.approvePlan(runId));
    expect(eventTypes(planned)).toContain("plan.approved");
    expect(eventTypes(planned)).toContain("patch.proposed");

    // Phase 3: Patch approval → apply → checks FAIL → repair proposed
    const firstApply = await collect(session.approvePatch(runId));
    expect(eventTypes(firstApply)).toContain("patch.applied");
    expect(eventTypes(firstApply)).toContain("check.started");
    expect(eventTypes(firstApply)).toContain("check.completed");
    expect(eventTypes(firstApply)).toContain("repair.proposed");
    expect(eventTypes(firstApply)).toContain("patch.proposed");
    expect(session.getRunState(runId)?.status).toBe("patch_pending");
    expect(session.getRunState(runId)?.repairAttempts).toBe(1);
    // The repair diff should contain "lotus fixed"
    expect(session.getRunState(runId)?.diff).toContain("+lotus fixed");
    // Original patch was applied (README now has "lotus", not "hello")
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");

    // Phase 4: Repair patch approval → apply → checks PASS → run.completed
    const repairApply = await collect(session.approvePatch(runId));
    expect(eventTypes(repairApply)).toContain("patch.applied");
    expect(eventTypes(repairApply)).toContain("check.completed");
    expect(eventTypes(repairApply)).toContain("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus fixed\n");

    // Final state
    expect(session.getRunState(runId)?.status).toBe("applied");
  });

  it("blocks security tasks without security scope and allows with scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-e2e-security-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-e2e-security-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(
      join(root, "logs/auth.log"),
      [
        "Jul 6 02:00:01 web01 sshd[101]: Failed password for invalid user admin from 203.0.113.5",
        "Jul 6 02:00:02 web01 sshd[101]: Failed password for invalid user admin from 203.0.113.5",
        "Jul 6 02:05:11 web01 sshd[102]: Accepted password for deploy from 203.0.113.5",
        "Jul 6 02:06:30 web01 sudo: deploy : USER=root ; COMMAND=/bin/bash",
      ].join("\n"),
      "utf8",
    );

    // Without security scope: task is blocked
    const blocked = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "read-only",
      modelProvider: null,
    });
    const blockedEvents = await collect(blocked.startTask("做一次漏洞审计"));
    expect(eventTypes(blockedEvents)).toContain("run.started");
    expect(eventTypes(blockedEvents)).toContain("context.loaded");
    // Security task without scope should be blocked (no plan.proposed)
    expect(eventTypes(blockedEvents)).not.toContain("plan.proposed");
    const blockedRunId = blockedEvents[0]!.runId;
    expect(blocked.getRunState(blockedRunId)?.status).toBe("blocked");

    // With security scope: task reaches plan.proposed
    const store = new SqliteEgoStore(sqlitePath(egoHome));
    try {
      await store.saveMemory({
        id: "security-scope-e2e",
        scope: "project",
        kind: "security_scope",
        content: "incident response security scope",
        summary: "Allow incident response inspection",
        rawContent: JSON.stringify({
          allowedActions: ["inspect"],
          forbiddenActions: [],
          riskLevel: "high",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
        source: "test",
        tags: ["security", "incident-response"],
        references: [],
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      store.close();
    }

    const authorized = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "Analyzed auth log.",
          editPlan: {
            goal: "document findings",
            operations: [
              {
                type: "replace_text",
                path: "logs/auth.log",
                oldText: "Failed password",
                newText: "BLOCKED Failed password",
              },
            ],
          },
        }),
      ),
      checkCommands: [{ name: "node-version", command: process.execPath, args: ["--version"] }],
    });
    const allowedEvents = await collect(authorized.startTask("做一次漏洞审计"));
    expect(eventTypes(allowedEvents)).toContain("run.started");
    expect(eventTypes(allowedEvents)).toContain("context.loaded");
    expect(eventTypes(allowedEvents)).toContain("memory.recalled");
    expect(eventTypes(allowedEvents)).toContain("plan.proposed");
    const allowedRunId = allowedEvents[0]!.runId;
    expect(authorized.getRunState(allowedRunId)?.status).toBe("plan_pending");

    // Full chain: approve plan → patch → checks → completion
    const planned = await collect(authorized.approvePlan(allowedRunId));
    expect(eventTypes(planned)).toContain("plan.approved");
    expect(eventTypes(planned)).toContain("patch.proposed");

    const applied = await collect(authorized.approvePatch(allowedRunId));
    expect(eventTypes(applied)).toContain("patch.applied");
    expect(eventTypes(applied)).toContain("run.completed");
    expect(
      await readFile(join(root, "logs/auth.log"), "utf8"),
    ).toContain("BLOCKED Failed password");
  });

  it("preserves evidence trail across the full workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-e2e-evidence-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-e2e-evidence-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README contains the requested text.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
      ),
      checkCommands: [{ name: "node-version", command: process.execPath, args: ["--version"] }],
    });

    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;

    const planned = await collect(session.approvePlan(runId));
    const applied = await collect(session.approvePatch(runId));

    // Collect all events across the full workflow
    const allEvents = [...started, ...planned, ...applied];

    // Assert key trajectory events are present (these map to TrajectoryEvent types)
    expect(eventTypes(allEvents)).toContain("run.started");
    expect(eventTypes(allEvents)).toContain("plan.proposed");
    expect(eventTypes(allEvents)).toContain("plan.approved");
    expect(eventTypes(allEvents)).toContain("patch.proposed");
    expect(eventTypes(allEvents)).toContain("patch.approved");
    expect(eventTypes(allEvents)).toContain("patch.applied");
    expect(eventTypes(allEvents)).toContain("check.started");
    expect(eventTypes(allEvents)).toContain("check.completed");
    expect(eventTypes(allEvents)).toContain("run.completed");

    // Verify events have correct runId linkage
    expect(allEvents.every((event) => event.runId === runId)).toBe(true);

    // Verify the final run state
    expect(session.getRunState(runId)?.status).toBe("applied");
    expect(session.getRunState(runId)?.phase).toBe("complete");

    // Verify replay works (trajectory is persisted)
    const replayed = await session.replayRun(runId);
    expect(replayed.length).toBeGreaterThan(0);
    expect(eventTypes(replayed)).toContain("run.completed");
  });

  it("skips repair after reaching the max retry limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-e2e-repair-limit-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-e2e-repair-limit-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    // Check command that always fails — simulates an unfixable regression.
    const alwaysFail = [
      "-e",
      "console.error('permanent failure'); process.exit(1)",
    ];

    // Provider queue: plan + initial edit + repair 1 + repair 2
    // maxRepairAttempts is 2, so after 2 failed repairs the loop must skip.
    const session = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: queuedProvider([
        JSON.stringify({
          plan: [
            {
              id: "context",
              title: "Read",
              knownEvidence: ["README"],
              missingEvidence: ["edit"],
              toolChoiceRationale: "Read",
              expectedResult: "context",
              stopCondition: "done",
              riskNote: "ro",
            },
            {
              id: "patch",
              title: "Edit",
              knownEvidence: ["context"],
              missingEvidence: ["approval"],
              toolChoiceRationale: "edit",
              expectedResult: "diff",
              stopCondition: "approved",
              riskNote: "write",
            },
          ],
        }),
        JSON.stringify({
          rationale: "initial",
          editPlan: {
            goal: "update",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
        JSON.stringify({
          rationale: "repair 1",
          editPlan: {
            goal: "repair 1",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "lotus", newText: "lotus r1" },
            ],
          },
        }),
        JSON.stringify({
          rationale: "repair 2",
          editPlan: {
            goal: "repair 2",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "lotus r1", newText: "lotus r2" },
            ],
          },
        }),
      ]),
      checkCommands: [{ name: "always-fail", command: process.execPath, args: alwaysFail }],
    });

    const started = await collect(session.startTask("把 README 里的 hello 改成 lotus"));
    const runId = started[0]!.runId;
    await collect(session.approvePlan(runId));

    // First apply: check fails → repair 1 proposed
    const firstApply = await collect(session.approvePatch(runId));
    expect(eventTypes(firstApply)).toContain("repair.proposed");
    expect(session.getRunState(runId)?.repairAttempts).toBe(1);

    // Second apply: check fails again → repair 2 proposed
    const secondApply = await collect(session.approvePatch(runId));
    expect(eventTypes(secondApply)).toContain("repair.proposed");
    expect(session.getRunState(runId)?.repairAttempts).toBe(2);

    // Third apply: check fails again → repair limit reached → repair.skipped
    const thirdApply = await collect(session.approvePatch(runId));
    expect(eventTypes(thirdApply)).toContain("repair.skipped");
    expect(session.getRunState(runId)?.status).toBe("blocked");
    expect(session.getRunState(runId)?.phase).toBe("blocked");
  });

  it("resumes patch approval after session restart via hydration", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-e2e-hydrate-resume-"));
    const egoHome = await mkdtemp(join(tmpdir(), "ego-e2e-hydrate-resume-home-"));
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    await writeFile(join(root, "README.md"), "hello\n", "utf8");

    // Session 1: start task, approve plan, get patch pending — then "crash"
    const first = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README edit.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
      ),
      checkCommands: [{ name: "node-version", command: process.execPath, args: ["--version"] }],
    });
    const started = await collect(first.startTask("把 README hello 改成 lotus"));
    const runId = started[0]!.runId;
    await collect(first.approvePlan(runId));
    // Patch is pending — session "crashes" here (we just abandon it)
    expect(first.getRunState(runId)?.status).toBe("patch_pending");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");

    // Session 2: new session, hydrate pending runs, resume patch approval
    const resumed = createTerminalAgentSession({
      workspaceRoot: root,
      egoHome,
      permissionLevel: "shell-readonly",
      modelProvider: fakeProvider(
        JSON.stringify({
          rationale: "README edit.",
          editPlan: {
            goal: "update readme",
            operations: [
              { type: "replace_text", path: "README.md", oldText: "hello", newText: "lotus" },
            ],
          },
        }),
      ),
      checkCommands: [{ name: "node-version", command: process.execPath, args: ["--version"] }],
    });
    const hydrated = await resumed.hydratePendingRuns();
    expect(hydrated.map((run) => run.runId)).toContain(runId);
    expect(resumed.getRunState(runId)?.status).toBe("patch_pending");
    expect(resumed.getRunState(runId)?.diff).toContain("+lotus");

    // Resume: approve patch → checks → run.completed
    const applied = await collect(resumed.approvePatch(runId));
    expect(eventTypes(applied)).toContain("patch.applied");
    expect(eventTypes(applied)).toContain("run.completed");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("lotus\n");
  });
});
