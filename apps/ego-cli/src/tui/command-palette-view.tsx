/** @jsxImportSource @opentui/solid */
import type { JSX } from "solid-js";
import {
  getCommandAvailability,
  type CommandAvailabilityContext,
  type CommandPaletteState,
} from "./command-palette.js";
import { truncateDisplay } from "./cjk.js";

export function CommandPaletteView({
  state,
  width,
  activeRun,
}: {
  state: CommandPaletteState;
  width: number;
  activeRun?: CommandAvailabilityContext["activeRun"];
}): JSX.Element | null {
  if (!state.open) return null;
  const panelWidth = Math.max(42, Math.min(width - 4, 96));
  return (
    <box width={panelWidth} flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text>Command Palette</text>
      <text>query {state.query || "/"} · Tab/Arrow select · Enter run · Esc close</text>
      {state.matches.length === 0 ? <text>No command matched.</text> : null}
      {state.matches.slice(0, 10).map((command, index) => {
        const availability = getCommandAvailability(command, { activeRun });
        const unavailable = !availability.available;
        return (
          <text>
            {index === state.selectedIndex ? "❯ " : "  "}
            {truncateDisplay(command.name, 22)} {truncateDisplay(command.category, 12)}{" "}
            {truncateDisplay(
              unavailable
                ? `${command.description} · ${availability.reason ?? "unavailable"}`
                : command.description,
              Math.max(10, panelWidth - 46),
            )}
          </text>
        );
      })}
    </box>
  );
}
