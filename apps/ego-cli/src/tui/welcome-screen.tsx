import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export type WelcomeModel = {
  logo: string[];
  left: string[];
  right: string[];
};

export function createWelcomeModel({
  modelLabel,
  permissionLevel,
  cwd,
}: {
  modelLabel: string;
  permissionLevel: PermissionLevel;
  cwd: string;
}): WelcomeModel {
  return {
    logo: [
      "     /\\",
      "  /\\ /  \\ /\\",
      " /  \\ 紫莲花 /  \\",
      " \\   \\____/   /",
      "  \\__/    \\__/",
    ],
    left: ["Welcome back", "EGO-Graph", `${modelLabel} · ${permissionLevel}`, cwd],
    right: [
      "Tips",
      "/help 查看快捷键",
      "/thinking 展开/折叠思考过程",
      "/history 回放历史运行",
      "普通问题会先自然回答",
    ],
  };
}

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
  const wide = innerWidth >= 76;
  const model = createWelcomeModel({
    modelLabel: workbench.model.label,
    permissionLevel,
    cwd: workbench.cwd,
  });
  const leftWidth = wide ? Math.floor(innerWidth * 0.52) : innerWidth - 6;
  const rightWidth = wide ? Math.floor(innerWidth * 0.4) : innerWidth - 6;

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={1}>
      <Box
        borderStyle="round"
        borderColor="gray"
        width={innerWidth}
        flexDirection={wide ? "row" : "column"}
        paddingX={2}
      >
        <Box flexDirection="column" width={leftWidth}>
          {model.logo.map((line) => (
            <Text key={line} color="magentaBright">
              {truncateDisplay(line, leftWidth - 2)}
            </Text>
          ))}
          <Text> </Text>
          <Text color="gray">{model.left[0]}</Text>
          <Text color="magentaBright">{model.left[1]}</Text>
          <Text color="gray">{truncateDisplay(model.left[2] ?? "", leftWidth - 2)}</Text>
          <Text color="gray">{truncateDisplay(model.left[3] ?? "", leftWidth - 2)}</Text>
        </Box>
        <Box flexDirection="column" width={rightWidth}>
          {model.right.map((line, index) => (
            <Text key={line} color={index === 0 ? "yellow" : "gray"}>
              {truncateDisplay(line, rightWidth - 2)}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
