import { describe, expect, it } from "vitest";
import {
  clearCapabilityCache,
  createBuiltinOnlyCapability,
  detectAllCapabilities,
  detectCapability,
  registerCapabilityDetector,
  unregisterCapabilityDetector,
} from "../../src/security/capability-registry.js";
import {
  buildIncidentTimeline,
  detectAnomalies,
  parseLogEntries,
} from "../../src/security/parsers/log-parser.js";
import { extractIocs } from "../../src/security/parsers/ioc-patterns.js";
import { identifyBinary } from "../../src/security/parsers/elf-pe-parser.js";
import { summarizePcap } from "../../src/security/parsers/pcap-parser.js";
import { enforceEgressAllowlist, redactSecrets } from "../../src/security/sandbox/boundary.js";
import { createIrSecurityToolRegistry } from "../../src/security/ir/index.js";
import { createReportSecurityToolRegistry } from "../../src/security/report/index.js";

describe("security capability registry", () => {
  it("registers and detects a builtin-only capability", async () => {
    clearCapabilityCache();
    registerCapabilityDetector(createBuiltinOnlyCapability({ name: "test-builtin", label: "test builtin" }));
    const capability = await detectCapability("test-builtin", "2026-07-06T00:00:00Z");
    expect(capability?.source).toBe("builtin");
    expect(capability?.available).toBe(true);
    unregisterCapabilityDetector("test-builtin");
  });

  it("falls back gracefully when a binary is missing (unavailable or builtin)", async () => {
    clearCapabilityCache();
    const { createBinaryCapabilityDetector } = await import("../../src/security/capability-registry.js");
    registerCapabilityDetector(
      createBinaryCapabilityDetector({
        name: "definitely-missing-tool-xyz",
        label: "missing",
        binary: "definitely-missing-tool-xyz-12345",
        builtinFallback: true,
      }),
    );
    const capability = await detectCapability("definitely-missing-tool-xyz");
    expect(capability?.source).toBe("builtin"); // fallback path
    unregisterCapabilityDetector("definitely-missing-tool-xyz");
  });

  it("detectAllCapabilities returns every registered detector", async () => {
    clearCapabilityCache();
    registerCapabilityDetector(createBuiltinOnlyCapability({ name: "a-x", label: "a" }));
    registerCapabilityDetector(createBuiltinOnlyCapability({ name: "b-x", label: "b" }));
    const all = await detectAllCapabilities();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.map((capability) => capability.name)).toContain("a-x");
    unregisterCapabilityDetector("a-x");
    unregisterCapabilityDetector("b-x");
  });
});

describe("IR log parser", () => {
  const authLog = [
    "Jul  6 12:00:01 web01 sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 51000",
    "Jul  6 12:00:02 web01 sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 51001",
    "Jul  6 12:00:03 web01 sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 51002",
    "Jul  6 12:00:04 web01 sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 51003",
    "Jul  6 12:00:05 web01 sshd[1234]: Failed password for invalid user admin from 1.2.3.4 port 51004",
    "Jul  6 12:00:06 web01 sshd[1234]: Accepted password for realuser from 1.2.3.4 port 51005",
  ].join("\n");

  it("parses records with timestamps, levels, and fields", () => {
    const records = parseLogEntries(authLog);
    expect(records.length).toBe(6);
    expect(records[0]?.fields.ip).toBe("1.2.3.4");
    expect(records[0]?.fields.user).toBe("admin");
    expect(records[0]?.level).toBe("error"); // "Failed password" -> error
  });

  it("detects brute-force anomaly after repeated failures", () => {
    const records = parseLogEntries(authLog);
    const anomalies = detectAnomalies(records);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.some((a) => /brute-force/iu.test(a.raw))).toBe(true);
  });

  it("buildIncidentTimeline orders by timestamp", () => {
    const records = parseLogEntries(authLog);
    const timeline = buildIncidentTimeline(records);
    expect(timeline.length).toBe(6);
    // timestamps are all on Jul 6 12:00:0X so order should be preserved ascending
    expect(timeline[0]?.host).toBe("web01");
  });
});

