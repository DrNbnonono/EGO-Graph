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
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id local-run-001
node apps/ego-cli/dist/index.js replay --trajectory-id local-run-001
```

