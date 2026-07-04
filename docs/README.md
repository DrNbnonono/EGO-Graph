# EGO-Graph Repository Guide

EGO-Graph is a TypeScript-first cybersecurity agent project for the XH-202609 competition. It packages a terminal command named `ego`.

Primary structure:

- `apps/ego-cli`: terminal CLI and TUI.
- `apps/ego-api`: local API for `ego serve`.
- `apps/ego-web`: Web Workbench pages, components, styles, client scripts, and assets.
- `packages/agent`: assistant chat, Plan mode, and coding-agent Patch loop.
- `packages/workspace`: safe repository inspection, diff preview, and policy-gated writes.
- `packages/workbench`: shared TUI/Web state model.
- `packages/hermes`: internal event bus and runtime timeline.
- `packages/memory`: session/project/task memory and context compression.
- `packages/mcp`: MCP config and stdio client v1 boundary.
- `packages/core`: task specs, mission graph, trajectories, and runner.
- `packages/tools`: tool registry, permission policy, skills/plugins, and web search.
- `packages/overlays`: scenario overlays.
- `packages/storage`: trajectory, SQLite, approval, memory, plan, and timeline storage.
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
