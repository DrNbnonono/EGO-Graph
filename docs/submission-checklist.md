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
pnpm build
pnpm test
pnpm smoke
```
