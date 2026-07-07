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
pnpm typecheck
pnpm eval:smoke
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
- Keep TUI/API run-control surfaces aligned: `/cancel`, `/btw`, `/policy`, and the matching
  `/agent/harness/*` API routes.
- New tool execution behavior should have a failing test first, then implementation, then a focused
  green test run.
- Do not update docs with "all tests pass" unless the full command was freshly run in this branch.

Enable the MiniMax M3 planner locally:

```bash
export EGO_MODEL_PROVIDER=minimax
export MINIMAX_API_KEY=sk-cp-...
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id minimax-local-001
```

The API key must stay in the shell environment, `.env.local`, or a secret manager. Do not commit it.

## Windows + cloud-sync drives (EACCES / EPERM)

Running `pnpm install` or `pnpm typecheck` on a Baidu Syncdisk (or similar cloud-sync)
drive on Windows can fail with `EACCES` or `EPERM` during `node_modules` rename
operations. The pnpm content-addressable store itself is fine, but the hoisted
symlink layer conflicts with sync-engine file locks.

Workarounds (in order of preference):

1. **Use the Linux CI runner** (`.github/workflows/ci.yml`) as the authoritative
   verification path. It runs `typecheck`, `test`, `build`, `smoke`, `eval:smoke`,
   and `eval:hardness:smoke` on `ubuntu-latest`.
2. **Clone the repo to a non-synced local path** (e.g. `C:\dev\EGO-Graph`) and run
   `pnpm install` there. The Baidu Syncdisk copy can remain for editing while the
   non-synced copy handles builds and tests.
3. **Run tsc directly** without triggering `pnpm install`:
   ```bash
   node "node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/tsc.js" -b --pretty false
   ```
   This bypasses the pnpm hoist layer and uses the `.pnpm` store directly.

## Hardness CI gate

The CI pipeline runs `pnpm eval:hardness:smoke` after `eval:smoke`. This executes
the h0/h1 hardness scenarios against the real agent loop with a deterministic
stub model provider (no network) and exits non-zero on regression. A JSON
artifact (`hardness-artifacts/hardness-report-smoke.json`) is uploaded on every
run with per-scenario scores, missing signals, and timing data.

To run the full hardness suite locally:

```bash
pnpm build
pnpm eval:hardness
```
