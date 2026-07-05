import type { WorkbenchState } from "@ego-graph/workbench";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { PermissionLevel } from "@ego-graph/agent-harness";
import { truncateDisplay } from "./cjk.js";

export function WelcomeScreen({
  workbench,
  permissionLevel,
  width,
}: {
  workbench: WorkbenchState;
  permissionLevel: PermissionLevel;
  width: number;
}): ReactElement {
  const innerWidth = Math.max(40, Math.min(width - 4, 92));
  return (
    <Box flexDirection="column" alignItems="center" paddingTop={1}>
      <Box
        borderStyle="round"
        borderColor="gray"
        width={innerWidth}
        flexDirection="column"
        paddingX={2}
      >
        <Text color="magentaBright">EGO-Graph</Text>
        <Text>Welcome back</Text>
        <Text color="magentaBright">lotus</Text>
        <Text color="gray">
          {truncateDisplay(
            `${workbench.model.label} · ${permissionLevel} · ${workbench.cwd}`,
            innerWidth - 6,
          )}
        </Text>
        <Text> </Text>
        <Text color="yellow">Tips</Text>
        <Text>/help show shortcuts</Text>
        <Text>/model configure model in Workbench</Text>
        <Text>/mcp inspect MCP tools</Text>
        <Text>/history browse previous runs</Text>
      </Box>
    </Box>
  );
}
