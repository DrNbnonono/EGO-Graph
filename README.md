# EGO-Graph

![EGO-Graph logo](assets/brand/ego-lotus.png)

EGO-Graph means **Evidence-Guided Orchestration Graph**. It is a TypeScript-first autonomous-agent project for the XH-202609 challenge: a general cybersecurity intelligent agent with autonomous decision-making capability.

The product direction is a Codex-like terminal security engineering agent:
terminal-first, evidence-grounded, policy-gated, and replayable. The main loop
is owned by `@ego-graph/agent-harness`: session/run state, event stream, context
selection, tools, permissions, patch approval, checks, repair proposals, memory,
and replay. TUI/API surfaces are thin adapters over that Harness.

Datasets under `datasets/evals` are evaluation inputs and expected behaviors,
not application source code. The productization suite contains 60 lightweight
cases across chat, repo analysis, code change, repair, memory, security fixture,
and safety denial behavior.

The project direction is now:

```text
Lotus Agent Workbench + Security/CTF Tool Overlays + Evidence-Grounded Runtime
```

This matters because the competition is not scored on a static dashboard or a single scripted scan. It requires a self-developed AI Agent that can collaborate with human teammates in controlled real-world tasks, understand open security goals, call tools, explain decisions, and remain deployable.

## Current Status

Implemented:

- `ego` terminal command.
- Chinese terminal TUI workbench with a concept-style purple lotus startup card, conversation stream, sessions, tools, context, logs, approvals, and quick commands.
- Local Hono API and browser workbench using the same state model.
- MiniMax M3 model profile through the domestic Anthropic-compatible endpoint.
- Deterministic fallback planner.
- Mission graph, evidence board, trajectory events, JSONL and SQLite storage.
- Controlled `web_pentest` fixture scenario.
- Markdown report generation and replay.
- Shared `@ego-graph/workbench` model for CLI/TUI/Web runtime state.
- Policy-gated agent edit preview, approval, apply, check, and trajectory events.
- Hermes internal event bus with timeline/replay APIs and SQLite audit storage.
- Session/project/task memory with safe recall, overwrite/forget-friendly records, and context summaries.
- Plan-first coding flow: `/agent/plans` drafts an approvable plan before any Patch proposal is generated.
- Skills/plugin registry with built-in `workspace`, `shell-readonly`, `web-search`, and `ctf-basic` skills.
- MCP config loading plus stdio and Streamable HTTP MCP clients for `tools/list` and `tools/call` behind the tool boundary.
- MCP HTTP/OAuth foundation with bearer-token headers, protected-resource metadata discovery, long-lived client pooling, and per-tool permission policy overrides.
- Controlled `web.search` tool with result normalization, source URLs, and in-memory caching.
- Persistent LLM settings through Web, CLI, `.ego/config.json`, `ego.config.json`, or environment variables.
- Dynamic Web Workbench modes: read-only chat, plan-approved Patch generation, and controlled security tasks.
- Web/TUI Agent Kernel status panels for Memory, Plans, Skills, MCP, Search, approvals, and checks.
- Codex-like terminal Agent Harness for chat, inspect, plan, tool calls, diff preview, approval,
  apply, checks, repair proposals, memory, and replay.
- Modular `packages/agent-harness` boundary: public exports, session lifecycle, run state,
  planner facade, context bridge, memory/MCP bridge, patch/check/repair helpers, safety policy,
  and unified tool executor.
- Workspace Context Pack with repo map, relevance-ranked files, long-file compression, and recent
  event summaries so models receive minimal context instead of raw file dumps.
- Memory v2 categories for project facts, preferences, decisions, failures, tool results, security
  scope, and run summaries, with persisted importance/confidence/raw/source/evidence/access fields.
- Unified ToolCall protocol for schema validation, permission gate, approval gate, timeout,
  stdout/stderr truncation, `tool.failed`, `tool.timeout`, and `tool.blocked` events.

In progress:

- CTF/security overlays on top of the Agent Kernel foundation.
- Real-world exploit automation beyond the controlled fixture path.
- Rich multi-agent collaboration and long-running autonomous task scheduling.

Not complete yet:

- Full OAuth browser/device authorization flow for remote MCP servers.
- Semantic/vector memory and cross-session compaction tuned for very long projects.
- Fully autonomous CTF completion across unknown targets.
- Active public SRC/vulnerability scanning and exploitation automation. EGO-Graph keeps this behind explicit authorization scope and does not enable unauthorized public attack actions by default.

## Quick Start

Install and build:

```bash
pnpm install
pnpm build
```

Start the terminal Agent Harness:

```bash
ego
```

In the TUI:

```text
你好                         # normal chat, no plan
分析项目结构                   # reads a context pack, then answers
修改 README                   # proposes an evidence-gap plan first
/allow workspace-write
/plan approve                 # generates diff only after plan approval
/diff
/patch approve                # applies, checks, and may propose repair
/checks
/memory compact
/mcp                          # discover configured MCP tools
/skills                       # show skill management guidance
/prompt                       # show system prompt location
/replay <runId>
```

Start the browser dashboard:

```bash
ego serve
```

Open:

```text
http://127.0.0.1:4317
```

Run the controlled security fixture:

```bash
ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id demo-run-001
ego replay --trajectory-id demo-run-001
ego eval --dataset datasets/evals/web_pentest.jsonl
```

Check local readiness:

```bash
ego doctor
ego doctor --tools
```

## LLM Settings

EGO-Graph defaults to deterministic planning unless a model is configured.

Use the Web Workbench:

```bash
ego serve
```

Open `http://127.0.0.1:4317`, then use the right-side model settings panel. Saved keys are written to a user-local key file under `.ego/runtime/`; `.ego/config.json` stores only its relative `apiKeyFile` reference.
Use **Test connection** after saving to verify the current provider without starting a Patch run.

The Web Workbench has three modes:

- **对话** calls `/chat` and is read-only. If no model is enabled it returns `needs_model` with setup guidance instead of a canned fake answer.
- **生成 Patch** calls `/agent/plans` first. After the plan is approved, EGO-Graph calls the existing Patch runner and shows the generated diff in the right-side approval panel. Files are not changed until the Patch approval is clicked.
- **安全任务** uses controlled local scenario entry points such as the bundled `web_pentest` fixture.

The right-side Agent Kernel panel shows recent memories, draft plans, built-in skills, MCP stdio/http status, and the `web.search` tool state.
The compact Codex-like center stream shows user, assistant, tool, approval, and check events without exposing hidden chain-of-thought.
Typing `/` opens the command palette. Built-in commands include `/model`, `/models`, `/plan`, `/patch`, `/skills`, `/mcp`,
`/prompt`, `/memory`, `/status`, and `/clear`.

Use the CLI:

```bash
ego config model \
  --provider openai-compatible \
  --base-url https://api.example.com \
  --api-key sk-your-key \
  --model your-model
```

Local JSON configuration:

```json
{
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.example.com",
    "apiKeyFile": ".ego/runtime/model-api-key",
    "model": "your-model",
    "chatPath": "/v1/chat/completions",
    "wireApi": "openai-chat-completions",
    "maxTokens": 4096,
    "timeoutMs": 30000,
    "headers": {}
  }
}
```

Config lookup order is:

1. Environment variables.
2. `.ego/config.json`.
3. `ego.config.json`.
4. Deterministic fallback.

Model profiles are also available through the productized API:

```bash
curl http://127.0.0.1:4317/api/config/models
curl -X POST http://127.0.0.1:4317/api/config/models -H "content-type: application/json" -d '{"name":"MiniMax","provider":"minimax","apiKey":"sk-..."}'
curl -X POST http://127.0.0.1:4317/api/config/models/<profile-id>/select
curl -X POST http://127.0.0.1:4317/api/config/models/<profile-id>/test
```

