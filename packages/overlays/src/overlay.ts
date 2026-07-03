import type {ScenarioName} from "@ego-graph/shared";
import type {ToolDefinition} from "@ego-graph/tools";
import type {ZodTypeAny} from "zod";

export type ScenarioOverlay = {
  name: ScenarioName;
  displayName: string;
  tools: ToolDefinition<ZodTypeAny, ZodTypeAny>[];
  reportSections: string[];
  defaultTarget: string;
};
