import { describe, expect, it } from "vitest";
import {
  closeCommandPalette,
  createCommandPaletteState,
  getCommandAvailability,
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
    expect(getCommandPaletteMatches("/think").map((command) => command.name)).toContain(
      "/thinking",
    );
  });

  it("exposes run control and policy commands", () => {
    expect(getCommandPaletteMatches("/cancel").map((command) => command.name)).toContain(
      "/cancel",
    );
    expect(getCommandPaletteMatches("/btw").map((command) => command.name)).toContain("/btw");
    expect(getCommandPaletteMatches("/policy").map((command) => command.name)).toEqual(
      expect.arrayContaining(["/policy", "/policy set"]),
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

  it("marks run-scoped commands unavailable without an active run", () => {
    const command = getCommandPaletteMatches("/plan approve")[0];

    expect(command?.name).toBe("/plan approve");
    expect(getCommandAvailability(command!, {})).toEqual({
      available: false,
      reason: "needs an active run",
    });
  });

  it("allows plan approval only while a plan is pending", () => {
    const command = getCommandPaletteMatches("/plan approve")[0]!;

    expect(
      getCommandAvailability(command, {
        activeRun: { status: "patch_pending", phase: "waiting_patch_approval" },
      }),
    ).toEqual({
      available: false,
      reason: "current run is not waiting for plan approval",
    });
    expect(
      getCommandAvailability(command, {
        activeRun: { status: "plan_pending", phase: "waiting_plan_approval" },
      }),
    ).toEqual({ available: true });
  });

  it("allows patch approval only while a patch is pending", () => {
    const command = getCommandPaletteMatches("/patch approve")[0]!;

    expect(
      getCommandAvailability(command, {
        activeRun: { status: "plan_pending", phase: "waiting_plan_approval" },
      }),
    ).toEqual({
      available: false,
      reason: "current run is not waiting for patch approval",
    });
    expect(
      getCommandAvailability(command, {
        activeRun: { status: "patch_pending", phase: "waiting_patch_approval", diff: "--- a/a.ts" },
      }),
    ).toEqual({ available: true });
  });

  it("requires available diff and checks before opening focused overlays", () => {
    const diff = getCommandPaletteMatches("/diff")[0]!;
    const checks = getCommandPaletteMatches("/checks")[0]!;

    expect(
      getCommandAvailability(diff, {
        activeRun: { status: "patch_pending", phase: "diff_preview" },
      }),
    ).toEqual({
      available: false,
      reason: "current run has no diff yet",
    });
    expect(
      getCommandAvailability(checks, {
        activeRun: { status: "applied", phase: "checking", checks: [] },
      }),
    ).toEqual({
      available: false,
      reason: "current run has no checks yet",
    });
  });
});
