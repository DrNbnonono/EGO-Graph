# EGO-Graph Eval Guide

EGO-Graph evals live under `datasets/evals`. They are behavior contracts, not source code.

Run:

```bash
pnpm eval:smoke
pnpm eval
```

Outputs are written to `reports/eval-summary.md`, `reports/eval-results.json`, and `reports/failure-cases.md`.

Tracked metrics include success, steps, tool calls, duration, permission blocks, repair attempts, final status, failure reason, and optional tokens/cost. The smoke runner is deterministic so CI can catch workflow regressions without requiring a live model or target.
