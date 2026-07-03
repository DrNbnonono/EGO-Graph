# EGO-Graph Development Memory

## Project Identity

- Name: EGO-Graph
- Expansion: Evidence-Guided Orchestration Graph
- Competition: XH-202609 autonomous-decision general cybersecurity agent
- Product goal: a deliverable cybersecurity agent that packages into a terminal command named `ego`
- Logo direction: purple lotus

## Current Technical Decision

Use a TypeScript-first stack aligned with terminal agent tools such as OpenCode, Claude Code, and Codex-style workflows.

- Runtime: Node.js 22 LTS
- Language: TypeScript 5 strict mode
- Workspace: pnpm monorepo
- CLI: commander, exposing `ego`
- TUI: Ink + React terminal cockpit with a Chinese dialog box
- Web UI: Hono-served browser dashboard at `ego serve` / `http://127.0.0.1:4317`
- API: Hono local service for runs, status, evidence, reports, and replay streams
- Web package layout: `apps/ego-web/src/pages`, `components`, `styles`, `client`, and `assets`
- Schemas: Zod
- Storage: SQLite plus JSONL trajectories
- Agent core: self-owned mission graph engine plus a coding-agent turn runner for natural-language tasks
- LLM access: `packages/llm` owns persistent config loading/saving, MiniMax M3 defaults, OpenAI-compatible gateways, and environment-variable overrides
- MCP boundary: `packages/mcp` declares local capability boundaries before stdio/http MCP transports are implemented
- Workspace inspection: `packages/workspace` provides safe repository summary, text reads, file listing, and command suggestions
- Tool execution: TypeScript orchestration with Docker sandbox and external security tools
- Tests: Vitest, with Playwright reserved for future web console checks

## Architecture Invariants

- The terminal command `ego` is the primary product entry and must remain interactive.
- `ego serve` must expose a Web visualization of project progress, model status, recent runs, evidence, and reports.
- `/chat` remains a read-only compatibility endpoint; writable natural-language tasks must use `/agent/runs` with `autoPropose: true`.
- Every workspace write must pass through model/generated `WorkspaceEditPlan`, workspace policy, diff preview, Web approval, apply, checks, and SQLite/trajectory audit.
- Frontend code must stay in `apps/ego-web`; API code must not own page/component/style/client-script source.
- TypeScript orchestrates tools; mature security tools run as controlled external processes.
- Every agent action must be represented by an auditable trajectory event.
- Tool adapters must declare input schema, output schema, permissions, sandbox profile, parser, and evidence mapping.
- Scenario-specific behavior belongs in overlays, not in the shared core.
- The first strong scenario should be `web_pentest`, followed by `incident_response`, `vulnerability_research`, and `reverse_engineering`.
- The system must be useful in authorized, controlled environments and must reject actions outside declared scope.

## Expected Commands

Planned public commands:

```bash
ego
ego serve
curl -X POST http://127.0.0.1:4317/chat -H "content-type: application/json" -d "{\"message\":\"阅读项目状态并说明下一步\"}"
curl -X POST http://127.0.0.1:4317/agent/runs -H "content-type: application/json" -d "{\"message\":\"update README quick start\",\"autoPropose\":true}"
curl -X POST http://127.0.0.1:4317/agent/runs/<run-id>/approve -H "content-type: application/json" -d "{}"
curl -X POST http://127.0.0.1:4317/api/config/model -H "content-type: application/json" -d "{\"provider\":\"openai-compatible\",\"baseUrl\":\"https://api.example.com\",\"apiKey\":\"sk-...\",\"model\":\"your-model\"}"
ego config model --provider openai-compatible --base-url https://api.example.com --api-key sk-... --model your-model
ego run --scenario web_pentest --task "..."
ego run --scenario incident_response --input ./case.zip
ego replay --trajectory-id <id>
ego eval --dataset datasets/evals/web_pentest.jsonl
ego doctor
```

Planned development commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format
```

## Model Configuration

Persistent local config is supported through `.ego/config.json` first, then `ego.config.json`.
Environment variables override JSON fields. Web saves through `/api/config/model`; CLI saves through
`ego config model`.

Example local config:

```json
{
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.example.com",
    "apiKey": "sk-...",
    "model": "your-model",
    "chatPath": "/v1/chat/completions",
    "wireApi": "openai-chat-completions"
  }
}
```

Default MiniMax M3 planner:

```bash
export EGO_MODEL_PROVIDER=minimax
export MINIMAX_API_KEY=sk-cp-...
```

The `minimax` profile defaults to:

- `EGO_MODEL_BASE_URL=https://api.minimaxi.com/anthropic`
- `EGO_MODEL_CHAT_PATH=/v1/messages`
- `EGO_MODEL_NAME=MiniMax-M3`
- `EGO_MODEL_WIRE_API=anthropic-messages`

Never hardcode API keys in tracked files. `.ego/` is ignored and may store local demo keys; `ego.config.json`
should avoid secrets unless the user intentionally keeps it private.

## Documentation Responsibilities

Keep this file current when architecture, package layout, commands, testing strategy, safety policy, or competition deliverables change.

Core docs to maintain:

- `docs/architecture.md`
- `docs/development.md`
- `docs/user-guide.md`
- `docs/testing.md`
- `docs/security-policy.md`
- `docs/submission-checklist.md`
- `docs/superpowers/specs/2026-07-03-ego-graph-design.md`
- `docs/superpowers/plans/2026-07-03-ego-graph-implementation.md`
- `docs/superpowers/specs/2026-07-03-ego-graph-coding-agent-foundation-design.md`
- `docs/superpowers/plans/2026-07-03-ego-graph-coding-agent-foundation.md`

## Safety Rules

- Authorized targets only.
- Deny tool execution outside declared task scope.
- No hardcoded credentials or API keys.
- Use `.ego/config.json` or environment variables for model access; prefer `MINIMAX_API_KEY` or `EGO_MODEL_API_KEY` when avoiding persisted keys.
- Prefer Docker sandbox execution for risky tools.
- Log tool calls, observations, evidence, and safety decisions.
- Reports must include limitations and reproduction context.

## Current Milestone

Current milestone adds persistent LLM settings on top of the natural-language Patch approval loop:

- Root `README.md` and purple lotus logo asset are present.
- `apps/ego-web` owns Dashboard pages/components/styles/client scripts.
- `packages/workspace`, `packages/mcp`, and `packages/agent` are first-class workspace packages.
- `packages/agent` can generate a model-backed `WorkspaceEditPlan` from natural language through `generateWorkspaceEditPlan`.
- API exposes `/chat` for read-only compatibility plus `/agent/runs`, `/agent/runs/:id/approve`, `/agent/runs/:id/diff`, and `/agent/runs/:id/checks` for approved writes.
- API exposes `/api/config/model` for local model settings and returns redacted model config metadata.
- Web submits natural-language coding tasks through `/agent/runs`, renders diff previews, applies approved patches, and shows checks.
- Web includes a right-side model settings panel that writes `.ego/config.json`.
- CLI exposes `ego config model` for persistent provider/baseUrl/model/API key setup.
- TUI keeps a lightweight status view and points users to `ego serve` for full diff approval.
- Model-unavailable fallback is `needs_model`: no pending edit, no diff, no file write.

The vertical slice is complete when `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm smoke`, `ego --help`, `ego doctor`, `ego run`, `ego replay`, and `ego eval` pass against the controlled `web_pentest` fixture.
