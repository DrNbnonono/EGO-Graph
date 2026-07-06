/** @jsxImportSource @opentui/solid */
import type { AgentRunEvent } from "@ego-graph/agent-harness";
import type { JSX } from "solid-js";

export function DebugView({
  events,
  width,
  height,
}: {
  events: AgentRunEvent[];
  width: number;
  height: number;
}): JSX.Element {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} width={width} height={height}>
      <text>Debug events</text>
      {events.slice(-Math.max(1, height - 1)).map((event) => (
        <text>
          {event.type} · {event.phase ?? "none"} · {event.message}
        </text>
      ))}
    </box>
  );
}
