import { createArchiveInspectTool, createIrSecurityToolRegistry } from "@ego-graph/tools";
import type { ScenarioOverlay } from "./overlay.js";

export function createIncidentResponseOverlay(): ScenarioOverlay {
  return {
    name: "incident_response",
    displayName: "Incident Response",
    tools: [createArchiveInspectTool(), ...createIrSecurityToolRegistry().tools],
    reportSections: ["Executive Summary", "Timeline", "Indicators", "Root Cause", "Containment", "Residual Risk"],
    defaultTarget: "file://scenarios/incident_response/webshell-case.zip",
  };
}
