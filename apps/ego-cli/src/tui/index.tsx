import { render } from "ink";
import { EgoTui } from "./app.js";

export { EgoTui } from "./app.js";
export { getCommandPaletteMatches, resolvePaletteInput } from "./command-palette.js";
export { resolveDiffFileIndex, splitDiffByFile } from "./diff-view.js";
export { displayWidth, truncateDisplay } from "./cjk.js";
export { wrapDisplay } from "./text-wrap.js";

export function renderTui(): void {
  render(<EgoTui />);
}
