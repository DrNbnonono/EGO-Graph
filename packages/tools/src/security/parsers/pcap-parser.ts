/**
 * Pure-TS PCAP parser (builtin fallback for `security.pcap.summary`).
 *
 * Parses the pcap global header and per-packet headers (libpcap classic and
 * pcapng magic) directly from a buffer — no tshark required. It surfaces file
 * magic, link type, snaplen, packet count, approximate byte size, and a coarse
 * protocol distribution derived from link/ethertype heuristics. Detailed
 * dissection still delegates to tshark when the capability is detected.
 */

const PCAP_MAGICS = new Set<number>([
  0xa1b2c3d4, // classic, host byte order
  0xd4c3b2a1, // classic, swapped
  0x0a0d0d0a, // pcapng section header block
]);

const PCAPNG_SWAPPED = 0x0a0d0d0a;

export type PcapSummary = {
  magic: string;
  format: "pcap-classic" | "pcapng" | "unknown";
  byteOrder: "host" | "swapped" | "unknown";
  version?: string;
  linkType?: string;
  snaplen?: number;
  packetCount: number;
  approxBytes: number;
  protocolDistribution: Record<string, number>;
  truncated: boolean;
};

const LINK_TYPES: Record<number, string> = {
  0: "null-loopback",
  1: "ethernet",
  6: "token-ring",
  101: "raw-ip",
  113: "linux-sll",
  127: "ieee80211",
};

const ETHER_TYPES: Record<number, string> = {
  0x0800: "ipv4",
  0x0806: "arp",
  0x86dd: "ipv6",
  0x8100: "vlan",
};

const IP_PROTOCOLS: Record<number, string> = {
  1: "icmp",
  6: "tcp",
  17: "udp",
  47: "gre",
  89: "ospf",
  132: "sctp",
};

/**
 * Summarize a pcap file from raw bytes. Never throws; returns a summary with
 * `format: "unknown"` if the magic is unrecognized or the buffer is too short.
 */
export function summarizePcap(buffer: Uint8Array): PcapSummary {
  if (buffer.length < 24) {
    return emptySummary();
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, false);

  if (magic === PCAPNG_SWAPPED || magic === swap32(PCAPNG_SWAPPED)) {
    // pcapng: we still count packets by scanning block magic 0x06000000 + ts
    return summarizePcapng(buffer, view);
  }

  if (PCAP_MAGICS.has(magic) || PCAP_MAGICS.has(swap32(magic))) {
    return summarizeClassic(buffer, view, magic);
  }

  return emptySummary();
}

function summarizeClassic(buffer: Uint8Array, view: DataView, magic: number): PcapSummary {
  const swapped = magic === 0xd4c3b2a1 || magic === swap32(0xa1b2c3d4);
  const le = swapped; // swapped magic means little-endian reader reads big-endian wire
  try {
    const versionMajor = view.getUint16(4, le);
    const versionMinor = view.getUint16(6, le);
    const snaplen = view.getUint32(16, le);
    const linkType = view.getUint32(20, le);
    let offset = 24;
    let packetCount = 0;
    const protocols: Record<string, number> = {};
    let truncated = false;
    while (offset + 16 <= buffer.length) {
      const inclLen = view.getUint32(offset + 8, le);
      if (offset + 16 + inclLen > buffer.length) {
        truncated = true;
        break;
      }
      packetCount += 1;
      const linkName = LINK_TYPES[linkType] ?? `link-${linkType}`;
      classifyPacket(buffer, offset + 16, inclLen, linkName, protocols);
      offset += 16 + inclLen;
    }
    return {
      magic: `0x${magic.toString(16)}`,
      format: "pcap-classic",
      byteOrder: swapped ? "swapped" : "host",
      ...(versionMajor !== undefined
        ? { version: `${versionMajor}.${versionMinor}` }
        : {}),
      ...(LINK_TYPES[linkType] ? { linkType: LINK_TYPES[linkType] } : {}),
      snaplen,
      packetCount,
      approxBytes: buffer.length,
      protocolDistribution: protocols,
      truncated,
    };
  } catch {
    return emptySummary();
  }
}

function summarizePcapng(buffer: Uint8Array, view: DataView): PcapSummary {
  let offset = 0;
  let packetCount = 0;
  const protocols: Record<string, number> = {};
  let truncated = false;
  let byteOrder: PcapSummary["byteOrder"] =
    view.getUint32(8, false) === 0x1a2b3c4d ? "host" : "unknown";
  while (offset + 8 <= buffer.length) {
    const blockType = view.getUint32(offset, false);
    const blockLen = view.getUint32(offset + 4, false);
    if (blockLen < 12 || offset + blockLen > buffer.length) {
      truncated = true;
      break;
    }
    // Enhanced Packet Block (type 6) carries one captured packet.
    if (blockType === 0x00000006) {
      packetCount += 1;
      try {
        const pktLen = view.getUint32(offset + 20, false);
        const linkType = view.getUint32(offset + 8, false) & 0x0000ffff;
        const linkName = LINK_TYPES[linkType] ?? `link-${linkType}`;
        classifyPacket(buffer, offset + 28, pktLen, linkName, protocols);
      } catch {
        // ignore per-packet errors during counting
      }
    }
    offset += blockLen;
  }
  return {
    magic: "0x0a0d0d0a",
    format: "pcapng",
    byteOrder,
    packetCount,
    approxBytes: buffer.length,
    protocolDistribution: protocols,
    truncated,
  };
}

function classifyPacket(
  buffer: Uint8Array,
  offset: number,
  length: number,
  linkName: string,
  protocols: Record<string, number>,
): void {
  bump(protocols, linkName);
  if (linkName === "ethernet" && length >= 14) {
    const etherType = (buffer[offset + 12]! << 8) | buffer[offset + 13]!;
    const ether = ETHER_TYPES[etherType] ?? `ethertype-0x${etherType.toString(16)}`;
    bump(protocols, ether);
    if ((etherType === 0x0800 || etherType === 0x86dd) && length >= 24) {
      const ipOffset = offset + 14;
      const protocolByte = buffer[ipOffset + 9]!;
      const ipProto = IP_PROTOCOLS[protocolByte] ?? `ip-${protocolByte}`;
      bump(protocols, ipProto);
    }
  }
  if (linkName === "raw-ip" && length >= 10) {
    const protocolByte = buffer[offset + 9]!;
    bump(protocols, IP_PROTOCOLS[protocolByte] ?? `ip-${protocolByte}`);
  }
}

function bump(protocols: Record<string, number>, name: string): void {
  protocols[name] = (protocols[name] ?? 0) + 1;
}

function swap32(value: number): number {
  return (
    ((value & 0xff) << 24) |
    ((value & 0xff00) << 8) |
    ((value >> 8) & 0xff00) |
    ((value >> 24) & 0xff)
  ) >>> 0;
}

function emptySummary(): PcapSummary {
  return {
    magic: "unknown",
    format: "unknown",
    byteOrder: "unknown",
    packetCount: 0,
    approxBytes: 0,
    protocolDistribution: {},
    truncated: false,
  };
}