describe("IOC pattern extraction", () => {
  it("extracts ipv4, hash, cve, domain", () => {
    const text = "connect to 8.8.8.8 and download sha256 abc123def456... cve CVE-2021-23337 from evil.com";
    const matches = extractIocs(text);
    const kinds = matches.map((m) => m.kind);
    expect(kinds).toContain("ipv4");
    expect(kinds).toContain("cve");
    expect(kinds).toContain("domain");
  });

  it("redacts AWS keys and JWTs from output", () => {
    const out = redactSecrets({ token: "AKIAIOSFODNN7EXAMPLE", note: "see bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" });
    expect(out.token).toBe("[REDACTED]");
    expect(JSON.stringify(out.note)).toContain("[REDACTED");
  });
});

describe("binary identification", () => {
  it("identifies an ELF binary and extracts arch", () => {
    // Minimal ELF header (24 bytes): magic + class=2 (64-bit) + data=1 (LE) + machine=0x3e (x86_64) at offset 0x12.
    const elf = new Uint8Array(24);
    elf[0] = 0x7f;
    elf[1] = 0x45;
    elf[2] = 0x4c;
    elf[3] = 0x46;
    elf[4] = 2; // 64-bit
    elf[5] = 1; // little-endian
    elf[0x12] = 0x3e; // x86_64
    elf[0x13] = 0;
    const result = identifyBinary(elf);
    expect(result.format).toBe("elf");
    expect(result.bits).toBe(64);
    expect(result.arch).toBe("x86_64");
  });

  it("identifies a PE binary", () => {
    // MZ magic; PE header offset 0x40 with machine 0x014c.
    const pe = new Uint8Array(0x48);
    pe[0] = 0x4d;
    pe[1] = 0x5a;
    pe[0x3c] = 0x40;
    pe[0x40] = 0x50;
    pe[0x41] = 0x45;
    pe[0x44] = 0x4c;
    pe[0x45] = 0x01;
    const result = identifyBinary(pe);
    expect(result.format).toBe("pe");
    expect(result.arch).toBe("x86");
  });

  it("classifies text files as text", () => {
    const text = new TextEncoder().encode("just a normal text file with printable content ".repeat(8));
    const result = identifyBinary(text);
    expect(result.format).toBe("text");
  });
});

describe("pcap summary", () => {
  it("reports unknown for a too-short buffer", () => {
    const summary = summarizePcap(new Uint8Array(4));
    expect(summary.format).toBe("unknown");
    expect(summary.packetCount).toBe(0);
  });
});

describe("egress allowlist", () => {
  it("allows loopback by default and blocks external hosts", () => {
    expect(enforceEgressAllowlist("http://127.0.0.1:8080/").allowed).toBe(true);
    expect(enforceEgressAllowlist("http://evil.example.com/").allowed).toBe(false);
  });

  it("honors an explicit allowlist", () => {
    const decision = enforceEgressAllowlist("https://api.allowed.test/path", {
      allowlist: ["api.allowed.test"],
      allowLoopback: false,
    });
    expect(decision.allowed).toBe(true);
  });
});

describe("IR tool registry", () => {
  it("log_parse tool produces structured findings", async () => {
    const { tools } = createIrSecurityToolRegistry();
    const logParse = tools[0]!;
    const result = await logParse.execute(
      { content: "Jul 6 12:00:00 host sshd: Failed password for admin", maxLines: 10 },
      { workspaceRoot: "." },
    );
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.recordCount).toBe(1);
  });

  it("ioc_extract surfaces CVEs and IPs", async () => {
    const { tools } = createIrSecurityToolRegistry();
    const ioc = tools.find((t) => t.name === "security.ir.ioc_extract")!;
    const result = await ioc.execute(
      { content: "attack from 10.0.0.5 references CVE-2021-23337" },
      { workspaceRoot: "." },
    );
    const summary = result.iocSummary ?? {};
    expect(summary.cve).toBeGreaterThan(0);
    expect(summary.ipv4).toBeGreaterThan(0);
  });
});

describe("report tool registry", () => {
  it("drafts a vulnerability report with inferred severity", async () => {
    const { tools } = createReportSecurityToolRegistry();
    const draft = tools[0]!;
    const result = await draft.execute(
      { evidence: ["RCE found in /api/exec via unsanitized input"] },
      { workspaceRoot: "." },
    );
    expect((result.draft as { severity: string }).severity).toBe("critical");
  });
});
