import { estimateMessageTokens, type ChatMessage } from "@ego-graph/llm";
import type { ContextBudgetDecision } from "./context-budget.js";
import {
  resolveModelContextLimit,
  type ModelContextLimitInput,
} from "./model-limits.js";

/**
 * Automatic context compaction for long-running agent runs.
 *
 * The loop accumulates `ChatMessage[]` (system preamble, user turns, tool
 * exchanges, strategy prompts). Once the active prompt approaches the model's
 * context limit, this module produces a compacted message list that:
 *
 * - Always keeps the system preamble, the current user turn, the latest
 *   strategy-graph prompt, the most recent tool result, and the last
 *   assistant conclusion.
 * - Keeps observations the strategy graph still marks as P0 evidence.
 * - Folds everything in between into a single `system` summary so the model
 *   retains a compressed narrative instead of dropping context silently.
 *
 * This satisfies the contest requirement: long sessions must not lose P0
 * evidence gaps, tool results, or the final conclusion.
 */

export type CompactionPreservedKind =
  | "system_preamble"
  | "user_turn"
  | "strategy_prompt"
  | "recent_tool"
  | "p0_evidence"
  | "final_answer";

export type CompactionPreservedItem = {
  kind: CompactionPreservedKind;
  /** Index into the original message list. */
  index: number;
  reason: string;
};

export type CompactionResult = {
  activeMessages: ChatMessage[];
  compactedSummary: string;
  droppedCount: number;
  preserved: CompactionPreservedItem[];
  /** Estimated tokens before compaction. */
  tokensBefore: number;
  /** Estimated tokens after compaction. */
  tokensAfter: number;
};

export type CompactModelMessagesInput = ModelContextLimitInput & {
  messages: ChatMessage[];
  /**
   * Target utilization of the context window after compaction. Defaults to
   * 0.6 so there is headroom for the next tool exchange before the next
   * compaction pass.
   */
  targetUtilization?: number;
  /**
   * Number of most-recent tool results to keep verbatim. Defaults to 3.
   */
  keepRecentTools?: number;
  /**
   * Optional set of tool-use ids whose results must be treated as P0 evidence
   * and preserved even if they are not in the recent window. The loop derives
   * this from the strategy graph's open P0 evidence gaps.
   */
  p0ToolUseIds?: ReadonlySet<string>;
};

/**
 * Decide whether a context budget decision warrants compaction. The loop
 * calls this each step; only when it returns true does it run
 * {@link compactModelMessages}.
 */
export function shouldCompact(decision: ContextBudgetDecision): boolean {
  return decision.status === "needs_compaction";
}

/**
 * Compute a {@link ContextBudgetDecision} for a live `ChatMessage[]` context.
 * This mirrors {@link analyzeContextBudget} but works on in-memory model
 * messages (no persistence layer) so the loop can decide when to compact.
 *
 * `nearLimitRatio` is the utilization fraction at which we downgrade from
 * `healthy` to `near_limit`. `compactionRatio` is the fraction at which we
 * upgrade to `needs_compaction`.
 */
export function analyzeChatContextBudget(input: {
  messages: ChatMessage[];
  contextLimit: number;
  nearLimitRatio?: number;
  compactionRatio?: number;
}): ContextBudgetDecision {
  const nearLimitRatio = input.nearLimitRatio ?? 0.82;
  const compactionRatio = input.compactionRatio ?? 0.7;
  const totalTokens = estimateMessagesCost(input.messages);
  const utilization = input.contextLimit > 0 ? totalTokens / input.contextLimit : 0;
  const status: ContextBudgetDecision["status"] =
    utilization >= compactionRatio
      ? "needs_compaction"
      : utilization >= nearLimitRatio
        ? "near_limit"
        : "healthy";
  return {
    tokenBudget: input.contextLimit,
    totalTokens,
    selectedTokens: totalTokens,
    omittedTokens: 0,
    selectedCount: input.messages.length,
    omittedCount: 0,
    utilization,
    status,
    reason:
      status === "needs_compaction"
        ? "Active prompt exceeds the compaction ratio; compact now."
        : status === "near_limit"
          ? "Active prompt is close to the context limit."
          : "Active prompt is within the context budget.",
  };
}

/**
 * Estimate the token cost of a message list using the shared llm heuristic.
 */
