import { describe, expect, it } from "vitest";
import {
  createMemoryService,
  recallForTask,
  rememberDecision,
  rememberFailure,
  rememberRunSummary,
  rememberSecurityScope,
  rememberToolResult,
  summarizeContext,
} from "../src/index.js";

describe("memory service", () => {
  it("stores scoped memories, recalls by query, and rejects sensitive references", async () => {
    const memory = createMemoryService();

    const accepted = await memory.remember({
      scope: "project",
      content: "MiniMax M3 is the selected coding model profile.",
      source: "user",
      tags: ["model"],
      references: ["README.md"],
    });
    const rejected = await memory.remember({
      scope: "project",
      content: "Do not store secrets from env files.",
      source: ".env",
      references: [".env"],
    });
    const hits = await memory.recall({ query: "which coding model is selected", scope: "project" });

    expect(accepted.status).toBe("stored");
    expect(rejected.status).toBe("rejected");
    expect(hits[0]?.content).toContain("MiniMax M3");
    expect(await memory.listMemories("project")).toHaveLength(1);
  });

  it("rejects memory content that looks like credentials", async () => {
    const memory = createMemoryService();

    const result = await memory.remember({
      scope: "session",
      content: "Temporary provider token: sk-cp-1234567890abcdef1234567890abcdef",
      source: "api.chat",
      tags: ["chat"],
      references: [],
    });

    expect(result.status).toBe("rejected");
    expect(await memory.listMemories("session")).toEqual([]);
  });

  it("supports memory v2 kinds, compact, archive, and forget", async () => {
    const memory = createMemoryService();

    const stored = await memory.remember({
      scope: "project",
      kind: "decision",
      content: "Use terminal harness for Codex-like agent workflows.",
      source: "test",
      tags: ["agent"],
    });

    expect(stored.status).toBe("stored");
    const hits = await memory.recall({ query: "terminal harness", kind: "decision" });
    expect(hits[0]?.tags).toContain("kind:decision");
    expect(await memory.compact({ query: "harness" })).toContain("terminal harness");

    if (stored.status === "stored") {
      expect(await memory.archive(stored.memory.id)).toBe(true);
      expect(await memory.recall({ query: "terminal harness" })).toEqual([]);
      expect(await memory.forget(stored.memory.id)).toBe(true);
    }
  });

  it("persists memory v2 metadata and ranks task recall by importance, confidence, recency, and access count", async () => {
    const memory = createMemoryService();

    const low = await rememberDecision(memory, {
      scope: "project",
      summary: "Use the old dashboard as the main interface.",
      rawContent: "This older decision was superseded by the terminal-first workflow.",
      source: "test",
      sourceRunId: "run-low",
      importance: 1,
      confidence: 0.4,
      evidenceRefs: ["docs/old.md"],
    });
    const high = await rememberDecision(memory, {
      scope: "project",
      summary: "Prefer the terminal conversation harness for Codex-like workflows.",
      rawContent: "Terminal harness is the approved UX center.",
      source: "test",
      sourceRunId: "run-high",
      importance: 5,
      confidence: 0.95,
      evidenceRefs: ["docs/agent-kernel.md"],
    });

    expect(low.status).toBe("stored");
    expect(high.status).toBe("stored");

    const hits = await recallForTask(memory, {
      query: "terminal harness workflow",
      scope: "project",
      kind: "decision",
      limit: 2,
    });

    expect(hits[0]?.summary).toContain("terminal conversation harness");
    expect(hits[0]?.accessCount).toBe(1);
    expect(hits[0]?.lastAccessedAt).toBeTruthy();
    expect(hits[0]?.rawContent).toContain("Terminal harness");
  });

  it("stores typed memory helpers and redacts sensitive raw content", async () => {
    const memory = createMemoryService();

    const results = await Promise.all([
      rememberFailure(memory, {
        scope: "session",
        summary: "Typecheck failed because the MCP transport enum was stale.",
        rawContent: "tsc error in packages/workbench",
        source: "check.typecheck",
        sourceRunId: "run-1",
      }),
      rememberToolResult(memory, {
        scope: "session",
        summary: "pnpm test passed after MCP HTTP tests were added.",
        rawContent: "48 files passed",
        source: "check.test",
        sourceRunId: "run-1",
      }),
      rememberSecurityScope(memory, {
        scope: "project",
        summary: "Only controlled fixtures are authorized for active security testing.",
        rawContent: "fixture://web-pentest/basic",
        source: "user",
      }),
      rememberRunSummary(memory, {
        scope: "session",
        summary: "Implemented MCP HTTP client pool.",
        rawContent: "Run generated docs and tests.",
        source: "agent",
        sourceRunId: "run-1",
      }),
    ]);

    expect(results.every((result) => result.status === "stored")).toBe(true);

    const rejected = await rememberToolResult(memory, {
      scope: "session",
      summary: "Model call used a secret token.",
      rawContent: "api_key=sk-cp-1234567890abcdef1234567890abcdef",
      source: "model",
    });

    expect(rejected.status).toBe("rejected");
    const memories = await memory.listMemories();
    expect(memories.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["failure", "tool_result", "security_scope", "run_summary"]),
    );
    expect(memories.some((item) => item.rawContent?.includes("sk-cp-"))).toBe(false);
  });

  it("compresses context while preserving operational facts", () => {
    const summary = summarizeContext({
      goal: "Generate an approvable patch from natural language.",
      constraints: ["No file writes before approval", "Authorized CTF scope only"],
      inspectedFiles: ["apps/ego-api/src/server.ts", "packages/agent/src/coding-agent.ts"],
      decisions: ["Use Hermes as the internal event bus"],
      todos: ["Add plan approval endpoint"],
      risks: ["Model output may request forbidden paths"],
      maxChars: 500,
    });

    expect(summary).toContain("Goal: Generate an approvable patch");
    expect(summary).toContain("No file writes before approval");
    expect(summary).toContain("apps/ego-api/src/server.ts");
    expect(summary).toContain("Use Hermes as the internal event bus");
    expect(summary.length).toBeLessThanOrEqual(500);
  });
});
