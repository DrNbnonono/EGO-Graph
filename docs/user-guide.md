# EGO-Graph User Guide

Start the terminal TUI. It opens a conversation-first terminal Agent surface with a compact purple
lotus welcome screen, model/permission/workspace status, and a fixed prompt at the bottom:

```bash
ego
```

The TUI is intentionally thin. It renders conversation, collapsed tool events, approvals, diffs,
checks, memory commands, history, and replay. Agent state, tool execution, Patch approval, repair,
memory, and MCP calls live in `packages/agent-harness`.

Terminal shortcuts:

- Type natural language directly to chat with the Agent.
- Type `/` to open the command palette. Use Tab or arrow keys to select, Enter to run, Esc to close.
- Use Ctrl+A/Ctrl+E for Home/End, Ctrl+U to clear before cursor, Ctrl+K to clear after cursor, Ctrl+J for a new line.
- Use Backspace to delete before the cursor and Delete to delete after the cursor.
- Use Up/Down to browse prompt history. Use mouse wheel or PageUp/PageDown to scroll conversation history.
- Use Ctrl+O or `/thinking` to expand/collapse auditable reasoning summaries and tool events.
- Use `/history` to browse persisted runs, then `/replay 1` or `/switch 1` to open a run by number.
- Use `/plan approve`, `/diff`, `/diff next`, `/patch approve`, and `/checks` for the approval flow.
- Use `/debug` only when you need full folded tool payloads and technical details.
- Use `/cancel` to request cancellation for the active run.
- Use `/btw <message>` to inject a mid-run correction without starting over.
- Use `/policy` to inspect loop budgets, and `/policy set maxSteps=8 maxToolCalls=12` to persist
  local policy overrides in `.ego/policy.json`.

Start the browser visualization:

```bash
ego serve
```

Then open:

```text
http://127.0.0.1:4317
```

The Web dashboard shows project progress, model status, storage paths, recent runs, terminal
commands, and a dialog-style mission form for controlled `web_pentest` runs. It also shows the
Agent Kernel status: recent memories, draft plans, built-in skills, MCP stdio/http status, web search,
pending approvals, and checks.

Web modes:

- **对话**: read-only assistant chat through `/chat`.
- **生成 Patch**: creates a draft plan through `/agent/plans`; after plan approval, it generates a diff and waits for Patch approval before writing files.
- **安全任务**: runs controlled security scenarios such as the bundled `web_pentest` fixture.

Run the controlled web pentest scenario:

```bash
ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id demo-run-001
```

The run prints a markdown report with findings, decision trace, observations, reproduction steps,
and limitations. Trajectory events are written under `EGO_HOME/trajectories` or `.ego/trajectories`.
Reports are written under `EGO_HOME/reports` or `.ego/reports`. SQLite indexes are stored at
`EGO_HOME/ego.sqlite` or `.ego/ego.sqlite`.

Replay the decision trail:

```bash
ego replay --trajectory-id demo-run-001
```

Start the local dashboard/API and create a run:

```bash
ego serve
curl -X POST http://127.0.0.1:4317/runs -H "content-type: application/json" -d '{"runId":"api-demo-001"}'
```

Runtime API endpoints:

- `GET /`
- `GET /api/status`
- `GET /api/workbench`
- `GET /api/memory`
- `GET /api/hermes/timeline`
- `GET /api/skills`
- `GET /api/mcp/tools`
- `GET /api/mcp/servers`
- `POST /api/mcp/servers`
- `POST /api/mcp/servers/:name/test`
- `POST /chat`
- `POST /agent/plans`
- `POST /agent/plans/:id/approve`
- `POST /agent/runs`
- `POST /agent/runs/:id/approve`
- `GET /agent/runs/:id/diff`
- `GET /agent/runs/:id/checks`
- `GET /agent/harness/policy`
- `PATCH /agent/harness/policy`
- `POST /agent/harness/runs/:id/cancel`
- `POST /agent/harness/runs/:id/btw`
- `POST /runs`
- `GET /runs/:id`
- `GET /runs/:id/events`
- `GET /runs/:id/evidence`
- `GET /runs/:id/report`
- `GET /runs/:id/stream`

Optional model planner configuration:

```bash
export EGO_MODEL_PROVIDER=minimax
export MINIMAX_API_KEY=sk-cp-...
```

The `minimax` profile defaults to the domestic Anthropic-compatible endpoint
`https://api.minimaxi.com/anthropic`, Messages path `/v1/messages`, and model `MiniMax-M3`.
You can also set `EGO_MODEL_API_KEY` instead of `MINIMAX_API_KEY`.

MCP servers can be local stdio processes or Streamable HTTP endpoints. HTTP bearer tokens are stored
locally and are not echoed by public status APIs:

```json
{
  "mcpServers": {
    "docs": {
      "transport": "http",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "accessToken": "token",
        "scopes": ["tools.read"]
      },
      "toolPolicies": {
        "docs.search": {
          "scope": "network",
          "risk": "low",
          "requiresApproval": false
        }
      },
      "enabled": true
    }
  }
}
```

Unknown MCP tools remain approval-gated. Active public scanning or exploitation still requires
explicit authorization scope and is not enabled by default.

## Memory And Tool Events

Memory v2 stores reusable project facts, preferences, decisions, failures, tool results, security
scope, and run summaries. Each record has importance, confidence, source run, evidence refs,
status, access count, and timestamps. `rawContent` is kept for local audit/debug only; prompts and
compact summaries should use the safer `summary` field.

Use:

```text
/memory recall <query>
/memory compact
/memory archive <id>
/memory forget <id>
```

Tool calls normalize through a `ToolCall` protocol with schema validation, permission checks,
approval gates, timeout, output truncation, and output validation. Policy denials show
`tool.blocked`, permission prompts show `permission.requested`, runtime failures show
`tool.failed`, timeout failures show `tool.timeout`, and truncated previews show
`tool.output.truncated`.

Useful built-in tools for agent runs:

- `workspace.grep` supports regex, ignore-case, and context lines.
- `workspace.glob` finds files by glob pattern.
- `lsp.diagnostics`, `lsp.definition`, and `lsp.references` provide read-only TypeScript code
  intelligence.
- `local_fixture.http_request`, `local_fixture.crawl`, `local_fixture.fingerprint`, and
  `report.vulnerability_draft` support controlled local security demos.

Advanced overrides:

```bash
export EGO_MODEL_BASE_URL=https://api.minimaxi.com/anthropic
export EGO_MODEL_CHAT_PATH=/v1/messages
export EGO_MODEL_NAME=MiniMax-M3
export EGO_MODEL_MAX_TOKENS=4096
export EGO_MODEL_HEADERS='{"x-extra-header":"value"}'
```

`EGO_MODEL_PROVIDER` accepts `minimax`, `openai-compatible`, `deepseek`, or `disabled`.
If model configuration is missing or a model call fails, EGO-Graph falls back to deterministic planning
and records the fallback in the trajectory.

Check readiness:

```bash
ego doctor
```

Run the evaluation dataset:

```bash
ego eval --dataset datasets/evals/web_pentest.jsonl
```
