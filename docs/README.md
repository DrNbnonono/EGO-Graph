# EGO-Graph Repository Guide

EGO-Graph is a TypeScript-first cybersecurity agent project for the XH-202609 competition. It packages a terminal command named `ego`.

Primary structure:

- `apps/ego-cli`: terminal CLI and TUI.
- `apps/ego-api`: local API for `ego serve`.
- `packages/core`: task specs, mission graph, trajectories, and runner.
- `packages/tools`: tool registry and permission policy.
- `packages/overlays`: scenario overlays.
- `packages/storage`: trajectory storage.
- `packages/report`: report generation.
- `scenarios`: controlled scenario fixtures.
- `datasets`: evaluation datasets and prompt assets.
- `docs`: design, development, testing, user, and submission docs.
- `submit`: competition delivery materials.

Start with:

```bash
pnpm install
pnpm build
pnpm smoke
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json
```
