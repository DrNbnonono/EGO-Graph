/** @jsxImportSource @opentui/solid */
import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { TextareaRenderable, TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { createEffect, createMemo, createSignal, For, onMount, Show, type JSX } from "solid-js";
import { getCommandPaletteMatches, type CommandManifest } from "./command-palette.js";
import { useTuiTheme } from "./theme.js";

export type PromptPart =
  | { type: "text"; text: string }
  | { type: "command"; name: string }
  | { type: "file-placeholder"; label: string };

export type PromptInfo = {
  input: string;
  parts: PromptPart[];
};

export type PromptRef = {
  readonly focused: boolean;
  readonly current: PromptInfo;
  set(prompt: PromptInfo): void;
  reset(): void;
  blur(): void;
  focus(): void;
  submit(): void;
};

export function EgoPrompt(props: {
  value: string;
  busy: boolean;
  workbench: WorkbenchState | undefined;
  permissionLevel: PermissionLevel;
  history: string[];
  historyIndex: number | undefined;
  home?: boolean;
  onChange(value: string): void;
  onSubmit(value: string): Promise<void>;
  onHistory(delta: -1 | 1): void;
  onClear(): void;
  ref?(value: TextareaRenderable | undefined): void;
}): JSX.Element {
  const theme = useTuiTheme();
  let input: TextareaRenderable | undefined;
  const suggestions = createMemo(() =>
    props.value.trim().startsWith("/") ? getCommandPaletteMatches(props.value).slice(0, 6) : [],
  );
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const selected = createMemo(() => suggestions()[selectedIndex()]);
  const mode = createMemo(() => (props.value.trim().startsWith("$") ? "shell" : "normal"));
  const autocompleteVisible = createMemo(() => suggestions().length > 0);

  createEffect(() => {
    props.value;
    setSelectedIndex(0);
  });

  function moveSuggestion(delta: -1 | 1): boolean {
    const options = suggestions();
    if (options.length === 0) return false;
    setSelectedIndex((current) => (current + delta + options.length) % options.length);
    return true;
  }

  function submitCurrent(): void {
    setTimeout(() => {
      const text = input?.plainText ?? props.value;
      const command = selected();
      const submitted = text.trim().startsWith("/") && command ? command.name : text;
      void props.onSubmit(submitted);
    }, 0);
  }

  const promptRef: PromptRef = {
    get focused() {
      return input?.focused ?? false;
    },
    get current() {
      return { input: input?.plainText ?? props.value, parts: [] };
    },
    set(prompt) {
      input?.setText(prompt.input);
      props.onChange(prompt.input);
      input?.gotoBufferEnd();
    },
    reset() {
      input?.clear();
      props.onChange("");
    },
    blur() {
      input?.blur();
    },
    focus() {
      input?.focus();
    },
    submit() {
      void props.onSubmit(input?.plainText ?? props.value);
    },
  };

  onMount(() => setTimeout(() => input?.focus(), 1));

  useBindings(() => ({
    target: () => input,
    enabled: () => autocompleteVisible(),
    commands: [
      {
        name: "prompt.autocomplete.prev",
        title: "Previous command suggestion",
        category: "Autocomplete",
        run: () => moveSuggestion(-1),
      },
      {
        name: "prompt.autocomplete.next",
        title: "Next command suggestion",
        category: "Autocomplete",
        run: () => moveSuggestion(1),
      },
      {
        name: "prompt.autocomplete.select",
        title: "Select command suggestion",
        category: "Autocomplete",
        run: submitCurrent,
      },
    ],
    bindings: [
      { key: "up", cmd: "prompt.autocomplete.prev" },
      { key: "down", cmd: "prompt.autocomplete.next" },
      { key: "return", cmd: "prompt.autocomplete.select" },
      { key: "kpenter", cmd: "prompt.autocomplete.select" },
      { key: "linefeed", cmd: "prompt.autocomplete.select" },
    ],
  }));

  useBindings(() => ({
    target: () => input,
    enabled: () => !autocompleteVisible(),
    bindings: [
      { key: "up", cmd: () => props.onHistory(-1) },
      { key: "down", cmd: () => props.onHistory(1) },
      { key: "ctrl+u", cmd: () => promptRef.reset() },
      { key: "ctrl+l", cmd: props.onClear },
    ],
  }));

  return (
    <box width="100%" flexShrink={0}>
      <box
        backgroundColor={props.home ? theme.background : theme.backgroundElement}
        border={props.home ? true : ["top", "bottom"]}
        borderColor={autocompleteVisible() ? theme.borderActive : theme.border}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={props.home ? 1 : 0}
        paddingBottom={props.home ? 1 : 0}
        customBorderChars={roundedBorder}
      >
        <Show when={!props.home}>
          <box width="100%" flexDirection="row" justifyContent="space-between" gap={2} flexShrink={0}>
            <text fg={theme.textMuted}>
              {mode() === "shell" ? "$ shell" : "EGO-Graph"}
              <span style={{ fg: theme.borderActive }}> / </span>
              {props.workbench?.model.label ?? "loading model"}
            </text>
            <PromptStatus
              busy={props.busy}
              permissionLevel={props.permissionLevel}
              workbench={props.workbench}
            />
          </box>
        </Show>
        <box width="100%" flexDirection="row">
          <text width={2} fg={props.busy ? theme.warning : theme.primary} attributes={TextAttributes.BOLD}>
            {mode() === "shell" ? "$" : ">"}
          </text>
          <textarea
            ref={(value: TextareaRenderable) => {
              input = value;
              props.ref?.(value);
            }}
            width="100%"
            minHeight={1}
            maxHeight={6}
            placeholder={props.home ? "Ask EGO-Graph about this workspace" : "Type a task, /command, or $ shell note"}
            placeholderColor={theme.textMuted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={props.busy ? theme.warning : theme.text}
            keyBindings={[
              { name: "return", action: "submit" },
              { name: "kpenter", action: "submit" },
              { name: "linefeed", action: "submit" },
              { name: "return", ctrl: true, action: "newline" },
              { name: "return", shift: true, action: "newline" },
              { name: "return", meta: true, action: "newline" },
              { name: "kpenter", ctrl: true, action: "newline" },
              { name: "kpenter", shift: true, action: "newline" },
              { name: "kpenter", meta: true, action: "newline" },
            ]}
            onContentChange={() => props.onChange(input?.plainText ?? "")}
            onSubmit={submitCurrent}
          />
        </box>
        <Show when={suggestions().length > 0}>
          <PromptAutocomplete options={suggestions()} selectedIndex={selectedIndex()} />
        </Show>
      </box>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text fg={theme.textMuted}>
          {props.busy ? "ctrl+c interrupt  ctrl+o details" : "ctrl+p commands  /help status  ↑↓ select"}
        </text>
        <text fg={theme.textMuted}>enter submit  shift/ctrl+enter newline</text>
      </box>
    </box>
  );
}

function PromptStatus(props: {
  busy: boolean;
  permissionLevel: PermissionLevel;
  workbench: WorkbenchState | undefined;
}): JSX.Element {
  const theme = useTuiTheme();
  const mcp = props.workbench?.mcp.status ?? "mcp";
  const network = props.workbench?.network ?? "network";
  const tools = props.workbench?.tools.length ?? 0;
  return (
    <box flexDirection="row" gap={2} flexShrink={0}>
      <text fg={props.busy ? theme.warning : theme.success}>{props.busy ? "running" : "idle"}</text>
      <text fg={theme.textMuted}>{props.permissionLevel}</text>
      <text fg={theme.textMuted}>{tools} tools</text>
      <text fg={mcp === "connected" ? theme.success : theme.textMuted}>{mcp}</text>
      <text fg={network === "connected" ? theme.success : theme.textMuted}>{network}</text>
    </box>
  );
}

function PromptAutocomplete(props: { options: CommandManifest[]; selectedIndex?: number }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
      <For each={props.options}>
        {(option, index) => (
          <Show
            when={index() === (props.selectedIndex ?? 0)}
            fallback={
              <box paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
                <text fg={theme.text}>{option.name.padEnd(20)}</text>
                <text fg={theme.textMuted}>{option.description}</text>
              </box>
            }
          >
            <box backgroundColor={theme.primary} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
              <text fg={theme.background}>{option.name.padEnd(20)}</text>
              <text fg={theme.background}>{option.description}</text>
            </box>
          </Show>
        )}
      </For>
    </box>
  );
}

const roundedBorder = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  topT: "┬",
  bottomT: "┴",
  leftT: "├",
  rightT: "┤",
  cross: "┼",
};
