export type HermesEventType =
  | "session.created"
  | "message.received"
  | "plan.updated"
  | "tool.called"
  | "memory.written"
  | "approval.created"
  | "check.finished"
  | "mcp.connected"
  | "search.performed";

export type HermesEvent = {
  id: string;
  type: HermesEventType | string;
  sessionId: string;
  runId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  source: string;
};

export type HermesEventInput = {
  type: HermesEvent["type"];
  sessionId: string;
  runId?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
  source: string;
};

export type HermesEventFilter = {
  sessionId?: string;
  runId?: string;
  type?: HermesEvent["type"];
};

export type HermesSubscriber = (event: HermesEvent) => void;

export type HermesBus = {
  emit(event: HermesEventInput): HermesEvent;
  subscribe(filter: HermesEventFilter, subscriber: HermesSubscriber): () => void;
  getTimeline(sessionId: string): HermesEvent[];
  replay(runId: string): HermesEvent[];
  list(filter?: HermesEventFilter): HermesEvent[];
};

type Subscription = {
  filter: HermesEventFilter;
  subscriber: HermesSubscriber;
};

export function createHermes(): HermesBus {
  const events: HermesEvent[] = [];
  const subscriptions: Subscription[] = [];

  return {
    emit(input) {
      const event = createHermesEvent(input);
      events.push(event);
      for (const subscription of subscriptions) {
        if (matchesFilter(event, subscription.filter)) {
          subscription.subscriber(event);
        }
      }
      return event;
    },
    subscribe(filter, subscriber) {
      const subscription = { filter, subscriber };
      subscriptions.push(subscription);
      return () => {
        const index = subscriptions.indexOf(subscription);
        if (index >= 0) {
          subscriptions.splice(index, 1);
        }
      };
    },
    getTimeline(sessionId) {
      return events.filter((event) => event.sessionId === sessionId);
    },
    replay(runId) {
      return events.filter((event) => event.runId === runId);
    },
    list(filter = {}) {
      return events.filter((event) => matchesFilter(event, filter));
    },
  };
}

export function createHermesEvent(input: HermesEventInput): HermesEvent {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    id: `hermes-${createdAt.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 10)}`,
    type: input.type,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    payload: input.payload ?? {},
    createdAt,
    source: input.source,
  };
}

export function matchesFilter(event: HermesEvent, filter: HermesEventFilter): boolean {
  if (filter.sessionId && event.sessionId !== filter.sessionId) {
    return false;
  }
  if (filter.runId && event.runId !== filter.runId) {
    return false;
  }
  if (filter.type && event.type !== filter.type) {
    return false;
  }
  return true;
}
