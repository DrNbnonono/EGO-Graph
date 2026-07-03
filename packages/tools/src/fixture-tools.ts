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

const fixtureAttackSurfaceOutputSchema = z.object({
  links: z.array(z.string()),
  forms: z.array(z.string()),
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
    scenarios: ["web_pentest"],
    riskLevel: "low",
    sandboxProfile: "none",
    evidenceMapper(output) {
      return output.findings.map((summary) => ({summary, raw: output}));
    },
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

export function createFixtureAttackSurfaceTool(): ToolDefinition<
  typeof fixtureReadInputSchema,
  typeof fixtureAttackSurfaceOutputSchema
> {
  return {
    name: "fixture.attack_surface",
    description: "Extract links and form entry points from the controlled web fixture",
    inputSchema: fixtureReadInputSchema,
    outputSchema: fixtureAttackSurfaceOutputSchema,
    permission: {scope: "fixture", risk: "low", requiresSandbox: false},
    scenarios: ["web_pentest"],
    riskLevel: "low",
    sandboxProfile: "none",
    evidenceMapper(output) {
      return output.findings.map((summary) => ({summary, raw: output}));
    },
    async execute(input, context) {
      const path = join(context.workspaceRoot, "scenarios", "web_pentest", "basic", "target.html");
      const body = await readFile(path, "utf8");
      const links = [...body.matchAll(/href="(?<href>[^"]+)"/g)].map(
        (match) => match.groups?.href ?? "",
      );
      const forms = [...body.matchAll(/<form[^>]*action="(?<action>[^"]+)"/g)].map(
        (match) => match.groups?.action ?? "",
      );
      const findings = [
        ...links
          .filter((link) => link.toLowerCase().includes("admin"))
          .map((link) => `Fixture exposes administrative path candidate: ${link}`),
        ...forms.map((form) => `Fixture exposes form entry point: ${form}`),
      ];

      return fixtureAttackSurfaceOutputSchema.parse({
        ...input,
        links: links.filter((link) => link.length > 0),
        forms: forms.filter((form) => form.length > 0),
        findings,
      });
    },
  };
}
