import { describe, expect, it } from "vitest";
import {
  classifyShellCommand,
  isDestructiveCommand,
  assertReadonlySafe,
  assertWorkspacePath,
} from "../src/shell-command-policy.js";

describe("isDestructiveCommand", () => {
  it("blocks rm -rf /", () => {
    const result = isDestructiveCommand("rm", ["-rf", "/"]);
    expect(result.destructive).toBe(true);
    expect(result.reason).toContain("root");
  });

  it("blocks mkfs", () => {
    expect(isDestructiveCommand("mkfs", []).destructive).toBe(true);
  });

  it("blocks dd writing to device", () => {
    expect(isDestructiveCommand("dd", ["if=/dev/zero", "of=/dev/sda"]).destructive).toBe(true);
  });

  it("allows dd with non-device output", () => {
    expect(isDestructiveCommand("dd", ["if=input.bin", "of=output.bin"]).destructive).toBe(false);
  });

  it("blocks fork bomb pattern", () => {
    expect(isDestructiveCommand("bash", ["-c", ":(){ :|:& };:"]).destructive).toBe(true);
  });

  it("allows safe commands", () => {
    expect(isDestructiveCommand("ls", ["-la"]).destructive).toBe(false);
    expect(isDestructiveCommand("git", ["status"]).destructive).toBe(false);
  });

  it("blocks shutdown/reboot", () => {
    expect(isDestructiveCommand("shutdown", []).destructive).toBe(true);
    expect(isDestructiveCommand("reboot", []).destructive).toBe(true);
  });
});

describe("classifyShellCommand", () => {
  it("classifies git readonly subcommands", () => {
    for (const sub of ["status", "diff", "log", "show", "blame"]) {
      const result = classifyShellCommand("git", [sub]);
      expect(result.readonlySafe).toBe(true);
      expect(result.category).toBe("git_read");
    }
  });

  it("classifies git write subcommands as non-readonly", () => {
    for (const sub of ["add", "commit", "checkout", "merge"]) {
      const result = classifyShellCommand("git", [sub]);
      expect(result.readonlySafe).toBe(false);
      expect(result.category).toBe("git_write");
    }
  });

  it("rejects pnpm through shell-readonly; checks use dedicated tools", () => {
    for (const sub of ["typecheck", "test", "build", "lint", "--version"]) {
      const result = classifyShellCommand("pnpm", [sub]);
      expect(result.readonlySafe).toBe(false);
    }
  });

  it("classifies pnpm write scripts as non-readonly", () => {
    for (const sub of ["install", "add", "remove", "dev"]) {
      const result = classifyShellCommand("pnpm", [sub]);
      expect(result.readonlySafe).toBe(false);
    }
  });

  it("classifies filesystem read commands", () => {
    for (const cmd of ["ls", "pwd", "cat", "grep", "rg", "find", "wc"]) {
      const result = classifyShellCommand(cmd, []);
      expect(result.readonlySafe).toBe(true);
      expect(result.category).toBe("filesystem_read");
    }
  });

  it("rejects node even for version checks because it is an arbitrary code entrypoint", () => {
    const result = classifyShellCommand("node", ["--version"]);
    expect(result.readonlySafe).toBe(false);
  });

  it("classifies node script as non-readonly", () => {
    const result = classifyShellCommand("node", ["script.js"]);
    expect(result.readonlySafe).toBe(false);
  });

  it("classifies unknown commands as non-readonly", () => {
    const result = classifyShellCommand("some-unknown-cmd", []);
    expect(result.readonlySafe).toBe(false);
    expect(result.category).toBe("unknown");
  });

  it("classifies destructive commands", () => {
    const result = classifyShellCommand("mkfs", []);
    expect(result.destructive).toBe(true);
    expect(result.readonlySafe).toBe(false);
  });
});

describe("assertReadonlySafe", () => {
  it("passes for readonly commands", () => {
    expect(() => assertReadonlySafe("ls", ["-la"])).not.toThrow();
    expect(() => assertReadonlySafe("git", ["status"])).not.toThrow();
    expect(() => assertReadonlySafe("rg", ["lotus"])).not.toThrow();
  });

  it("throws for non-readonly commands", () => {
    expect(() => assertReadonlySafe("git", ["commit", "-m", "test"])).toThrow("not allowed");
    expect(() => assertReadonlySafe("pnpm", ["install"])).toThrow("not allowed");
  });

  it("throws for destructive commands", () => {
    expect(() => assertReadonlySafe("mkfs", [])).toThrow("Destructive");
  });
});

describe("assertWorkspacePath", () => {
  it("allows paths within workspace", () => {
    expect(() => assertWorkspacePath("src/index.ts", "/workspace")).not.toThrow();
    expect(() => assertWorkspacePath("./src/index.ts", "/workspace")).not.toThrow();
  });

  it("blocks paths escaping workspace", () => {
    expect(() => assertWorkspacePath("../../etc/passwd", "/workspace")).toThrow("escapes");
    expect(() => assertWorkspacePath("/etc/passwd", "/workspace")).toThrow("escapes");
  });
});
