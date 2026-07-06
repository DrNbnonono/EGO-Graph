# EGO-Graph Security Policy

EGO-Graph is for authorized and controlled security work.

Execution rules:

- Tool execution is denied unless the task scope matches the tool permission scope.
- Permission levels are presets, not the whole policy. Tool execution also evaluates
  action/resource rules with `allow`, `ask`, and `deny`; the last matching rule wins.
- High-risk or network-scoped security tools must pass SecurityScope checks before execution.
- The first shipped scenario uses `fixture://web-pentest/basic`.
- API keys are read from environment variables.
- The default model profile is MiniMax M3 through the domestic Anthropic-compatible endpoint; keys must never be committed.
- MCP stdio and Streamable HTTP tools are remote capability boundaries, not trusted code by default.
- Unknown MCP tools default to approval-gated medium risk. Per-tool policy may only reduce risk when the server config explicitly declares the allowed scope, risk, approval, and sandbox profile.
- HTTP MCP OAuth bearer tokens stay in local `.ego/config.json` or environment-managed config and must never be returned by public API responses.
- Trajectory events record planning, safety checks, tool execution, evidence, and reports.
- Reports must include limitations and reproduction context.

Real network scanners, exploit tools, fuzzers, and reverse-engineering tools must run through sandbox profiles and explicit scope checks.
Active public SRC/vulnerability scanning and exploitation automation is disabled by default. The system may prepare plans, collect local evidence, and work inside controlled fixtures, but public targets require explicit authorization scope, risk acknowledgement, permission elevation, approval, and audit.

Allowed default active-security demonstration paths:

- Local fixture HTTP request, crawl, and fingerprint against `localhost`, `127.0.0.1`, or `::1`.
- Local package manifest audit and local Semgrep scan when installed.
- CTF file identification, strings extraction, hash identification, and PCAP metadata summary.
- Vulnerability report drafting from collected evidence.

Disallowed by default:

- Public internet port scans, brute force, exploit delivery, credential access, destructive payloads,
  DDoS, or scanning targets not present in an explicit authorization scope.
