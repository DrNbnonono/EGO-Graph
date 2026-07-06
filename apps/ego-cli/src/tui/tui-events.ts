import type { AgentRunEvent } from "@ego-graph/agent-harness";
import { truncateDisplay } from "./cjk.js";
import { wrapDisplay } from "./text-wrap.js";

export type RenderEventOptions = {
  width: number;
  debug: boolean;
  thinkingExpanded: boolean;
};

export function renderConversationLines(
  events: AgentRunEvent[],
  options: RenderEventOptions,
): string[] {
  const normalized = coalesceAssistantDeltas(events);
  return normalized.flatMap((event) => renderEventLines(event, options));
}

export function renderEventLines(event: AgentRunEvent, options: RenderEventOptions): string[] {
  const width = Math.max(24, options.width);
  if (event.type === "user.message") {
    return wrapDisplay(`❯ ${event.message}`, width);
  }
  if (
    event.type === "assistant.message" ||
    event.type === "assistant.completed" ||
    event.type === "assistant.delta"
  ) {
    return renderAssistantMessage(event.message, width);
  }
  if (event.type.includes("plan")) {
    return wrapDisplay(`plan ${event.message}`, width);
  }
  if (event.type.includes("patch")) {
    return wrapDisplay(`patch ${event.message}`, width);
  }
  if (isFoldedEvent(event.type) && !options.debug) {
    if (!options.thinkingExpanded) {
      return [
        truncateDisplay(
          `${eventIcon(event.type)} ${readCompactEventLabel(event.type)} · Ctrl+O expand`,
          width,
        ),
      ];
    }
    const lines = wrapDisplay(`${eventIcon(event.type)} ${event.message}`, width);
    const summary = summarizePayload(event.payload);
    if (summary) {
      lines.push(...wrapDisplay(`  ${summary}`, width));
    }
    return lines;
  }

  const base = wrapDisplay(`${eventIcon(event.type)} ${event.message}`, width);
  if (options.debug && event.payload.debug) {
    base.push(...wrapDisplay(`debug ${JSON.stringify(event.payload.debug)}`, width));
  }
  return base;
}

function coalesceAssistantDeltas(events: AgentRunEvent[]): AgentRunEvent[] {
  const normalized: AgentRunEvent[] = [];
  let pending: AgentRunEvent | undefined;

  const flushPending = (): void => {
    if (pending) {
      normalized.push(pending);
      pending = undefined;
    }
  };

  for (const event of events) {
    if (event.type === "assistant.delta") {
      if (pending?.type === "assistant.delta" && pending.runId === event.runId) {
        pending = { ...event, message: `${pending.message}${event.message}` };
      } else {
        flushPending();
        pending = { ...event };
      }
      continue;
    }

    if (
      pending &&
      event.runId === pending.runId &&
      (event.type === "assistant.completed" || event.type === "assistant.message")
    ) {
      pending = undefined;
      normalized.push(event);
      continue;
    }

    flushPending();
    normalized.push(event);
  }

  flushPending();
  return normalized;
}

function renderAssistantMessage(message: string, width: number): string[] {
  const lines: string[] = ["●"];
  for (const sourceLine of message.split(/\r?\n/u)) {
    const rendered = renderMarkdownLine(sourceLine);
    if (rendered.length === 0) {
      lines.push("");
    } else {
      lines.push(...wrapDisplay(rendered, width));
    }
  }
  return lines;
}

function renderMarkdownLine(line: string): string {
  if (/^#{1,6}\s/u.test(line)) {
    return line.replace(/^#{1,6}\s/u, "");
  }
  if (/^```/u.test(line)) {
    return line.replace(/^```/u, "code ");
  }
  if (/^\s*---+\s*$/u.test(line)) {
    return "─".repeat(24);
  }
  return line
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1");
}

function isFoldedEvent(type: AgentRunEvent["type"]): boolean {
  return (
    type.includes("context") ||
    type.includes("memory") ||
    type.includes("planner") ||
    type.includes("loop") ||
    type.includes("plan") ||
    type.includes("tool") ||
    type.includes("evidence") ||
    type.includes("reflection") ||
    type.includes("model.failed") ||
    type.includes("check") ||
    type.includes("patch") ||
    type.includes("permission")
  );
}

function readCompactEventLabel(type: AgentRunEvent["type"]): string {
  if (type.includes("context")) {
    return "context pack";
  }
  if (type.includes("planner") || type.includes("plan")) {
    return "plan event";
  }
  if (type.includes("loop")) {
    return "agent loop";
  }
  if (type.includes("tool")) {
    return "tool event";
  }
  if (type.includes("evidence")) {
    return "evidence event";
  }
  if (type.includes("reflection")) {
    return "reasoning summary";
  }
  if (type.includes("check")) {
    return "check event";
  }
  if (type.includes("model")) {
    return "model event";
  }
  if (type.includes("patch")) {
    return "patch event";
  }
  if (type.includes("permission")) {
    return "permission event";
  }
  return "runtime event";
}

function summarizePayload(payload: AgentRunEvent["payload"]): string | undefined {
  const debug = payload.debug;
  if (!debug || typeof debug !== "object") {
    return undefined;
  }
  const entries = Object.entries(debug)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${formatDebugValue(value)}`);
  return entries.length > 0 ? entries.join(" · ") : undefined;
}

function formatDebugValue(value: unknown): string {
  if (typeof value === "string") {
    return truncateDisplay(value, 80);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return truncateDisplay(JSON.stringify(value), 80);
}

function eventIcon(type: AgentRunEvent["type"]): string {
  if (type.includes("tool")) {
    return "tool";
  }
  if (type.includes("evidence")) {
    return "evidence";
  }
  if (type.includes("reflection")) {
    return "note";
  }
  if (type.includes("memory")) {
    return "memory";
  }
  if (type.includes("planner") || type.includes("plan")) {
    return "plan";
  }
  if (type.includes("loop")) {
    return "agent";
  }
  if (type.includes("model")) {
    return "model";
  }
  if (type.includes("patch")) {
    return "patch";
  }
  if (type.includes("permission")) {
    return "permission";
  }
  return "agent";
}
