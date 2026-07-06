import { describe, expect, it } from "vitest";
import {
  createPromptChrome,
  createPromptState,
  editPrompt,
  getPromptRenderMetrics,
} from "../../src/tui/prompt-input.js";

describe("prompt input model", () => {
  it("supports cursor movement and insert/delete editing", () => {
    let state = createPromptState("你好ab");
    state = editPrompt(state, { type: "move-left" });
    state = editPrompt(state, { type: "insert", text: "!" });

    expect(state.value).toBe("你好a!b");
    expect(state.cursor).toBe(4);

    state = editPrompt(state, { type: "delete-before" });
    expect(state.value).toBe("你好ab");
    expect(state.cursor).toBe(3);
  });

  it("supports home/end and ctrl-style line edits", () => {
    let state = createPromptState("abcdef");
    state = editPrompt(state, { type: "move-home" });
    state = editPrompt(state, { type: "insert", text: ">" });
    state = editPrompt(state, { type: "move-end" });
    state = editPrompt(state, { type: "delete-after" });

    expect(state.value).toBe(">abcdef");

    state = editPrompt(state, { type: "clear-before" });
    expect(state.value).toBe("");
    expect(state.cursor).toBe(0);
  });

  it("walks input history with up/down without changing conversation scroll", () => {
    let state = createPromptState("draft", ["first", "second"]);

    state = editPrompt(state, { type: "history-prev" });
    expect(state.value).toBe("second");
    expect(state.draftBeforeHistory).toBe("draft");

    state = editPrompt(state, { type: "history-prev" });
    expect(state.value).toBe("first");

    state = editPrompt(state, { type: "history-next" });
    expect(state.value).toBe("second");

    state = editPrompt(state, { type: "history-next" });
    expect(state.value).toBe("draft");
    expect(state.historyIndex).toBeNull();
    expect(state.draftBeforeHistory).toBeUndefined();
  });

  it("caps multiline prompt height so the input stays anchored", () => {
    const state = createPromptState("1\n2\n3\n4\n5\n6\n7");
    const metrics = getPromptRenderMetrics(state, 80);

    expect(metrics.lines).toHaveLength(6);
    expect(metrics.height).toBe(9);
  });

  it("uses the concept-style prompt chrome", () => {
    const chrome = createPromptChrome(80, false);

    expect(chrome.promptPrefix).toBe("> ");
    expect(chrome.footer).toBe("ctrl+p commands  /help status");
    expect(chrome.separator).toHaveLength(78);
  });
});
