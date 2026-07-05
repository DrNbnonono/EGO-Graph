# EGO-Graph Agent Harness

The Agent Harness is the shared runtime base for EGO-Graph. Its job is to make terminal chat,
coding, research, MCP, search, and future CTF capability observable, memory-aware, replayable, and
approval-gated.

The terminal TUI is intentionally thin: it renders conversation, collapsed tool events, approvals,
diffs, checks, memory, and replay. Session state, run phase, context packing, tool execution,
workspace writes, checks, repair, and audit live in the Harness.

## State Machine

Runs move through stable phases:

```text
idle -> chat -> context_loading -> planning -> waiting_plan_approval
  -> patch_generating -> waiting_patch_approval -> patch_applying
  -> checking -> repairing -> waiting_patch_approval -> checking -> completed
                                                       \-> blocked/cancelled
```

Every phase emits Hermes/trajectory events and can be replayed after restart. File writes still
require the two gates: plan approval and patch approval.
Events carry `runId`, `sessionId`, `createdAt`, `phase`, `permissionLevel`, a user-visible
`message`, and technical details under `payload.debug`.

## Runtime Flow

Natural-language write tasks use a plan-first terminal flow:

```text
user message
  -> classify intent
  -> chat answers directly, or project analysis builds a Context Pack
  -> code/security task drafts evidence-gap plan + memory hits
  -> human approves plan
  -> model-generated WorkspaceEditPlan
  -> workspace policy
  -> diff preview
  -> human approves Patch
  -> apply changes
  -> checks
  -> if checks fail, generate a repair proposal, max 2 rounds
  -> Hermes + SQLite audit
```

Plan approval does not approve file changes. It only authorizes EGO-Graph to generate a Patch
proposal. The Patch still needs explicit diff approval before files are written.

`POST /chat` remains read-only and must never create pending edits.

## Packages

- `packages/hermes`: internal event bus with `emit`, `subscribe`, `getTimeline`, and `replay`.
- `packages/agent-harness`: shared Agent Harness session, run stream, state machine, permissions, patch approval, repair, memory commands, MCP tool calls, and replay.
- `packages/terminal-agent`: compatibility re-export for older TUI imports.
- `packages/memory`: Memory v2 records, scope/kind-aware recall, compact/archive/forget, sensitive reference filtering, and context compression.
- `packages/agent`: assistant chat, plan drafting, model-backed edit-plan generation, and coding-agent turns.
- `packages/tools`: tool registry, permission policy, built-in skills, plugin manifest validation, and `web.search`.
- `packages/mcp`: MCP config loading, tool registry boundary, stdio client, Streamable HTTP client, OAuth metadata discovery, client pool, and per-tool permission mapping.
- `packages/storage`: SQLite persistence for Hermes events, memories, plans, approvals, edits, checks, and runs.
- `packages/workspace`: repository map, relevance-ranked context pack, safe reads, policy-gated edit preview, and writes.
- `packages/workbench`: shared state contract for Web and TUI observability.

## Agent Harness Modules

`packages/agent-harness/src/index.ts` is now a public export surface. Runtime responsibilities are
split into focused modules so the terminal UI can remain a thin renderer:

- `session.ts`: `createTerminalAgentSession` and session lifecycle.
- `run-state.ts`: phase names, pending-run helpers, and run-state types.
- `event-protocol.ts`: harness event shape, user-visible messages, and debug payload access.
- `context-pack-bridge.ts`: workspace context-pack integration.
- `planner.ts`: intent routing and structured planner decision facade.
- `tool-executor.ts`: normalized `ToolCall` execution with schema validation, permission gates,
  approval gates, timeout, truncation, output validation, and failure events.
- `memory-bridge.ts`: Memory v2 helper exports for decisions, failures, tool results, scopes, and
  run summaries.
- `mcp-bridge.ts`: MCP discovery/call facade over stdio and Streamable HTTP transports.
- `patch-harness.ts`, `check-runner.ts`, `repair-loop.ts`: Patch approval flow, check output
  truncation, and max-two-round repair policy.
- `safety-policy.ts`: permission levels and required-permission resolution.

## Hermes Events

Hermes is an internal event bus, not an external protocol dependency. Events are persisted to SQLite
so the user can inspect the agent timeline after a run.

Core event types:

- `session.created`
- `message.received`
- `plan.updated`
- `tool.called`
- `memory.written`
- `approval.created`
- `check.finished`
- `repair.proposed`
- `memory.compacted`

Every new runtime capability should emit Hermes events at the decision points that matter for
audit, replay, and debugging.

## Context Pack

The Harness does not send raw repository dumps to a model. It builds a compact context pack:

