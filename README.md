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
- MCP config loading and policy-gated placeholder tool registration.

In progress:

- Model-backed edit-plan generation beyond explicit structured plans.
- Real MCP stdio/http transport execution behind the current config/tool boundary.
- CTF/security overlays on top of the coding-agent foundation.

Not complete yet:

- Full MCP transport client/server runtime.
- Real CTF exploit automation.
- Live multi-agent collaboration.

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

## MiniMax M3

EGO-Graph defaults to deterministic planning unless a model is configured.

```bash
export EGO_MODEL_PROVIDER=minimax
export MINIMAX_API_KEY=sk-cp-...
```

The `minimax` profile defaults to:

- `https://api.minimaxi.com/anthropic`
- `/v1/messages`
- `MiniMax-M3`

Never commit API keys. Use shell environment variables, `.env.local`, or a secret manager.

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
  mcp         MCP config, manifest, and adapter boundary
  core        Mission graph, task specs, trajectories, runner
  llm         MiniMax M3 and compatible model providers
  tools       Local tool registry and permission policy
  overlays    Security scenario overlays
  storage     JSONL and SQLite stores
  report      Markdown report rendering
```

## Competition Scoring Mapping

- **Task understanding and execution design:** natural-language `/chat`, mission planning, and policy-gated edit runs.
- **System architecture and engineering:** separated CLI/API/Web/agent/workspace/MCP packages.
- **Decision explainability and robustness:** mission graph, trajectories, evidence, reports.
- **Tool calling and collaboration:** tool registry, workspace tools, MCP config boundary, security overlays.
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
- `docs/development.md`
- `docs/testing.md`
- `docs/user-guide.md`
- `docs/security-policy.md`
- `docs/submission-checklist.md`
- `submit/`
