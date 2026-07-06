/** @jsxImportSource @opentui/solid */
import type { AgentCheckRecord } from "@ego-graph/storage";
import type { JSX } from "solid-js";

export function ChecksView({
  checks,
  width,
}: {
  checks: AgentCheckRecord[];
  width: number;
}): JSX.Element {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} width={width}>
      <text>Checks</text>
      {checks.length === 0 ? <text>No checks have run yet.</text> : null}
      {checks.map((check) => (
        <text>
          {check.exitCode === 0 ? "✓" : "×"} {check.command} exit {check.exitCode}
        </text>
      ))}
    </box>
  );
}
