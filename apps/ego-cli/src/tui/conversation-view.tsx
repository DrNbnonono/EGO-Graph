import type { AgentRunEvent } from "@ego-graph/agent-harness";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { renderConversationLines } from "./tui-events.js";

export type ConversationWindowInput = {
  events: AgentRunEvent[];
  width: number;
  height: number;
  scrollOffset: number;
  debug: boolean;
  thinkingExpanded: boolean;
  replayMode: boolean;
};

export type ConversationWindow = {
  visibleLines: string[];
  totalLines: number;
  maxScroll: number;
  scrollOffset: number;
};

export function isUserPromptLine(line: string): boolean {
  return line.startsWith("❯ ");
}

export function preserveScrollOffsetOnAppend({
  currentOffset,
  previousTotal,
  nextTotal,
}: {
  currentOffset: number;
  previousTotal: number;
  nextTotal: number;
}): number {
  if (currentOffset <= 0 || nextTotal <= previousTotal) {
    return currentOffset;
  }
  return currentOffset + (nextTotal - previousTotal);
}

export function createConversationWindow(input: ConversationWindowInput): ConversationWindow {
  const rendered = renderConversationLines(input.events, {
    width: input.width - 2,
    debug: input.debug,
    thinkingExpanded: input.thinkingExpanded,
  });
  const allLines = input.replayMode ? ["read-only replay mode", ...rendered] : rendered;
  const visibleCount = Math.max(4, input.height - 1);
  const maxScroll = Math.max(0, allLines.length - visibleCount);
  const scrollOffset = Math.min(Math.max(0, input.scrollOffset), maxScroll);
  const end = Math.max(0, allLines.length - scrollOffset);
  const start = Math.max(0, end - visibleCount);

  return {
    visibleLines: allLines.slice(start, end),
    totalLines: allLines.length,
    maxScroll,
    scrollOffset,
  };
}

export function ConversationView({
  events,
  width,
  height,
  scrollOffset,
  debug,
  thinkingExpanded,
  replayMode,
}: {
  events: AgentRunEvent[];
  width: number;
  height: number;
  scrollOffset: number;
  debug: boolean;
  thinkingExpanded: boolean;
  replayMode: boolean;
}): ReactElement {
  const window = createConversationWindow({
    events,
    width,
    height,
    scrollOffset,
    debug,
    thinkingExpanded,
    replayMode,
  });

  return (
    <Box flexDirection="column" paddingX={1} height={height}>
      {window.visibleLines.map((line, index) =>
        isUserPromptLine(line) ? (
          <Text key={`${window.scrollOffset}-${index}`} backgroundColor="black" color="white">
            {line}
          </Text>
        ) : (
          <Text key={`${window.scrollOffset}-${index}`}>{line}</Text>
        ),
      )}
      {window.maxScroll > 0 ? (
        <Text color="gray">
          {window.scrollOffset > 0
            ? `Viewing earlier output ${window.scrollOffset}/${window.maxScroll} · wheel/PageDown returns`
            : "Wheel/PageUp to review earlier output"}
        </Text>
      ) : null}
    </Box>
  );
}
