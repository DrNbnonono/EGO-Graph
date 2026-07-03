export const scenarioNames = [
  "web_pentest",
  "incident_response",
  "vulnerability_research",
  "reverse_engineering",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export function isScenarioName(value: string): value is ScenarioName {
  return scenarioNames.includes(value as ScenarioName);
}
