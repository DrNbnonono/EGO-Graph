import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("ego config model", () => {
  it("persists local model settings in .ego/config.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-cli-config-"));
    const cli = join(process.cwd(), "apps", "ego-cli", "dist", "index.js");
    await writeFile(join(root, "package.json"), '{"name":"ego-cli-config-fixture"}', "utf8");

    const result = await execa(process.execPath,
      [
        cli,
        "config",
        "model",
        "--provider",
        "openai-compatible",
        "--base-url",
        "https://gateway.example.test",
        "--api-key",
        "cli-secret-key",
        "--model",
        "cli-model",
      ],
      { cwd: root },
    );
    const config = JSON.parse(await readFile(join(root, ".ego", "config.json"), "utf8")) as {
      model: { provider: string; apiKey: string; model: string };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Model provider openai-compatible");
    expect(result.stdout).toContain("workspace-local");
    expect(config.model.provider).toBe("openai-compatible");
    expect(config.model.apiKey).toBe("cli-secret-key");
    expect(config.model.model).toBe("cli-model");
  });

  it("persists MCP and skill settings from the CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-cli-config-tools-"));
    const cli = join(process.cwd(), "apps", "ego-cli", "dist", "index.js");
    await writeFile(join(root, "package.json"), '{"name":"ego-cli-config-tools"}', "utf8");

    const mcp = await execa(process.execPath,
      [
        cli,
        "config",
        "mcp",
        "--name",
        "filesystem",
        "--command",
        process.execPath,
        "--args",
        "server.mjs,--readonly",
      ],
      { cwd: root },
    );
    const skill = await execa(process.execPath,
      [
        cli,
        "config",
        "skill",
        "--name",
        "report-writer",
        "--description",
        "Write reports",
        "--capabilities",
        "report.write,markdown.render",
        "--permissions",
        "file:write",
        "--entry",
        "local:report-writer",
      ],
      { cwd: root },
    );
    const config = JSON.parse(await readFile(join(root, ".ego", "config.json"), "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
      skills: Array<{ name: string; capabilities: string[] }>;
    };

    expect(mcp.exitCode).toBe(0);
    expect(mcp.stdout).toContain("MCP server filesystem");
    expect(skill.exitCode).toBe(0);
    expect(skill.stdout).toContain("Skill report-writer");
    expect(config.mcpServers.filesystem.command).toBe(process.execPath);
    expect(config.mcpServers.filesystem.args).toEqual(["server.mjs", "--readonly"]);
    expect(config.skills[0]?.name).toBe("report-writer");
    expect(config.skills[0]?.capabilities).toContain("report.write");
  });
});
