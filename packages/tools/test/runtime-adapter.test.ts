import { describe, expect, it } from "vitest";
import {
  builtinReceipt,
  executeExternalBinary,
  getToolHealthRecord,
} from "../src/security/runtime-adapter.js";

describe("real tool runtime adapter", () => {
  it("executes a real argv process and records a verifiable receipt", async () => {
    const { result, receipt } = await executeExternalBinary({
      tool: "fixture.node.version",
      program: process.execPath,
      args: ["--version"],
      cwd: process.cwd(),
      timeoutMs: 10_000,
      version: process.version,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(process.version);
    expect(receipt.source).toBe("external");
    expect(receipt.argvDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.stdoutDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(getToolHealthRecord("fixture.node.version")).toMatchObject({
      status: "verified",
      successCount: 1,
      failureCount: 0,
    });
  });

  it("labels builtin execution receipts without pretending they are external", () => {
    const receipt = builtinReceipt("fixture.builtin", ["fixture://sample"]);
    expect(receipt).toMatchObject({
      tool: "fixture.builtin",
      source: "builtin",
      artifactRefs: ["fixture://sample"],
    });
  });
});