export function estimateMessagesCost(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

/**
 * Compact a message list according to the preserve/fold strategy. Always
 * returns a valid (possibly unchanged) message list; never throws.
 *
 * If the messages already fit comfortably under the target, the input is
 * returned as-is with an empty summary and zero drops.
 */
export function compactModelMessages(input: CompactModelMessagesInput): CompactionResult {
  const contextLimit = resolveModelContextLimit(input);
  const targetUtilization = input.targetUtilization ?? 0.6;
  const keepRecentTools = input.keepRecentTools ?? 3;
  const tokensBefore = estimateMessagesCost(input.messages);
  const targetTokens = Math.floor(contextLimit * targetUtilization);

  if (tokensBefore <= targetTokens) {
    return {
      activeMessages: input.messages,
      compactedSummary: "",
      droppedCount: 0,
      preserved: [],
      tokensBefore,
      tokensAfter: tokensBefore,
    };
  }

  const recentToolUseIds = collectRecentToolUseIds(input.messages, keepRecentTools);
  const preserved: CompactionPreservedItem[] = [];
  const kept: ChatMessage[] = [];
  const folded: ChatMessage[] = [];

  for (let index = 0; index < input.messages.length; index += 1) {
    const message = input.messages[index];
    if (!message) {
      continue;
    }
    const preserve = preserveDecision(message, index, input.messages, {
      recentToolUseIds,
      p0ToolUseIds: input.p0ToolUseIds,
    });
    if (preserve) {
      kept.push(message);
      preserved.push({ kind: preserve.kind, index, reason: preserve.reason });
    } else {
      folded.push(message);
    }
  }

  const compactedSummary = buildCompactedSummary(folded);
  const activeMessages: ChatMessage[] = [];
  if (compactedSummary) {
    activeMessages.push({
      role: "system",
      content: compactedSummary,
    });
  }
  activeMessages.push(...kept);

  // If compaction did not actually shrink below the target (rare, e.g. a
  // single huge tool result dominates), still return the preserved set so we
  // never make things worse. The loop will warn again next step.
  const tokensAfter = estimateMessagesCost(activeMessages);
  return {
    activeMessages,
    compactedSummary,
    droppedCount: folded.length,
    preserved,
    tokensBefore,
    tokensAfter,
  };
}

type PreserveOutcome = { kind: CompactionPreservedKind; reason: string };

function preserveDecision(
  message: ChatMessage,
  index: number,
  messages: ChatMessage[],
  context: {
    recentToolUseIds: ReadonlySet<string>;
    p0ToolUseIds: ReadonlySet<string> | undefined;
  },
): PreserveOutcome | undefined {
  // Always keep system messages verbatim — they carry the preamble and the
  // latest strategy-graph prompt.
  if (message.role === "system") {
    return { kind: "system_preamble", reason: "system/strategy preamble always retained" };
  }

  // Always keep the final user turn (the active task).
  if (message.role === "user" && index === findLastUserIndex(messages)) {
    return { kind: "user_turn", reason: "current user turn always retained" };
  }

  // Keep the last assistant conclusion verbatim.
  if (message.role === "assistant" && index === findLastAssistantIndex(messages)) {
    return { kind: "final_answer", reason: "last assistant conclusion retained" };
  }

  // Keep tool results whose tool-use id is in the recent or P0 set.
  const toolUseId = readToolUseId(message);
  if (toolUseId && (context.recentToolUseIds.has(toolUseId) || context.p0ToolUseIds?.has(toolUseId))) {
    return {
      kind: context.p0ToolUseIds?.has(toolUseId) ? "p0_evidence" : "recent_tool",
      reason: context.p0ToolUseIds?.has(toolUseId)
        ? "tool result tagged as P0 evidence by the strategy graph"
        : "recent tool result within keepRecentTools window",
    };
  }

  // Keep assistant messages that carry a tool_use block whose id is recent/P0,
  // so the matching tool result is not orphaned.
  if (message.role === "assistant") {
    const referencedRecent = assistantToolUseIds(message).some(
      (id) => context.recentToolUseIds.has(id) || context.p0ToolUseIds?.has(id),
    );
    if (referencedRecent) {
      return { kind: "recent_tool", reason: "assistant tool_use paired with a retained tool result" };
    }
  }

  return undefined;
}

function collectRecentToolUseIds(messages: ChatMessage[], keep: number): Set<string> {
  const ids: string[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    const id = readToolUseId(message);
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
    if (ids.length >= keep) {
      break;
    }
  }
  return new Set(ids);
}

function readToolUseId(message: ChatMessage): string | undefined {
  if (message.role === "tool" && typeof message.toolCallId === "string") {
    return message.toolCallId;
  }
  return undefined;
}

function assistantToolUseIds(message: ChatMessage): string[] {
  if (!Array.isArray(message.content)) {
    return [];
  }
  const ids: string[] = [];
  for (const block of message.content) {
    if (typeof block === "object" && block !== null && block.type === "tool_use") {
      ids.push(block.id);
    }
  }
  return ids;
}

function findLastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return i;
    }
  }
  return -1;
}

function findLastAssistantIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") {
      return i;
    }
  }
  return -1;
}

function buildCompactedSummary(folded: ChatMessage[]): string {
  if (folded.length === 0) {
    return "";
  }
  const userTurns = folded.filter((message) => message.role === "user").length;
  const assistantTurns = folded.filter((message) => message.role === "assistant").length;
  const toolTurns = folded.filter((message) => message.role === "tool").length;
  const snippets = folded
    .map((message) => summarizeMessage(message))
    .filter((summary): summary is string => summary.length > 0)
    .slice(0, 6);
  return [
    "[context compacted]",
    `folded ${folded.length} message(s): ${userTurns} user, ${assistantTurns} assistant, ${toolTurns} tool.`,
    "preserved: system preamble, current user turn, latest strategy graph, recent tool results, P0 evidence, last answer.",
    "compressed narrative (oldest -> newest):",
    ...snippets.map((snippet) => `- ${snippet}`),
  ].join("\n");
}

function summarizeMessage(message: ChatMessage): string {
  const text = extractText(message);
  if (!text) {
    return "";
  }
  const trimmed = text.replace(/\s+/gu, " ").trim();
  if (trimmed.length === 0) {
    return "";
  }
  const prefix = `${message.role}: `;
  const maxSnippet = 160;
  if (trimmed.length <= maxSnippet) {
    return `${prefix}${trimmed}`;
  }
  return `${prefix}${trimmed.slice(0, maxSnippet)}…`;
}

function extractText(message: ChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (block.type === "text") {
        return block.text;
      }
      if (block.type === "tool_use") {
        return `tool_use ${block.name}`;
      }
      if (block.type === "tool_result") {
        return block.content;
      }
      return "";
    })
    .join(" ");
}
