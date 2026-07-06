/** @jsxImportSource @opentui/solid */
import type { JSX } from "solid-js";
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

export function getDiffFileStats(lines: string[]): { additions: number; deletions: number } {
  return lines.reduce(
    (stats, line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        stats.additions += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        stats.deletions += 1;
      }
      return stats;
    },
    { additions: 0, deletions: 0 },
  );
}

export function getVisibleDiffLines(
  lines: string[],
  scrollOffset: number,
  height: number,
): string[] {
  const visibleHeight = Math.max(1, height);
  const maxOffset = Math.max(0, lines.length - visibleHeight);
  const safeOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
  return lines.slice(safeOffset, safeOffset + visibleHeight);
}

export function DiffView({
  diff,
  fileIndex,
  width,
  height,
  scrollOffset = 0,
}: {
  diff: string | undefined;
  fileIndex: number;
  width: number;
  height: number;
  scrollOffset?: number;
}): JSX.Element {
  if (!diff) {
    return <text fg="gray">No pending diff.</text>;
  }
  const files = splitDiffByFile(diff);
  const safeIndex = Math.min(fileIndex, Math.max(0, files.length - 1));
  const file = files[safeIndex] ?? { header: "diff", lines: diff.split("\n") };
  const stats = getDiffFileStats(file.lines);
  const wide = width >= 112 && files.length > 1;
  const listWidth = wide ? Math.min(34, Math.max(24, Math.floor(width * 0.28))) : 0;
  const diffWidth = wide ? width - listWidth - 4 : width;
  const visibleLines = getVisibleDiffLines(file.lines, scrollOffset, Math.max(4, height - 4));
  const diffPane = (
    <box flexDirection="column" paddingLeft={wide ? 0 : 1} paddingRight={wide ? 0 : 1} width={diffWidth}>
      <text fg="yellow">
        Diff {safeIndex + 1}/{files.length} -{" "}
        {truncateDisplay(file.header, Math.max(12, diffWidth - 30))}{" "}
        <text fg="green">+{stats.additions}</text> <text fg="red">-{stats.deletions}</text>
      </text>
      {visibleLines.map((line, index) => {
        const color = diffLineColor(line);
        const text = truncateDisplay(line || " ", Math.max(10, diffWidth - 2));
        return color ? (
          <text fg={color}>
            {text}
          </text>
        ) : (
          <text>{text}</text>
        );
      })}
      <text fg="gray">n/p file | PgUp/PgDn scroll | y approve patch | r reject patch</text>
    </box>
  );

  if (!wide) {
    return diffPane;
  }

  return (
    <box flexDirection="row" paddingLeft={1} paddingRight={1}>
      <box flexDirection="column" width={listWidth} paddingRight={1}>
        <text fg="yellow">Files</text>
        {files.slice(0, Math.max(4, height - 2)).map((candidate, index) => {
          const candidateStats = getDiffFileStats(candidate.lines);
          const prefix = index === safeIndex ? ">" : " ";
          return (
            <text fg={index === safeIndex ? "magentaBright" : "gray"}>
              {prefix} {truncateDisplay(candidate.header, Math.max(8, listWidth - 12))} +
              {candidateStats.additions} -{candidateStats.deletions}
            </text>
          );
        })}
      </box>
      {diffPane}
    </box>
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
