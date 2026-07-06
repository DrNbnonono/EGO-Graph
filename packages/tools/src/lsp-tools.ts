import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";
import { z } from "zod";
import type { ToolDefinition } from "./tool-definition.js";

const diagnosticsInputSchema = z.object({ path: z.string().min(1) });
const diagnosticsOutputSchema = z.object({
  diagnostics: z.array(
    z.object({
      path: z.string(),
      line: z.number().int().positive(),
      column: z.number().int().positive(),
      message: z.string(),
      code: z.number().int(),
      category: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

const symbolInputSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1),
});
const symbolOutputSchema = z.object({
  symbol: z.string(),
  locations: z.array(
    z.object({
      path: z.string(),
      line: z.number().int().positive(),
      column: z.number().int().positive(),
      text: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

export function createLspDiagnosticsTool(): ToolDefinition<
  typeof diagnosticsInputSchema,
  typeof diagnosticsOutputSchema
> {
  return {
    name: "lsp.diagnostics",
    version: "1",
    description: "Return TypeScript diagnostics for a workspace file.",
    inputSchema: diagnosticsInputSchema,
    outputSchema: diagnosticsOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const service = await createWorkspaceLanguageService(context.workspaceRoot);
      const file = resolveWorkspacePath(context.workspaceRoot, input.path);
      const source = service.program.getSourceFile(file);
      const diagnostics = source
        ? [
            ...service.language.getSyntacticDiagnostics(file),
            ...service.language.getSemanticDiagnostics(file),
          ].map((diagnostic) => formatDiagnostic(context.workspaceRoot, source, diagnostic))
        : [];
      return {
        diagnostics,
        findings:
          diagnostics.length > 0
            ? [`Found ${diagnostics.length} TypeScript diagnostic(s) in ${input.path}.`]
            : [`No TypeScript diagnostics found in ${input.path}.`],
      };
    },
  };
}

export function createLspDefinitionTool(): ToolDefinition<
  typeof symbolInputSchema,
  typeof symbolOutputSchema
> {
  return {
    name: "lsp.definition",
    version: "1",
    description: "Find the TypeScript definition location for a symbol in a workspace file.",
    inputSchema: symbolInputSchema,
    outputSchema: symbolOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const locations = await findSymbolLocations(context.workspaceRoot, input, "definition");
      return {
        symbol: input.symbol,
        locations,
        findings:
          locations.length > 0
            ? [`Found ${locations.length} definition location(s) for ${input.symbol}.`]
            : [`No definition found for ${input.symbol}.`],
      };
    },
  };
}

export function createLspReferencesTool(): ToolDefinition<
  typeof symbolInputSchema,
  typeof symbolOutputSchema
> {
  return {
    name: "lsp.references",
    version: "1",
    description: "Find TypeScript references for a symbol in a workspace file.",
    inputSchema: symbolInputSchema,
    outputSchema: symbolOutputSchema,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    riskLevel: "low",
    sandboxProfile: "none",
    async execute(input, context) {
      const locations = await findSymbolLocations(context.workspaceRoot, input, "references");
      return {
        symbol: input.symbol,
        locations,
        findings:
          locations.length > 0
            ? [`Found ${locations.length} reference location(s) for ${input.symbol}.`]
            : [`No references found for ${input.symbol}.`],
      };
    },
  };
}

async function findSymbolLocations(
  workspaceRoot: string,
  input: z.infer<typeof symbolInputSchema>,
  mode: "definition" | "references",
): Promise<z.infer<typeof symbolOutputSchema>["locations"]> {
  const service = await createWorkspaceLanguageService(workspaceRoot);
  const file = resolveWorkspacePath(workspaceRoot, input.path);
  const content = service.files.get(file) ?? "";
  const position = content.indexOf(input.symbol);
  if (position < 0) {
    return [];
  }
  const spans =
    mode === "definition"
      ? service.language.getDefinitionAtPosition(file, position) ?? []
      : service.language.getReferencesAtPosition(file, position) ?? [];
  return spans
    .map((span) => formatLocation(workspaceRoot, service.files, span.fileName, span.textSpan.start))
    .filter((location): location is z.infer<typeof symbolOutputSchema>["locations"][number] =>
      Boolean(location),
    );
}

async function createWorkspaceLanguageService(workspaceRoot: string): Promise<{
  files: Map<string, string>;
  language: ts.LanguageService;
  program: ts.Program;
}> {
  const root = resolve(workspaceRoot);
  const files = new Map<string, string>();
  for (const file of await listTypeScriptFiles(root)) {
    files.set(file, await readFile(file, "utf8"));
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot(fileName) {
      const content = files.get(resolve(fileName)) ?? ts.sys.readFile(fileName);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (compilerOptions) => ts.getDefaultLibFilePath(compilerOptions),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
  const language = ts.createLanguageService(host);
  const program = language.getProgram() ?? ts.createProgram([...files.keys()], options);
  return { files, language, program };
}

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walk(root, files, 0);
  return files;
}

async function walk(directory: string, files: string[], depth: number): Promise<void> {
  if (depth > 8 || files.length > 500) {
    return;
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "coverage"].includes(entry.name)) {
      continue;
    }
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, files, depth + 1);
    } else if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name)) {
      files.push(absolute);
    }
  }
}

function formatDiagnostic(
  workspaceRoot: string,
  source: ts.SourceFile,
  diagnostic: ts.Diagnostic,
): z.infer<typeof diagnosticsOutputSchema>["diagnostics"][number] {
  const start = diagnostic.start ?? 0;
  const position = source.getLineAndCharacterOfPosition(start);
  return {
    path: toWorkspacePath(workspaceRoot, source.fileName),
    line: position.line + 1,
    column: position.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    code: diagnostic.code,
    category: ts.DiagnosticCategory[diagnostic.category] ?? "Unknown",
  };
}

function formatLocation(
  workspaceRoot: string,
  files: Map<string, string>,
  fileName: string,
  start: number,
): z.infer<typeof symbolOutputSchema>["locations"][number] | undefined {
  const absolute = resolve(fileName);
  const content = files.get(absolute) ?? ts.sys.readFile(absolute);
  if (!content) {
    return undefined;
  }
  const source = ts.createSourceFile(absolute, content, ts.ScriptTarget.ES2022);
  const position = source.getLineAndCharacterOfPosition(start);
  const lineText = content.split(/\r?\n/u)[position.line] ?? "";
  return {
    path: toWorkspacePath(workspaceRoot, absolute),
    line: position.line + 1,
    column: position.character + 1,
    text: lineText.trim(),
  };
}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (relativePath.includes("\0") || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error(`Refusing unsafe workspace path: ${relativePath}`);
  }
  const root = resolve(workspaceRoot);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing path outside workspace: ${relativePath}`);
  }
  return target;
}

function toWorkspacePath(root: string, absolute: string): string {
  return relative(resolve(root), absolute).replaceAll("\\", "/");
}
