import type { RunIndexRecord } from "@ego-graph/storage";
import { Box, Text } from "ink";
import React from "react";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export type HistoryRunRecord = Pick<
  RunIndexRecord,
  "runId" | "scenario" | "status" | "eventCount" | "updatedAt"
>;

export type HistoryItem = {
  index: number;
  runId: string;
  title: string;
  status: string;
  phase: string;
  eventCount: number;
  timeLabel: string;
};

export function createHistoryItems(runs: HistoryRunRecord[]): HistoryItem[] {
  return runs.slice(0, 20).map((run, offset) => ({
    index: offset + 1,
    runId: run.runId,
    title: run.scenario,
    status: run.status,
    phase: run.status,
    eventCount: run.eventCount,
    timeLabel: formatHistoryTime(run.updatedAt),
  }));
}

export function resolveHistoryReference(
  reference: string,
  history: HistoryItem[],
): string | undefined {
  const trimmed = reference.trim();
  const index = Number(trimmed);
  if (Number.isInteger(index) && index > 0) {
    return history[index - 1]?.runId;
  }
  return history.find((item) => item.runId === trimmed)?.runId ?? (trimmed ? trimmed : undefined);
}

export function HistoryBrowser({
  items,
  selectedIndex,
  width,
}: {
  items: HistoryItem[];
  selectedIndex: number;
  width: number;
}): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="yellow">History - persisted runs</Text>
      {items.length === 0 ? <Text color="gray">No persisted runs yet.</Text> : null}
      {items.slice(0, 12).map((item, index) => (
        <Text key={item.runId} color={index === selectedIndex ? "magentaBright" : "white"}>
          {index === selectedIndex ? "> " : "  "}
          {item.index}. {truncateDisplay(item.timeLabel, 8)} {item.status} {item.eventCount}e{" "}
          {truncateDisplay(item.title, Math.max(12, width - 34))}
        </Text>
      ))}
      <Text color="gray">Enter replay /replay 1 /switch 1 Esc close</Text>
    </Box>
  );
}

function formatHistoryTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 8);
  }
  return parsed.toLocaleTimeString("zh-CN", { hour12: false });
}
