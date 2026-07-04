# EGO-Graph

![EGO-Graph logo](assets/brand/ego-lotus.png)

EGO-Graph means **Evidence-Guided Orchestration Graph**. It is a TypeScript-first autonomous-agent project for the XH-202609 challenge: a general cybersecurity intelligent agent with autonomous decision-making capability.

The project direction is now:

```text
Lotus Agent Workbench + Security/CTF Tool Overlays + Evidence-Grounded Runtime
```

This matters because the competition is not scored on a static dashboard or a single scripted scan. It requires a self-developed AI Agent that can collaborate with human teammates in controlled real-world tasks, understand open security goals, call tools, explain decisions, and remain deployable.

## Current Status

Implemented:

- `ego` terminal command.
- Chinese terminal TUI workbench with sessions, tools, context, logs, approvals, and quick commands.
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
- MCP config loading plus stdio MCP client v1 for `tools/list` and `tools/call` behind the tool boundary.
- Controlled `web.search` tool with result normalization, source URLs, and in-memory caching.
- Persistent LLM settings through Web, CLI, `.ego/config.json`, `ego.config.json`, or environment variables.
- Dynamic Web Workbench modes: read-only chat, plan-approved Patch generation, and controlled security tasks.
- Web/TUI Agent Kernel status panels for Memory, Plans, Skills, MCP, Search, approvals, and checks.

In progress:

- CTF/security overlays on top of the Agent Kernel foundation.
- Real-world exploit automation beyond the controlled fixture path.
- Rich multi-agent collaboration and long-running autonomous task scheduling.

Not complete yet:

- Full MCP HTTP/remote-auth transport runtime.
- Semantic/vector memory and cross-session compaction tuned for very long projects.
- Fully autonomous CTF completion across unknown targets.

## Quick Start

Install and build:

```bash
pnpm install
pnpm build
```

Start the terminal cockpit:

```bash
ego
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
```

## LLM Settings

EGO-Graph defaults to deterministic planning unless a model is configured.

Use the Web Workbench:

```bash
ego serve
```

Open `http://127.0.0.1:4317`, then use the right-side model settings panel. Saved keys are written to local `.ego/config.json`.
Use **Test connection** after saving to verify the current provider without starting a Patch run.

The Web Workbench has three modes:

- **对话** calls `/chat` and is read-only. If no model is enabled it returns `needs_model` with setup guidance instead of a canned fake answer.
- **生成 Patch** calls `/agent/plans` first. After the plan is approved, EGO-Graph calls the existing Patch runner and shows the generated diff in the right-side approval panel. Files are not changed until the Patch approval is clicked.
- **安全任务** uses controlled local scenario entry points such as the bundled `web_pentest` fixture.

The right-side Agent Kernel panel shows recent memories, draft plans, built-in skills, MCP stdio status, and the `web.search` tool state.
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
    "apiKey": "sk-your-key",
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
- `GET /api/mcp/servers`, `POST /api/mcp/servers`, `DELETE /api/mcp/servers/:name`, and `POST /api/mcp/servers/:name/test` for stdio MCP configuration.

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
`.ego/` is ignored by git and is the recommended place for local persisted keys.

## Architecture

```text
apps/
  ego-cli     Terminal command and TUI
  ego-api     Hono runtime API
  ego-web     Browser UI pages, components, styles, client scripts

packages/
  agent       Coding-agent turn runner
  workspace   Safe repository inspection, edit preview, and policy-gated writes
  workbench   Shared TUI/Web state model
  hermes      Internal event bus and runtime timeline
  memory      Session/project/task memory and context compression
  mcp         MCP config, manifest, adapter boundary, and stdio client v1
  core        Mission graph, task specs, trajectories, runner
  llm         Persistent LLM config plus MiniMax M3 and compatible model providers
  tools       Local tool registry, skill/plugin registry, web.search, and permission policy
  overlays    Security scenario overlays
  storage     JSONL and SQLite stores
  report      Markdown report rendering
```

## Competition Scoring Mapping

- **Task understanding and execution design:** read-only `/chat`, approvable Plan mode, mission planning, and policy-gated edit runs.
- **System architecture and engineering:** separated CLI/API/Web/agent/workspace/MCP packages.
- **Decision explainability and robustness:** Hermes timeline, mission graph, trajectories, evidence, memory summaries, reports.
- **Tool calling and collaboration:** tool registry, skills/plugins, workspace tools, MCP stdio boundary, web.search, security overlays.
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
