import type { AgentRunEvent } from "@ego-graph/agent-harness";
import { truncateDisplay } from "./cjk.js";
import { wrapDisplay } from "./text-wrap.js";

export type RenderEventOptions = {
  width: number;
  debug: boolean;
};

export function renderEventLines(event: AgentRunEvent, options: RenderEventOptions): string[] {
  const width = Math.max(24, options.width);
  if (event.type === "user.message") {
    return wrapDisplay(`> ${event.message}`, width);
  }
  if (event.type === "assistant.message" || event.type === "assistant.completed") {
    return renderAssistantMessage(event.message, width);
  }
  if (event.type === "assistant.delta") {
    return wrapDisplay(`lotus ${event.message}`, width);
  }
  if (event.type.includes("plan")) {
    return wrapDisplay(`plan ${event.message}`, width);
  }
  if (event.type.includes("patch")) {
    return wrapDisplay(`patch ${event.message}`, width);
  }
  if (event.type.includes("check")) {
    return wrapDisplay(`check ${event.message}`, width);
  }
  if (isFoldedEvent(event.type) && !options.debug) {
    return [truncateDisplay(`${eventIcon(event.type)} ${event.message}`, width)];
  }

  const base = wrapDisplay(`${eventIcon(event.type)} ${event.message}`, width);
  if (options.debug && event.payload.debug) {
    base.push(...wrapDisplay(`debug ${JSON.stringify(event.payload.debug)}`, width));
  }
  return base;
}

function renderAssistantMessage(message: string, width: number): string[] {
  const lines: string[] = ["lotus"];
  for (const sourceLine of message.split(/\r?\n/u)) {
    lines.push(...wrapDisplay(renderMarkdownLine(sourceLine), width));
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
  return line;
}

function isFoldedEvent(type: AgentRunEvent["type"]): boolean {
  return (
    type.includes("tool") ||
    type.includes("evidence") ||
    type.includes("reflection") ||
    type.includes("model.failed")
  );
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
  if (type.includes("model")) {
    return "model";
  }
  return "agent";
}
