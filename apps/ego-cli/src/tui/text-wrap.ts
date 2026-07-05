import { displayWidth, tokenizeDisplay, truncateDisplay } from "./cjk.js";

export { truncateDisplay };

export function wrapDisplay(value: string, width: number): string[] {
  if (width <= 0) {
    return [""];
  }

  const lines: string[] = [];
  for (const sourceLine of value.split(/\r?\n/u)) {
    let current = "";
    let currentWidth = 0;
    for (const token of tokenizeDisplay(sourceLine)) {
      if (token.kind === "ansi") {
        current += token.value;
        continue;
      }
      if (currentWidth > 0 && currentWidth + token.width > width) {
        lines.push(current);
        current = "";
        currentWidth = 0;
      }
      current += token.value;
      currentWidth += token.width;
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

export function clampDisplayLine(value: string, width: number): string {
  return displayWidth(value) <= width ? value : truncateDisplay(value, width);
}
