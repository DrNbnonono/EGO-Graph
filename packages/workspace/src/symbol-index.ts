import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RepoIndex } from "./repo-index.js";

export type SymbolIndexEntry = {
  file: string;
  name: string;
  kind: "export" | "import" | "function" | "class" | "type" | "const";
  line: number;
};

export async function buildSymbolIndex(
  workspaceRoot: string,
  repoIndex: RepoIndex,
): Promise<SymbolIndexEntry[]> {
  const entries: SymbolIndexEntry[] = [];
  for (const file of repoIndex.files.filter(
    (item) => item.kind === "source" || item.kind === "test",
  )) {
    const content = await readFile(resolve(workspaceRoot, file.path), "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNo = index + 1;
      for (const match of line.matchAll(
        /\bexport\s+(?:async\s+)?(?:function|class|type|interface|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      )) {
        entries.push({ file: file.path, name: match[1] ?? "", kind: "export", line: lineNo });
      }
      for (const match of line.matchAll(/\bimport\s+.*?\s+from\s+["']([^"']+)["']/g)) {
        entries.push({ file: file.path, name: match[1] ?? "", kind: "import", line: lineNo });
      }
      for (const match of line.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
        entries.push({ file: file.path, name: match[1] ?? "", kind: "function", line: lineNo });
      }
      for (const match of line.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) {
        entries.push({ file: file.path, name: match[1] ?? "", kind: "class", line: lineNo });
      }
      for (const match of line.matchAll(/\b(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
        entries.push({ file: file.path, name: match[1] ?? "", kind: "type", line: lineNo });
      }
      for (const match of line.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)/g)) {
        entries.push({ file: file.path, name: match[1] ?? "", kind: "const", line: lineNo });
      }
    });
  }
  return entries.filter((entry) => entry.name);
}
