# EGO-Graph Coding Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert EGO-Graph from a security fixture demo into a coding-agent foundation with separated Web UI, workspace inspection, MCP boundary, final logo, and root documentation.

**Architecture:** The API remains the Hono runtime but delegates browser UI rendering to `apps/ego-web`. A new `packages/workspace` package provides bounded repository context, `packages/mcp` exposes typed MCP capability manifests, and `packages/agent` composes both into a first natural-language coding-agent turn. Security overlays remain available for CTF expansion.

**Tech Stack:** Node.js 22, TypeScript 5, pnpm workspace, Hono, Ink, Vitest, Zod, existing JSONL/SQLite trajectory infrastructure.

---

## File Structure

- `README.md`: root project readme and competition-facing overview.
- `assets/brand/ego-lotus.png`: final project logo copied from the provided image.
- `apps/ego-web/*`: independent Web UI package.
- `apps/ego-api/src/server.ts`: import UI renderers from `@ego-graph/ego-web`; add `/chat`.
- `packages/workspace/*`: safe workspace context service.
- `packages/mcp/*`: MCP manifest and capability boundary.
- `packages/agent/*`: coding-agent turn runner.
- `apps/ego-api/test/server.test.ts`: tests for Web package rendering and `/chat`.
- `packages/workspace/test/*.test.ts`, `packages/mcp/test/*.test.ts`, `packages/agent/test/*.test.ts`: package behavior tests.
- `docs/*` and `.claude/CLAUDE.MD`: update architecture and development memory.

## Task 1: Brand Assets and README

- [ ] Copy the provided logo to `assets/brand/ego-lotus.png`.
- [ ] Create root `README.md` with startup commands, architecture, competition scoring mapping, current limits, and roadmap.
- [ ] Verify the logo path exists and README mentions `ego`, `ego serve`, MiniMax M3, MCP, and coding-agent foundation.

## Task 2: Split Web UI into `apps/ego-web`

- [ ] Write failing API test that imports dashboard output through the API and expects `/assets/brand/ego-lotus.png`.
- [ ] Create `apps/ego-web/package.json`, `tsconfig.json`, and `src` folders.
- [ ] Move dashboard render functions into page/component/style/client files.
- [ ] Update `apps/ego-api` to depend on `@ego-graph/ego-web`.
- [ ] Keep `GET /`, `/assets/dashboard.css`, and `/assets/dashboard.js` behavior stable.

## Task 3: Workspace Service

- [ ] Write failing tests for listing files, reading bounded text files, and finding root project metadata.
- [ ] Implement `packages/workspace` with `createWorkspaceService`.
- [ ] Export safe methods: `summarizeProject`, `listFiles`, `readTextFile`, and `suggestCommands`.

## Task 4: MCP Boundary

- [ ] Write failing tests for an MCP manifest that reports no transport configured but exposes planned capability names.
- [ ] Implement `packages/mcp` with `createMcpManifest`.
- [ ] Surface MCP capability status in `/api/status`.

## Task 5: Coding Agent Turn and `/chat`

- [ ] Write failing tests for `runCodingAgentTurn` returning assistant text, plan steps, workspace observations, suggested commands, and MCP status.
- [ ] Implement `packages/agent`.
- [ ] Add `POST /chat` to `apps/ego-api`.
- [ ] Update Web client to submit chat messages to `/chat` before or instead of running a scenario.

## Task 6: Verification

- [ ] Run `pnpm install`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm smoke`.
- [ ] Commit the implementation.
