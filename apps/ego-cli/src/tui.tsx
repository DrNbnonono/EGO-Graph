import {Box, Text, render} from "ink";
import type {ReactElement} from "react";

export function EgoTui(): ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="magentaBright">紫莲花 EGO-Graph</Text>
      <Text>Evidence-Guided Orchestration Graph</Text>
      <Text>Run a controlled mission with:</Text>
      <Text color="cyan">
        ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json
      </Text>
    </Box>
  );
}

export function renderTui(): void {
  render(<EgoTui />);
}
