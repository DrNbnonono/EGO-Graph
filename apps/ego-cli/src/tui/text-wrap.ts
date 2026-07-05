import { displayWidth, tokenizeDisplay, truncateDisplay } from "./cjk.js";

export { truncateDisplay };

type WrapSegment = {
  value: string;
  width: number;
  kind: "ansi" | "space" | "word" | "char";
};

export function wrapDisplay(value: string, width: number): string[] {
  if (width <= 0) {
    return [""];
  }

  const lines: string[] = [];
  for (const sourceLine of value.split(/\r?\n/u)) {
    let current = "";
    let currentWidth = 0;
    for (const segment of segmentDisplay(sourceLine)) {
      if (segment.kind === "ansi") {
        current += segment.value;
        continue;
      }
      if (segment.kind === "space" && currentWidth === 0) {
        continue;
      }
      if (currentWidth > 0 && currentWidth + segment.width > width) {
        lines.push(current.trimEnd());
        current = "";
        currentWidth = 0;
        if (segment.kind === "space") {
          continue;
        }
      }
      if (segment.width > width) {
        const split = wrapOversizedSegment(segment.value, width);
        if (currentWidth > 0) {
          lines.push(current.trimEnd());
          current = "";
          currentWidth = 0;
        }
        lines.push(...split.slice(0, -1));
        current = split.at(-1) ?? "";
        currentWidth = displayWidth(current);
        continue;
      }
      current += segment.value;
      currentWidth += segment.width;
    }
    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [""];
}

export function clampDisplayLine(value: string, width: number): string {
  return displayWidth(value) <= width ? value : truncateDisplay(value, width);
}

function segmentDisplay(value: string): WrapSegment[] {
  const segments: WrapSegment[] = [];
  let currentWord = "";
  let currentWordWidth = 0;
  let currentSpace = "";
  let currentSpaceWidth = 0;

  const flushWord = (): void => {
    if (currentWord.length > 0) {
      segments.push({ kind: "word", value: currentWord, width: currentWordWidth });
      currentWord = "";
      currentWordWidth = 0;
    }
  };
  const flushSpace = (): void => {
    if (currentSpace.length > 0) {
      segments.push({ kind: "space", value: currentSpace, width: currentSpaceWidth });
      currentSpace = "";
      currentSpaceWidth = 0;
    }
  };

  for (const token of tokenizeDisplay(value)) {
    if (token.kind === "ansi") {
      flushWord();
      flushSpace();
      segments.push({ kind: "ansi", value: token.value, width: 0 });
      continue;
    }
    if (/\s/u.test(token.value)) {
      flushWord();
      currentSpace += token.value;
      currentSpaceWidth += token.width;
      continue;
    }
    if (isAsciiWordToken(token.value)) {
      flushSpace();
      currentWord += token.value;
      currentWordWidth += token.width;
      continue;
    }
    flushWord();
    flushSpace();
    segments.push({ kind: "char", value: token.value, width: token.width });
  }

  flushWord();
  flushSpace();
  return segments;
}

function wrapOversizedSegment(value: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const token of tokenizeDisplay(value)) {
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
  return lines;
}

function isAsciiWordToken(value: string): boolean {
  return /^[A-Za-z0-9_./:@#%+=-]$/u.test(value);
}
