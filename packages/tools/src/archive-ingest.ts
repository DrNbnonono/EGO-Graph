import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { z } from "zod";
import type { ToolDefinition } from "./tool-definition.js";

const archiveInput = z.object({
  path: z.string().min(1),
  maxEntries: z.number().int().min(1).max(100).default(100),
  maxUncompressedBytes: z.number().int().min(1).max(50_000_000).default(50_000_000),
});

const archiveOutput = z.object({
  path: z.string(),
  entries: z.array(z.object({
    name: z.string(),
    size: z.number().int().nonnegative(),
    sha256: z.string(),
    contentPreview: z.string().optional(),
  })),
  totalUncompressedBytes: z.number().int().nonnegative(),
  findings: z.array(z.string()),
});

export function createArchiveInspectTool(): ToolDefinition<typeof archiveInput, typeof archiveOutput> {
  return {
    name: "artifact.archive.inspect",
    description: "Safely inspect a local ZIP without extracting paths to disk.",
    inputSchema: archiveInput,
    outputSchema: archiveOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "artifact.archive.inspect",
    permissionResources: (input) => [input.path],
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    async execute(input, context) {
      const absolute = resolveInsideWorkspace(context.workspaceRoot, input.path);
      const bytes = await readFile(absolute);
      const entries = inspectZip(bytes, {
        maxEntries: input.maxEntries,
        maxUncompressedBytes: input.maxUncompressedBytes,
      });
      return {
        path: input.path,
        entries,
        totalUncompressedBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
        findings: [
          `Safely inspected ${entries.length} ZIP entr${entries.length === 1 ? "y" : "ies"}.`,
          ...entries.slice(0, 20).map((entry) => `${entry.name} (${entry.size} bytes, sha256:${entry.sha256.slice(0, 12)})`),
        ],
      };
    },
    evidenceMapper(output) {
      return output.entries.map((entry) => ({
        summary: `Archive artifact ${entry.name} (${entry.size} bytes).`,
        kind: "artifact" as const,
        confidence: 0.95,
        artifactRefs: [`archive:${output.path}#${entry.name}`],
        raw: { sha256: entry.sha256, contentPreview: entry.contentPreview },
      }));
    },
  };
}

export function inspectZip(
  bytes: Uint8Array,
  limits: { maxEntries: number; maxUncompressedBytes: number },
): Array<{ name: string; size: number; sha256: string; contentPreview?: string }> {
  const buffer = Buffer.from(bytes);
  const eocd = findSignatureBackwards(buffer, 0x06054b50);
  if (eocd < 0) throw new Error("Invalid ZIP: end-of-central-directory not found.");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > limits.maxEntries) throw new Error(`ZIP entry limit exceeded: ${entryCount}/${limits.maxEntries}.`);
  const entries: Array<{ name: string; size: number; sha256: string; contentPreview?: string }> = [];
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP central directory.");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    assertSafeArchiveEntry(name, externalAttributes);
    if ((flags & 1) !== 0) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
    total += uncompressedSize;
    if (total > limits.maxUncompressedBytes) throw new Error(`ZIP uncompressed-size limit exceeded: ${total}.`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > 200) throw new Error(`Suspicious ZIP compression ratio: ${name}`);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : undefined;
    if (!content) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    if (content.length !== uncompressedSize) throw new Error(`ZIP size mismatch: ${name}`);
    const entry = {
      name,
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
      ...(isTextContent(content) ? { contentPreview: content.toString("utf8", 0, 4_000) } : {}),
    };
    entries.push(entry);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function assertSafeArchiveEntry(name: string, externalAttributes: number): void {
  const normalized = name.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.split("/").includes("..") || normalized.includes("\0")) {
    throw new Error(`Unsafe ZIP path rejected: ${name}`);
  }
  const unixMode = externalAttributes >>> 16;
  if ((unixMode & 0o170000) === 0o120000) throw new Error(`ZIP symbolic link rejected: ${name}`);
}

function resolveInsideWorkspace(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}/`) && !target.startsWith(`${resolvedRoot}\\`)) {
    throw new Error(`Archive path escapes workspace: ${relativePath}`);
  }
  return target;
}

function findSignatureBackwards(buffer: Buffer, signature: number): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

function isTextContent(content: Buffer): boolean {
  const sample = content.subarray(0, 4_000);
  return !sample.includes(0) && sample.every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32);
}
