import { describe, expect, it } from "vitest";
import { createPromptState, editPrompt } from "../../src/tui/prompt-input.js";

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
    let state = createPromptState("", ["first", "second"]);

    state = editPrompt(state, { type: "history-prev" });
    expect(state.value).toBe("second");

    state = editPrompt(state, { type: "history-prev" });
    expect(state.value).toBe("first");

    state = editPrompt(state, { type: "history-next" });
    expect(state.value).toBe("second");
  });
});
