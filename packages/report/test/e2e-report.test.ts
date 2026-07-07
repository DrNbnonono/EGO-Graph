import { describe, expect, it } from "vitest";
import {
  buildReproBundleFromEvents,
  serializeReproBundle,
  deserializeReproBundle,
} from "../src/evidence/repro-bundle.js";
import { renderDefenseReport } from "../src/evidence/defense-report.js";
import { buildEvidenceGraphFromEvents } from "../src/evidence/evidence-graph.js";
import { buildDecisionTraceFromEvents } from "../src/evidence/decision-trace.js";
import type { EvidenceInputEvent } from "../src/evidence/evidence-graph.js";

/**
 * End-to-end report generation test: verify the full pipeline from agent run
 * events → evidence graph → repro bundle → defense report works correctly
 * with events matching the exact shape produced by createTerminalAgentSession.
 *
 * Event types and payloads are modeled after session.ts's actual output:
 * run.started, context.loaded, plan.proposed, plan.approved, patch.proposed,
 * patch.approved, patch.applied, check.started, check.completed, repair.proposed,
 * run.completed, evidence.created, tool.started, tool.completed.
 */

function realRunEvents(): EvidenceInputEvent[] {
  return [
    { type: "run.started", runId: "e2e-run-001", message: "Terminal Agent started with shell-readonly permissions.", createdAt: "2026-07-06T10:00:00Z", payload: { userMessage: "把 README 里的 hello 改成 lotus", permissionLevel: "shell-readonly" } },
    { type: "context.loaded", runId: "e2e-run-001", message: "Loaded repo map and 2 relevant context file(s).", createdAt: "2026-07-06T10:00:01Z", payload: { selectedFiles: [{ path: "README.md" }, { path: "package.json" }] } },
    { type: "memory.recalled", runId: "e2e-run-001", message: "Recalled 0 relevant memory item(s).", createdAt: "2026-07-06T10:00:02Z", payload: { memories: [] } },
    { type: "strategy.graph.created", runId: "e2e-run-001", message: "Strategy graph created.", createdAt: "2026-07-06T10:00:03Z", payload: { strategyGraph: { hypotheses: [{ id: "h1", title: "README needs updating", status: "open", confidence: 0.8 }] } } },
    { type: "plan.proposed", runId: "e2e-run-001", message: "Evidence-gap plan proposed.", createdAt: "2026-07-06T10:00:04Z", payload: { plan: [{ id: "context", title: "Read README" }] } },
    { type: "plan.approved", runId: "e2e-run-001", message: "Plan approved. Generating Patch preview.", createdAt: "2026-07-06T10:00:05Z", payload: {} },
    { type: "patch.proposed", runId: "e2e-run-001", message: "Patch preview ready for 1 file(s).", createdAt: "2026-07-06T10:00:06Z", payload: { approvalId: "approval-1", diff: "--- a/README.md\n+++ b/README.md\n-hello\n+lotus", files: ["README.md"] } },
    { type: "patch.approved", runId: "e2e-run-001", message: "Patch approved. Applying workspace edit and running checks.", createdAt: "2026-07-06T10:00:07Z", payload: { files: ["README.md"] } },
    { type: "patch.applied", runId: "e2e-run-001", message: "Patch applied to README.md.", createdAt: "2026-07-06T10:00:08Z", payload: { files: ["README.md"] } },
    { type: "check.started", runId: "e2e-run-001", message: "Check started: node --version", createdAt: "2026-07-06T10:00:09Z", payload: { check: { name: "node-version", command: "node", status: "running" } } },
    { type: "check.completed", runId: "e2e-run-001", message: "Check passed: node --version", createdAt: "2026-07-06T10:00:10Z", payload: { check: { name: "node-version", command: "node", status: "passed", exitCode: 0 } } },
    { type: "evidence.created", runId: "e2e-run-001", message: "README.md contains lotus after patch.", createdAt: "2026-07-06T10:00:11Z", payload: { summary: "README.md contains lotus after patch", source: "patch.applied", raw: { file: "README.md", content: "lotus" } } },
    { type: "run.completed", runId: "e2e-run-001", message: "Patch applied. Checks passed 1/1: node=passed.", createdAt: "2026-07-06T10:00:12Z", payload: { checks: [{ status: "passed", command: "node" }], files: ["README.md"] } },
  ];
}

