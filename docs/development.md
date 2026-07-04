# EGO-Graph Development

Requirements:

- Node.js 22 or newer.
- pnpm 11.7.0 or compatible.
- Docker for container packaging checks.

Common commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm smoke
pnpm ego -- --help
```

Local run:

```bash
pnpm build
node apps/ego-cli/dist/index.js
node apps/ego-cli/dist/index.js serve
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id local-run-001
node apps/ego-cli/dist/index.js replay --trajectory-id local-run-001
```

After `serve`, open `http://127.0.0.1:4317` to inspect the Web dashboard. The page is served by
the local API, while page, component, style, client script, and asset source lives under
`apps/ego-web/src`.

Agent Kernel development checkpoints:

- Keep `/chat` read-only.
- Route natural-language write tasks through `/agent/plans` before Patch generation.
- Keep every file write behind workspace policy, diff preview, Patch approval, checks, and audit.
- Emit Hermes events for meaningful runtime decisions.
- Register new tools through declared permissions and tests for both allowed and denied paths.

Enable the MiniMax M3 planner locally:

```bash
export EGO_MODEL_PROVIDER=minimax
export MINIMAX_API_KEY=sk-cp-...
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id minimax-local-001
```

The API key must stay in the shell environment, `.env.local`, or a secret manager. Do not commit it.
