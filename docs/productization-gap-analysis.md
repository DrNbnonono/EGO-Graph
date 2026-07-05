# EGO-Graph Productization Gap Analysis

## Current Capability Inventory

EGO-Graph already has a usable TypeScript monorepo foundation:

- CLI/TUI: `ego` starts an Ink terminal workbench with chat, permissions, plan approval, diff view, patch approval, checks, memory, MCP discovery, and replay commands.
- API/Web: `ego serve` exposes Hono endpoints for read-only chat, plan-first edits, patch approvals, workbench state, model config, MCP, Hermes timeline, memory, and runtime metrics.
- Agent Harness: `packages/agent-harness` owns session state, ToolCall execution, patch/check/repair helpers, pending-run hydration, MCP bridge, memory bridge, and replay.
- LLM: `packages/llm` supports OpenAI-compatible and Anthropic-compatible providers, persistent config, token streaming, and structured tool-call parsing.
- Workspace: `packages/workspace` supports project summary, context pack, safe text reads, edit preview, policy-gated apply, and git diff.
- Memory/Storage: Memory v2 fields are persisted in SQLite, and Hermes/trajectory events provide audit and replay.
- Tools/MCP: Built-in workspace/shell/check/evidence/security audit tools and MCP stdio/http discovery/call are normalized into `ToolDefinition`.

## Current Harness Flow

The terminal Harness currently follows a mostly fixed flow:

```text
message -> classify intent
  -> chat/project_analysis or startTask
  -> build Context Pack
  -> recall memory
  -> register MCP tools
  -> run predefined read-only tool requests
  -> generate evidence-gap plan
  -> wait for plan approval
  -> generate WorkspaceEditPlan
  -> diff preview
  -> wait for patch approval
  -> apply
  -> checks
  -> repair proposal when checks fail
```

This is useful and auditable, but it is not yet a true dynamic `Plan -> Act -> Observe -> Reflect -> Replan -> Stop` loop. The model can generate plans and edits, but it does not yet choose every next tool/action in a bounded loop.

## Current TUI/API Calling Chain

- TUI calls `createTerminalAgentSession()` directly and renders streamed Harness events.
- API exposes both legacy `/agent/runs` and newer `/agent/harness/*` endpoints.
- `/chat` stays read-only and uses `runAssistantChatTurn()`.
- `/chat/stream` uses provider streaming when available, but Harness chat streaming is not yet the primary path.
- Web remains a local dashboard/approval surface; terminal is the primary workbench.

## LLM Provider Capability

Implemented:

- OpenAI-compatible text completion, JSON completion, SSE token streaming, and `tool_calls` parsing.
- Anthropic-compatible text completion, SSE token streaming, and `tool_use` parsing.
- Persistent provider config and model profiles.

Partial:

- Provider capabilities are not exposed as first-class `supportsStreaming`, `supportsToolCalls`, `supportsJsonMode`, `supportsVision`, or `maxContextTokens`.
- Structured planner actions are not yet the default Harness decision protocol.

## Memory And SQLite Persistence

Implemented:

- Memory kinds: project facts, user preferences, decisions, failures, tool results, security scopes, and run summaries.
- SQLite stores runs, edits, checks, approvals, Hermes events, plans, memories, reports, evidence, and trajectories.
- Pending patch/plan hydration exists.

Partial:

- Memory is not yet deeply integrated with a dynamic loop stop condition or context engine.
- Security scope exists as a memory kind, not yet as an enforceable active-tool authorization object.

## Tool Protocol And Permission Gate

Implemented:

- Unified `ToolCall` protocol.
- Schema validation before execute.
- Permission gate, approval gate, timeout, stdout/stderr truncation, output validation.
- `tool.failed`, `tool.timeout`, and `tool.blocked` events.

Partial:

- `sandboxProfile` is still mostly declarative; there is no real Docker/nsjail isolation for all risky tools.
- Model-native tool calls are parsed but not yet broadly routed into the Harness loop.

## Workspace Edit Boundary

Implemented:

- `create_file`, `replace_file`, and `replace_text`.
- Path policy, denied path checks, max file size, diff preview, approval, apply, checks, and audit.

Missing:

- `insert_after`, `insert_before`, `delete_text`, `rename_file`, `move_file`, policy-gated `delete_file`.
- Conflict objects, rollback proposal, before snapshots, and check-aware rollback flow.

## Eval Coverage

Current dataset coverage is minimal:

- `web_pentest.jsonl`: 1 case.
- `agent_write_loop.jsonl`: 2 cases.
- `mcp_tool_fixture.jsonl`: 2 cases.

This is not enough to prove autonomous-decision progress or prevent regressions. There is no eval runner, eval report, eval smoke script, or CI workflow.

## Productization Gaps

| Area       | Status  | Gap                                                                                  |
| ---------- | ------- | ------------------------------------------------------------------------------------ |
| Agent Loop | Partial | Still mostly fixed Harness flow; no bounded model-driven loop.                       |
| Streaming  | Partial | API streaming works; Harness/TUI assistant deltas are not universal.                 |
| Context    | Partial | Context Pack is heuristic and uncached; no repo/symbol/dependency/test index.        |
| Patch      | Partial | Safe but limited edit operations; no rollback/conflict engine.                       |
| Security   | Partial | Safety boundary exists; no `packages/security-tools` or enforceable `SecurityScope`. |
| Sandbox    | Partial | Tool metadata exists; real isolation remains future work.                            |
| Eval       | Missing | Only 5 eval records and no runner/report/CI eval smoke.                              |
| CI/Release | Missing | No GitHub Actions workflow, bootstrap, demo, or packaging script.                    |

## Four Milestones

1. **Dynamic Loop Milestone:** add `agent-loop`, loop policy/state/reflection/stop condition modules; route project analysis and write tasks through bounded loop events.
2. **Context/Patch Milestone:** add Repo Index, Context Engine, richer Patch Engine operations, conflict detection, snapshots, and rollback proposal.
3. **Safety/Security Milestone:** add `packages/security-tools`, enforce `SecurityScope`, and implement low-risk local fixture/CTF tools only.
4. **Eval/Productization Milestone:** add eval runner, 60+ cases, reports, CI workflow, bootstrap, demo guide, and submission packaging.
