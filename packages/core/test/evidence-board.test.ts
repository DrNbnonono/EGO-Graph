import { describe, expect, it } from "vitest";
import { addEvidenceItem, createEvidenceBoard, evidenceItemFromFinding } from "../src/index.js";

describe("EvidenceBoard", () => {
  it("deduplicates evidence by stable id", () => {
    const item = evidenceItemFromFinding({
      summary: "Fixture contains an exposed admin hint",
      source: "fixture.read",
      raw: {},
    });

    const board = addEvidenceItem(addEvidenceItem(createEvidenceBoard(), item), item);

    expect(board.items).toHaveLength(1);
    expect(board.items[0]?.kind).toBe("fact");
  });
});
