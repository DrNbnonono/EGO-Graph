# EGO-Graph Submission Checklist

Program materials:

- Source code with TypeScript workspace packages.
- `ego` terminal command with `run`, `replay`, `eval`, `doctor`, and `serve`.
- Autonomous decision loop with mission graph updates, safety checks, tool execution, observations, and evidence.
- Local API endpoint `POST /runs` for testable demos.
- Controlled `web_pentest` scenario and eval dataset.
- JSONL trajectory files for reproducible audit trails.
- Markdown report with decision trace, observations, findings, reproduction, and limitations.
- Docker packaging path.
- TUI/API live control plane: cancel, btw, and loop policy.
- Permission rules with action/resource `allow | ask | deny` decisions.
- Local fixture security tools for request, crawl, fingerprint, and vulnerability report drafting.
- Lightweight TypeScript code intelligence tools for diagnostics, definitions, and references.

Documentation materials:

- Design spec.
- Architecture document.
- Development guide.
- Testing guide.
- User guide.
- Security policy.
- Technical report.
- Slides.
- Demo video.

Declaration materials:

- Originality declaration.
- Confidentiality declaration.

Release checks:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm eval:smoke
```

Do not mark the release checklist complete from historical results. Each command must be run fresh
on the release branch, and failures must be documented with the exact failing command.
