import type { AgentRunEvent } from "@ego-graph/agent-harness";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { renderEventLines } from "./tui-events.js";

export function ConversationView({
  events,
  width,
  height,
  scrollOffset,
  debug,
  replayMode,
}: {
  events: AgentRunEvent[];
  width: number;
  height: number;
  scrollOffset: number;
  debug: boolean;
  replayMode: boolean;
}): ReactElement {
  const rendered = events.flatMap((event) => renderEventLines(event, { width: width - 2, debug }));
  const visibleCount = Math.max(4, height - 1);
  const end = Math.max(0, rendered.length - scrollOffset);
  const start = Math.max(0, end - visibleCount);
  const visible = rendered.slice(start, end);

  return (
    <Box flexDirection="column" paddingX={1} height={height}>
      {replayMode ? <Text color="yellow">read-only replay mode</Text> : null}
      {visible.map((line, index) => (
        <Text key={`${start}-${index}`}>{line}</Text>
      ))}
      {scrollOffset > 0 ? (
        <Text color="gray">Scrolled {scrollOffset}; PageDown returns.</Text>
      ) : null}
    </Box>
  );
}
