import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const localSkillSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).default("0.1.0"),
  description: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  entry: z.string().min(1),
  enabled: z.boolean().default(true),
});

const skillsConfigSchema = z.object({
  skills: z.array(localSkillSchema).default([]),
});

export type LocalSkillConfig = z.output<typeof localSkillSchema>;
export type PublicLocalSkill = LocalSkillConfig & {
  source: "local";
};

export type SaveLocalSkillInput = {
  workspaceRoot: string;
  skill: z.input<typeof localSkillSchema>;
};

export type LocalSkillNameInput = {
  workspaceRoot: string;
  name: string;
};

export async function listLocalSkills(workspaceRoot: string): Promise<{
  source: string | "none";
  skills: PublicLocalSkill[];
}> {
  const path = join(workspaceRoot, ".ego", "config.json");
  const existing = await readJsonObject(path);
  const parsed = skillsConfigSchema.parse(existing);
  return {
    source: Object.keys(existing).length > 0 ? path : "none",
    skills: parsed.skills.map((skill) => ({ ...skill, source: "local" })),
  };
}

export async function saveLocalSkill(input: SaveLocalSkillInput): Promise<{
  source: string;
  skills: PublicLocalSkill[];
}> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  await mkdir(join(input.workspaceRoot, ".ego"), { recursive: true });
  const existing = await readJsonObject(path);
  const parsed = skillsConfigSchema.parse(existing);
  const skill = localSkillSchema.parse(input.skill);
  const remaining = parsed.skills.filter((candidate) => candidate.name !== skill.name);
  await writeFile(
    path,
    `${JSON.stringify({ ...existing, skills: [...remaining, skill] }, null, 2)}\n`,
    "utf8",
  );
  const listed = await listLocalSkills(input.workspaceRoot);
  return { source: path, skills: listed.skills };
}

export async function deleteLocalSkill(input: LocalSkillNameInput): Promise<{
  source: string;
  skills: PublicLocalSkill[];
}> {
  const path = join(input.workspaceRoot, ".ego", "config.json");
  const existing = await readJsonObject(path);
  const parsed = skillsConfigSchema.parse(existing);
  await writeFile(
    path,
    `${JSON.stringify(
      {
        ...existing,
        skills: parsed.skills.filter((skill) => skill.name !== input.name),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const listed = await listLocalSkills(input.workspaceRoot);
  return { source: path, skills: listed.skills };
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
