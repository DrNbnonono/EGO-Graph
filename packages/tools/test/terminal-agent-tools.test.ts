import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTerminalAgentToolRegistry } from "../src/index.js";

describe("terminal agent tools", () => {
  it("lists, reads, greps, and maps workspace evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-tools-"));
    await writeFile(join(root, "README.md"), "hello lotus\n", "utf8");
    await writeFile(join(root, "package.json"), '{"name":"fixture"}', "utf8");
    const registry = createTerminalAgentToolRegistry();

    const listed = await registry
      .get("workspace.list")
      .execute({ limit: 10 }, { workspaceRoot: root });
    const read = await registry
      .get("workspace.read")
      .execute({ path: "README.md" }, { workspaceRoot: root });
    const grep = await registry
      .get("workspace.grep")
      .execute({ query: "lotus" }, { workspaceRoot: root });

    expect(listed.files).toContain("README.md");
    expect(read.content).toContain("hello lotus");
    expect(grep.matches[0]?.path).toBe("README.md");
    expect(registry.get("workspace.grep").evidenceMapper?.(grep)[0]?.summary).toContain("Found");
  });

  it("blocks non-readonly shell commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-shell-"));
    const tool = createTerminalAgentToolRegistry().get("shell.readonly");

    await expect(
      tool.execute({ program: "rm", args: ["-rf", "."] }, { workspaceRoot: root }),
    ).rejects.toThrow("not allowed");
  });

  it("runs readonly shell commands without mutating files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-shell-ok-"));
    await writeFile(join(root, "README.md"), "hello\n", "utf8");
    const tool = createTerminalAgentToolRegistry().get("shell.readonly");
    const result = await tool.execute(
      { program: "git", args: ["status", "--short"] },
      { workspaceRoot: root },
    );

    expect(result.command).toBe("git status --short");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("hello\n");
  });

  it("audits local manifests as a security-active tool without network scanning", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-security-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          remote: "git+https://example.test/repo.git",
          floating: "*",
        },
      }),
      "utf8",
    );
    const tool = createTerminalAgentToolRegistry().get("security.package_manifest_audit");

    const result = await tool.execute(
      { manifestPath: "package.json", includeDevDependencies: true },
      { workspaceRoot: root },
    );

    expect(tool.riskLevel).toBe("high");
    expect(tool.requiresApproval).toBe(true);
    expect(tool.sandboxProfile).toBe("process");
    expect(result.findings.join("\n")).toContain("remote dependency spec");
    expect(result.findings.join("\n")).toContain("unbounded dependency version");
  });

  it("provides lightweight TypeScript diagnostics, definitions, and references", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-terminal-lsp-"));
    await writeFile(join(root, "a.ts"), "export function lotus() { return 1; }\n", "utf8");
    await writeFile(join(root, "b.ts"), "import { lotus } from './a';\nlotus();\n", "utf8");
    await writeFile(join(root, "bad.ts"), "const value: string = 1;\n", "utf8");
    const registry = createTerminalAgentToolRegistry();

    const diagnostics = await registry
      .get("lsp.diagnostics")
      .execute({ path: "bad.ts" }, { workspaceRoot: root });
    const definition = await registry
      .get("lsp.definition")
      .execute({ path: "b.ts", symbol: "lotus" }, { workspaceRoot: root });
    const references = await registry
      .get("lsp.references")
      .execute({ path: "b.ts", symbol: "lotus" }, { workspaceRoot: root });

    expect(JSON.stringify(diagnostics.diagnostics)).toContain("string");
    expect(definition.locations[0]?.path).toBe("a.ts");
    expect(references.locations.map((location: { path: string }) => location.path)).toContain("b.ts");
  });
});
