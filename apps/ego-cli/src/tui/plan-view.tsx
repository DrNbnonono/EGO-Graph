import type { EvidenceGapStep } from "@ego-graph/agent-harness";
import { Box, Text } from "ink";
import React from "react";
import type { ReactElement } from "react";
import { truncateDisplay } from "./cjk.js";

export function PlanView({
  plan,
  width,
}: {
  plan: EvidenceGapStep[];
  width: number;
}): ReactElement {
  if (plan.length === 0) {
    return <Text color="gray">No active plan.</Text>;
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="yellow">Plan approval</Text>
      {plan.map((step, index) => (
        <Box key={step.id} flexDirection="column" marginBottom={1}>
          <Text color="magentaBright">
            {index + 1}. {truncateDisplay(step.title, Math.max(12, width - 6))}
          </Text>
          <Text>{truncateDisplay(`Risk: ${step.riskNote}`, Math.max(12, width - 4))}</Text>
          <Text color="gray">
            {truncateDisplay(`Stop: ${step.stopCondition}`, Math.max(12, width - 4))}
          </Text>
        </Box>
      ))}
      <Text color="gray">y approve n reject /plan approve /plan reject</Text>
    </Box>
  );
}
