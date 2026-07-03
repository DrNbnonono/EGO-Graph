# EGO-Graph Architecture

EGO-Graph means Evidence-Guided Orchestration Graph. The system converts an authorized security task into a typed `TaskSpec`, creates a `MissionGraph`, executes scenario tools through a deny-by-default policy, stores JSONL trajectory events, and renders a report.

The first delivery slice uses the `web_pentest` overlay and the controlled fixture at `scenarios/web_pentest/basic`. The shared core stays scenario-neutral; overlays provide tools, prompts, report sections, and default targets.

The current agent loop is `plan -> tool_select -> policy_check -> execute -> observe -> update_evidence -> evaluate -> replan/done`. Every step writes append-only trajectory events. The default planner is deterministic for repeatable demos; an optional model-backed planner can be enabled through the MiniMax M3 profile or other compatible model environment variables and automatically falls back when unavailable.

Storage uses JSONL as the append-only audit trail and SQLite as the query/index layer for runs,
events, evidence, artifacts, and reports.

User-facing surfaces:

- `ego`: terminal TUI cockpit with a lightweight Chinese dialog box and project progress summary.
- `ego serve`: local Web dashboard at `http://127.0.0.1:4317`, backed by the same Hono API.
- `GET /api/status`: dashboard status API for progress, model configuration, storage paths, and recent runs.

Primary packages:

- `apps/ego-cli`: terminal CLI and Ink TUI.
- `apps/ego-api`: local Hono API and static Web dashboard for `ego serve`.
- `packages/core`: task specs, mission graph, trajectory events, and runner.
- `packages/llm`: MiniMax M3 Anthropic Messages provider plus OpenAI-compatible model abstraction.
- `packages/tools`: tool registry and permission policy.
- `packages/overlays`: scenario overlays.
- `packages/storage`: trajectory storage.
- `packages/report`: report generation.
