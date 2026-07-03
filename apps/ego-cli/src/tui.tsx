import {Box, Text, render} from "ink";
import type {ReactElement} from "react";

export function EgoTui(): ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="magentaBright">紫莲花 EGO-Graph</Text>
      <Text>Evidence-Guided Orchestration Graph</Text>
      <Text color="green">Runtime: ready for controlled web_pentest missions</Text>
      <Text>{"Agent loop: plan -> policy -> execute -> observe -> evidence -> evaluate"}</Text>
      <Text>{"Reports: .ego/reports/<run-id>.md"}</Text>
      <Text>Run a controlled mission with:</Text>
      <Text color="cyan">
        ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json
      </Text>
      <Text>Replay audit trail with:</Text>
      <Text color="cyan">{"ego replay --trajectory-id <run-id>"}</Text>
      <Text>Start local Runtime Server with:</Text>
      <Text color="cyan">ego serve</Text>
    </Box>
  );
}

export function renderTui(): void {
  render(<EgoTui />);
}
