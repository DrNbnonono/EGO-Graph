import { describe, expect, it } from "vitest";
import { createMemoryService, summarizeContext } from "../src/index.js";

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
