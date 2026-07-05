import { basename, dirname } from "node:path";
import type { RepoIndex } from "./repo-index.js";

export type TestMapping = {
  sourceToTests: Array<{ source: string; tests: string[]; reason: string }>;
  testToSources: Array<{ test: string; sources: string[]; reason: string }>;
};

export function buildTestMapping(repoIndex: RepoIndex): TestMapping {
  const sources = repoIndex.files.filter((file) => file.kind === "source");
  const tests = repoIndex.files.filter((file) => file.kind === "test");
  const sourceToTests = sources.map((source) => ({
    source: source.path,
    tests: likelyTests(
      source.path,
      tests.map((test) => test.path),
    ),
    reason: "Matched by basename, directory proximity, or package path.",
  }));
  const testToSources = tests.map((test) => ({
    test: test.path,
    sources: likelySources(
      test.path,
      sources.map((source) => source.path),
    ),
    reason: "Matched by basename, directory proximity, or package path.",
  }));
  return { sourceToTests, testToSources };
}

function likelyTests(source: string, tests: string[]): string[] {
  const stem = stripKnownExtensions(basename(source));
  const dir = dirname(source).replace(/\/src$/, "");
  return tests
    .map((test) => ({
      test,
      score:
        (test.includes(stem) ? 5 : 0) +
        (dirname(test).includes(dir) || dir.includes(dirname(test)) ? 3 : 0) +
        (sameTopLevel(source, test) ? 2 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.test);
}

function likelySources(test: string, sources: string[]): string[] {
  const stem = stripKnownExtensions(basename(test).replace(/\.(test|spec)$/i, ""));
  return sources
    .map((source) => ({
      source,
      score:
        (source.includes(stem) ? 5 : 0) +
        (sameTopLevel(source, test) ? 2 : 0) +
        (dirname(test).includes(dirname(source).replace(/\/src$/, "")) ? 2 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.source);
}

function sameTopLevel(a: string, b: string): boolean {
  return a.split("/")[0] === b.split("/")[0] && a.split("/")[1] === b.split("/")[1];
}

function stripKnownExtensions(name: string): string {
  return name.replace(/\.(test|spec)?\.?[cm]?[jt]sx?$/i, "");
}
