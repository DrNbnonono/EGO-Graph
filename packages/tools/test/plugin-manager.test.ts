import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  installCuratedPlugin,
  listCuratedPlugins,
  setPluginEnabled,
  uninstallPlugin,
  verifyCuratedPlugin,
  verifyInstalledPlugin,
} from "../src/plugin-manager.js";

describe("curated plugin lifecycle", () => {
  it("verifies, installs, and uninstalls an offline plugin", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-plugin-manager-"));
    await cp(join(process.cwd(), "plugins"), join(root, "plugins"), { recursive: true });

    const catalog = await listCuratedPlugins(root);
    expect(catalog.map((entry) => entry.name)).toContain("ego-web-toolkit");
    await expect(verifyCuratedPlugin(root, "ego-web-toolkit")).resolves.toMatchObject({ ok: true });

    const installed = await installCuratedPlugin(root, "ego-web-toolkit");
    const saved = JSON.parse(await readFile(installed.path, "utf8")) as { source?: string };
    expect(saved.source).toBe("curated");
    expect((await setPluginEnabled(root, "ego-web-toolkit", true)).enabledByDefault).toBe(true);
    await expect(verifyInstalledPlugin(root, "ego-web-toolkit")).resolves.toMatchObject({
      ok: true,
      catalogVerified: true,
      requiredImages: ["ego-toolkit-core"],
    });

    await uninstallPlugin(root, "ego-web-toolkit");
    await expect(readFile(installed.path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a manifest whose checksum no longer matches the catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "ego-plugin-manager-tampered-"));
    await cp(join(process.cwd(), "plugins"), join(root, "plugins"), { recursive: true });
    const path = join(root, "plugins", "ego-web-toolkit", "ego.plugin.json");
    const original = await readFile(path, "utf8");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path, `${original}\n`, "utf8"));
    await expect(verifyCuratedPlugin(root, "ego-web-toolkit")).rejects.toThrow("checksum mismatch");
  });
});
