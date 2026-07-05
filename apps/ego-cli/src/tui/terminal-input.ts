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
const sgrMousePattern = new RegExp(`^${escapeCharacter}\\[<(?<button>\\d+);\\d+;\\d+[mM]`, "u");

export function normalizeTerminalInput(raw: string): TerminalInputAction[] {
  const direct = directTerminalAction(raw);
  if (direct) {
    return [direct];
  }

  const actions: TerminalInputAction[] = [];
  let index = 0;
  while (index < raw.length) {
    const mouseEvent = readSgrMouseEvent(raw.slice(index));
    if (mouseEvent) {
      appendMouseAction(actions, mouseEvent.wheel);
      index += mouseEvent.length;
      continue;
    }

    const legacyMouseEvent = readX10MouseEvent(raw.slice(index));
    if (legacyMouseEvent) {
      appendMouseAction(actions, legacyMouseEvent.wheel);
      index += legacyMouseEvent.length;
      continue;
    }

    const escapeAction = readEscapeAction(raw.slice(index));
    if (escapeAction) {
      actions.push(escapeAction.action);
      index += escapeAction.length;
      continue;
    }

    const char = Array.from(raw.slice(index))[0] ?? "";
    const action = directTerminalAction(char);
    if (action) {
      actions.push(action);
    } else if (!isControlCharacter(char)) {
      actions.push({ type: "prompt-edit", edit: "insert", text: char });
    }
    index += char.length;
  }
  return actions;
}

export function parseMouseWheel(raw: string): "up" | "down" | null {
  const event = readSgrMouseEvent(raw);
  return event && event.length === raw.length ? event.wheel : null;
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

function readEscapeAction(raw: string): { action: TerminalInputAction; length: number } | null {
  const sequences = [
    "\x1b[3~",
    "\x1b[5~",
    "\x1b[6~",
    "\x1b[1~",
    "\x1b[4~",
    "\x1b[A",
    "\x1b[B",
    "\x1b[C",
    "\x1b[D",
    "\x1b[H",
    "\x1b[F",
  ];
  for (const sequence of sequences) {
    if (raw.startsWith(sequence)) {
      const action = directTerminalAction(sequence);
      return action ? { action, length: sequence.length } : null;
    }
  }
  return null;
}

function readSgrMouseEvent(raw: string): {
  length: number;
  wheel: "up" | "down" | null;
} | null {
  const match = sgrMousePattern.exec(raw);
  if (!match) {
    return null;
  }
  const button = match.groups?.button;
  const wheel = button === "64" ? "up" : button === "65" ? "down" : null;
  return { length: match[0].length, wheel };
}

function readX10MouseEvent(raw: string): {
  length: number;
  wheel: "up" | "down" | null;
} | null {
  if (!raw.startsWith("\x1b[M") || raw.length < 6) {
    return null;
  }
  const button = (raw.codePointAt(3) ?? 32) - 32;
  const wheel = button === 64 ? "up" : button === 65 ? "down" : null;
  return { length: 6, wheel };
}

function appendMouseAction(actions: TerminalInputAction[], wheel: "up" | "down" | null): void {
  if (wheel === "up") {
    actions.push({ type: "scroll", delta: 5 });
  } else if (wheel === "down") {
    actions.push({ type: "scroll", delta: -5 });
  }
}

function isControlCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint < 32 || codePoint === 127;
}
