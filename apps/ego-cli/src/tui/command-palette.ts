import type { PermissionLevel, TerminalAgentRunState } from "@ego-graph/agent-harness";

export type CommandCategory =
  | "Session"
  | "Model"
  | "Permission"
  | "Plan/Patch"
  | "Diff/Checks"
  | "Memory"
  | "MCP"
  | "Security"
  | "Help";

export type CommandManifest = {
  name: string;
  category: CommandCategory;
  description: string;
  shortcut?: string;
  requiresActiveRun?: boolean;
  requiredPermission?: PermissionLevel;
  aliases?: string[];
};

export type CommandPaletteState = {
  open: boolean;
  query: string;
  selectedIndex: number;
  matches: CommandManifest[];
};

export type CommandAvailability = {
  available: boolean;
  reason?: string;
};

export type CommandAvailabilityContext = {
  activeRun?:
    Pick<TerminalAgentRunState, "status" | "phase" | "plan" | "diff" | "checks"> | undefined;
};

export const commandPalette: CommandManifest[] = [
  { name: "/help", category: "Help", description: "Show terminal commands.", shortcut: "?" },
  { name: "/status", category: "Session", description: "Open status overlay." },
  { name: "/init", category: "Session", description: "Initialize workspace guidance." },
  { name: "/new", category: "Session", description: "Start a clean local conversation." },
  { name: "/history", category: "Session", description: "Browse persisted runs from SQLite." },
  { name: "/sessions", category: "Session", description: "List runs in the current process." },
  { name: "/replay", category: "Session", description: "Replay by number or runId." },
  { name: "/switch", category: "Session", description: "Switch by number or runId." },
  { name: "/cancel", category: "Session", description: "Cancel the active run.", requiresActiveRun: true },
  { name: "/btw", category: "Session", description: "Inject a by-the-way message into the active run.", requiresActiveRun: true },
  { name: "/clear", category: "Session", description: "Clear the visible conversation." },
  { name: "/exit", category: "Session", description: "Exit the terminal UI.", shortcut: "Esc" },
  { name: "/model", category: "Model", description: "Show active model guidance." },
  { name: "/models", category: "Model", description: "Open model profiles guidance." },
  { name: "/mcp", category: "MCP", description: "Discover configured MCP tools." },
  { name: "/tools", category: "MCP", description: "Discover available tools." },
  { name: "/skills", category: "MCP", description: "Show skill management guidance." },
  { name: "/prompt", category: "Model", description: "Show system prompt location." },
  { name: "/thinking", category: "Help", description: "Toggle folded reasoning and tool events." },
  { name: "/permissions", category: "Permission", description: "Show permission levels." },
  { name: "/policy", category: "Permission", description: "Show loop policy." },
  { name: "/policy set", category: "Permission", description: "Set loop policy, e.g. /policy set maxSteps=8." },
  { name: "/allow read-only", category: "Permission", description: "Use read-only mode." },
  {
    name: "/allow workspace-write",
    category: "Permission",
    description: "Allow patch generation after approval.",
    requiredPermission: "workspace-write",
  },
  {
    name: "/allow shell-readonly",
    category: "Permission",
    description: "Allow approved readonly shell checks.",
    requiredPermission: "shell-readonly",
  },
  {
    name: "/allow network-low",
    category: "Permission",
    description: "Allow low-risk public requests.",
    requiredPermission: "network-low",
  },
  {
    name: "/allow security-active",
    category: "Permission",
    description: "Allow explicit authorized security tools.",
    requiredPermission: "security-active",
  },
  {
    name: "/plan",
    category: "Plan/Patch",
    description: "Show current plan.",
    requiresActiveRun: true,
  },
  {
    name: "/plan approve",
    category: "Plan/Patch",
    description: "Approve the current plan.",
    requiresActiveRun: true,
    requiredPermission: "workspace-write",
  },
  {
    name: "/plan reject",
    category: "Plan/Patch",
    description: "Reject the current plan.",
    requiresActiveRun: true,
  },
  {
    name: "/diff",
    category: "Diff/Checks",
    description: "Open full diff view.",
    requiresActiveRun: true,
  },
  {
    name: "/diff next",
    category: "Diff/Checks",
    description: "Next changed file.",
    requiresActiveRun: true,
  },
  {
    name: "/diff prev",
    category: "Diff/Checks",
    description: "Previous changed file.",
    requiresActiveRun: true,
  },
  {
    name: "/diff first",
    category: "Diff/Checks",
    description: "First changed file.",
    requiresActiveRun: true,
  },
  {
    name: "/diff last",
    category: "Diff/Checks",
    description: "Last changed file.",
    requiresActiveRun: true,
  },
  {
    name: "/patch approve",
    category: "Plan/Patch",
    description: "Apply the pending patch and run checks.",
    requiresActiveRun: true,
    requiredPermission: "workspace-write",
  },
  {
    name: "/patch reject",
    category: "Plan/Patch",
    description: "Reject the pending patch.",
    requiresActiveRun: true,
  },
  {
    name: "/checks",
    category: "Diff/Checks",
    description: "Show latest checks.",
    requiresActiveRun: true,
  },
  { name: "/memory", category: "Memory", description: "Recall project memory." },
  { name: "/memory compact", category: "Memory", description: "Compact active memory." },
  { name: "/memory archive", category: "Memory", description: "Archive memory by id." },
  { name: "/memory forget", category: "Memory", description: "Forget memory by id." },
  { name: "/debug", category: "Help", description: "Toggle debug payload details." },
  { name: "/scan", category: "Security", description: "Explain authorized scan requirements." },
  { name: "/analyze", category: "Security", description: "Explain evidence-analysis workflow." },
  { name: "/report", category: "Help", description: "Explain report generation workflow." },
];

