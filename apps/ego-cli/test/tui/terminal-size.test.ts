import { describe, expect, it } from "vitest";
import { calculateBodyHeight, createTerminalSize } from "../../src/tui/terminal-size.js";

describe("terminal sizing", () => {
  it("normalizes stdout dimensions with safe minimums", () => {
    expect(createTerminalSize({ columns: 120, rows: 40 })).toEqual({ columns: 120, rows: 40 });
    expect(createTerminalSize({ columns: 20, rows: 10 })).toEqual({ columns: 60, rows: 24 });
  });

  it("calculates body height from dynamic chrome heights", () => {
    expect(
      calculateBodyHeight({
        terminalRows: 36,
        statusHeight: 1,
        paletteHeight: 8,
        promptHeight: 4,
      }),
    ).toBe(23);
  });
});