function repairRunEvents(): EvidenceInputEvent[] {
  return [
    { type: "run.started", runId: "e2e-run-002", message: "Terminal Agent started.", createdAt: "2026-07-06T11:00:00Z", payload: {} },
    { type: "plan.proposed", runId: "e2e-run-002", message: "Plan proposed.", createdAt: "2026-07-06T11:00:01Z", payload: {} },
    { type: "plan.approved", runId: "e2e-run-002", message: "Plan approved.", createdAt: "2026-07-06T11:00:02Z", payload: {} },
    { type: "patch.proposed", runId: "e2e-run-002", message: "Patch proposed.", createdAt: "2026-07-06T11:00:03Z", payload: { diff: "+lotus" } },
    { type: "patch.approved", runId: "e2e-run-002", message: "Patch approved.", createdAt: "2026-07-06T11:00:04Z", payload: {} },
    { type: "patch.applied", runId: "e2e-run-002", message: "Patch applied.", createdAt: "2026-07-06T11:00:05Z", payload: { files: ["README.md"] } },
    { type: "check.started", runId: "e2e-run-002", message: "Check started.", createdAt: "2026-07-06T11:00:06Z", payload: {} },
    { type: "check.completed", runId: "e2e-run-002", message: "Check failed.", createdAt: "2026-07-06T11:00:07Z", payload: { check: { status: "failed", exitCode: 1 } } },
    { type: "repair.proposed", runId: "e2e-run-002", message: "Checks failed; repair Patch 1/2 is ready for review.", createdAt: "2026-07-06T11:00:08Z", payload: { repairAttempts: 1, failedChecks: ["content-check: failed exit=1"] } },
    { type: "patch.proposed", runId: "e2e-run-002", message: "Repair diff ready for 1 file(s).", createdAt: "2026-07-06T11:00:09Z", payload: { diff: "+lotus fixed" } },
    { type: "patch.approved", runId: "e2e-run-002", message: "Repair patch approved.", createdAt: "2026-07-06T11:00:10Z", payload: {} },
    { type: "patch.applied", runId: "e2e-run-002", message: "Repair patch applied.", createdAt: "2026-07-06T11:00:11Z", payload: { files: ["README.md"] } },
    { type: "check.completed", runId: "e2e-run-002", message: "Check passed.", createdAt: "2026-07-06T11:00:12Z", payload: { check: { status: "passed", exitCode: 0 } } },
    { type: "run.completed", runId: "e2e-run-002", message: "Patch applied. Checks passed 1/1.", createdAt: "2026-07-06T11:00:13Z", payload: {} },
  ];
}

describe("e2e: defense report from agent run events", () => {
  it("builds a repro bundle from a successful run and renders a complete defense report", () => {
    const events = realRunEvents();
    const bundle = buildReproBundleFromEvents({ events });

    expect(bundle.runId).toBe("e2e-run-001");
    expect(bundle.goal).toContain("把 README");
    expect(bundle.status).toBe("complete");
    expect(bundle.toolInvocations.length).toBe(0); // no tool.started events in this run
    expect(bundle.evidenceGraph.nodes.length).toBeGreaterThan(0);
    expect(bundle.generatedAt).toBeTruthy();

    const report = renderDefenseReport({ bundle, metadata: { scenario: "code_change", model: "fake" } });

    // Verify all required sections are present
    expect(report).toContain("# EGO-Graph Defense Report");
    expect(report).toContain("## Executive Summary");
    expect(report).toContain("## Scope and Authorization");
    expect(report).toContain("## Tool Invocations");
    expect(report).toContain("## Evidence Graph");
    expect(report).toContain("## Decision Trace");
    expect(report).toContain("## Approval History");
    expect(report).toContain("## Residual Risks");
    expect(report).toContain("## Reproduction");

    // Verify key details are rendered
    expect(report).toContain("e2e-run-001");
    expect(report).toContain("shell-readonly");
    expect(report).toContain("README.md");
  });

  it("builds a repro bundle from a repair run and captures the repair trace", () => {
    const events = repairRunEvents();
    const bundle = buildReproBundleFromEvents({ events });

    expect(bundle.runId).toBe("e2e-run-002");
    expect(bundle.status).toBe("complete");

    const report = renderDefenseReport({ bundle });

    // The repair flow should be visible in the decision trace
    expect(report).toContain("## Decision Trace");
    // The repair.proposed event should contribute to the trace
    expect(report).toContain("repair");
  });

  it("evidence graph contains nodes from evidence.created events", () => {
    const events = realRunEvents();
    const graph = buildEvidenceGraphFromEvents(events);

    expect(graph.nodes.length).toBeGreaterThan(0);
    const evidenceNode = graph.nodes.find((node) =>
      node.summary.includes("README.md contains lotus"),
    );
    expect(evidenceNode).toBeDefined();
    expect(evidenceNode?.kind).toBeTruthy();
    expect(evidenceNode?.source).toBe("patch.applied");
  });

  it("decision trace captures planner and tool decisions", () => {
    const events = realRunEvents();
    const trace = buildDecisionTraceFromEvents(events);

    expect(trace.length).toBeGreaterThan(0);
    // Each step should have required fields
    for (const step of trace) {
      expect(step.step).toBeGreaterThan(0);
      expect(step.type).toBeTruthy();
      expect(step.action).toBeTruthy();
    }
  });

  it("repro bundle round-trips through serialization", () => {
    const events = realRunEvents();
    const bundle = buildReproBundleFromEvents({ events });
    const serialized = serializeReproBundle(bundle);
    const deserialized = deserializeReproBundle(serialized);

    expect(deserialized.runId).toBe(bundle.runId);
    expect(deserialized.goal).toBe(bundle.goal);
    expect(deserialized.status).toBe(bundle.status);
    expect(deserialized.evidenceGraph.nodes.length).toBe(bundle.evidenceGraph.nodes.length);
    expect(deserialized.decisionTrace.length).toBe(bundle.decisionTrace.length);

    // The deserialized bundle should render the same report
    const report = renderDefenseReport({ bundle: deserialized });
    expect(report).toContain("e2e-run-001");
  });
});
