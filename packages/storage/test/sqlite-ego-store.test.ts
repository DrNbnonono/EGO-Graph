import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTrajectoryEvent } from "@ego-graph/core";
import { describe, expect, it } from "vitest";
import { SqliteEgoStore } from "../src/index.js";

describe("SqliteEgoStore", () => {
  it("stores runs, events, evidence, and reports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-sqlite-"));
    try {
      const store = new SqliteEgoStore(join(dir, "ego.sqlite"));
      const evidence = createTrajectoryEvent("run-sqlite-001", "evidence.created", "Finding", {
        source: "fixture.read",
        raw: { ok: true },
      });

      await store.upsertRun({
        runId: "run-sqlite-001",
        scenario: "web_pentest",
        status: "complete",
        eventCount: 1,
        reportPath: join(dir, "report.md"),
        updatedAt: "2026-07-03T00:00:00.000Z",
      });
      await store.append(evidence);
      await store.saveReport({
        runId: "run-sqlite-001",
        markdown: "# Report",
        reportPath: join(dir, "report.md"),
        createdAt: "2026-07-03T00:00:00.000Z",
      });

      expect(await store.getRun("run-sqlite-001")).toMatchObject({
        runId: "run-sqlite-001",
        scenario: "web_pentest",
      });
      expect((await store.readRun("run-sqlite-001"))[0]?.type).toBe("evidence.created");
      expect((await store.listEvidence("run-sqlite-001"))[0]?.summary).toBe("Finding");
      expect((await store.getReport("run-sqlite-001"))?.markdown).toBe("# Report");
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists memory v2 fields, archives, and forgets without leaking raw secrets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-sqlite-memory-"));
    let store: SqliteEgoStore | undefined;
    try {
      store = new SqliteEgoStore(join(dir, "ego.sqlite"));
      await store.saveMemory({
        id: "memory-v2-1",
        scope: "project",
        kind: "decision",
        content: "Prefer Codex-like terminal harness.",
        summary: "Prefer Codex-like terminal harness.",
        rawContent: "The approved decision came from the architecture review.",
        source: "test",
        sourceRunId: "run-memory-1",
        evidenceRefs: ["docs/agent-kernel.md"],
        tags: ["agent"],
        references: ["docs/agent-kernel.md"],
        importance: 5,
        confidence: 0.9,
        status: "active",
        expiresAt: "2026-12-31T00:00:00.000Z",
        lastAccessedAt: "2026-07-05T00:00:00.000Z",
        accessCount: 3,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      });

      const [stored] = await store.listMemories({ scope: "project" });
      expect(stored).toMatchObject({
        id: "memory-v2-1",
        kind: "decision",
        summary: "Prefer Codex-like terminal harness.",
        rawContent: "The approved decision came from the architecture review.",
        sourceRunId: "run-memory-1",
        evidenceRefs: ["docs/agent-kernel.md"],
        importance: 5,
        confidence: 0.9,
        expiresAt: "2026-12-31T00:00:00.000Z",
        accessCount: 3,
      });

      expect(await store.archiveMemory("memory-v2-1", "2026-07-06T00:00:00.000Z")).toBe(true);
      expect(await store.listMemories({ scope: "project" })).toEqual([]);
      expect(await store.listMemories({ scope: "project", status: "archived" })).toHaveLength(1);

      expect(await store.forgetMemory("memory-v2-1", "2026-07-07T00:00:00.000Z")).toBe(true);
      const forgotten = await store.listMemories({ scope: "project", status: "forgotten" });
      expect(forgotten[0]).toMatchObject({
        id: "memory-v2-1",
        status: "forgotten",
        rawContent: "",
        content: "",
        summary: "Memory forgotten by user request.",
      });
    } finally {
      store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores and recalls token-bounded conversation history", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-sqlite-conversation-"));
    let store: SqliteEgoStore | undefined;
    try {
      store = new SqliteEgoStore(join(dir, "ego.sqlite"));
      await store.appendMessage({
        id: "msg-1",
        sessionId: "session-1",
        role: "system",
        contentJson: JSON.stringify("system prompt"),
        tokenCount: 1000,
        createdAt: "2026-07-05T00:00:00.000Z",
      });
      await store.appendMessage({
        id: "msg-2",
        sessionId: "session-1",
        runId: "run-1",
        role: "user",
        contentJson: JSON.stringify("first question"),
        tokenCount: 4,
        createdAt: "2026-07-05T00:00:01.000Z",
      });
      await store.appendMessage({
        id: "msg-3",
        sessionId: "session-1",
        role: "assistant",
        contentJson: JSON.stringify([
          { type: "text", text: "I will inspect it." },
          {
            type: "tool_use",
            id: "call-1",
            name: "workspace.read",
            input: { path: "README.md" },
          },
        ]),
        toolCallId: "call-1",
        toolName: "workspace.read",
        tokenCount: 8,
        createdAt: "2026-07-05T00:00:02.000Z",
      });
      await store.appendMessage({
        id: "msg-4",
        sessionId: "session-1",
        role: "tool",
        contentJson: JSON.stringify([
          { type: "tool_result", toolUseId: "call-1", content: "README body" },
        ]),
        toolCallId: "call-1",
        toolName: "workspace.read",
        tokenCount: 6,
        createdAt: "2026-07-05T00:00:03.000Z",
      });

      expect((await store.listMessages("session-1")).map((message) => message.id)).toEqual([
        "msg-1",
        "msg-2",
        "msg-3",
        "msg-4",
      ]);
      expect(
        (await store.listMessages("session-1", { beforeId: "msg-4", limit: 2 })).map(
          (message) => message.id,
        ),
      ).toEqual(["msg-2", "msg-3"]);

      const recalled = await store.recallForPrompt("session-1", 14);
      expect(recalled.map((message) => message.id)).toEqual(["msg-1", "msg-3", "msg-4"]);
      expect(recalled[1]).toMatchObject({
        role: "assistant",
        toolCallId: "call-1",
        toolName: "workspace.read",
      });

      await store.clearSession("session-1");
      expect(await store.listMessages("session-1")).toEqual([]);
    } finally {
      store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