- repo map entries with kind, score, and reason
- relevance-ranked selected files
- compressed long files with head/tail preservation
- recent event summaries
- package/app/doc/config summary

This keeps ordinary chat fast, project analysis grounded, and code modification prompts small.

## Memory v2

Memory has three scopes:

- `session`: short-lived conversation and UI context.
- `project`: durable project facts, conventions, and decisions.
- `task`: reusable task experience, check results, and scenario observations.

Memory kinds include:

- `project_fact`
- `user_preference`
- `decision`
- `failure`
- `tool_result`
- `security_scope`
- `run_summary`

Memory records include source metadata so the UI can show why a memory was recalled. Records should
be easy to recall, compact, archive, or forget. Sensitive references such as `.env`, private keys,
`.git`, and secret-like paths must not be promoted into long-term memory.

Memory v2 fields are persisted as first-class SQLite columns rather than hidden in tags:

- `kind`, `importance`, `confidence`, `summary`, `rawContent`
- `sourceRunId`, `evidenceRefs`, `expiresAt`
- `status` as `active`, `archived`, or `forgotten`
- `lastAccessedAt`, `accessCount`

System prompts and compact context should use `summary`; `rawContent` is for local debug/audit and
must not be injected into model prompts.

Context compression keeps:

- user goal
- constraints
- files already inspected
- decisions made
- pending todos
- risks
- cited files or sources

## Skills And Plugins

Skills are local capability descriptions with declared tools and permissions. Built-in skills are:

- `workspace`
- `shell-readonly`
- `web-search`
- `ctf-basic`

Plugins can contribute skills, MCP servers, and tools through validated manifests. Invalid manifests
must not register tools or permissions.

## MCP

MCP support includes stdio and Streamable HTTP clients:

- `initialize`
- `tools/list`
- `tools/call`
- HTTP bearer-token headers
- protected-resource metadata discovery for OAuth-capable servers
- long-lived client pooling per server descriptor
- per-tool policy overrides for scope, risk, approval, sandbox profile, timeout, and scenarios

Every MCP tool is converted into an EGO-Graph `ToolDefinition` before it can run. Unknown remote
tools default to medium risk with human approval. Tool annotations are ignored unless a server is
explicitly configured with `trustToolAnnotations`.

Full interactive OAuth browser/device authorization and HTTP MCP subscriptions are future work.

## Web Search

`web.search` is a controlled tool. It returns normalized result items with titles, URLs, snippets,
source names, and cached timestamps. Search results can inform plans and answers, but they must not
directly trigger repository writes without the normal Plan and Patch approval flow.

## Tool Executor

All new tools should normalize to this protocol before execution:

```ts
type ToolCall = {
  id: string;
  name: string;
  input: unknown;
  permissionRequired: PermissionLevel;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  sandboxProfile: "none" | "process" | "docker";
  timeoutMs: number;
};
```

The required path is:

```text
schema validate -> permission gate -> approval gate -> execute with timeout
  -> stdout/stderr truncate -> output schema validate -> evidence/memory candidates
  -> event emit
```

Failures must emit `tool.failed`, timeouts must emit `tool.timeout`, and policy denials must emit
`tool.blocked`. They must not be disguised as `tool.completed`.

## Terminal And Web

The terminal TUI is the primary Codex-like surface. It shows:

- conversation-first run stream
- collapsed tool/evidence events
- `/debug` for technical details
- `/allow` permission changes
- `/plan approve`, `/diff`, `/patch approve`, `/checks`
- `/mcp` MCP tool discovery
- `/skills` skill management guidance
- `/prompt` system prompt location
- `/model` model management guidance
- `/memory` recall/compact/archive/forget
- `/replay <runId>` from persisted Hermes events

The Web Workbench remains a local dashboard and approval surface. It shows:

- current Plan preview
- Patch diff and approval controls
- recent memories
- built-in skills
- MCP tool status
- search tool status
- checks
- Hermes timeline hooks

Both surfaces use the same SQLite/Hermes/trajectory audit chain.

## Development Rules

- New write-capable features must use `/agent/plans` or an equivalent plan approval gate.
- File writes must always pass workspace policy, diff preview, approval, apply, checks, and audit.
- Checks that fail should enter repair mode and produce a new approvable diff when a model can
  generate a safe repair plan. Repair attempts are capped.
- `/chat` must remain read-only.
- New tools must declare permissions and risk level before registration.
- New CTF overlays should reuse memory, Hermes, skills, MCP/search, and the existing evidence model.
- Tests should cover both the allowed path and the denied path for new tools or write flows.
- Active public SRC/vulnerability scanning and exploitation automation must not be enabled by
  default. It requires explicit authorization scope, permission elevation, approval, sandbox/audit,
  and a controlled target definition.
