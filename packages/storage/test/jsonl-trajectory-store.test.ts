import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTrajectoryEvent } from "@ego-graph/core";
import { describe, expect, it } from "vitest";
import { JsonlTrajectoryStore } from "../src/jsonl-trajectory-store.js";

describe("JsonlTrajectoryStore", () => {
  it("appends and replays trajectory events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-trajectory-"));
    try {
      const store = new JsonlTrajectoryStore(dir);
      const event = createTrajectoryEvent("run-test-001", "task.parsed", "Task parsed", {
        scenario: "web_pentest",
      });

      await store.append(event);
      const events = await store.readRun("run-test-001");
      const raw = await readFile(join(dir, "run-test-001.jsonl"), "utf8");

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("task.parsed");
      expect(raw.trim()).toContain("Task parsed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
