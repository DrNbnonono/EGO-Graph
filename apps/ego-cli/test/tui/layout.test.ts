import { describe, expect, it } from "vitest";
import { chooseTuiLayout } from "../../src/tui/layout.js";

describe("TUI layout", () => {
  it("hides the side panel on narrow terminals", () => {
    expect(chooseTuiLayout(88).showSidePanel).toBe(false);
    expect(chooseTuiLayout(88).mode).toBe("single");
  });

  it("keeps conversation as the primary surface on wide terminals", () => {
    const layout = chooseTuiLayout(160, true);

    expect(layout.showSidePanel).toBe(true);
    expect(layout.conversationWidth).toBeGreaterThan(layout.sidePanelWidth);
  });
});
