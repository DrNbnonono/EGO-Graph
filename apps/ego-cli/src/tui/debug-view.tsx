import type { AgentRunEvent } from "@ego-graph/agent-harness";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export function DebugView({
  events,
  width,
  height,
}: {
  events: AgentRunEvent[];
  width: number;
  height: number;
}): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="yellow">Debug events</Text>
      {events
        .slice(-Math.max(4, height - 3))
        .reverse()
        .map((event) => (
          <Text key={`${event.runId}-${event.createdAt}-${event.type}`} color="gray">
            {truncateDisplay(
              `${event.type} ${event.runId} ${JSON.stringify(event.payload)}`,
              Math.max(12, width - 2),
            )}
          </Text>
        ))}
    </Box>
  );
}
