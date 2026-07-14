import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./tool-definition.js";
import { createWebSearchTool } from "./web-search-tool.js";

export const skillManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(z.string()),
  tools: z.array(z.string()),
  permissions: z.array(z.string()),
  entry: z.string().min(1),
});

export const pluginManifestSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  skills: z.array(skillManifestSchema).optional(),
  mcpServers: z
    .record(
      z.object({
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .optional(),
  tools: z.array(z.string()).optional(),
  runtime: z
    .object({
      binaries: z.array(z.string()).optional(),
      images: z.array(z.object({ name: z.string().min(1), digest: z.string().min(1) })).optional(),
    })
    .optional(),
  fixtures: z.array(z.string()).optional(),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u).optional(),
  source: z.enum(["built-in", "curated", "local"]).optional(),
  enabledByDefault: z.boolean(),
});

export type SkillManifest = z.output<typeof skillManifestSchema>;
export type PluginManifest = z.output<typeof pluginManifestSchema>;

export type SkillRegistry = {
  registerSkill(skill: SkillManifest): void;
  registerTool(tool: ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>): void;
  listSkills(): SkillManifest[];
  listTools(): ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>[];
};

export type PluginManifestLoadResult = {
  plugins: PluginManifest[];
  errors: Array<{ path: string; message: string }>;
};

export function createSkillRegistry(): SkillRegistry {
  const skills = new Map<string, SkillManifest>();
  const tools = new Map<string, ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>>();

  return {
    registerSkill(skill) {
      if (skills.has(skill.name)) {
        throw new Error(`Skill already registered: ${skill.name}`);
      }
      skills.set(skill.name, skill);
    },
    registerTool(tool) {
      if (tools.has(tool.name)) {
        throw new Error(`Tool already registered: ${tool.name}`);
      }
      tools.set(tool.name, tool);
    },
    listSkills() {
      return [...skills.values()].sort((left, right) => left.name.localeCompare(right.name));
    },
    listTools() {
      return [...tools.values()].sort((left, right) => left.name.localeCompare(right.name));
    },
  };
}

export function createBuiltinSkillRegistry(): SkillRegistry {
  const registry = createSkillRegistry();
  for (const skill of builtinSkills()) {
    registry.registerSkill(skill);
  }
  registry.registerTool(createWebSearchTool());
  return registry;
}

export async function loadPluginManifests(root: string): Promise<PluginManifestLoadResult> {
  const candidates = [join(root, "ego.plugin.json"), ...(await pluginDirectoryCandidates(root))];
  const plugins: PluginManifest[] = [];
  const errors: PluginManifestLoadResult["errors"] = [];

  for (const candidate of candidates) {
    try {
      const manifest = pluginManifestSchema.parse(JSON.parse(await readFile(candidate, "utf8")));
      plugins.push(manifest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      errors.push({
        path: candidate,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { plugins, errors };
}

function builtinSkills(): SkillManifest[] {
  return [
    {
      name: "workspace",
      version: "0.1.0",
      description: "Read and summarize files inside the current workspace.",
      capabilities: ["workspace.read", "workspace.search"],
      tools: [],
      permissions: ["file:read"],
      entry: "builtin:workspace",
    },
    {
      name: "shell-readonly",
      version: "0.1.0",
      description: "Run non-mutating diagnostic shell commands.",
      capabilities: ["shell.run"],
      tools: [],
      permissions: ["process:readonly"],
      entry: "builtin:shell-readonly",
    },
    {
      name: "web-search",
      version: "0.1.0",
      description: "Search public web sources with cited snippets.",
      capabilities: ["web.search"],
      tools: ["web.search"],
      permissions: ["network:public"],
      entry: "builtin:web-search",
    },
    {
      name: "ctf-basic",
      version: "0.1.0",
      description: "Provide the controlled CTF task entrypoint and safety reminders.",
      capabilities: ["ctf.task", "ctf.report"],
      tools: [],
      permissions: ["fixture:read"],
      entry: "builtin:ctf-basic",
    },
  ];
}

async function pluginDirectoryCandidates(root: string): Promise<string[]> {
  const dir = join(root, ".ego", "plugins");
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(dir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
