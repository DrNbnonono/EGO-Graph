import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {z} from "zod";
import type {ToolDefinition} from "./tool-definition.js";

const fixtureReadInputSchema = z.object({
  fixture: z.literal("fixture://web-pentest/basic"),
});

const fixtureReadOutputSchema = z.object({
  title: z.string(),
  body: z.string(),
  findings: z.array(z.string()),
});

export function createFixtureReadTool(): ToolDefinition<
  typeof fixtureReadInputSchema,
  typeof fixtureReadOutputSchema
> {
  return {
    name: "fixture.read",
    description: "Read the controlled web pentest fixture",
    inputSchema: fixtureReadInputSchema,
    outputSchema: fixtureReadOutputSchema,
    permission: {scope: "fixture", risk: "low", requiresSandbox: false},
    async execute(input, context) {
      const path = join(context.workspaceRoot, "scenarios", "web_pentest", "basic", "target.html");
      const body = await readFile(path, "utf8");
      const title = body.match(/<title>(?<title>[^<]+)<\/title>/)?.groups?.title ?? "Untitled";
      const findings = body.includes("admin")
        ? ["Fixture contains an exposed admin hint"]
        : ["Fixture contains no admin hint"];
      return fixtureReadOutputSchema.parse({...input, title, body, findings});
    },
  };
}
