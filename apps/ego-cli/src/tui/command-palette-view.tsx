import { Box, Text } from "ink";
import React from "react";
import type { ReactElement } from "react";
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
}): ReactElement | null {
  if (!state.open) {
    return null;
  }
  const panelWidth = Math.max(42, Math.min(width - 4, 96));
  return (
    <Box
      borderStyle="round"
      borderColor="magenta"
      width={panelWidth}
      flexDirection="column"
      paddingX={1}
    >
      <Text color="magentaBright">Command Palette</Text>
      <Text color="gray">
        query {state.query || "/"} · Tab/Arrow select · Enter run · Esc close
      </Text>
      {state.matches.length === 0 ? <Text color="gray">No command matched.</Text> : null}
      {state.matches.slice(0, 10).map((command, index) => {
        const availability = getCommandAvailability(command, { activeRun });
        const unavailable = !availability.available;
        return (
          <Text
            key={command.name}
            color={unavailable ? "gray" : index === state.selectedIndex ? "magentaBright" : "white"}
          >
            {index === state.selectedIndex ? "❯ " : "  "}
            {truncateDisplay(command.name, 22)} {truncateDisplay(command.category, 12)}{" "}
            {truncateDisplay(
              unavailable
                ? `${command.description} · ${availability.reason ?? "unavailable"}`
                : command.description,
              Math.max(10, panelWidth - 46),
            )}
          </Text>
        );
      })}
    </Box>
  );
}
