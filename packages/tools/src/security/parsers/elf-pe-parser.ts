/**
 * Pure-TS binary file identification (builtin fallback for `security.file.identify`
 * and `security.reverse.*`). Reads magic numbers, ELF/PE headers, and Mach-O
 * fat headers directly — no `file` binary required.
 */

export type BinaryFormat =
  | "elf"
  | "pe"
  | "mach-o"
  | "java-class"
  | "zip"
  | "gzip"
  | "pdf"
  | "png"
  | "jpeg"
  | "text"
  | "unknown";

export type BinaryIdentifyResult = {
  format: BinaryFormat;
  arch?: string;
  bits?: 32 | 64;
  byteOrder?: "little" | "big";
  sections?: string[];
  entryPoint?: number;
  size: number;
  /** Printable ASCII strings (first N), best-effort. */
  strings: string[];
};

const MAGIC_TABLE: Array<{ format: BinaryFormat; offset: number; bytes: number[] }> = [
  { format: "elf", offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { format: "pe", offset: 0, bytes: [0x4d, 0x5a] },
  { format: "mach-o", offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { format: "mach-o", offset: 0, bytes: [0xfe, 0xed, 0xcf, 0xfa] },
  { format: "mach-o", offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { format: "java-class", offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { format: "zip", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { format: "gzip", offset: 0, bytes: [0x1f, 0x8b] },
  { format: "pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { format: "png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { format: "jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
];

export function identifyBinary(buffer: Uint8Array, options: { maxStrings?: number } = {}): BinaryIdentifyResult {
  const maxStrings = options.maxStrings ?? 40;
  const base: BinaryIdentifyResult = {
    format: detectFormat(buffer),
    size: buffer.length,
    strings: extractStrings(buffer, maxStrings),
  };
  if (base.format === "elf") {
    return { ...base, ...parseElf(buffer) };
  }
  if (base.format === "pe") {
    return { ...base, ...parsePe(buffer) };
  }
  if (base.format === "unknown" && isMostlyPrintable(buffer)) {
    return { ...base, format: "text" };
  }
  return base;
}

function detectFormat(buffer: Uint8Array): BinaryFormat {
  for (const entry of MAGIC_TABLE) {
    if (buffer.length < entry.offset + entry.bytes.length) {
      continue;
    }
    let match = true;
    for (let i = 0; i < entry.bytes.length; i += 1) {
      if (buffer[entry.offset + i] !== entry.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return entry.format;
    }
  }
  return "unknown";
}

function parseElf(buffer: Uint8Array): Partial<BinaryIdentifyResult> {
  if (buffer.length < 24) {
    return {};
  }
  const bits = buffer[4] === 2 ? 64 : 32;
  const littleEndian = buffer[5] === 1;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const machine = view.getUint16(0x12, littleEndian);
  const arch = ELF_MACHINE[machine] ?? `machine-0x${machine.toString(16)}`;
  return {
    bits,
    byteOrder: littleEndian ? "little" : "big",
    arch,
  };
}

function parsePe(buffer: Uint8Array): Partial<BinaryIdentifyResult> {
  if (buffer.length < 0x40) {
    return {};
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset + 6 > buffer.length) {
    return {};
  }
  const machine = view.getUint16(peOffset + 4, true);
  const arch = PE_MACHINE[machine] ?? `machine-0x${machine.toString(16)}`;
  return {
    arch,
    byteOrder: "little",
  };
}

function extractStrings(buffer: Uint8Array, max: number): string[] {
  const strings: string[] = [];
  let current = "";
  for (let i = 0; i < buffer.length && strings.length < max; i += 1) {
    const byte = buffer[i]!;
    if (byte >= 0x20 && byte < 0x7f) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 4) {
        strings.push(current);
      }
      current = "";
    }
  }
  if (current.length >= 4) {
    strings.push(current);
  }
  return strings;
}

function isMostlyPrintable(buffer: Uint8Array): boolean {
  if (buffer.length === 0) {
    return false;
  }
  const sample = Math.min(buffer.length, 512);
  let printable = 0;
  for (let i = 0; i < sample; i += 1) {
    const byte = buffer[i]!;
    if ((byte >= 0x20 && byte < 0x7f) || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      printable += 1;
    }
  }
  return printable / sample > 0.85;
}

const ELF_MACHINE: Record<number, string> = {
  0x03: "x86",
  0x3e: "x86_64",
  0x28: "arm",
  0xb7: "aarch64",
  0xf3: "riscv",
};

const PE_MACHINE: Record<number, string> = {
  0x014c: "x86",
  0x8664: "x86_64",
  0x01c0: "arm",
  0xaa64: "aarch64",
};
