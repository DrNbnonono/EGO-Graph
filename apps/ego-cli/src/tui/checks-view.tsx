import type { AgentCheckRecord } from "@ego-graph/storage";
import { Box, Text } from "ink";
import React from "react";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export function ChecksView({
  checks,
  width,
}: {
  checks: AgentCheckRecord[];
  width: number;
}): ReactElement {
  if (checks.length === 0) {
    return <Text color="gray">No checks have run yet.</Text>;
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="yellow">Checks</Text>
      {checks.map((check) => (
        <Box key={`${check.name}-${check.createdAt}`} flexDirection="column" marginBottom={1}>
          <Text color={check.status === "passed" ? "green" : "red"}>
            {check.status} {truncateDisplay(check.command, Math.max(12, width - 12))}
          </Text>
          {check.stderr ? (
            <Text color="gray">
              {truncateDisplay(check.stderr.replace(/\s+/gu, " "), width - 2)}
            </Text>
          ) : null}
        </Box>
      ))}
      <Text color="gray">/debug shows full payloads.</Text>
    </Box>
  );
}
