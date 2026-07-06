/** @jsxImportSource @opentui/solid */
import { InputRenderable, RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { useRenderer, useTerminalDimensions } from "@opentui/solid";
import { createContext, createEffect, createMemo, createSignal, For, Show, useContext, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { selectedForeground, useTuiTheme } from "./theme.js";

export type DialogState =
  | { type: "none" }
  | { type: "commands"; filter?: string }
  | { type: "help" }
  | { type: "models" }
  | { type: "permissions" }
  | { type: "plan" }
  | { type: "diff" }
  | { type: "checks" }
  | { type: "history" }
  | { type: "debug" };

export type TuiDialogContext = {
  state: DialogState;
  stack: DialogState[];
  open(state: Exclude<DialogState, { type: "none" }>): void;
  replace(state: Exclude<DialogState, { type: "none" }>): void;
  pop(): void;
  clear(): void;
};

export type DialogSelectOption<T = string> = {
  title: string;
  value: T;
  description?: string;
  category?: string;
  footer?: string;
  disabled?: boolean;
  details?: string[];
  onSelect?: () => void;
};

export type DialogSelectRef<T = string> = {
  filter: string;
  filtered: DialogSelectOption<T>[];
  moveTo(value: T): void;
};

const DialogContext = createContext<TuiDialogContext>();

export function TuiDialogProvider(props: { children: JSX.Element }): JSX.Element {
  const [store, setStore] = createStore<{ stack: Exclude<DialogState, { type: "none" }>[] }>({
    stack: [],
  });
  const renderer = useRenderer();
  let focus: { focus(): void; blur(): void; isDestroyed?: boolean } | undefined;

  function refocus(): void {
    setTimeout(() => {
      if (!focus || focus.isDestroyed) return;
      focus.focus();
    }, 1);
  }

  const value: TuiDialogContext = {
    get state() {
      return store.stack.at(-1) ?? { type: "none" };
    },
    get stack() {
      return store.stack;
    },
    open(state) {
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable as typeof focus;
        focus?.blur();
      }
      setStore("stack", [...store.stack, state]);
    },
    replace(state) {
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable as typeof focus;
        focus?.blur();
      }
      setStore("stack", [state]);
    },
    pop() {
      setStore("stack", store.stack.slice(0, -1));
      if (store.stack.length <= 1) refocus();
    },
    clear() {
      setStore("stack", []);
      refocus();
    },
  };

  useBindings(() => ({
    enabled: store.stack.length > 0,
    bindings: [
      { key: "escape", cmd: value.pop },
      { key: "ctrl+c", cmd: value.pop },
    ],
  }));

  return <DialogContext.Provider value={value}>{props.children}</DialogContext.Provider>;
}

export function useTuiDialog(): TuiDialogContext {
  const value = useContext(DialogContext);
  if (!value) {
    throw new Error("TuiDialogProvider is missing");
  }
  return value;
}

export function DialogFrame(props: {
  title: string;
  children: JSX.Element;
  size?: "medium" | "large" | "xlarge";
}): JSX.Element {
  const dimensions = useTerminalDimensions();
  const theme = useTuiTheme();
  const dialog = useTuiDialog();
  const width = () => {
    if (props.size === "xlarge") return Math.min(116, dimensions().width - 2);
    if (props.size === "large") return Math.min(88, dimensions().width - 2);
    return Math.min(64, dimensions().width - 2);
  };
  const height = () => Math.min(Math.max(12, Math.floor(dimensions().height / 2)), dimensions().height - 4);

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={dimensions().width}
      height={dimensions().height}
      zIndex={3000}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      alignItems="center"
      paddingTop={Math.max(1, Math.floor(dimensions().height / 4))}
      onMouseUp={() => dialog.pop()}
    >
      <box
        width={width()}
        height={height()}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme.backgroundPanel}
        paddingTop={1}
        onMouseUp={(event: { stopPropagation(): void }) => event.stopPropagation()}
      >
        <box flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <box flexGrow={1} minHeight={0}>
          {props.children}
        </box>
      </box>
    </box>
  );
}

