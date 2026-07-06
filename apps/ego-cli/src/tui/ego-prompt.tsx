/** @jsxImportSource @opentui/solid */
import type { PermissionLevel } from "@ego-graph/agent-harness";
import type { WorkbenchState } from "@ego-graph/workbench";
import { TextareaRenderable, TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { createMemo, For, onMount, Show, type JSX } from "solid-js";
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
  const selected = createMemo(() => suggestions()[0]);
  const mode = createMemo(() => (props.value.trim().startsWith("$") ? "shell" : "normal"));

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
        backgroundColor={theme.backgroundElement}
        border={["top", "bottom"]}
        borderColor={theme.borderSubtle}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={props.home ? 1 : 0}
        paddingBottom={props.home ? 1 : 0}
      >
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
            onContentChange={() => props.onChange(input?.plainText ?? "")}
            onSubmit={() => {
              const command = selected();
              const text = input?.plainText ?? "";
              void props.onSubmit(text.trim() === "/" && command ? command.name : text);
            }}
          />
        </box>
        <Show when={suggestions().length > 0}>
          <PromptAutocomplete options={suggestions()} />
        </Show>
      </box>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text fg={theme.textMuted}>
          {props.busy ? "ctrl+c interrupt  ctrl+o details" : "ctrl+p commands  /help status"}
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

function PromptAutocomplete(props: { options: CommandManifest[] }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <box paddingLeft={2} paddingTop={1}>
      <For each={props.options}>
        {(option, index) => (
          <Show
            when={index() === 0}
            fallback={
              <box paddingLeft={1} paddingRight={1}>
                <text fg={theme.text}>{option.name.padEnd(20)}</text>
                <text fg={theme.textMuted}>{option.description}</text>
              </box>
            }
          >
            <box backgroundColor={theme.primary} paddingLeft={1} paddingRight={1}>
              <text fg={theme.background}>{option.name.padEnd(20)}</text>
              <text fg={theme.background}>{option.description}</text>
            </box>
          </Show>
        )}
      </For>
    </box>
  );
}
