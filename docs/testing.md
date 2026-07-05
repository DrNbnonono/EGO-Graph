# EGO-Graph Testing

Automated checks:

- `pnpm format:check`: repository formatting, excluding local runtime artifacts.
- `pnpm lint`: ESLint for TypeScript and Web assets.
- `pnpm typecheck`: workspace TypeScript project references.
- `pnpm test`: unit and integration tests.
- `pnpm build`: TypeScript compilation.
- `pnpm smoke`: package-level smoke path for help, doctor, run, and report output.

The first scenario test uses only a controlled local fixture. External security tools must be added with parser fixtures and permission-policy tests before use in live runs.

Agent Kernel tests should cover:

- ordinary chat does not create a plan
- project analysis uses a context pack
- write requests enter plan approval before diff generation
- patch approval is separate from plan approval
- failed checks can enter repair with a new approvable patch
- Memory v2 fields persist to SQLite and reject secrets
- Tool Executor emits `tool.failed`, `tool.timeout`, and `tool.blocked` instead of pretending failures completed
- pending plan/patch state can hydrate after restart
