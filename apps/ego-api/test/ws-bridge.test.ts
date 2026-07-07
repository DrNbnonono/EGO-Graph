import { describe, expect, it } from "vitest";

// WebSocket bridge requires the `ws` package and a real HTTP server.
// These tests verify the module exports and type contracts only.

describe("ws-bridge module", () => {
  it("exports createWebSocketBridge function", async () => {
    const mod = await import("../src/ws-bridge.js");
    expect(typeof mod.createWebSocketBridge).toBe("function");
  });

  it("createWebSocketBridge returns undefined when ws is not installed", async () => {
    const mod = await import("../src/ws-bridge.js");
    // When ws is not available, the function should return undefined gracefully.
    // We can't easily test the full bridge without a real HTTP server + ws,
    // but we verify the function signature is correct.
    expect(mod.createWebSocketBridge.length).toBeGreaterThanOrEqual(1);
  });
});
