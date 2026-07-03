import {describe, expect, it} from "vitest";
import {parseTaskSpec} from "../src/task-spec.js";

describe("TaskSpec", () => {
  it("normalizes a controlled web pentest task", () => {
    const task = parseTaskSpec({
      scenario: "web_pentest",
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: ["fixture://web-pentest/basic"],
      constraints: ["authorized-fixture-only"],
    });

    expect(task.scenario).toBe("web_pentest");
    expect(task.targets[0]).toBe("fixture://web-pentest/basic");
    expect(task.allowedScope.kind).toBe("fixture");
  });

  it("rejects an empty target list", () => {
    expect(() =>
      parseTaskSpec({
        scenario: "web_pentest",
        goal: "Assess nothing",
        targets: [],
        constraints: ["authorized-fixture-only"],
      }),
    ).toThrow("TaskSpec");
  });
});
