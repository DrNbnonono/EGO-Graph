import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { displayWidth, truncateDisplay } from "./cjk.js";

export type PromptState = {
  value: string;
  cursor: number;
  history: string[];
  historyIndex: number | null;
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
      return { ...state, value, cursor: Array.from(value).length, historyIndex: nextIndex };
    }
    case "history-next": {
      if (state.history.length === 0 || state.historyIndex === null) {
        return state;
      }
      const nextIndex = Math.min(state.history.length - 1, state.historyIndex + 1);
      const value = state.history[nextIndex] ?? "";
      return { ...state, value, cursor: Array.from(value).length, historyIndex: nextIndex };
    }
    case "reset": {
      const value = edit.value ?? "";
      return { ...state, value, cursor: Array.from(value).length, historyIndex: null };
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
}): ReactElement {
  const visibleWidth = Math.max(8, width - 6);
  const beforeCursor = Array.from(state.value).slice(0, state.cursor).join("");
  const atCursor = Array.from(state.value)[state.cursor] ?? " ";
  const afterCursor = Array.from(state.value)
    .slice(state.cursor + 1)
    .join("");
  const rendered = `${beforeCursor}${atCursor}${afterCursor}`;
  const lines = rendered.split("\n");

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={busy ? "yellow" : "gray"}>
        {busy
          ? "Thinking - draft is editable, Enter waits until ready"
          : "? shortcuts  / commands  Ctrl+J newline"}
      </Text>
      {lines.map((line, index) => (
        <Text key={index} color="magentaBright">
          {index === 0 ? "> " : "  "}
          {truncateDisplay(line, visibleWidth)}
          {index === lines.length - 1 ? cursorHint(state, visibleWidth) : ""}
        </Text>
      ))}
    </Box>
  );
}

function cursorHint(state: PromptState, visibleWidth: number): string {
  const cursorWidth = displayWidth(Array.from(state.value).slice(0, state.cursor).join(""));
  return cursorWidth <= visibleWidth ? "▌" : "";
}
