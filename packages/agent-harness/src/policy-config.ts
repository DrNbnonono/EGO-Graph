import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultLoopPolicy, type LoopPolicy } from "./loop-policy.js";

/**
 * Persisted user-configurable loop policy, stored at `.ego/policy.json`.
 * Mirrors the `.ego/config.json` model-settings pattern already used by
 * @ego-graph/llm: env vars are not involved here (this is a purely local,
 * per-workspace preference), so the lookup order is just
 * `.ego/policy.json` -> defaultLoopPolicy.
 */

export function policyConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".ego", "policy.json");
}

export async function loadPersistedLoopPolicy(
  workspaceRoot: string,
): Promise<Partial<LoopPolicy>> {
  const path = policyConfigPath(workspaceRoot);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return sanitizePolicyInput(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    // Malformed policy file: fall back to defaults rather than crashing the
    // session; the caller can still override via mergeLoopPolicy at runtime.
    return {};
  }
}

export async function savePersistedLoopPolicy(
  workspaceRoot: string,
  policy: Partial<LoopPolicy>,
): Promise<LoopPolicy> {
  const path = policyConfigPath(workspaceRoot);
  await mkdir(join(workspaceRoot, ".ego"), { recursive: true });
  const merged = { ...defaultLoopPolicy, ...sanitizePolicyInput(policy) };
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

function sanitizePolicyInput(value: unknown): Partial<LoopPolicy> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const result: Partial<LoopPolicy> = {};
  for (const key of Object.keys(defaultLoopPolicy) as Array<keyof LoopPolicy>) {
    const raw = record[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      result[key] = raw;
    }
  }
  return result;
}
