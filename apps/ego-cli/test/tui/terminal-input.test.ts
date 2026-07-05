import { describe, expect, it } from "vitest";
import {
  normalizeTerminalInput,
  parseMouseWheel,
  shouldEnableMouseTracking,
} from "../../src/tui/terminal-input.js";

describe("terminal input normalization", () => {
  it("maps backspace bytes to delete-before", () => {
    expect(normalizeTerminalInput("\x7f")).toEqual([
      { type: "prompt-edit", edit: "delete-before" },
    ]);
    expect(normalizeTerminalInput("\b")).toEqual([{ type: "prompt-edit", edit: "delete-before" }]);
  });

  it("maps the terminal Delete escape sequence to delete-after", () => {
    expect(normalizeTerminalInput("\x1b[3~")).toEqual([
      { type: "prompt-edit", edit: "delete-after" },
    ]);
  });

  it("maps Ctrl+O to the thinking details toggle", () => {
    expect(normalizeTerminalInput("\x0f")).toEqual([{ type: "toggle-thinking" }]);
  });

  it("parses SGR mouse wheel events", () => {
    expect(parseMouseWheel("\x1b[<64;20;12M")).toBe("up");
    expect(parseMouseWheel("\x1b[<65;20;12M")).toBe("down");
    expect(normalizeTerminalInput("\x1b[<64;20;12M")).toEqual([{ type: "scroll", delta: 5 }]);
    expect(normalizeTerminalInput("\x1b[<65;20;12M")).toEqual([{ type: "scroll", delta: -5 }]);
  });

  it("ignores SGR mouse clicks instead of treating them as Escape", () => {
    expect(normalizeTerminalInput("\x1b[<0;20;12M")).toEqual([]);
    expect(normalizeTerminalInput("\x1b[<0;20;12m")).toEqual([]);
  });

  it("extracts wheel events from mixed terminal input chunks", () => {
    expect(normalizeTerminalInput("\x1b[<0;20;12M\x1b[<64;20;12M")).toEqual([
      { type: "scroll", delta: 5 },
    ]);
  });

  it("keeps native terminal scrollback unless mouse capture is explicitly requested", () => {
    expect(shouldEnableMouseTracking()).toBe(false);
    expect(shouldEnableMouseTracking({ captureMouse: false })).toBe(false);
    expect(shouldEnableMouseTracking({ captureMouse: true })).toBe(true);
  });

  it("ignores legacy X10 mouse clicks instead of treating them as Escape", () => {
    expect(normalizeTerminalInput("\x1b[M !!")).toEqual([]);
  });
});
