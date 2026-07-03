# EGO-Graph Architecture

EGO-Graph means Evidence-Guided Orchestration Graph. The system converts an authorized security task into a typed `TaskSpec`, creates a `MissionGraph`, executes scenario tools through a deny-by-default policy, stores JSONL trajectory events, indexes them in SQLite, and renders reports/replay views.

The first delivery slice uses the `web_pentest` overlay and the controlled fixture at `scenarios/web_pentest/basic`. The shared core stays scenario-neutral; overlays provide tools, prompts, report sections, and default targets.

The current agent loop is `plan -> tool_select -> policy_check -> execute -> observe -> update_evidence -> evaluate -> replan/done`. Every step writes append-only trajectory events. The default planner is deterministic for repeatable demos; an optional model-backed planner can be enabled through the MiniMax M3 profile or other compatible model environment variables and automatically falls back when unavailable.

Storage uses JSONL as the append-only audit trail and SQLite as the query/index layer for runs,
events, evidence, artifacts, and reports.

User-facing surfaces:

- `ego`: terminal-first purple-lotus Agent Workbench built with Ink. It shows sessions/tasks, tool state, context, files, logs, approvals, quick commands, and a natural-language coding-agent input.
- `ego serve`: local Web Workbench at `http://127.0.0.1:4317`, using the same view model as the terminal surface.
- `GET /api/workbench`: unified state API for TUI/Web data such as model status, SQLite paths, runs, logs, files, approvals, and quick commands.
- `GET /api/status`: compatibility status API derived from the same workbench state.
- `POST /chat`: natural-language coding-agent turn endpoint for project inspection, planning, and command suggestions.
- `/runs` and `/runs/:id/*`: runtime execution, event, evidence, report, and SSE replay endpoints.

Primary packages:

- `apps/ego-cli`: terminal CLI and Ink TUI.
- `apps/ego-api`: local Hono API and static Web dashboard for `ego serve`.
- `apps/ego-web`: static HTML/CSS/JS Web Workbench assets, designed to build with TypeScript only.
- `packages/workbench`: shared read-only Workbench state model consumed by the TUI, Web app, and API.
- `packages/agent`: natural-language coding-agent turn runner.
- `packages/workspace`: safe repository inspection and command suggestions.
- `packages/mcp`: MCP manifest and future adapter boundary.
- `packages/core`: task specs, mission graph, trajectory events, and runner.
- `packages/llm`: MiniMax M3 Anthropic Messages provider plus OpenAI-compatible model abstraction.
- `packages/tools`: tool registry and permission policy.
- `packages/overlays`: scenario overlays.
- `packages/storage`: JSONL trajectory storage plus SQLite run/evidence/artifact/report index.
- `packages/report`: report generation.
