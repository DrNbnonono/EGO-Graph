/** @jsxImportSource @opentui/solid */
import type { PermissionLevel, TerminalAgentRunState } from "@ego-graph/agent-harness";
import type { JSX } from "solid-js";

const levels: PermissionLevel[] = [
  "read-only",
  "workspace-write",
  "shell-readonly",
  "network-low",
  "security-active",
];

export function PermissionsView({
  current,
  activeRun,
}: {
  current: PermissionLevel;
  activeRun?: TerminalAgentRunState;
}): JSX.Element {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text>Permissions</text>
      {levels.map((level) => (
        <text>
          {level === current ? "●" : "○"} {level}
        </text>
      ))}
      <text>active run: {activeRun?.status ?? "none"}</text>
    </box>
  );
}
