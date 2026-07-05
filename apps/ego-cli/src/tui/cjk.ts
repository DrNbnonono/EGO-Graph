const escapeCharacter = String.fromCharCode(27);
const ansiPattern = new RegExp(`${escapeCharacter}\\[[0-?]*[ -/]*[@-~]`, "gu");

type TextToken = { kind: "ansi"; value: string } | { kind: "text"; value: string; width: number };

export function stripAnsi(value: string): string {
  return value.replace(ansiPattern, "");
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const token of tokenizeDisplay(value)) {
    if (token.kind === "text") {
      width += token.width;
    }
  }
  return width;
}

export function truncateDisplay(value: string, maxWidth: number, ellipsis = "…"): string {
  if (maxWidth <= 0) {
    return "";
  }
  if (displayWidth(value) <= maxWidth) {
    return value;
  }

  const ellipsisWidth = displayWidth(ellipsis);
  const targetWidth = Math.max(0, maxWidth - ellipsisWidth);
  let width = 0;
  let output = "";

  for (const token of tokenizeDisplay(value)) {
    if (token.kind === "ansi") {
      output += token.value;
      continue;
    }
    if (width + token.width > targetWidth) {
      break;
    }
    output += token.value;
    width += token.width;
  }

  return `${output}${ellipsis}`;
}

export function tokenizeDisplay(value: string): TextToken[] {
  const tokens: TextToken[] = [];
  let cursor = 0;

  for (const match of value.matchAll(ansiPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      pushTextTokens(tokens, value.slice(cursor, index));
    }
    tokens.push({ kind: "ansi", value: match[0] });
    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    pushTextTokens(tokens, value.slice(cursor));
  }

  return tokens;
}

function pushTextTokens(tokens: TextToken[], value: string): void {
  for (const char of Array.from(value)) {
    tokens.push({ kind: "text", value: char, width: charWidth(char) });
  }
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint === 0 || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return 0;
  }
  if (isCombining(codePoint)) {
    return 0;
  }
  if (isFullWidth(codePoint) || isEmojiLike(codePoint)) {
    return 2;
  }
  return 1;
}

function isCombining(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

function isFullWidth(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6))
  );
}

function isEmojiLike(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff) || (codePoint >= 0x2600 && codePoint <= 0x27bf)
  );
}
