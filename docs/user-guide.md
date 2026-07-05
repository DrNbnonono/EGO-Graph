# EGO-Graph User Guide

Start the terminal TUI. It opens a Chinese project cockpit with a small command dialog, project
progress, and the Web dashboard entry:

```bash
ego
```

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
