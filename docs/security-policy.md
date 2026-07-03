# EGO-Graph Security Policy

EGO-Graph is for authorized and controlled security work.

Execution rules:

- Tool execution is denied unless the task scope matches the tool permission scope.
- The first shipped scenario uses `fixture://web-pentest/basic`.
- API keys are read from environment variables.
- Trajectory events record planning, safety checks, tool execution, evidence, and reports.
- Reports must include limitations and reproduction context.

Real network scanners, exploit tools, fuzzers, and reverse-engineering tools must run through sandbox profiles and explicit scope checks.

