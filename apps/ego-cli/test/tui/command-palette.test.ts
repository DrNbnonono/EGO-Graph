import { describe, expect, it } from "vitest";
import {
  closeCommandPalette,
  createCommandPaletteState,
  getCommandPaletteMatches,
  moveCommandPaletteSelection,
  selectCommandPalette,
} from "../../src/tui/command-palette.js";

describe("command palette", () => {
  it("opens on slash and filters plan commands", () => {
    const state = createCommandPaletteState("/");
    const filtered = getCommandPaletteMatches("/pl");

    expect(state.open).toBe(true);
    expect(filtered.map((command) => command.name)).toEqual(
      expect.arrayContaining(["/plan", "/plan approve", "/plan reject"]),
    );
  });

  it("moves selection with arrow-like deltas and tab-like next", () => {
    const state = createCommandPaletteState("/m");
    const moved = moveCommandPaletteSelection(state, 1);

    expect(moved.selectedIndex).toBe(1);
    expect(moveCommandPaletteSelection(moved, -1).selectedIndex).toBe(0);
  });

  it("executes selected command only after explicit selection", () => {
    const state = createCommandPaletteState("/");

    expect(selectCommandPalette(state)).toBe("/help");
    expect(closeCommandPalette(state).open).toBe(false);
  });
});
