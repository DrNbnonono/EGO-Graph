import type { PermissionLevel, TerminalAgentRunState } from "@ego-graph/agent-harness";
import { Box, Text } from "ink";
import React from "react";
import type { ReactElement } from "react";

const permissionDescriptions: Record<PermissionLevel, string> = {
  "read-only": "Only read workspace context and answer questions.",
  "workspace-write": "Allow plan-approved patch generation and apply.",
  "shell-readonly": "Allow approved read-only shell checks.",
  "network-low": "Allow low-risk public network requests.",
  "security-active": "Allow explicitly authorized security tools.",
};

export function PermissionsView({
  current,
  activeRun,
}: {
  current: PermissionLevel;
  activeRun?: Pick<TerminalAgentRunState, "status" | "phase"> | undefined;
}): ReactElement {
  const nextAction = readNextAction(activeRun);
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="yellow">Permissions</Text>
      {Object.entries(permissionDescriptions).map(([level, description]) => (
        <Text key={level} color={level === current ? "magentaBright" : "gray"}>
          {level === current ? "> " : "  "}
          {level} - {description}
        </Text>
      ))}
      <Text> </Text>
      <Text color="gray">
        Change level with /allow
        read-only|workspace-write|shell-readonly|network-low|security-active.
      </Text>
      <Text color="gray">
        Current run: {activeRun ? `${activeRun.status} | ${activeRun.phase}` : "none"}
      </Text>
      <Text color="gray">Next: {nextAction}</Text>
    </Box>
  );
}

function readNextAction(activeRun?: Pick<TerminalAgentRunState, "status" | "phase">): string {
  if (!activeRun) {
    return "start with a natural-language request or open /history.";
  }
  if (activeRun.status === "plan_pending") {
    return "review /plan, then approve with /plan approve or y in the Plan overlay.";
  }
  if (activeRun.status === "patch_pending") {
    return "review /diff, then approve with /patch approve or y in the Diff overlay.";
  }
  if (activeRun.status === "applied") {
    return "open /checks or /debug to inspect verification output.";
  }
  return "continue the conversation or open /debug for details.";
}
