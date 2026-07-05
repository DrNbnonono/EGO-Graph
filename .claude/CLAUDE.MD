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
- TUI: Ink + React conversation-first terminal Agent with purple lotus welcome screen, fixed prompt input, raw terminal input handling, mouse-wheel review, slash command palette, history/replay browser, and Plan/Diff/Checks overlays
- Web UI: Hono-served browser dashboard at `ego serve` / `http://127.0.0.1:4317`
- API: Hono local service for runs, status, evidence, reports, and replay streams
- Web package layout: `apps/ego-web/src/pages`, `components`, `styles`, `client`, and `assets`
- Schemas: Zod
- Storage: SQLite plus JSONL trajectories
- Agent core: self-owned mission graph engine plus read-only assistant chat, Plan mode, and a coding-agent turn runner for approved writes
- Hermes: `packages/hermes` is the internal event bus and runtime timeline for auditable agent decisions
- Memory: `packages/memory` provides session/project/task memory, safe recall, and context compression
- LLM access: `packages/llm` owns persistent config loading/saving, MiniMax M3 defaults, OpenAI-compatible gateways, and environment-variable overrides
- Skills/plugins: `packages/tools` owns built-in skill registration, plugin manifest validation, permission declarations, and `web.search`
- MCP boundary: `packages/mcp` declares capability boundaries and includes stdio plus Streamable HTTP MCP clients for `tools/list` and `tools/call`
- MCP HTTP/OAuth: bearer-token support, protected-resource metadata discovery, long-lived client pooling, and per-tool permission overrides are implemented; full interactive OAuth authorization is future work
- Workspace inspection: `packages/workspace` provides safe repository summary, text reads, file listing, and command suggestions
- Tool execution: TypeScript orchestration with Docker sandbox and external security tools
- Tests: Vitest, with Playwright reserved for future web console checks

## Architecture Invariants

- The terminal command `ego` is the primary product entry and must remain an interactive conversation-first Agent surface, not a dashboard.
- `ego serve` must expose a Web visualization of project progress, model status, recent runs, evidence, and reports.
- `/chat` is a model-first, read-only assistant endpoint. It must never create pending edits.
- Writable natural-language tasks should enter `/agent/plans` first and return `draft_plan`.
- Approving a plan only authorizes Patch generation. It does not approve file writes.
- Patch generation then uses `/agent/runs` with `autoPropose: true` or an explicit `WorkspaceEditPlan`.
- Every workspace write must pass through model/generated `WorkspaceEditPlan`, workspace policy, diff preview, Web approval, apply, checks, and SQLite/trajectory audit.
- Hermes events must be emitted for important runtime decisions such as messages, plan updates, approvals, tool calls, memory writes, and check completion.
- Long-term memory must not store sensitive references such as `.env`, key files, `.git`, or secret-like paths.
- Frontend code must stay in `apps/ego-web`; API code must not own page/component/style/client-script source.
- TypeScript orchestrates tools; mature security tools run as controlled external processes.
- Every agent action must be represented by an auditable trajectory event.
- Tool adapters must declare input schema, output schema, permissions, sandbox profile, parser, and evidence mapping.
- New tool execution should use the Harness `ToolCall` protocol: schema validation, permission gate,
  approval gate, timeout, stdout/stderr truncation, output validation, failure event, and recovery hint.
- TUI code must stay thin and modular under `apps/ego-cli/src/tui/`; it may render state and dispatch commands, but it must not own Agent Harness business logic.
- TUI raw terminal behavior belongs in `terminal-input.ts` and dynamic terminal sizing belongs in `terminal-size.ts`.
- TUI text rendering must use CJK/display-width helpers instead of raw JS `slice()` when truncating visible UI strings.
- Scenario-specific behavior belongs in overlays, not in the shared core.
- The first strong scenario should be `web_pentest`, followed by `incident_response`, `vulnerability_research`, and `reverse_engineering`.
- The system must be useful in authorized, controlled environments and must reject actions outside declared scope.

## Expected Commands

Planned public commands:

