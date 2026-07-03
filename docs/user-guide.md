# EGO-Graph User Guide

Start the terminal experience:

```bash
ego
```

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

Start the local API and create a run:

```bash
ego serve
curl -X POST http://localhost:3000/runs -H "content-type: application/json" -d '{"runId":"api-demo-001"}'
```

Runtime API endpoints:

- `POST /runs`
- `GET /runs/:id`
- `GET /runs/:id/events`
- `GET /runs/:id/evidence`
- `GET /runs/:id/report`
- `GET /runs/:id/stream`

Optional model planner configuration:

```bash
export EGO_MODEL_PROVIDER=openai-compatible
export EGO_MODEL_BASE_URL=https://your-openai-compatible-gateway.example
export EGO_MODEL_CHAT_PATH=/v1/chat/completions
export EGO_MODEL_API_KEY=...
export EGO_MODEL_NAME=...
export EGO_MODEL_HEADERS='{"x-extra-header":"value"}'
```

`EGO_MODEL_PROVIDER` accepts `openai-compatible`, `deepseek`, `minimax`, or `disabled`.
If model configuration is missing or a model call fails, EGO-Graph falls back to deterministic planning.

Check readiness:

```bash
ego doctor
```

Run the evaluation dataset:

```bash
ego eval --dataset datasets/evals/web_pentest.jsonl
```
