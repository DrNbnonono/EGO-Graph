/** @jsxImportSource @opentui/solid */
import type { EvidenceGapStep } from "@ego-graph/agent-harness";
import type { JSX } from "solid-js";

export function PlanView({ plan, width }: { plan: EvidenceGapStep[]; width: number }): JSX.Element {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} width={width}>
      <text>Plan</text>
      {plan.length === 0 ? <text>No pending plan.</text> : null}
      {plan.map((step, index) => (
        <box>
          <text>
            {index + 1}. {step.title}
          </text>
          <text>{step.expectedResult}</text>
          <text>{step.riskNote}</text>
        </box>
      ))}
      <text>/plan approve · /plan reject</text>
    </box>
  );
}
