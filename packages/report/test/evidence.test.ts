import { describe, expect, it } from "vitest";
import {
  buildEvidenceGraphFromEvents,
  summarizeResidualRisk,
} from "../src/evidence/evidence-graph.js";
import { buildDecisionTraceFromEvents } from "../src/evidence/decision-trace.js";
import {
  buildReproBundleFromEvents,
  deserializeReproBundle,
  serializeReproBundle,
} from "../src/evidence/repro-bundle.js";
import { renderDefenseReport } from "../src/evidence/defense-report.js";
import type { EvidenceInputEvent } from "../src/evidence/evidence-graph.js";

function sampleRun(): EvidenceInputEvent[] {
  return [
    {
      type: "run.started",
      runId: "run-1",
      message: "Run started.",
      createdAt: "2026-07-06T10:00:00Z",
      payload: {},
    },
    {
      type: "user.message",
      runId: "run-1",
      message: "Analyze the local web fixture for XSS.",
      createdAt: "2026-07-06T10:00:01Z",
      payload: {},
    },
    {
      type: "strategy.graph.created",
      runId: "run-1",
      message: "Strategy graph created.",
      createdAt: "2026-07-06T10:00:02Z",
      payload: {
        strategyGraph: {
          hypotheses: [
            { id: "h3", title: "The target has an input weakness.", status: "open", confidence: 0.4 },
          ],
        },
      },
    },
    {
      type: "planner.decision",
      runId: "run-1",
      message: "model chose tool",
      createdAt: "2026-07-06T10:00:03Z",
      payload: { action: { nextAction: "call_tool", toolCall: { name: "security.web.forms" }, thoughtSummary: "inspect forms" } },
    },
    {
      type: "tool.started",
      runId: "run-1",
      message: "Started security.web.forms",
      createdAt: "2026-07-06T10:00:04Z",
      payload: { tool: "security.web.forms", toolCall: { id: "tc-1" } },
    },
    {
      type: "observation.created",
      runId: "run-1",
      message: "form posts to /search without escaping",
      createdAt: "2026-07-06T10:00:05Z",
      payload: { tool: "security.web.forms", findings: ["form posts to /search without escaping"] },
    },
    {
      type: "evidence.created",
      runId: "run-1",
      message: "evidence candidate",
      createdAt: "2026-07-06T10:00:06Z",
      payload: { toolName: "security.web.forms", candidate: { summary: "reflected input confirmed", kind: "fact", confidence: 0.8 } },
    },
    {
      type: "strategy.graph.updated",
      runId: "run-1",
      message: "hypothesis bumped",
      createdAt: "2026-07-06T10:00:07Z",
      payload: { updates: [{ kind: "hypothesis_changed", ref: "h3", summary: "confidence up" }] },
    },
    {
      type: "tool.failed",
      runId: "run-1",
      message: "auxiliary tool failed",
      createdAt: "2026-07-06T10:00:08Z",
      payload: { tool: "security.web.headers" },
    },
    {
      type: "permission.requested",
      runId: "run-1",
      message: "approval needed",
      createdAt: "2026-07-06T10:00:09Z",
      payload: { action: "security.web.forms", resources: ["http://127.0.0.1/"] },
    },
    {
      type: "run.completed",
      runId: "run-1",
      message: "Run completed.",
      createdAt: "2026-07-06T10:00:10Z",
      payload: {},
    },
  ];
}

describe("evidence graph", () => {
  it("rebuilds nodes and edges from an event stream", () => {
    const graph = buildEvidenceGraphFromEvents(sampleRun());
    expect(graph.runId).toBe("run-1");
    expect(graph.nodes.some((node) => node.kind === "hypothesis")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "fact")).toBe(true);
    // The hypothesis should be linked to evidence it produced.
    expect(graph.edges.some((edge) => edge.relation === "produced_by")).toBe(true);
  });

  it("surfaces residual risks for low-confidence hypotheses and failed tools", () => {
    const events = sampleRun();
    const graph = buildEvidenceGraphFromEvents(events);
    const risks = summarizeResidualRisk(graph, events);
    expect(risks.some((risk) => /failed/iu.test(risk.description))).toBe(true);
  });
});

describe("decision trace", () => {
  it("captures planner, tool, observation, and strategy steps", () => {
    const trace = buildDecisionTraceFromEvents(sampleRun());
    const types = trace.map((step) => step.type);
    expect(types).toContain("planner_decision");
    expect(types).toContain("tool_invocation");
    expect(types).toContain("permission_decision");
    // The tool invocation should have absorbed an evidence ref.
    const toolStep = trace.find((step) => step.type === "tool_invocation");
    expect(toolStep?.evidenceRefs.length ?? 0).toBeGreaterThan(0);
  });
});

describe("repro bundle", () => {
  it("round-trips through serialize/deserialize", () => {
    const bundle = buildReproBundleFromEvents({ events: sampleRun() });
    const text = serializeReproBundle(bundle);
    const restored = deserializeReproBundle(text);
    expect(restored.runId).toBe(bundle.runId);
    expect(restored.toolInvocations.length).toBe(bundle.toolInvocations.length);
    expect(restored.evidenceGraph.nodes.length).toBe(bundle.evidenceGraph.nodes.length);
  });

  it("infers goal, status, and scope", () => {
    const bundle = buildReproBundleFromEvents({ events: sampleRun() });
    expect(bundle.goal).toContain("XSS");
    expect(bundle.status).toBe("complete");
  });
});

describe("defense report", () => {
  it("cites tool names, evidence ids, timestamps, and approvals", () => {
    const bundle = buildReproBundleFromEvents({ events: sampleRun() });
    const report = renderDefenseReport({ bundle, metadata: { scenario: "web-xss-demo" } });
    expect(report).toContain("# EGO-Graph Defense Report");
    expect(report).toContain("security.web.forms");
    expect(report).toContain("Scenario"); // metadata section header
    expect(report).toContain("Approval History"); // approval history section
    // Each node id appears as a backticked reference.
    expect(report).toMatch(/`[a-z]+:\d+`/u);
  });
});
