/**
 * Readline-based interactive terminal fallback.
 *
 * Used when @opentui/core native FFI backend is unavailable (e.g. Node.js on
 * Windows without bun-ffi). Provides a minimal REPL that drives the same
 * `TerminalAgentSession` API used by the full TUI, so feature parity is
 * maintained without any native dependencies.
 */
import * as readline from "node:readline";
import type { TerminalAgentSession, AgentRunEvent } from "@ego-graph/agent-harness";

// ── ANSI helpers ────────────────────────────────────────────────────────

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const RED = `${ESC}31m`;
const MAGENTA = `${ESC}35m`;

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

// ── Event formatting ───────────────────────────────────────────────────────

function formatEvent(event: AgentRunEvent): string {
  const time = new Date(event.createdAt).toLocaleTimeString();
  const prefix = `${DIM}${time}${RESET}`;

  switch (event.type) {
    case "assistant.delta":
      // Streaming text — no timestamp prefix for a natural chat feel.
      return event.message;
    case "assistant.completed":
      return "";
    case "assistant.thinking":
      return `${prefix} ${DIM}${MAGENTA}⟡ Thinking...${RESET}`;
    case "tool.started":
      return `${prefix} ${CYAN}▸ ${event.message}${RESET}`;
    case "tool.completed":
      return `${prefix} ${GREEN}✓ ${event.message}${RESET}`;
    case "model.failed":
    case "tool.failed":
    case "tool.blocked":
      return `${prefix} ${RED}✗ ${event.message}${RESET}`;
    case "permission.requested":
      return `${prefix} ${YELLOW}⚠ Permission: ${event.message}${RESET}`;
    case "plan.proposed":
      return `${prefix} ${BOLD}${YELLOW}📋 Plan: ${event.message}${RESET}`;
    case "patch.proposed":
      return `${prefix} ${BOLD}${CYAN}📝 Patch: ${event.message}${RESET}`;
    case "loop.step.started":
      return `${prefix} ${DIM}── Step ${event.payload.step ?? "?"} ──${RESET}`;
    case "loop.stopped":
    case "run.completed":
      return `${prefix} ${GREEN}■ ${event.message}${RESET}`;
    case "run.cancelled":
      return `${prefix} ${RED}■ Cancelled${RESET}`;
    case "run.blocked":
      return `${prefix} ${YELLOW}■ Blocked: ${event.message}${RESET}`;
    case "strategy.graph.created":
    case "strategy.graph.updated":
      return `${prefix} ${DIM}◈ ${event.message}${RESET}`;
    case "planner.decision":
      return `${prefix} ${DIM}→ ${event.message}${RESET}`;
    case "context.compacted":
      return `${prefix} ${DIM}↻ Context compacted${RESET}`;
    default:
      // Collapse noisy events to dim one-liners.
      if (event.message) {
        return `${prefix} ${DIM}${event.type}: ${event.message}${RESET}`;
      }
      return "";
  }
}

// ── Slash command handling ─────────────────────────────────────────────────

const SLASH_COMMANDS: Record<string, string> = {
  "/help": "Show this help message.",
  "/init": "Initialize a new mission.",
  "/scan": "Scan the workspace for context.",
  "/plan": "Draft an edit plan for approval.",
  "/patch": "Generate a patch from the approved plan.",
  "/apply": "Apply the approved patch.",
  "/check": "Run configured checks (typecheck, test).",
  "/tools": "List available tools.",
  "/clear": "Clear conversation history.",
  "/allow": "Change permission level: /allow <level>",
  "/status": "Show current session status.",
  "/quit": "Exit the terminal.",
};

function handleSlashCommand(line: string): string | null {
  const cmd = line.trim().toLowerCase();
  if (cmd === "/help") {
    const lines = [`${BOLD}Available commands:${RESET}`];
    for (const [name, desc] of Object.entries(SLASH_COMMANDS)) {
      lines.push(`  ${CYAN}${name.padEnd(12)}${RESET} ${desc}`);
    }
    return lines.join("\n");
  }
  if (cmd === "/quit" || cmd === "/exit") {
    return "__EXIT__";
  }
  // Other slash commands are forwarded to the session as-is.
  return null;
}

