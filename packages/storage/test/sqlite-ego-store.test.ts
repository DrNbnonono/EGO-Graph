import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createTrajectoryEvent} from "@ego-graph/core";
import {describe, expect, it} from "vitest";
import {SqliteEgoStore} from "../src/index.js";

describe("SqliteEgoStore", () => {
  it("stores runs, events, evidence, and reports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-sqlite-"));
    try {
      const store = new SqliteEgoStore(join(dir, "ego.sqlite"));
      const evidence = createTrajectoryEvent("run-sqlite-001", "evidence.created", "Finding", {
        source: "fixture.read",
        raw: {ok: true},
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
      await rm(dir, {recursive: true, force: true});
    }
  });
});
