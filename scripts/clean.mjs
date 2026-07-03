import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

async function removePackageDists(root) {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    await rm(join(root, entry.name, "dist"), { recursive: true, force: true });
  }
}

await removePackageDists("apps");
await removePackageDists("packages");
await rm(".ego", { recursive: true, force: true });

console.log("Cleaned generated EGO-Graph artifacts");
