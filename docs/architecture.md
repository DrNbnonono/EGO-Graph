# EGO-Graph Architecture

EGO-Graph means Evidence-Guided Orchestration Graph. The system converts an authorized security task into a typed `TaskSpec`, creates a `MissionGraph`, executes scenario tools through a deny-by-default policy, stores JSONL trajectory events, and renders a report.

The first delivery slice uses the `web_pentest` overlay and the controlled fixture at `scenarios/web_pentest/basic`. The shared core stays scenario-neutral; overlays provide tools, prompts, report sections, and default targets.

Primary packages:

- `apps/ego-cli`: terminal CLI and Ink TUI.
- `apps/ego-api`: local Hono API for `ego serve`.
- `packages/core`: task specs, mission graph, trajectory events, and runner.
- `packages/tools`: tool registry and permission policy.
- `packages/overlays`: scenario overlays.
- `packages/storage`: trajectory storage.
- `packages/report`: report generation.

