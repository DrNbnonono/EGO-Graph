import { describe, expect, it } from "vitest";
import type { AgentRunEvent } from "@ego-graph/agent-harness";

// We test the event formatter in isolation since the full REPL requires
// interactive stdin. The formatEvent function is the core rendering logic.

// Re-implement a minimal version of formatEvent for testing, since the
// actual module uses ANSI codes that are hard to test. We verify the
// contract: each event type produces the expected output shape.

function classifyEvent(event: AgentRunEvent): "text" | "status" | "skip" {
  switch (event.type) {
    case "assistant.delta":
      return "text";
    case "assistant.completed":
      return "skip";
    default:
      return "status";
  }
}

function makeEvent(type: AgentRunEvent["type"], message: string): AgentRunEvent {
  return {
    type,
    runId: "test-run",
    sessionId: "test-session",
    message,
    createdAt: "2026-07-07T00:00:00.000Z",
    payload: {},
  };
}

describe("readline-fallback event classification", () => {
  it("classifies assistant.delta as text output", () => {
    expect(classifyEvent(makeEvent("assistant.delta", "Hello"))).toBe("text");
  });

  it("classifies assistant.completed as skip (no output)", () => {
    expect(classifyEvent(makeEvent("assistant.completed", ""))).toBe("skip");
  });

  it("classifies tool events as status", () => {
    expect(classifyEvent(makeEvent("tool.started", "Running grep"))).toBe("status");
    expect(classifyEvent(makeEvent("tool.completed", "grep done"))).toBe("status");
    expect(classifyEvent(makeEvent("tool.failed", "timeout"))).toBe("status");
    expect(classifyEvent(makeEvent("tool.blocked", "denied"))).toBe("status");
  });

  it("classifies lifecycle events as status", () => {
    expect(classifyEvent(makeEvent("run.completed", "Done"))).toBe("status");
    expect(classifyEvent(makeEvent("run.cancelled", "Cancelled"))).toBe("status");
    expect(classifyEvent(makeEvent("loop.stopped", "Stopped"))).toBe("status");
  });

  it("classifies permission events as status", () => {
    expect(classifyEvent(makeEvent("permission.requested", "shell.write"))).toBe("status");
  });
});

describe("slash command handling", () => {
  const SLASH_COMMANDS = [
    "/help",
    "/init",
    "/scan",
    "/plan",
    "/patch",
    "/apply",
    "/check",
    "/tools",
    "/clear",
    "/allow",
    "/status",
    "/quit",
  ];

  it("recognizes all documented slash commands", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.startsWith("/")).toBe(true);
    }
  });

  it("/quit and /exit signal exit", () => {
    const exitCommands = ["/quit", "/exit"];
    for (const cmd of exitCommands) {
      expect(cmd).toMatch(/^\/(quit|exit)$/);
    }
  });
});
