# EGO-Graph Agent Kernel v1

Agent Kernel v1 is the shared runtime base for EGO-Graph. Its job is to make every future coding,
research, MCP, search, and CTF capability observable, memory-aware, and approval-gated.

The kernel is not a separate product surface. It is used by `ego`, `ego serve`, the local API, and
future security overlays.

## Runtime Flow

Natural-language write tasks now use a plan-first flow:

```text
user message
  -> POST /agent/plans
  -> draft_plan + contextSummary + memoryHits
  -> human approves plan
  -> POST /agent/plans/:id/approve
  -> model-generated WorkspaceEditPlan
  -> workspace policy
  -> diff preview
  -> human approves Patch
  -> apply changes
  -> checks
  -> Hermes + SQLite audit
```

Plan approval does not approve file changes. It only authorizes EGO-Graph to generate a Patch
proposal. The Patch still needs explicit diff approval before files are written.

`POST /chat` remains read-only and must never create pending edits.

## Packages

- `packages/hermes`: internal event bus with `emit`, `subscribe`, `getTimeline`, and `replay`.
- `packages/memory`: session/project/task memory, scope-aware recall, sensitive reference filtering, and context compression.
- `packages/agent`: assistant chat, plan drafting, model-backed edit-plan generation, and coding-agent turns.
- `packages/tools`: tool registry, permission policy, built-in skills, plugin manifest validation, and `web.search`.
- `packages/mcp`: MCP config loading, tool registry boundary, and stdio client v1.
- `packages/storage`: SQLite persistence for Hermes events, memories, plans, approvals, edits, checks, and runs.
- `packages/workbench`: shared state contract for Web and TUI observability.

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

Every new runtime capability should emit Hermes events at the decision points that matter for
audit, replay, and debugging.

## Memory

Memory has three scopes:

- `session`: short-lived conversation and UI context.
- `project`: durable project facts, conventions, and decisions.
- `task`: reusable task experience, check results, and scenario observations.

Memory records include source metadata so the UI can show why a memory was recalled. Records should
be easy to overwrite or forget. Sensitive references such as `.env`, private keys, `.git`, and
secret-like paths must not be promoted into long-term memory.

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

MCP support currently includes stdio client v1:

- `tools/list`
- `tools/call`

MCP tools still go through the existing permission policy and audit path. HTTP transport, remote
auth, and advanced server lifecycle management are future work.

## Web Search

`web.search` is a controlled tool. It returns normalized result items with titles, URLs, snippets,
source names, and cached timestamps. Search results can inform plans and answers, but they must not
directly trigger repository writes without the normal Plan and Patch approval flow.

## Web And TUI

The Web Workbench is the full approval and observability surface. It shows:

- current Plan preview
- Patch diff and approval controls
- recent memories
- built-in skills
- MCP tool status
- search tool status
- checks
- Hermes timeline hooks

The TUI keeps a compact status view and points users to `ego serve` for Plan and Patch approvals.

## Development Rules

- New write-capable features must use `/agent/plans` or an equivalent plan approval gate.
- File writes must always pass workspace policy, diff preview, approval, apply, checks, and audit.
- `/chat` must remain read-only.
- New tools must declare permissions and risk level before registration.
- New CTF overlays should reuse memory, Hermes, skills, MCP/search, and the existing evidence model.
- Tests should cover both the allowed path and the denied path for new tools or write flows.
