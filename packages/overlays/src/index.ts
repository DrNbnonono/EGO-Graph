import type { ScenarioName } from "@ego-graph/shared";
import type { ScenarioOverlay } from "./overlay.js";
import { createWebPentestOverlay } from "./web-pentest.js";

export * from "./overlay.js";
export * from "./web-pentest.js";

export function loadOverlay(name: ScenarioName): ScenarioOverlay {
  if (name === "web_pentest") {
    return createWebPentestOverlay();
  }
  throw new Error(`Overlay is not implemented yet: ${name}`);
}