export function createCommandPaletteState(query: string): CommandPaletteState {
  const matches = getCommandPaletteMatches(query);
  return {
    open: query.startsWith("/"),
    query,
    selectedIndex: 0,
    matches,
  };
}

export function getCommandPaletteMatches(query: string): CommandManifest[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized.startsWith("/")) {
    return [];
  }
  if (normalized === "/allow") {
    return commandPalette.filter((command) => command.name.startsWith("/allow "));
  }
  return commandPalette
    .map((command, index) => ({ command, index, score: scoreCommand(command, normalized) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.command)
    .slice(0, 12);
}

export function moveCommandPaletteSelection(
  state: CommandPaletteState,
  delta: number,
): CommandPaletteState {
  if (state.matches.length === 0) {
    return { ...state, selectedIndex: 0 };
  }
  const next = (state.selectedIndex + delta + state.matches.length) % state.matches.length;
  return { ...state, selectedIndex: next };
}

export function closeCommandPalette(state: CommandPaletteState): CommandPaletteState {
  return { ...state, open: false, selectedIndex: 0 };
}

export function selectCommandPalette(state: CommandPaletteState): string | undefined {
  return state.matches[Math.min(state.selectedIndex, Math.max(0, state.matches.length - 1))]?.name;
}

export function getCommandAvailability(
  command: CommandManifest,
  context: CommandAvailabilityContext,
): CommandAvailability {
  const run = context.activeRun;
  if (command.requiresActiveRun && !run) {
    return { available: false, reason: "needs an active run" };
  }

  if (command.name === "/plan approve" || command.name === "/plan reject") {
    return run?.status === "plan_pending"
      ? { available: true }
      : {
          available: false,
          reason: "current run is not waiting for plan approval",
        };
  }

  if (command.name === "/patch approve" || command.name === "/patch reject") {
    return run?.status === "patch_pending"
      ? { available: true }
      : {
          available: false,
          reason: "current run is not waiting for patch approval",
        };
  }

  if (command.name === "/diff" || command.name.startsWith("/diff ")) {
    return run?.diff
      ? { available: true }
      : { available: false, reason: "current run has no diff yet" };
  }

  if (command.name === "/checks") {
    return run?.checks && run.checks.length > 0
      ? { available: true }
      : { available: false, reason: "current run has no checks yet" };
  }

  if (command.name === "/plan") {
    return run?.plan && run.plan.length > 0
      ? { available: true }
      : { available: false, reason: "current run has no plan yet" };
  }

  return { available: true };
}

export function resolvePaletteInput(input: string, matches: string[], selectedIndex = 0): string {
  const trimmed = input.trim();
  if (trimmed === "/") {
    return "/";
  }
  if (matches.length > 0 && matches.includes(trimmed)) {
    return trimmed;
  }
  if (
    trimmed.length > 1 &&
    matches.length > 0 &&
    !commandPalette.some((command) => command.name === trimmed)
  ) {
    return matches[Math.min(selectedIndex, matches.length - 1)] ?? trimmed;
  }
  return trimmed;
}

function scoreCommand(command: CommandManifest, query: string): number {
  const haystacks = [command.name, command.description, ...(command.aliases ?? [])].map((item) =>
    item.toLowerCase(),
  );
  let best = Number.POSITIVE_INFINITY;
  for (const haystack of haystacks) {
    if (query === "/" || haystack.startsWith(query)) {
      best = Math.min(best, haystack === query ? 0 : 1);
    } else if (isFuzzyMatch(query.replace(/^\//u, ""), haystack.replace(/^\//u, ""))) {
      best = Math.min(best, 4);
    }
  }
  return best === Number.POSITIVE_INFINITY ? -1 : best;
}

function isFuzzyMatch(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of needle) {
    index = haystack.indexOf(char, index);
    if (index < 0) {
      return false;
    }
    index += 1;
  }
  return true;
}
