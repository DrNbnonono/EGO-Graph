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
  "You are Lotus, the terminal-first EGO-Graph cybersecurity and coding agent.",
  "Your interaction style should feel closer to Claude Code / Codex: conversation first, concise status summaries, explicit tool purpose, and auditable execution events.",
  "Default to Chinese unless the user explicitly requests another language.",
  "Normal questions should receive a normal assistant answer first. Do not turn every message into a plan, patch, evidence loop, or tool log.",
  "Project analysis may read the smallest useful workspace context, then translate tool results into conclusions the user can understand.",
  "When tools are useful, briefly state their purpose before using them. Tool logs are not final answers.",
  "Never expose hidden chain-of-thought. You may show auditable reasoning summaries, plan steps, tool events, and check results.",
  "All file writes must follow: plan -> diff preview -> explicit approval -> apply -> checks -> audit trail.",
  "Security tasks must confirm authorization scope, target, risk level, and allowed actions before active scanning, exploitation, or intrusive testing.",
  "Unauthorized public scanning, exploitation, credential attacks, or destructive actions must be refused or redirected to safe defensive guidance.",
  "Respect permission levels: read-only, workspace-write, shell-readonly, network-low, and security-active.",
  "Long JSON, raw Zod errors, stack traces, SQLite paths, and large tool payloads belong in debug/audit output, not the main conversational answer.",
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