export function DialogSelect<T>(props: {
  title: string;
  options: DialogSelectOption<T>[];
  placeholder?: string;
  footer?: JSX.Element;
  current?: T;
  onSelect?(option: DialogSelectOption<T>): void;
  ref?: (ref: DialogSelectRef<T>) => void;
}): JSX.Element {
  const theme = useTuiTheme();
  const dialog = useTuiDialog();
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal(0);
  let input: InputRenderable | undefined;
  let scroll: ScrollBoxRenderable | undefined;

  const filtered = createMemo(() => {
    const needle = filter().trim().toLowerCase();
    const options = props.options.filter((option) => option.disabled !== true);
    if (!needle) return options;
    return options.filter((option) =>
      [option.title, option.description, option.category, option.footer]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  });

  const groups = createMemo(() => {
    const result: Array<{ category: string; options: DialogSelectOption<T>[] }> = [];
    for (const option of filtered()) {
      const category = option.category ?? "";
      const existing = result.find((item) => item.category === category);
      if (existing) existing.options.push(option);
      else result.push({ category, options: [option] });
    }
    return result;
  });

  const current = createMemo(() => filtered()[selected()]);

  createEffect(() => {
    if (selected() >= filtered().length) setSelected(Math.max(0, filtered().length - 1));
    scrollToSelection();
    props.ref?.({
      get filter() {
        return filter();
      },
      get filtered() {
        return filtered();
      },
      moveTo(value) {
        const index = filtered().findIndex((option) => option.value === value);
        if (index >= 0) setSelected(index);
      },
    });
  });

  function choose(option = current()): void {
    if (!option) return;
    props.onSelect?.(option);
    option.onSelect?.();
    dialog.clear();
  }

  function move(delta: -1 | 1): void {
    const count = filtered().length;
    if (count === 0) return;
    setSelected((value) => (value + delta + count) % count);
  }

  function scrollToSelection(): void {
    if (!scroll || scroll.isDestroyed) return;
    const row = selectedRowOffset(groups(), selected());
    const visible = Math.max(1, scroll.height - 2);
    if (row < scroll.scrollTop) {
      scroll.scrollTo(row);
      return;
    }
    if (row >= scroll.scrollTop + visible) {
      scroll.scrollTo(Math.max(0, row - visible + 1));
    }
  }

  useBindings(() => ({
    enabled: dialog.state.type !== "none",
    bindings: [
      { key: "up", cmd: () => move(-1) },
      { key: "down", cmd: () => move(1) },
      { key: "return", cmd: () => choose() },
      { key: "kpenter", cmd: () => choose() },
      { key: "linefeed", cmd: () => choose() },
    ],
  }));

  return (
    <DialogFrame title={props.title} size="large">
      <box paddingLeft={2} paddingRight={2} flexShrink={0}>
        <input
          ref={(value: InputRenderable) => {
            input = value;
            setTimeout(() => input?.focus(), 1);
          }}
          width="100%"
          placeholder={props.placeholder ?? "Filter"}
          placeholderColor={theme.textMuted}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.primary}
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "kpenter", action: "submit" },
            { name: "linefeed", action: "submit" },
          ]}
          onInput={(value: string) => setFilter(value)}
          onSubmit={() => choose()}
        />
      </box>
      <scrollbox ref={(value: ScrollBoxRenderable) => (scroll = value)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
        <For each={groups()}>
          {(group) => (
            <box paddingLeft={1} paddingRight={1}>
              <Show when={group.category}>
                <text fg={theme.textMuted}>{group.category}</text>
              </Show>
              <For each={group.options}>
                {(option) => {
                  const index = () => filtered().indexOf(option);
                  const active = () => index() === selected();
                  const bg = () => (active() ? theme.primary : undefined);
                  const fg = () => (active() ? selectedForeground(theme, bg()) : theme.text);
                  const content = (
                    <>
                      <box flexDirection="row" justifyContent="space-between">
                        <Show
                          when={active()}
                          fallback={<text fg={fg()}>{option.title}</text>}
                        >
                          <text fg={fg()} attributes={TextAttributes.BOLD}>
                            {option.title}
                          </text>
                        </Show>
                        <text fg={active() ? fg() : theme.textMuted}>{option.footer ?? ""}</text>
                      </box>
                      <Show when={option.description}>
                        <text fg={active() ? fg() : theme.textMuted}>{option.description}</text>
                      </Show>
                    </>
                  );
                  return (
                    <Show
                      when={active()}
                      fallback={
                        <box paddingLeft={1} paddingRight={1} onMouseUp={() => choose(option)}>
                          {content}
                        </box>
                      }
                    >
                      <box
                        paddingLeft={1}
                        paddingRight={1}
                        backgroundColor={theme.primary}
                        onMouseUp={() => choose(option)}
                      >
                        {content}
                      </box>
                    </Show>
                  );
                }}
              </For>
            </box>
          )}
        </For>
        <Show when={filtered().length === 0}>
          <box paddingLeft={2}>
            <text fg={theme.textMuted}>No matches.</text>
          </box>
        </Show>
      </scrollbox>
      <box paddingLeft={2} paddingRight={2} flexShrink={0} flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>↑↓ move  enter select</text>
        {props.footer ?? <text fg={theme.textMuted}>ctrl+c close</text>}
      </box>
    </DialogFrame>
  );
}

export function EmptyDialogHint(props: { children: JSX.Element }): JSX.Element {
  const theme = useTuiTheme();
  return (
    <box paddingTop={1} paddingLeft={2}>
      <text fg={theme.textMuted}>{props.children}</text>
    </box>
  );
}

function selectedRowOffset<T>(
  groups: Array<{ category: string; options: DialogSelectOption<T>[] }>,
  selected: number,
): number {
  let row = 0;
  let remaining = selected;
  for (const group of groups) {
    if (group.category) row += 1;
    if (remaining < group.options.length) {
      return row + remaining * 2;
    }
    row += group.options.length * 2;
    remaining -= group.options.length;
  }
  return row;
}
