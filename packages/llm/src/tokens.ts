import type { ChatContentBlock, ChatContentBlockArray, ChatMessage } from "./provider.js";

/**
 * Approximate token counting.
 *
 * A real BPE tokenizer is intentionally out of scope for the first iteration
 * (it would add a heavy dependency and per-model variants). The byte/4
 * heuristic tracks within ~15% of GPT-style tokenizers for typical
 * mixed CJK + ASCII agent traffic, which is good enough for budget gating
 * and history window selection.
 *
 * The interface mirrors what a real tokenizer would expose, so a later swap
 * to `gpt-tokenizer` / `tiktoken` / `anthropic-tokenizer` is a drop-in.
 */
export function estimateTokens(content: ChatContentBlock | ChatContentBlockArray): number {
  const blocks = Array.isArray(content) ? content : [content];
  let total = 0;
  for (const block of blocks) {
    total += estimateBlockTokens(block);
  }
  return total;
}

export function estimateMessageTokens(message: ChatMessage): number {
  // Role tag and separator overhead (~4 tokens per message in OpenAI accounting).
  const overhead = 4;
  return overhead + estimateContentField(message.content);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateMessageTokens(message);
  }
  // Trailing priming tokens added by the API.
  return total + 3;
}

function estimateContentField(content: ChatMessage["content"]): number {
  if (typeof content === "string") {
    return approximateStringTokens(content);
  }
  return estimateTokens(content);
}

function estimateBlockTokens(block: ChatContentBlock): number {
  if (typeof block === "string") {
    return approximateStringTokens(block);
  }
  if (block.type === "tool_use") {
    // name + serialized input + framing
    return (
      approximateStringTokens(block.name) +
      approximateStringTokens(safeJsonStringify(block.input)) +
      8
    );
  }
  if (block.type === "tool_result") {
    return approximateStringTokens(block.content) + 6;
  }
  // ChatTextBlock fallback (text-only).
  return approximateStringTokens(block.text) + 2;
}

/**
 * Byte/4 heuristic with a CJK upward adjustment: CJK characters tend to map
 * to ~1 token each (one CJK char = ~3 UTF-8 bytes ≈ 0.75 by byte/4, but in
 * practice BPE encodes them as single tokens), so count CJK ranges as 1.
 */
export function approximateStringTokens(text: string): number {
  if (!text) {
    return 0;
  }
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (isCjk(ch)) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  // ASCII/whitespace: ~4 chars per token.
  const otherTokens = Math.ceil(other / 4);
  return cjk + otherTokens;
}

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3000 && code <= 0x30ff) || // CJK symbols, Hiragana, Katakana
    (code >= 0xff00 && code <= 0xffef) // Fullwidth forms
  );
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
