/** @jsxImportSource @opentui/solid */
import type { JSX } from "solid-js";
import { truncateDisplay } from "./cjk.js";
import { wrapDisplay } from "./text-wrap.js";

export type PromptState = {
  value: string;
  cursor: number;
  history: string[];
  historyIndex: number | null;
  draftBeforeHistory?: string | undefined;
};

export type PromptEdit =
  | { type: "insert"; text: string }
  | { type: "move-left" }
  | { type: "move-right" }
  | { type: "move-home" }
  | { type: "move-end" }
  | { type: "delete-before" }
  | { type: "delete-after" }
  | { type: "clear-before" }
  | { type: "clear-after" }
  | { type: "newline" }
  | { type: "history-prev" }
  | { type: "history-next" }
  | { type: "reset"; value?: string };

export type PromptChrome = {
  separator: string;
  footer: string;
  promptPrefix: string;
  status: string;
};

export type PromptRenderMetrics = {
  lines: string[];
  height: number;
  totalLines: number;
};

const maxPromptLines = 6;

export function createPromptState(value = "", history: string[] = []): PromptState {
  return {
    value,
    cursor: Array.from(value).length,
    history,
    historyIndex: null,
  };
}

export function editPrompt(state: PromptState, edit: PromptEdit): PromptState {
  const chars = Array.from(state.value);
  switch (edit.type) {
    case "insert": {
      const next = [
        ...chars.slice(0, state.cursor),
        ...Array.from(edit.text),
        ...chars.slice(state.cursor),
      ].join("");
      return {
        ...state,
        value: next,
        cursor: state.cursor + Array.from(edit.text).length,
        historyIndex: null,
        draftBeforeHistory: undefined,
      };
    }
    case "move-left":
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case "move-right":
      return { ...state, cursor: Math.min(chars.length, state.cursor + 1) };
    case "move-home":
      return { ...state, cursor: 0 };
    case "move-end":
      return { ...state, cursor: chars.length };
    case "delete-before": {
      if (state.cursor === 0) {
        return state;
      }
      const next = [...chars.slice(0, state.cursor - 1), ...chars.slice(state.cursor)].join("");
      return { ...state, value: next, cursor: state.cursor - 1 };
    }
    case "delete-after": {
      if (state.cursor >= chars.length) {
        return state;
      }
      return {
        ...state,
        value: [...chars.slice(0, state.cursor), ...chars.slice(state.cursor + 1)].join(""),
      };
    }
    case "clear-before":
      return { ...state, value: chars.slice(state.cursor).join(""), cursor: 0 };
    case "clear-after":
      return { ...state, value: chars.slice(0, state.cursor).join("") };
    case "newline":
      return editPrompt(state, { type: "insert", text: "\n" });
    case "history-prev": {
      if (state.history.length === 0) {
        return state;
      }
      const nextIndex =
        state.historyIndex === null
          ? state.history.length - 1
          : Math.max(0, state.historyIndex - 1);
      const value = state.history[nextIndex] ?? "";
      return {
        ...state,
        value,
        cursor: Array.from(value).length,
        historyIndex: nextIndex,
        draftBeforeHistory: state.historyIndex === null ? state.value : state.draftBeforeHistory,
      };
    }
    case "history-next": {
      if (state.history.length === 0 || state.historyIndex === null) {
        return state;
      }
      if (state.historyIndex === state.history.length - 1) {
        const value = state.draftBeforeHistory ?? "";
        return {
          ...state,
          value,
          cursor: Array.from(value).length,
          historyIndex: null,
          draftBeforeHistory: undefined,
        };
      }
      const nextIndex = Math.min(state.history.length - 1, state.historyIndex + 1);
      const value = state.history[nextIndex] ?? "";
      return { ...state, value, cursor: Array.from(value).length, historyIndex: nextIndex };
    }
    case "reset": {
      const value = edit.value ?? "";
      return {
        ...state,
        value,
        cursor: Array.from(value).length,
        historyIndex: null,
        draftBeforeHistory: undefined,
      };
    }
  }
}

export function addPromptHistory(state: PromptState, submitted: string): PromptState {
  const trimmed = submitted.trim();
  if (!trimmed) {
    return state;
  }
  return {
    ...state,
    history: [...state.history.filter((item) => item !== trimmed), trimmed].slice(-50),
    historyIndex: null,
    draftBeforeHistory: undefined,
  };
}

export function createPromptChrome(width: number, busy: boolean): PromptChrome {
  return {
    separator: " ".repeat(Math.max(8, width - 2)),
    footer: "ctrl+p commands  /help status",
    promptPrefix: "> ",
    status: busy ? "ctrl+c interrupt  ctrl+o details" : "",
  };
}

export function getPromptRenderMetrics(state: PromptState, width: number): PromptRenderMetrics {
  const visibleWidth = Math.max(8, width - 5);
  const chars = Array.from(state.value);
  const beforeCursor = chars.slice(0, state.cursor).join("");
  const afterCursor = chars.slice(state.cursor).join("");
  const rendered = `${beforeCursor}▌${afterCursor}`;
  const allLines = rendered
    .split("\n")
    .flatMap((line) => wrapDisplay(line.length > 0 ? line : " ", visibleWidth))
    .map((line) => truncateDisplay(line, visibleWidth));
  const lines = allLines.slice(-maxPromptLines);

  return {
    lines,
    totalLines: allLines.length,
    height: lines.length + 3,
  };
}

export function PromptInput({
  state,
  busy,
  width,
}: {
  state: PromptState;
  busy: boolean;
  width: number;
}): JSX.Element {
  const metrics = getPromptRenderMetrics(state, width);
  const chrome = createPromptChrome(width, busy);

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} height={metrics.height}>
      <text>{chrome.separator}</text>
      {metrics.lines.map((line, index) => (
        <text>
          <text>{index === 0 ? chrome.promptPrefix : "  "}</text>
          {line}
        </text>
      ))}
      <text>{chrome.separator}</text>
      <text>{busy ? chrome.status : chrome.footer}</text>
    </box>
  );
}