// ── Main REPL ──────────────────────────────────────────────────────────────

export type ReadlineFallbackOptions = {
  session: TerminalAgentSession;
  workspaceRoot: string;
};

/**
 * Start the readline-based interactive terminal. Returns when the user
 * exits via `/quit`, Ctrl+D, or Ctrl+C.
 */
export async function startReadlineFallback(options: ReadlineFallbackOptions): Promise<void> {
  const { session } = options;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
    prompt: colorize("ego ❯ ", BOLD + CYAN),
  });

  const printBanner = (): void => {
    console.log(
      `${BOLD}${MAGENTA}EGO-Graph${RESET} ${DIM}v0.1.0 — Readline Terminal${RESET}`,
    );
    console.log(
      `${DIM}Type ${CYAN}/help${RESET}${DIM} for commands, ${CYAN}/quit${RESET}${DIM} to exit.${RESET}`,
    );
    console.log(
      `${DIM}Permission: ${YELLOW}${session.getPermissionLevel()}${RESET}`,
    );
    console.log();
  };

  printBanner();

  let busy = false;
  let closed = false;

  const processInput = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Handle local slash commands first.
    const slashResult = handleSlashCommand(trimmed);
    if (slashResult === "__EXIT__") {
      rl.close();
      return;
    }
    if (slashResult !== null) {
      console.log(slashResult);
      return;
    }

    // Handle /clear as a session reset.
    if (trimmed.toLowerCase() === "/clear") {
      await session.clearConversation();
      console.log(`${GREEN}Conversation cleared.${RESET}`);
      return;
    }

    // Handle /allow <level>
    if (trimmed.toLowerCase().startsWith("/allow ")) {
      const level = trimmed.slice(7).trim() as Parameters<typeof session.setPermissionLevel>[0];
      try {
        session.setPermissionLevel(level);
        console.log(`${GREEN}Permission level set to: ${level}${RESET}`);
      } catch {
        console.log(`${RED}Invalid permission level.${RESET}`);
      }
      return;
    }

    // Handle /status
    if (trimmed.toLowerCase() === "/status") {
      console.log(`${DIM}Session: ${session.getActiveSessionId()}${RESET}`);
      console.log(`${DIM}Permission: ${session.getPermissionLevel()}${RESET}`);
      return;
    }

    if (busy) {
      console.log(`${YELLOW}Agent is busy; please wait for the current run to finish.${RESET}`);
      return;
    }

    // Submit to the agent session and stream events.
    busy = true;
    let lastWasDelta = false;

    try {
      for await (const event of session.submitMessage(trimmed)) {
        const formatted = formatEvent(event);
        if (!formatted) continue;

        if (event.type === "assistant.delta") {
          // Stream text inline without newlines between deltas.
          process.stdout.write(formatted);
          lastWasDelta = true;
        } else {
          if (lastWasDelta) {
            process.stdout.write("\n");
            lastWasDelta = false;
          }
          console.log(formatted);
        }
      }
      if (lastWasDelta) {
        process.stdout.write("\n");
      }
    } catch (error) {
      if (lastWasDelta) process.stdout.write("\n");
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${RED}Error: ${message}${RESET}`);
    } finally {
      busy = false;
    }
  };

  // Register line handler.
  rl.on("line", (line) => {
    // Fire-and-forget the async processing; readline will queue the next
    // prompt after the callback returns.
    void processInput(line).then(() => {
      if (!closed) {
        rl.prompt();
      }
    });
  });

  rl.on("close", () => {
    closed = true;
    console.log(`\n${DIM}Goodbye.${RESET}`);
  });

  // Handle Ctrl+C gracefully.
  rl.on("SIGINT", () => {
    if (busy) {
      console.log(`\n${YELLOW}Press Ctrl+C again to force exit.${RESET}`);
      rl.prompt();
    } else {
      rl.close();
    }
  });

  // Show initial prompt.
  rl.prompt();

  // Keep the process alive until readline closes.
  await new Promise<void>((resolve) => {
    rl.on("close", resolve);
  });
}
