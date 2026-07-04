import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type LoadAgentSystemPromptInput = {
  workspaceRoot: string;
  memoryHints?: string[];
  skills?: string[];
  mcpTools?: string[];
};

export type AgentSystemPrompt = {
  defaultPrompt: string;
  projectPrompt: string;
  finalPrompt: string;
  path: string;
  summary: string;
};

export type SaveProjectSystemPromptInput = {
  workspaceRoot: string;
  content: string;
};

export type SaveProjectSystemPromptResult = {
  path: string;
  content: string;
};

const DEFAULT_AGENT_SYSTEM_PROMPT = [
  "You are Lotus, the EGO-Graph agent kernel.",
  "EGO-Graph is a local, auditable cybersecurity and coding agent workbench.",
  "Answer in Chinese unless the user explicitly asks for another language.",
  "Show auditable reasoning summaries, plan steps, tool events, and check results, but never expose hidden chain-of-thought.",
  "Treat file writes as controlled operations: plan first, preview diffs, wait for approval, then run checks and record the audit trail.",
  "For cybersecurity tasks, only assist within clearly authorized scope and prefer evidence-driven, defensive guidance.",
].join("\n");

export async function loadAgentSystemPrompt(
  input: LoadAgentSystemPromptInput,
): Promise<AgentSystemPrompt> {
  const path = systemPromptPath(input.workspaceRoot);
  const projectPrompt = await tryReadText(path);
  const sections = [
    ["Default EGO-Graph System Prompt", DEFAULT_AGENT_SYSTEM_PROMPT],
    ["Project System Prompt", projectPrompt || "(none)"],
    ["Memory Hints", formatList(input.memoryHints)],
    ["Available Skills", formatInline(input.skills)],
    ["Available MCP Tools", formatInline(input.mcpTools)],
  ];

  return {
    defaultPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
    projectPrompt,
    finalPrompt: sections
      .map(([title, content]) => `## ${title}\n${content}`)
      .join("\n\n")
      .trim(),
    path,
    summary: projectPrompt
      ? "System Prompt includes default policy and project prompt."
      : "System Prompt uses default EGO-Graph policy.",
  };
}

export async function saveProjectSystemPrompt(
  input: SaveProjectSystemPromptInput,
): Promise<SaveProjectSystemPromptResult> {
  const path = systemPromptPath(input.workspaceRoot);
  await mkdir(join(input.workspaceRoot, ".ego"), { recursive: true });
  await writeFile(path, input.content, "utf8");
  return { path, content: input.content };
}

export function systemPromptPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".ego", "system-prompt.md");
}

async function tryReadText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function formatList(items: string[] | undefined): string {
  if (!items || items.length === 0) {
    return "(none)";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function formatInline(items: string[] | undefined): string {
  if (!items || items.length === 0) {
    return "(none)";
  }
  return items.join(", ");
}
