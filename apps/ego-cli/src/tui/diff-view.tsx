import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export function splitDiffByFile(diff: string): Array<{ header: string; lines: string[] }> {
  const lines = diff.split("\n");
  const files: Array<{ header: string; lines: string[] }> = [];
  let current: { header: string; lines: string[] } | undefined;
  for (const line of lines) {
    if (line.startsWith("--- a/")) {
      if (current) {
        files.push(current);
      }
      current = { header: line.replace("--- a/", ""), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { header: "diff", lines: [line] };
    }
  }
  if (current) {
    files.push(current);
  }
  return files.length > 0 ? files : [{ header: "diff", lines }];
}

export function resolveDiffFileIndex(command: string, current: number, fileCount: number): number {
  const maxIndex = Math.max(0, fileCount - 1);
  const normalized = command.trim().toLowerCase();
  if (normalized === "/diff next") {
    return Math.min(current + 1, maxIndex);
  }
  if (normalized === "/diff prev") {
    return Math.max(current - 1, 0);
  }
  if (normalized === "/diff first") {
    return 0;
  }
  if (normalized === "/diff last") {
    return maxIndex;
  }
  const page = Number(normalized.replace("/diff", "").trim());
  return Number.isInteger(page) && page > 0 ? Math.min(page - 1, maxIndex) : current;
}

export function DiffView({
  diff,
  fileIndex,
  width,
  height,
}: {
  diff: string | undefined;
  fileIndex: number;
  width: number;
  height: number;
}): ReactElement {
  if (!diff) {
    return <Text color="gray">No pending diff.</Text>;
  }
  const files = splitDiffByFile(diff);
  const safeIndex = Math.min(fileIndex, Math.max(0, files.length - 1));
  const file = files[safeIndex] ?? { header: "diff", lines: diff.split("\n") };
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="yellow">
        Diff {safeIndex + 1}/{files.length} -{" "}
        {truncateDisplay(file.header, Math.max(12, width - 18))}
      </Text>
      {file.lines.slice(0, Math.max(4, height - 3)).map((line, index) => {
        const color = diffLineColor(line);
        const text = truncateDisplay(line || " ", Math.max(10, width - 2));
        return color ? (
          <Text key={`${safeIndex}-${index}`} color={color}>
            {text}
          </Text>
        ) : (
          <Text key={`${safeIndex}-${index}`}>{text}</Text>
        );
      })}
      <Text color="gray">n/p or /diff next|prev - /patch approve - /patch reject</Text>
    </Box>
  );
}

function diffLineColor(line: string): "green" | "red" | "cyan" | "gray" | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "green";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "red";
  }
  if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) {
    return "cyan";
  }
  if (!line.trim()) {
    return "gray";
  }
  return undefined;
}
