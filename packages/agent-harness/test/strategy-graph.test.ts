import { describe, expect, it } from "vitest";
import { createInitialStrategyGraph, summarizeStrategyGraph } from "../src/index.js";

describe("strategy graph", () => {
  it("models active security tasks as blocked without SecurityScope", () => {
    const graph = createInitialStrategyGraph({
      runId: "run-security",
      sessionId: "session",
      message: "对目标进行 web 渗透并验证 SQL 注入",
      intent: "security_task",
      permissionLevel: "security-active",
      hasSecurityScope: false,
      tools: [
        { name: "workspace.read", permissionScope: "file", riskLevel: "low" },
        { name: "local_fixture.http_request", permissionScope: "network", riskLevel: "high" },
      ],
      now: "2026-07-06T00:00:00.000Z",
    });

    expect(graph.domain).toBe("web_pentest");
    expect(graph.riskPosture).toBe("blocked");
    expect(graph.evidenceGaps.some((gap) => gap.id === "g3" && gap.priority === "p0")).toBe(true);
    expect(summarizeStrategyGraph(graph)).toContain("domain=web_pentest");
  });

  it("keeps project analysis read-only and evidence-first", () => {
    const graph = createInitialStrategyGraph({
      runId: "run-analysis",
      sessionId: "session",
      message: "分析项目结构并找出测试入口",
      intent: "project_analysis",
      permissionLevel: "read-only",
      tools: [
        { name: "workspace.list", permissionScope: "file", riskLevel: "low" },
        { name: "workspace.grep", permissionScope: "file", riskLevel: "low" },
        { name: "check.test", permissionScope: "process", riskLevel: "medium" },
      ],
      now: "2026-07-06T00:00:00.000Z",
    });

    expect(graph.domain).toBe("project_analysis");
    expect(graph.riskPosture).toBe("read_only");
    expect(graph.stages.map((stage) => stage.id)).toEqual([
      "scope",
      "evidence",
      "verification",
      "report",
    ]);
  });
});
