import { renderBaseCss } from "./base.js";
import { renderComponentsCss } from "./components.js";
import { renderLayoutCss } from "./layout.js";
import { renderResponsiveCss } from "./responsive.js";
import { renderTokensCss } from "./tokens.js";

export function renderDashboardCss(): string {
  return [
    renderTokensCss(),
    renderBaseCss(),
    renderLayoutCss(),
    renderComponentsCss(),
    renderResponsiveCss(),
  ].join("\n\n");
}
