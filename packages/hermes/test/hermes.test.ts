import { describe, expect, it } from "vitest";
import { createHermes } from "../src/index.js";

describe("Hermes event bus", () => {
  it("emits, filters, and replays timeline events", () => {
    const hermes = createHermes();
    const seen: string[] = [];
    const unsubscribe = hermes.subscribe(
      { sessionId: "session-1", type: "memory.written" },
      (event) => seen.push(event.id),
    );

    const ignored = hermes.emit({
      type: "message.received",
      sessionId: "session-1",
      source: "test",
      payload: { message: "hello" },
    });
    const captured = hermes.emit({
      type: "memory.written",
      sessionId: "session-1",
      runId: "run-1",
      source: "test",
      payload: { memoryId: "memory-1" },
    });

    expect(ignored.id).toMatch(/^hermes-/);
    expect(captured.createdAt).toMatch(/T/);
    expect(seen).toEqual([captured.id]);
    expect(hermes.getTimeline("session-1").map((event) => event.id)).toEqual([
      ignored.id,
      captured.id,
    ]);
    expect(hermes.replay("run-1").map((event) => event.type)).toEqual(["memory.written"]);

    unsubscribe();
    hermes.emit({
      type: "memory.written",
      sessionId: "session-1",
      source: "test",
      payload: {},
    });

    expect(seen).toEqual([captured.id]);
  });
});
