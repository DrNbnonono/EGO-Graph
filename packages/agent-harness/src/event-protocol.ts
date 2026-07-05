import type { AgentRunEvent, AgentRunEventType } from "./session.js";

export type HarnessEvent = AgentRunEvent;
export type { AgentRunEvent, AgentRunEventType };

export function createHarnessEvent(input: Omit<AgentRunEvent, "id" | "createdAt">): AgentRunEvent {
  return {
    ...input,
    id: `event-${new Date().toISOString().replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
}

export function userVisibleEventMessage(event: AgentRunEvent): string {
  return event.message;
}

export function debugPayload(event: AgentRunEvent): unknown {
  return event.payload.debug ?? event.payload;
}
