# EGO-Graph Architecture

## Productization Kernel

The current Codex-like kernel is centered on `@ego-graph/agent-harness`.
The Harness owns session state, run state, event streaming, context loading,
permission gates, tool calls, Patch/Diff approval, checks, repair proposals,
memory events, replay, and SQLite/Hermes audit writes. TUI and API callers
should remain thin adapters over this Harness.

The dynamic loop follows `Plan -> Act -> Observe -> Reflect -> Replan -> Stop`
with bounded defaults: 8 steps, 5 tool calls, 2 repairs, and 10 minutes. Chat
stays direct; project analysis runs bounded read-only tools; code changes must
pass plan and patch approval; active security tasks require an explicit
SecurityScope.

Workspace context is selected by the Repo Index and Context Engine: file
metadata, lightweight symbols, dependency hints, likely tests, recent events,
memory hits, and token budget. Secret-like files, `.git`, `.ego`,
`node_modules`, and build outputs are excluded from summaries and prompts.

Patch operations are mediated by the Patch Engine: path policy, denied paths,
file size checks, exact-match validation, conflict detection, diff preview,
approval, apply snapshot, checks, repair, and rollback proposal.

Security tooling is split into `@ego-graph/security-tools`. It exposes
SecurityScope and low-risk local fixture / CTF / API-doc tools. Public scanning,
bruteforce, exploit automation, credential access, DDoS, and destructive
payloads remain out of scope unless future authorized tooling adds explicit
scope, risk, sandbox, approval, and audit handling.

EGO-Graph means Evidence-Guided Orchestration Graph. The system converts an authorized security task into a typed `TaskSpec`, creates a `MissionGraph`, executes scenario tools through a deny-by-default policy, stores JSONL trajectory events, indexes them in SQLite, and renders reports/replay views.

The first delivery slice uses the `web_pentest` overlay and the controlled fixture at `scenarios/web_pentest/basic`. The shared core stays scenario-neutral; overlays provide tools, prompts, report sections, and default targets.

The current agent loop is `plan -> tool_select -> policy_check -> execute -> observe -> update_evidence -> evaluate -> replan/done`. Every step writes append-only trajectory events. The default planner is deterministic for repeatable demos; an optional model-backed planner can be enabled through the MiniMax M3 profile or other compatible model environment variables and automatically falls back when unavailable.

Storage uses JSONL as the append-only audit trail and SQLite as the query/index layer for runs,
events, evidence, artifacts, reports, agent edits, approvals, checks, Hermes events, memories,
agent plans, and tool calls.

## Agent Kernel v1

The Agent Kernel v1 turns EGO-Graph into a durable agent runtime rather than a single dashboard.
It adds five shared capabilities that every future CTF or coding overlay must use:

- **Hermes runtime timeline:** `packages/hermes` is the internal event bus. Runtime surfaces emit events such as `message.received`, `plan.updated`, `approval.created`, `tool.called`, `memory.written`, and `check.finished`; SQLite stores the timeline for replay and debugging.
- **Memory and context compression:** `packages/memory` owns session, project, and task memory plus structured context summaries. It persists Memory v2 metadata such as kind, importance, confidence, source run, evidence refs, access count, and soft-forget status. It rejects sensitive references such as `.env`, key files, and secret-like paths before long-term storage.
- **Plan mode:** natural-language write tasks enter `/agent/plans` and return `draft_plan`. Approval of a plan is required before the existing Patch proposal flow can produce a diff.
- **Skills/plugins:** `packages/tools` registers built-in skills and validates plugin manifests before exposing tools or permissions to the Workbench.
- **MCP/search base:** `packages/mcp` includes stdio and Streamable HTTP MCP clients for `tools/list` and `tools/call`; `packages/tools` includes a controlled `web.search` tool with normalized results and source URLs.

The kernel deliberately keeps writes behind the existing workspace policy, diff preview, approval,
checks, and audit chain. Plan approval is not file approval; users still inspect and approve the
Patch diff before any repository file changes.

User-facing surfaces:

- `ego`: terminal-first purple-lotus Agent Workbench built with Ink. It shows sessions/tasks, tool state, context, files, logs, approvals, quick commands, and a natural-language coding-agent input.
- `ego serve`: local Web Workbench at `http://127.0.0.1:4317`, using the same view model as the terminal surface.
- `GET /api/workbench`: unified state API for TUI/Web data such as model status, SQLite paths, runs, logs, files, approvals, and quick commands.
- `GET /api/status`: compatibility status API derived from the same workbench state.
- `POST /chat`: read-only assistant endpoint for project inspection, planning, and command suggestions. It must not create pending edits.
- `POST /agent/plans`: creates a draft plan with memory hits and a context summary.
- `POST /agent/plans/:id/approve`: approves the plan and then enters the existing Patch proposal path for coding/research tasks.
- `POST /agent/runs`: creates an inspect/propose-edit run. Structured edit plans or approved auto-proposals produce diff previews and pending approvals.
- `POST /agent/runs/:id/approve`: applies a pending edit only after approval and records verification checks.
- `GET /agent/runs/:id/diff` and `/agent/runs/:id/checks`: expose patch preview and validation output.
- `GET /api/memory`, `/api/hermes/timeline`, `/api/skills`, and `/api/mcp/tools`: expose kernel observability to the Web Workbench.
- `/runs` and `/runs/:id/*`: runtime execution, event, evidence, report, and SSE replay endpoints.

Primary packages:

- `apps/ego-cli`: terminal CLI and Ink TUI.
- `apps/ego-api`: local Hono API and static Web dashboard for `ego serve`.
- `apps/ego-web`: static HTML/CSS/JS Web Workbench assets, designed to build with TypeScript only.
- `packages/workbench`: shared Workbench state model consumed by the TUI, Web app, and API, including pending edits and approvals.
- `packages/agent`: natural-language coding-agent turn runner with inspect, plan, propose-edit, and apply-approved-edit modes.
- `packages/agent-harness`: terminal Agent Runtime split into public exports, session lifecycle, run state, event protocol, planner, context bridge, memory/MCP bridges, safety policy, tool executor, patch/check/repair helpers, and replay.
- `packages/workspace`: safe repository inspection, diff preview, and policy-gated write application.
- `packages/hermes`: internal event bus, timeline query, and run replay helpers.
- `packages/memory`: memory records, scope-aware recall, sensitive-reference filtering, and context compression.
- `packages/mcp`: MCP config loader, manifest, policy-gated registry boundary, and stdio client v1.
- `packages/core`: task specs, mission graph, trajectory events, and runner.
- `packages/llm`: MiniMax M3 Anthropic Messages provider plus OpenAI-compatible model abstraction.
- `packages/tools`: tool registry, permission policy, skills/plugins, and `web.search`.
- `packages/overlays`: scenario overlays.
- `packages/storage`: JSONL trajectory storage plus SQLite run/evidence/artifact/report index.
- `packages/report`: report generation.
