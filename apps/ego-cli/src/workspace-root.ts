import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const workspaceMarkers = [
  [".ego", "config.json"],
  ["ego.config.json"],
  ["pnpm-workspace.yaml"],
  [".git"],
] as const;

export function resolveWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (workspaceMarkers.some((marker) => existsSync(join(current, ...marker)))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }
    current = parent;
  }
}

export function resolveWorkspaceEgoHome(workspaceRoot: string): string {
  return process.env.EGO_HOME ?? join(workspaceRoot, ".ego");
}
