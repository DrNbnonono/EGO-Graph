# EGO-Graph Coding Agent Foundation Design

## Background

The current EGO-Graph repository already provides a TypeScript CLI, a local Hono API, a deterministic `web_pentest` fixture scenario, trajectory storage, report generation, and a MiniMax M3 model profile. It is still not sufficient for the competition goal. The competition scoring emphasizes autonomous task understanding, multi-step execution, explainability, tool orchestration, and human-agent collaboration in a controlled environment.

The next architectural step is to make EGO-Graph a useful coding agent first. Security and CTF automation should become overlays on top of this foundation, instead of being hard-coded demo flows.

## Goals

- Use the provided purple lotus image as the final product logo.
- Add a root `README.md` that explains the project, competition target, startup commands, architecture, and current capability boundaries.
- Move Web UI code out of `apps/ego-api` into an independent `apps/ego-web` TypeScript package with `pages`, `components`, `styles`, `client`, and `assets` boundaries.
- Add a first coding-agent foundation that can receive natural-language tasks and return structured planning/actions grounded in workspace context.
- Add a workspace service layer for safe repository inspection and command suggestions.
- Add an MCP package boundary so future MCP server/tool integration is explicit instead of hidden inside the custom tool registry.
- Keep the terminal TUI and Web dashboard as user-facing consoles for the same agent state.

## Non-Goals

- This slice does not implement a full autonomous code editor that writes arbitrary patches without user review.
- This slice does not implement live CTF exploit automation or real network scanning.
- This slice does not implement a complete MCP client transport. It creates the typed boundary and manifest layer needed for the next step.
- This slice does not replace the existing security overlay architecture.

## Architecture

EGO-Graph becomes a layered system:

1. **User surfaces**
   - `apps/ego-cli`: terminal command, TUI, and command handlers.
   - `apps/ego-web`: browser dashboard and chat UI assets.
   - `apps/ego-api`: Hono API that serves Web assets and exposes runtime endpoints.

2. **Agent foundation**
   - `packages/agent`: coding-agent turn runner. It accepts a user message, reads safe workspace context through `packages/workspace`, and returns a structured response with a plan, actions, suggested commands, and trace notes.
   - `packages/workspace`: safe local workspace operations such as listing files, reading bounded text files, searching text, and describing project health.

3. **Tool and protocol boundaries**
   - `packages/tools`: existing local tool registry for scenario tools.
   - `packages/mcp`: typed MCP manifest and adapter boundary. It makes MCP support visible in architecture and UI even before transport adapters are fully implemented.

4. **Security overlays**
   - `packages/overlays`: scenario-specific security/CTF behavior. The first overlay remains `web_pentest`; future work adds CTF, incident response, vulnerability research, and reverse engineering overlays on top of the agent foundation.

## Data Flow

1. A user opens `ego` or the Web dashboard.
2. The user submits a natural-language task to `/chat`.
3. `apps/ego-api` calls `runCodingAgentTurn` from `packages/agent`.
4. The agent gathers bounded workspace context through `packages/workspace`.
5. The agent returns:
   - assistant message,
   - short execution plan,
   - observed workspace facts,
   - safe suggested commands,
   - MCP capability summary,
   - trace notes for explainability.
6. The Web dashboard renders the response in the chat panel. Future iterations can persist these chat turns to trajectory storage.

## Web UI Structure

`apps/ego-web` owns all browser-facing source:

```text
apps/ego-web/src/
  assets/
    brand.ts
  client/
    dashboard-client.ts
  components/
    chat-panel.ts
    command-list.ts
    lotus-logo.ts
    progress-panel.ts
    runtime-panel.ts
  pages/
    dashboard-page.ts
  styles/
    dashboard-style.ts
  index.ts
```

The first implementation exports static render functions so no extra frontend bundler is required. The structure still follows page/component/client/style boundaries and can later move to Vite/React without disturbing `apps/ego-api`.

## Coding Agent Behavior

The first coding-agent turn is intentionally conservative:

- It does not modify files.
- It inspects project state using bounded workspace operations.
- It identifies likely next actions from user intent.
- It suggests safe commands such as `pnpm test`, `pnpm build`, `pnpm lint`, and `ego serve`.
- It reports that MCP transport is not yet configured while exposing the intended MCP capabilities.

This produces useful, auditable behavior immediately and prepares the codebase for safe patch-generation in the next implementation slice.

## Competition Mapping

- **Task understanding and execution design:** `/chat` accepts natural-language tasks and returns structured plans.
- **System architecture and engineering:** Web/API/agent/workspace/MCP boundaries are separated into packages.
- **Decision explainability and robustness:** responses include observations, actions, and trace notes.
- **Tool calling and collaboration:** local workspace operations and MCP manifest form the next tool integration layer.
- **Innovation and added value:** EGO-Graph becomes a coding-agent foundation with security overlays, rather than a single-purpose scanner demo.

## Verification

The slice is complete when:

- `README.md` exists and describes startup, architecture, competition mapping, and limits.
- `assets/brand/ego-lotus.png` exists and Web UI references it.
- `apps/ego-web` builds as a workspace package.
- `apps/ego-api` no longer owns dashboard HTML/CSS/JS source.
- `POST /chat` returns a structured coding-agent response.
- `GET /api/status` exposes MCP capability status.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm smoke` pass.
