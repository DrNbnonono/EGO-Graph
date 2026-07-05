import { createContextForTask, type TaskContext } from "@ego-graph/workspace";
import type { AgentCheckRecord } from "@ego-graph/storage";

export type FailureLocalization = {
  failedCommands: string[];
  likelyFiles: string[];
  likelyTests: string[];
  errorSummary: string[];
  context: Pick<
    TaskContext,
    "selectedFiles" | "selectedSymbols" | "relevantTests" | "snippets" | "budget"
  >;
};

export async function localizeCheckFailure(input: {
  workspaceRoot: string;
  goal: string;
  changedFiles: string[];
  failedChecks: AgentCheckRecord[];
}): Promise<FailureLocalization> {
  const errorSummary = input.failedChecks.flatMap((check) => summarizeCheckFailure(check));
  const referencedFiles = [...new Set(errorSummary.flatMap(extractFileReferences))];
  const changedFiles = [...new Set([...input.changedFiles, ...referencedFiles])];
  const context = await createContextForTask({
    workspaceRoot: input.workspaceRoot,
    goal: [input.goal, ...errorSummary].join("\n"),
    intent: "repair",
    changedFiles,
    tokenBudget: 8_000,
  });

  return {
    failedCommands: input.failedChecks.map((check) => check.command),
    likelyFiles: [
      ...new Set([...changedFiles, ...context.selectedFiles.slice(0, 8).map((file) => file.path)]),
    ].slice(0, 12),
    likelyTests: context.relevantTests.slice(0, 8),
    errorSummary,
    context: {
      selectedFiles: context.selectedFiles.slice(0, 8),
      selectedSymbols: context.selectedSymbols.slice(0, 40),
      relevantTests: context.relevantTests.slice(0, 8),
      snippets: context.snippets.slice(0, 6),
      budget: context.budget,
    },
  };
}

export function renderFailureLocalizationForPrompt(localization: FailureLocalization): string {
  return [
    "Failure localization:",
    `failedCommands=${localization.failedCommands.join(", ") || "(none)"}`,
    `likelyFiles=${localization.likelyFiles.join(", ") || "(none)"}`,
    `likelyTests=${localization.likelyTests.join(", ") || "(none)"}`,
    "Error summary:",
    localization.errorSummary.map((item) => `- ${item}`).join("\n") || "- (none)",
    "Relevant repair snippets:",
    localization.context.snippets
      .map(
        (snippet) =>
          `--- ${snippet.path} lines ${snippet.startLine}-${snippet.endLine} ---\n${snippet.content}`,
      )
      .join("\n\n") || "(none)",
  ].join("\n");
}

function summarizeCheckFailure(check: AgentCheckRecord): string[] {
  const lines = [check.stderr, check.stdout]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const important = lines.filter((line) =>
    /error|failed|cannot find|not assignable|expected|received|ts\d+|eslint|vitest/i.test(line),
  );
  return [
    `${check.name}: ${check.status} exit=${check.exitCode} command=${check.command}`,
    ...(important.length > 0 ? important : lines).slice(0, 12),
  ];
}

function extractFileReferences(line: string): string[] {
  const matches = [
    ...line.matchAll(
      /((?:apps|packages|docs|scripts|datasets|scenarios)\/[^\s:()]+?\.(?:ts|tsx|js|mjs|json|md|tsx?))/g,
    ),
  ];
  return matches.map((match) => match[1] ?? "").filter(Boolean);
}
