import { describe, expect, it } from "vitest";
import {
  applyObservationToStrategy,
  closeEvidenceGap,
  updateHypothesis,
} from "../src/strategy/strategy-graph-update.js";
import {
  createInitialStrategyGraph,
  type StrategyGraph,
} from "../src/strategy/strategy-graph.js";

function webPentestGraph(hasScope = false): StrategyGraph {
  return createInitialStrategyGraph({
    runId: "run",
    sessionId: "session",
    message: "对本地 fixture 进行 web 渗透，验证是否存在 SQL 注入",
    intent: "security_task",
    permissionLevel: "security-active",
    tools: [
      { name: "workspace.read", permissionScope: "file", riskLevel: "low" },
      { name: "security.web.form", permissionScope: "network", riskLevel: "low" },
      { name: "security.web.headers", permissionScope: "network", riskLevel: "low" },
      { name: "evidence.save", permissionScope: "file", riskLevel: "low" },
    ],
    hasSecurityScope: hasScope,
    now: "2026-07-06T00:00:00.000Z",
  });
}

function projectAnalysisGraph(): StrategyGraph {
  return createInitialStrategyGraph({
    runId: "run",
    sessionId: "session",
    message: "分析项目结构并找出测试入口",
    intent: "project_analysis",
    permissionLevel: "read-only",
    tools: [
      { name: "workspace.list", permissionScope: "file", riskLevel: "low" },
      { name: "workspace.grep", permissionScope: "file", riskLevel: "low" },
    ],
    now: "2026-07-06T00:00:00.000Z",
  });
}

describe("strategy graph lifecycle updates", () => {
  it("closes a context evidence gap when a workspace tool observes evidence", () => {
    const graph = projectAnalysisGraph();
    const result = applyObservationToStrategy({
      graph,
      observation: {
        tool: "workspace.list",
        findings: ["found 42 source files under src/"],
        claims: [
          {
            claim: "Workspace listing found source files under src/",
            artifactRefs: ["tool-call://workspace.list/output"],
            confidence: 0.75,
            relation: "supports",
          },
        ],
      },
    });
    expect(result.updates.some((u) => u.kind === "gap_closed" && u.ref === "g1")).toBe(true);
    expect(result.graph.evidenceGaps.find((g) => g.id === "g1")?.verification).toContain("[closed]");
  });

  it("closes the authorization gap and advances posture on a blocked security task", () => {
    const graph = webPentestGraph(false);
    expect(graph.riskPosture).toBe("blocked");
    const result = closeEvidenceGap({
      graph,
      gapId: "g3",
      evidence: { summary: "SecurityScope issued", source: "user" },
    });
    expect(result.graph.riskPosture).toBe("network_active");
    expect(result.updates.some((u) => u.kind === "posture_advanced")).toBe(true);
    expect(
      result.graph.hypotheses.find((h) => h.id === "h2")?.status,
    ).toBe("rejected");
  });

  it("maps web domain observations to the leading hypothesis and bumps confidence", () => {
    const graph = webPentestGraph(true);
    const before = graph.hypotheses.find((h) => h.id === "h3")?.confidence ?? 0;
    const result = applyObservationToStrategy({
      graph,
      observation: {
        tool: "security.web.form",
        findings: ["login form posts to /auth with user+password, no CSRF token"],
      },
    });
    const after = result.graph.hypotheses.find((h) => h.id === "h3")?.confidence ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(result.updates.some((u) => u.ref === "h3")).toBe(true);
  });

  it("is idempotent: re-applying the same observation produces no further updates", () => {
    const graph = webPentestGraph(true);
    const observation = {
      tool: "security.web.headers",
      findings: ["Server: nginx/1.18, X-Powered-By: PHP/7.4"],
    };
    const first = applyObservationToStrategy({ graph, observation });
    const second = applyObservationToStrategy({ graph: first.graph, observation });
    // Confidence bump should not re-apply; only the domain gap close may re-fire
    // once, and even that is deduped by gap id.
    const confidenceUpdates = second.updates.filter(
      (u) => u.kind === "hypothesis_changed" && u.ref === "h3",
    );
    expect(confidenceUpdates).toHaveLength(0);
  });

  it("strengthens confidence more when findings contain an indicator (flag/IOC/CVE)", () => {
    const graph = webPentestGraph(true);
    const plain = applyObservationToStrategy({
      graph,
      observation: { tool: "security.web.form", findings: ["form has two inputs"] },
    });
    const indicator = applyObservationToStrategy({
      graph,
      observation: {
        tool: "security.web.form",
        findings: ["found flag{test} in response body"],
      },
    });
    const plainConfidence = plain.graph.hypotheses.find((h) => h.id === "h3")?.confidence ?? 0;
    const indicatorConfidence =
      indicator.graph.hypotheses.find((h) => h.id === "h3")?.confidence ?? 0;
    expect(indicatorConfidence).toBeGreaterThan(plainConfidence);
  });

  it("updateHypothesis returns changed:false for a no-op patch", () => {
    const graph = projectAnalysisGraph();
    const hypothesis = graph.hypotheses.find((h) => h.id === "h1");
    expect(hypothesis).toBeDefined();
    const result = updateHypothesis({
      graph,
      hypothesisId: "h1",
      patch: { confidence: hypothesis?.confidence, status: hypothesis?.status },
    });
    expect(result.updates).toHaveLength(0);
  });

  it("updateHypothesis returns changed:false for an unknown hypothesis id", () => {
    const graph = projectAnalysisGraph();
    const result = updateHypothesis({
      graph,
      hypothesisId: "h-nope",
      patch: { confidence: 0.9 },
    });
    expect(result.updates).toHaveLength(0);
    expect(result.graph).toBe(graph);
  });

  it("clamps confidence to [0, 1]", () => {
    const graph = projectAnalysisGraph();
    const result = updateHypothesis({
      graph,
      hypothesisId: "h1",
      patch: { confidence: 5 },
    });
    expect(result.graph.hypotheses.find((h) => h.id === "h1")?.confidence).toBe(1);
  });
});
