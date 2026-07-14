import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { pluginManifestSchema, type PluginManifest } from "./skill-registry.js";

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  plugins: z.array(
    z.object({
      name: z.string().min(1),
      manifest: z.string().min(1),
      checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      category: z.string().min(1),
    }),
  ),
});

export type CuratedPluginEntry = z.output<typeof catalogSchema>["plugins"][number];

export async function listCuratedPlugins(workspaceRoot: string): Promise<CuratedPluginEntry[]> {
  const catalogPath = join(workspaceRoot, "plugins", "catalog.json");
  const catalog = catalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
  return catalog.plugins;
}

export async function verifyCuratedPlugin(
  workspaceRoot: string,
  name: string,
): Promise<{ ok: true; entry: CuratedPluginEntry; manifest: PluginManifest }> {
  const entry = (await listCuratedPlugins(workspaceRoot)).find((item) => item.name === name);
  if (!entry) throw new Error(`Curated plugin not found: ${name}`);
  const catalogRoot = resolve(workspaceRoot, "plugins");
  const manifestPath = resolve(catalogRoot, entry.manifest);
  const relativePath = relative(catalogRoot, manifestPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Plugin manifest escapes catalog root: ${entry.manifest}`);
  }
  const content = await readFile(manifestPath, "utf8");
  const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  if (checksum !== entry.checksum) throw new Error(`Plugin checksum mismatch: ${name}`);
  return { ok: true, entry, manifest: pluginManifestSchema.parse(JSON.parse(content)) };
}

export async function installCuratedPlugin(
  workspaceRoot: string,
  name: string,
): Promise<{ path: string; manifest: PluginManifest }> {
  const verified = await verifyCuratedPlugin(workspaceRoot, name);
  const directory = join(workspaceRoot, ".ego", "plugins");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${basename(name)}.json`);
  const manifest = { ...verified.manifest, source: "curated" as const };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { path, manifest };
}

export async function uninstallPlugin(workspaceRoot: string, name: string): Promise<void> {
  await rm(join(workspaceRoot, ".ego", "plugins", `${basename(name)}.json`), { force: true });
}

export async function setPluginEnabled(
  workspaceRoot: string,
  name: string,
  enabled: boolean,
): Promise<PluginManifest> {
  const path = join(workspaceRoot, ".ego", "plugins", `${basename(name)}.json`);
  const current = pluginManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const updated = { ...current, enabledByDefault: enabled };
  await writeFile(path, `${JSON.stringify(updated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return updated;
}

export async function verifyInstalledPlugin(
  workspaceRoot: string,
  name: string,
): Promise<{
  ok: true;
  manifest: PluginManifest;
  catalogVerified: boolean;
  requiredBinaries: string[];
  requiredImages: string[];
}> {
  const path = join(workspaceRoot, ".ego", "plugins", `${basename(name)}.json`);
  const manifest = pluginManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const curated = await verifyCuratedPlugin(workspaceRoot, name);
  const catalogVerified =
    curated.manifest.name === manifest.name && curated.manifest.version === manifest.version;
  return {
    ok: true,
    manifest,
    catalogVerified,
    requiredBinaries: manifest.runtime?.binaries ?? [],
    requiredImages: manifest.runtime?.images?.map((image) => image.name) ?? [],
  };
}
