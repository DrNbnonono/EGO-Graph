import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { RepoIndex } from "./repo-index.js";

export type DependencyGraph = {
  packageDependencies: Record<string, string[]>;
  internalImports: Array<{ from: string; to: string }>;
};

export async function buildDependencyGraph(
  workspaceRoot: string,
  repoIndex: RepoIndex,
): Promise<DependencyGraph> {
  const packageDependencies: Record<string, string[]> = {};
  for (const manifest of repoIndex.files.filter((file) => file.path.endsWith("package.json"))) {
    const json = await readJson(resolve(workspaceRoot, manifest.path));
    const deps = {
      ...(isObject(json.dependencies) ? json.dependencies : {}),
      ...(isObject(json.devDependencies) ? json.devDependencies : {}),
    };
    packageDependencies[dirname(manifest.path)] = Object.keys(deps).sort();
  }

  const internalImports: Array<{ from: string; to: string }> = [];
  for (const file of repoIndex.files.filter(
    (item) => item.kind === "source" || item.kind === "test",
  )) {
    const content = await readFile(resolve(workspaceRoot, file.path), "utf8").catch(() => "");
    for (const match of content.matchAll(/\bimport\s+.*?\s+from\s+["']([^"']+)["']/g)) {
      const target = match[1] ?? "";
      if (target.startsWith(".") || target.startsWith("@ego-graph/")) {
        internalImports.push({ from: file.path, to: target });
      }
    }
  }
  return { packageDependencies, internalImports };
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