The same Workbench exposes:

- `GET /api/runtime/metrics` for process CPU/RSS and system memory.
- `GET /api/commands` and `POST /api/commands/execute` for slash commands.
- `GET /api/config/system-prompt` and `PUT /api/config/system-prompt` for the project prompt saved under `.ego/system-prompt.md`.
- `GET /api/mcp/servers`, `POST /api/mcp/servers`, `DELETE /api/mcp/servers/:name`, and `POST /api/mcp/servers/:name/test` for stdio or Streamable HTTP MCP configuration.
- `GET /api/mcp/tools` and `POST /api/mcp/tools/call` for policy-gated MCP tool discovery/calls.

MiniMax M3 still works through environment variables:

```bash
export EGO_MODEL_PROVIDER=minimax
export MINIMAX_API_KEY=sk-cp-...
```

The `minimax` profile defaults to:

- `https://api.minimaxi.com/anthropic`
- `/v1/messages`
- `MiniMax-M3`
- `anthropic-messages`

Provider profiles in the Web UI auto-fill the matching endpoint/protocol defaults. `provider=disabled`
cannot be saved together with `baseUrl`, `apiKey`, or `model`; choose a real provider or clear those fields.

Never commit API keys. Use shell environment variables, `.env.local`, or a secret manager.
`.ego/` is ignored by git and may hold local persisted keys. EGO requests user-only filesystem modes and `ego doctor` reports legacy plaintext keys; filesystems that ignore POSIX modes remain a release blocker.

The repository also contains an offline curated plugin catalog for the Web, forensics, and reverse toolkits. Catalog installation verifies package checksums, but plugin tools still enter the same Executor, permission, scope, sandbox, and audit chain.

## Architecture

```text
apps/
  ego-cli     Terminal command and TUI
  ego-api     Hono runtime API
  ego-web     Browser UI pages, components, styles, client scripts

packages/
  agent       Coding-agent turn runner
  agent-harness  Shared Agent Harness state machine, run stream, approval, repair, memory, replay
  terminal-agent  Compatibility re-export for older terminal integrations
  workspace   Safe repository inspection, context packs, edit preview, and policy-gated writes
  workbench   Shared TUI/Web state model
  hermes      Internal event bus and runtime timeline
  memory      Session/project/task memory and context compression
  mcp         MCP config, manifest, stdio/http clients, OAuth metadata, and client pool
  core        Mission graph, task specs, trajectories, runner
  llm         Persistent LLM config plus MiniMax M3 and compatible model providers
  tools       Local tool registry, skill/plugin registry, web.search, and permission policy
  overlays    Security scenario overlays
  storage     JSONL and SQLite stores
  report      Markdown report rendering
```

## Competition Scoring Mapping

- **Task understanding and execution design:** read-only `/chat`, approvable Plan mode, mission planning, and policy-gated edit runs.
- **Codex-like terminal agent:** conversation-first TUI backed by the Agent Harness; UI is thin,
  while session/run state, tools, memory, diff approval, checks, repair, and replay live in the
  kernel.
- **System architecture and engineering:** separated CLI/API/Web/agent/workspace/MCP packages.
- **Decision explainability and robustness:** Hermes timeline, mission graph, trajectories, evidence, memory summaries, reports.
- **Tool calling and collaboration:** tool registry, skills/plugins, workspace tools, MCP stdio/http boundary, web.search, security overlays.
- **Human-in-the-loop product form:** terminal-first purple-lotus workbench, mirrored Web view, approvals, replay, and reports.
- **Innovation and added value:** coding-agent core extended with CTF/security overlays.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm smoke
```

## Submission Materials

See:

- `docs/architecture.md`
- `docs/agent-kernel.md`
- `docs/development.md`
- `docs/testing.md`
- `docs/user-guide.md`
- `docs/security-policy.md`
- `docs/submission-checklist.md`
- `submit/`
