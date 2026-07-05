import { useStdin, useStdout } from "ink";
import { useEffect, useRef } from "react";
import type { PromptEdit } from "./prompt-input.js";

type PromptEditWithoutInsert = Exclude<PromptEdit, { type: "insert" }>["type"];

export type TerminalInputAction =
  | { type: "exit" }
  | { type: "escape" }
  | { type: "submit" }
  | { type: "tab" }
  | { type: "toggle-thinking" }
  | { type: "toggle-side-panel" }
  | { type: "scroll"; delta: number }
  | { type: "move"; direction: "up" | "down" | "left" | "right" | "page-up" | "page-down" }
  | { type: "prompt-edit"; edit: "insert"; text: string }
  | { type: "prompt-edit"; edit: PromptEditWithoutInsert };

const mouseTrackingOn = "\x1b[?1000h\x1b[?1006h";
const mouseTrackingOff = "\x1b[?1000l\x1b[?1006l";
const escapeCharacter = String.fromCharCode(27);
const sgrMousePattern = new RegExp(`^${escapeCharacter}\\[<(?<button>\\d+);\\d+;\\d+[mM]$`, "u");

export function normalizeTerminalInput(raw: string): TerminalInputAction[] {
  const mouseWheel = parseMouseWheel(raw);
  if (mouseWheel === "up") {
    return [{ type: "scroll", delta: 5 }];
  }
  if (mouseWheel === "down") {
    return [{ type: "scroll", delta: -5 }];
  }

  const direct = directTerminalAction(raw);
  if (direct) {
    return [direct];
  }

  const actions: TerminalInputAction[] = [];
  for (const char of Array.from(raw)) {
    const action = directTerminalAction(char);
    if (action) {
      actions.push(action);
    } else if (!isControlCharacter(char)) {
      actions.push({ type: "prompt-edit", edit: "insert", text: char });
    }
  }
  return actions;
}

export function parseMouseWheel(raw: string): "up" | "down" | null {
  const match = sgrMousePattern.exec(raw);
  const button = match?.groups?.button;
  if (button === "64") {
    return "up";
  }
  if (button === "65") {
    return "down";
  }
  return null;
}

export function useTerminalInput(onAction: (action: TerminalInputAction) => void): void {
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  const onActionRef = useRef(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (isRawModeSupported) {
      setRawMode(true);
    }

    const handleData = (data: Buffer | string): void => {
      const raw = Buffer.isBuffer(data) ? data.toString("utf8") : data;
      for (const action of normalizeTerminalInput(raw)) {
        onActionRef.current(action);
      }
    };

    stdin.on("data", handleData);
    return () => {
      stdin.off("data", handleData);
      if (isRawModeSupported) {
        setRawMode(false);
      }
    };
  }, [stdin, setRawMode, isRawModeSupported]);
}

export function useMouseTracking(enabled = true): void {
  const { stdout } = useStdout();

  useEffect(() => {
    if (!enabled || !stdout.isTTY) {
      return;
    }
    stdout.write(mouseTrackingOn);
    return () => {
      stdout.write(mouseTrackingOff);
    };
  }, [enabled, stdout]);
}

function directTerminalAction(raw: string): TerminalInputAction | null {
  switch (raw) {
    case "\x03":
      return { type: "exit" };
    case "\x1b":
      return { type: "escape" };
    case "\r":
      return { type: "submit" };
    case "\t":
      return { type: "tab" };
    case "\x0f":
      return { type: "toggle-thinking" };
    case "\x12":
      return { type: "toggle-side-panel" };
    case "\x7f":
    case "\b":
      return { type: "prompt-edit", edit: "delete-before" };
    case "\x01":
      return { type: "prompt-edit", edit: "move-home" };
    case "\x05":
      return { type: "prompt-edit", edit: "move-end" };
    case "\x15":
      return { type: "prompt-edit", edit: "clear-before" };
    case "\x0b":
      return { type: "prompt-edit", edit: "clear-after" };
    case "\x0a":
      return { type: "prompt-edit", edit: "newline" };
    case "\x1b[A":
      return { type: "move", direction: "up" };
    case "\x1b[B":
      return { type: "move", direction: "down" };
    case "\x1b[C":
      return { type: "move", direction: "right" };
    case "\x1b[D":
      return { type: "move", direction: "left" };
    case "\x1b[5~":
      return { type: "move", direction: "page-up" };
    case "\x1b[6~":
      return { type: "move", direction: "page-down" };
    case "\x1b[3~":
      return { type: "prompt-edit", edit: "delete-after" };
    case "\x1b[H":
    case "\x1b[1~":
      return { type: "prompt-edit", edit: "move-home" };
    case "\x1b[F":
    case "\x1b[4~":
      return { type: "prompt-edit", edit: "move-end" };
    default:
      return null;
  }
}

function isControlCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint < 32 || codePoint === 127;
}
