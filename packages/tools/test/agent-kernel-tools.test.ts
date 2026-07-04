import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBuiltinSkillRegistry,
  createWebSearchTool,
  loadPluginManifests,
  skillManifestSchema,
} from "../src/index.js";

describe("agent kernel tools", () => {
  it("declares built-in skills and their tool capabilities", () => {
    const registry = createBuiltinSkillRegistry();
    const skills = registry.listSkills();

    expect(skills.map((skill) => skill.name)).toEqual([
      "ctf-basic",
      "shell-readonly",
      "web-search",
      "workspace",
    ]);
    expect(registry.listTools().map((tool) => tool.name)).toContain("web.search");
  });

  it("rejects malformed skill manifests", () => {
    expect(() => skillManifestSchema.parse({ name: "broken" })).toThrow();
  });

  it("loads plugin manifests without registering invalid plugin files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-plugin-manifests-"));
    await writeFile(
      join(root, "ego.plugin.json"),
      JSON.stringify({
        name: "fixture-plugin",
        version: "0.1.0",
        enabledByDefault: true,
        skills: [
          {
            name: "fixture-skill",
            version: "0.1.0",
            description: "Fixture skill",
            capabilities: ["workspace.read"],
            tools: [],
            permissions: [],
            entry: "index.js",
          },
        ],
      }),
      "utf8",
    );

    const result = await loadPluginManifests(root);

    expect(result.plugins.map((plugin) => plugin.name)).toEqual(["fixture-plugin"]);
    expect(result.errors).toEqual([]);
  });

  it("exposes web.search as a low-risk cached network tool", async () => {
    let calls = 0;
    const urls: string[] = [];
    const tool = createWebSearchTool({
      fetcher: async (url) => {
        calls += 1;
        urls.push(url);
        return new Response(
          JSON.stringify({
            AbstractText: "CTF writeups explain challenge-solving tactics.",
            AbstractURL: "https://example.test/ctf",
            RelatedTopics: [{ Text: "MCP tools", FirstURL: "https://example.test/mcp" }],
          }),
        );
      },
    });

    const first = await tool.execute({ query: "ctf agent" }, { workspaceRoot: process.cwd() });
    const second = await tool.execute({ query: "ctf agent" }, { workspaceRoot: process.cwd() });

    expect(tool.name).toBe("web.search");
    expect(tool.permission.scope).toBe("network");
    expect(first.results[0]?.url).toBe("https://example.test/ctf");
    expect(second.cached).toBe(true);
    expect(calls).toBe(1);
    expect(new URL(urls[0]!).searchParams.get("df")).toBeNull();
  });

  it("passes recency through to the search provider query", async () => {
    let requestedUrl = "";
    const tool = createWebSearchTool({
      fetcher: async (url) => {
        requestedUrl = url;
        return new Response(JSON.stringify({ RelatedTopics: [] }));
      },
    });

    await tool.execute(
      { query: "MiniMax M3 release", recencyDays: 7 },
      { workspaceRoot: process.cwd() },
    );

    expect(new URL(requestedUrl).searchParams.get("df")).toBe("w");
  });
});
