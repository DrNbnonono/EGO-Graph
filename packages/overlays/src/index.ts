import type { ScenarioName } from "@ego-graph/shared";
import type { ScenarioOverlay } from "./overlay.js";
import { createWebPentestOverlay } from "./web-pentest.js";
import { createIncidentResponseOverlay } from "./incident-response.js";

export * from "./overlay.js";
export * from "./web-pentest.js";
export * from "./incident-response.js";

export function loadOverlay(name: ScenarioName): ScenarioOverlay {
  if (name === "web_pentest") {
    return createWebPentestOverlay();
  }
  if (name === "incident_response") {
    return createIncidentResponseOverlay();
  }
  throw new Error(`Overlay is not implemented yet: ${name}`);
}
