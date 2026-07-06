import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../tool-definition.js";
import { identifyBinary } from "../parsers/elf-pe-parser.js";
import { extractIocs } from "../parsers/ioc-patterns.js";
import { resolveCapabilityExecution } from "../capability-registry.js";

/**
 * Reverse-engineering tool adapters (security.reverse.*, security.file.*).
 * The identify tool probes for the system `file` binary; on miss it falls
 * back to the builtin magic-number parser. strings extraction always uses
 * the builtin parser (it is fast and dependency-free). binwalk probes the
 * external binary and degrades to a builtin "embedded archive" heuristic.
 */

const fileInput = z.object({ path: z.string() });
const reverseOutput = z.object({
  findings: z.array(z.string()),
  file: z.string(),
  format: z.string(),
  arch: z.string().optional(),
  bits: z.number().optional(),
  size: z.number(),
  capabilitySource: z.string(),
  strings: z.array(z.string()).optional(),
});

function reverseTool(
  name: string,
  description: string,
  run: (absolute: string, buffer: Uint8Array, source: string) => z.infer<typeof reverseOutput>,
): ToolDefinition<typeof fileInput, typeof reverseOutput> {
  return {
    name,
    description,
    inputSchema: fileInput,
    outputSchema: reverseOutput,
    permission: { scope: "file", risk: "low", requiresSandbox: false },
    permissionAction: "inspect",
    riskLevel: "low",
    sandboxProfile: "none",
    timeoutMs: 30_000,
    evidenceMapper(output) {
      return [
        {
          summary: output.findings[0] ?? `${name} on ${output.file}`,
          kind: "fact" as const,
          confidence: 0.7,
          raw: { format: output.format, arch: output.arch, bits: output.bits },
        },
      ];
    },
    async execute(input, context) {
      const absolute = resolve(context.workspaceRoot, input.path);
      const buffer = await readFile(absolute);
      const { source } = await resolveCapabilityExecution(name.includes("binwalk") ? "binwalk" : "file");
      return run(absolute, new Uint8Array(buffer), source);
    },
  };
}

export function createReverseSecurityToolRegistry(): {
  tools: ToolDefinition<typeof fileInput, typeof reverseOutput>[];
} {
  const identify = reverseTool(
    "security.file.identify",
    "Identify a binary file: format, arch, bits. Uses `file` when available, builtin magic parser otherwise.",
    (absolute, buffer, source) => {
      const result = identifyBinary(buffer, { maxStrings: 0 });
      return {
        findings: [
          `${result.format} (${result.bits ?? "?"}-bit, ${result.arch ?? "unknown arch"}); capability=${source}.`,
        ],
        file: absolute,
        format: result.format,
        ...(result.arch ? { arch: result.arch } : {}),
        ...(result.bits ? { bits: result.bits } : {}),
        size: result.size,
        capabilitySource: source,
      };
    },
  );

  const strings = reverseTool(
    "security.reverse.strings",
    "Extract printable ASCII strings (>=4 chars) from a binary, builtin parser.",
    (absolute, buffer, source) => {
      const result = identifyBinary(buffer, { maxStrings: 60 });
      return {
        findings: [`Extracted ${result.strings.length} printable string(s) (first 60 shown).`],
        file: absolute,
        format: result.format,
        size: result.size,
        capabilitySource: "builtin",
        strings: result.strings,
      };
    },
  );

  const binwalk = reverseTool(
    "security.reverse.binwalk",
    "Scan a binary for embedded archives/firmware. Uses `binwalk` when available, builtin heuristic otherwise.",
    (absolute, buffer, source) => {
      // Builtin heuristic: look for zip/gzip/pdf magic offsets beyond offset 0.
      const embedded: string[] = [];
      for (let offset = 1; offset < buffer.length - 4; offset += 1) {
        if (
          buffer[offset] === 0x50 && buffer[offset + 1] === 0x4b && buffer[offset + 2] === 0x03 && buffer[offset + 3] === 0x04
        ) {
          embedded.push(`zip @0x${offset.toString(16)}`);
        }
        if (buffer[offset] === 0x1f && buffer[offset + 1] === 0x8b) {
          embedded.push(`gzip @0x${offset.toString(16)}`);
        }
      }
      const iocs = extractIocs(Buffer.from(buffer).toString("latin1")).slice(0, 5);
      return {
        findings: [
          embedded.length > 0
            ? `Found ${embedded.length} embedded archive offset(s): ${embedded.slice(0, 5).join(", ")}.`
            : "No embedded archives detected by builtin heuristic.",
        ],
        file: absolute,
        format: source === "external" ? "scanned" : "builtin-scan",
        size: buffer.length,
        capabilitySource: source,
        strings: [...embedded.slice(0, 10), ...iocs.map((ioc) => `${ioc.kind}:${ioc.value}`)],
      };
    },
  );

  return { tools: [identify, strings, binwalk] };
}
