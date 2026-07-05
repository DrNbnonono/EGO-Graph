import { describe, expect, it } from "vitest";
import {
  getDiffFileStats,
  getVisibleDiffLines,
  resolveDiffFileIndex,
  splitDiffByFile,
} from "../../src/tui/diff-view.js";

const sampleDiff = [
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@",
  "-old",
  "+new",
  " context",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@",
  "+created",
  "+more",
  "",
].join("\n");

describe("diff view helpers", () => {
  it("splits diff by file and counts additions/deletions", () => {
    const files = splitDiffByFile(sampleDiff);

    expect(files.map((file) => file.header)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(getDiffFileStats(files[0]!.lines)).toEqual({ additions: 1, deletions: 1 });
    expect(getDiffFileStats(files[1]!.lines)).toEqual({ additions: 2, deletions: 0 });
  });

  it("resolves file navigation without exceeding bounds", () => {
    expect(resolveDiffFileIndex("/diff next", 0, 2)).toBe(1);
    expect(resolveDiffFileIndex("/diff next", 1, 2)).toBe(1);
    expect(resolveDiffFileIndex("/diff prev", 0, 2)).toBe(0);
    expect(resolveDiffFileIndex("/diff 2", 0, 2)).toBe(1);
  });

  it("returns visible diff lines using scroll offset", () => {
    const lines = splitDiffByFile(sampleDiff)[0]!.lines;

    expect(getVisibleDiffLines(lines, 0, 3)).toEqual(["--- a/src/a.ts", "+++ b/src/a.ts", "@@"]);
    expect(getVisibleDiffLines(lines, 2, 3)).toEqual(["@@", "-old", "+new"]);
    expect(getVisibleDiffLines(lines, 99, 3)).toEqual(["-old", "+new", " context"]);
  });
});