```bash
ego
ego serve
curl -X POST http://127.0.0.1:4317/chat -H "content-type: application/json" -d "{\"message\":\"阅读项目状态并说明下一步\"}"
curl -X POST http://127.0.0.1:4317/agent/plans -H "content-type: application/json" -d "{\"message\":\"update README quick start\",\"mode\":\"coding\"}"
curl -X POST http://127.0.0.1:4317/agent/plans/<plan-id>/approve -H "content-type: application/json" -d "{}"
curl -X POST http://127.0.0.1:4317/agent/runs -H "content-type: application/json" -d "{\"message\":\"update README quick start\",\"autoPropose\":true}"
curl -X POST http://127.0.0.1:4317/agent/runs/<run-id>/approve -H "content-type: application/json" -d "{}"
curl -X POST http://127.0.0.1:4317/api/config/model -H "content-type: application/json" -d "{\"provider\":\"openai-compatible\",\"baseUrl\":\"https://api.example.com\",\"apiKey\":\"sk-...\",\"model\":\"your-model\"}"
curl -X POST http://127.0.0.1:4317/api/config/model/test
curl http://127.0.0.1:4317/api/config/models
curl http://127.0.0.1:4317/api/commands
curl http://127.0.0.1:4317/api/config/system-prompt
curl http://127.0.0.1:4317/api/mcp/servers
curl http://127.0.0.1:4317/api/mcp/tools
curl http://127.0.0.1:4317/api/runtime/metrics
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

Web provider profiles auto-fill MiniMax, DeepSeek, and OpenAI-compatible defaults. The API rejects
`provider=disabled` when `baseUrl`, `apiKey`, or `model` are supplied; saving disabled with no model
fields clears local persisted model credentials.

Never hardcode API keys in tracked files. `.ego/` is ignored and may store local demo keys; `ego.config.json`
should avoid secrets unless the user intentionally keeps it private.

## Documentation Responsibilities

Keep this file current when architecture, package layout, commands, testing strategy, safety policy, or competition deliverables change.

Core docs to maintain:

- `docs/tui-productization-gap-analysis.md`
- `docs/architecture.md`
- `docs/agent-kernel.md`
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

Current milestone is Agent Kernel v1: make the Web Workbench plan-aware and give the runtime durable
memory, Hermes timeline, skills/plugins, MCP stdio v1, and controlled web search:

- Root `README.md` and purple lotus logo asset are present.
- `apps/ego-web` owns Dashboard pages/components/styles/client scripts.
- `packages/workspace`, `packages/mcp`, `packages/agent`, `packages/hermes`, and `packages/memory` are first-class workspace packages.
- `packages/mcp` supports stdio and Streamable HTTP transports, OAuth bearer-token headers, protected-resource metadata discovery, client pooling, and per-tool risk/approval policy.
- `packages/agent-harness` is now modularized: `index.ts` is public exports, `session.ts` owns the
  live session, and focused modules cover run state, events, planner, context bridge, memory/MCP
  bridges, safety policy, tool executor, patch/check/repair helpers.
- `packages/memory` Memory v2 persists kind, importance, confidence, summary/rawContent, source run,
  evidence refs, status, last access, and access count; raw content must not be injected into prompts.
- `packages/agent` can generate a model-backed `WorkspaceEditPlan` from natural language through `generateWorkspaceEditPlan`.
- API exposes `/chat` for read-only model replies.
- API exposes `/agent/plans` and `/agent/plans/:id/approve` for plan-first write tasks.
- API exposes `/agent/runs`, `/agent/runs/:id/approve`, `/agent/runs/:id/diff`, and `/agent/runs/:id/checks` for approved Patch writes.
- API exposes `/api/memory`, `/api/hermes/timeline`, `/api/skills`, and `/api/mcp/tools` for kernel observability.
- API exposes `/api/config/model`, `/api/config/model/test`, and profile routes under `/api/config/models` for local model settings and connectivity checks.
- API exposes `/api/commands`, `/api/config/system-prompt`, `/api/mcp/servers`, `/api/runtime/metrics`, and `/chat/stream` for the productized Workbench shell.
- Web has three modes: `对话` calls `/chat`, `生成 Patch` calls `/agent/plans` before Patch generation, and `安全任务` runs controlled fixtures.
- Web keeps Plan preview, Patch preview, affected files, Approve, and checks in the right-side approval panel.
- Web shows Agent Kernel status for memory, plans, skills, MCP, command palette, system prompt, runtime metrics, and search.
- Web polls `/api/workbench`, ticks local time, supports local session switching, and makes quick commands executable.
- Web includes a right-side model settings panel that writes `.ego/config.json`, validates disabled-provider conflicts, and tests connectivity.
- CLI exposes `ego config model` for persistent provider/baseUrl/model/API key setup.
- TUI is now split under `apps/ego-cli/src/tui/`: `app.tsx`, `conversation-view.tsx`, `prompt-input.tsx`, `command-palette.ts`, `history-browser.tsx`, `diff-view.tsx`, `plan-view.tsx`, `checks-view.tsx`, `debug-view.tsx`, `layout.tsx`, `terminal-input.ts`, `terminal-size.ts`, `cjk.ts`, `text-wrap.ts`, and support modules.
- TUI keeps a conversation-first Agent Kernel view, purple lotus welcome screen, fixed prompt input, mouse-wheel/PageUp review, Ctrl+O thinking expansion, overlay slash command palette, persisted history/replay browsing, multi-file diff browsing, MCP discovery, and approval shortcuts while still pointing users to `ego serve` for full management pages.
- Model-unavailable fallback is `needs_model`: no pending edit, no diff, no file write.
- Active public SRC/vulnerability scanning and exploit automation remain disabled by default. Security tools require explicit authorization scope, permission elevation, approval, sandbox/audit, and controlled targets.

The vertical slice is complete when `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm smoke`, `ego --help`, `ego doctor`, `ego run`, `ego replay`, and `ego eval` pass against the controlled `web_pentest` fixture.
