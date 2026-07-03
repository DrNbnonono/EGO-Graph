# EGO-Graph Design Spec

## Purpose

EGO-Graph is a deliverable cybersecurity agent project for the XH-202609 competition, "具备自主决策能力的通用网络安全智能体技术研究". The project will ship as a terminal-first agent that can be packaged and launched with the `ego` command.

The name expands to **Evidence-Guided Orchestration Graph**: an agent that turns security tasks into auditable mission graphs, executes tools inside controlled boundaries, collects structured evidence, and produces reproducible reports.

The visual identity is **EGO-Graph with a 紫莲花 (purple lotus) logo**. The lotus appears in the terminal start screen, documentation, presentation materials, and optional web console.

## Competition Requirements Addressed

The system is designed around the five scoring dimensions in the competition document:

1. **Task understanding and execution design**: parse natural language, structured files, archives, and API documents into a structured task specification and executable mission graph.
2. **System architecture and engineering implementation**: use a TypeScript monorepo, modular packages, typed schemas, packageable CLI, and reproducible deployment.
3. **Decision explainability and robustness**: record every planning step, tool call, observation, evidence item, safety decision, and report output as JSONL trajectory events.
4. **Tool invocation and collaboration**: expose tools through a plugin-style registry with Zod schemas, Docker sandbox execution, parsers, and scenario overlays.
5. **Innovation and additional value**: use an evidence-guided mission graph rather than a linear prompt chain, making decisions inspectable, replayable, and useful for human-agent collaboration.

The final submission must include source code, one-click deployment or full deployment manual, an online or local testable entry point, design/development/test/user documents, technical report, slides, demo video, and originality/confidentiality declarations.

## Product Shape

The first-class user experience is a terminal application:

```bash
ego
```

This opens the EGO-Graph terminal interface. The interface must support selecting a scenario, entering or loading a task, watching plan and evidence progress, reviewing safety gates, and exporting a report.

The CLI also exposes scriptable commands:

```bash
ego run --scenario web_pentest --task "..."
ego run --scenario incident_response --input ./case.zip
ego replay --trajectory-id <id>
ego eval --dataset datasets/evals/web_pentest.jsonl
ego doctor
ego serve
```

`ego serve` starts a local HTTP API for optional web UI integration and live demos. The project remains useful without the web UI.

## Recommended Technology Stack

### Core Stack

- **Runtime**: Node.js 22 LTS.
- **Language**: TypeScript 5 in strict mode.
- **Package manager**: pnpm workspace.
- **CLI**: `commander` for stable command parsing.
- **TUI**: Ink + React for a reliable terminal UI.
- **HTTP API**: Hono for lightweight local service endpoints.
- **Schemas**: Zod for runtime validation and typed contracts.
- **Storage**: SQLite with Drizzle ORM for indexed state; JSONL files for append-only trajectories.
- **Process execution**: `execa` for command execution and `node-pty` only where interactive tools need a pseudo-terminal.
- **Testing**: Vitest for units and integration tests; Playwright for future web console checks.
- **Formatting and linting**: Prettier, ESLint, TypeScript compiler checks.
- **Packaging**: root `package.json` exposes a `bin` named `ego`; Docker image provides isolated deployment.

### Agent and Model Stack

- **Agent core**: a self-owned mission graph engine instead of a heavy external agent framework.
- **LLM provider**: OpenAI-compatible provider abstraction, configured through environment variables.
- **Model compatibility**: domestic regulated and 备案-compatible model APIs can be used through the same interface, including services that expose OpenAI-compatible chat completions.
- **Prompt assets**: versioned under `datasets/prompts/` and scenario overlays.
- **Trajectory format**: stable JSONL event schema for planning, tool execution, observations, evidence, safety decisions, and reports.

### Security Tool Stack

TypeScript orchestrates security tools but does not reimplement them. Tools run through a controlled runner:

- Network and web testing: nmap, httpx-like probing adapters, sqlmap where permitted, nuclei-like template execution where permitted.
- Incident response: log parsers, YARA rule checks, timeline extraction, IOC matching.
- Vulnerability research: dependency and source scanning adapters, PoC harness adapters, fuzzing hooks for controlled targets.
- Reverse engineering: static metadata extraction, strings, file identification, radare2 or Ghidra headless adapters.

Every tool adapter declares input schema, output schema, required permissions, sandbox profile, parser, and evidence mapping.

## Rejected Alternatives

### Python-first backend

The initial scaffold used a Python-style `backend/app` directory. Python remains useful for some security scripts, but a Python-first architecture does not align with the desired OpenCode, Claude Code, and Codex-like developer-agent product shape. Because the current Python files are empty placeholders, replacing the scaffold with a TypeScript monorepo is low risk.

### Pure TypeScript security tooling

Pure TypeScript implementation of scanners, reverse engineering tools, and sandbox execution would be slow to build and weaker than mature security tools. EGO-Graph uses TypeScript for orchestration and evidence modeling, while specialized tools run inside controlled environments.

### Heavy LangChain/LangGraph dependency

LangChain-style frameworks can speed up demos, but they make auditability, state shape, and safety boundaries less explicit. EGO-Graph uses a small mission graph engine with typed nodes so the project can explain its decisions in competition review.

### OpenTUI as the first terminal UI

OpenTUI is visually strong and close to the OpenCode feel, but Ink is more stable for the first deliverable. OpenTUI can be evaluated later as a polish layer after the core CLI, agent loop, and trajectory system are reliable.

## Architecture

The repository will become a TypeScript monorepo:

```text
EGO-Graph/
  apps/
    ego-cli/                 # packaged CLI and Ink TUI, exposes `ego`
    ego-api/                 # optional Hono local API used by `ego serve`
  packages/
    core/                    # mission graph, task spec, planner loop, state machine
    llm/                     # provider abstraction and model gateway clients
    tools/                   # tool registry, adapters, parsers, permission metadata
    sandbox/                 # Docker runner and process execution policy
    storage/                 # SQLite schema, JSONL trajectory writer, replay reader
    overlays/                # scenario overlays: playbooks, tools, prompts, evaluators
    report/                  # markdown/html report generation
    shared/                  # cross-package types and utility functions
  scenarios/                 # reproducible demo tasks and controlled fixtures
  datasets/
    evals/                   # evaluation datasets
    prompts/                 # prompt versions
    trajectories/            # recorded runs for replay and judging evidence
  docs/                      # design, development, test, user, and submission docs
  submit/                    # slides, demo video notes, declarations, final package index
  docker/                    # sandbox images and compose files
  scripts/                   # release, eval, packaging, replay helpers
  .claude/CLAUDE.MD          # local development memory for Claude-style agents
```

Existing empty Python placeholders may be removed during implementation after the TypeScript scaffold is created. The competition source document under `docs/` remains a reference artifact.

## Core Domain Model

The main entities are:

- **TaskSpec**: normalized representation of the requested security task, including scenario, goals, inputs, constraints, allowed scope, and success criteria.
- **MissionGraph**: a graph of planned steps, dependencies, candidate strategies, safety checks, and evidence requirements.
- **AgentState**: current task, graph, tool context, evidence store, model context, and run status.
- **ToolDefinition**: typed adapter metadata, input schema, output schema, permissions, sandbox profile, parser, and evidence mapper.
- **EvidenceItem**: structured proof from a tool, file, log, observation, model judgment, or human confirmation.
- **TrajectoryEvent**: append-only audit record for task parsing, planning, action selection, tool execution, observation, evidence creation, safety gate, and report generation.
- **Report**: final markdown/html deliverable with summary, timeline, findings, evidence, reproduction steps, and limitations.

## Execution Flow

1. User starts `ego` or `ego run`.
2. The CLI loads config, model provider, scenario overlay, storage, and sandbox policy.
3. The input parser converts natural language, files, archives, or API documents into a `TaskSpec`.
4. The planner creates a `MissionGraph` with goals, candidate paths, tool needs, and evidence requirements.
5. The safety gate validates scope, permissions, tool risk, and sandbox requirements.
6. The executor runs allowed tools through the sandbox runner.
7. Parsers convert raw outputs into observations and evidence items.
8. The evaluator checks whether evidence satisfies mission goals or requires replanning.
9. The loop continues until completion, blocked state, or user stop.
10. The report generator exports the trajectory-backed result.
11. The replay command reconstructs the run from trajectory events for explanation and judging.

## Scenario Overlays

Each scenario overlay supplies playbooks, tool lists, prompts, evaluators, and report sections. The first implementation sequence should prioritize one strong scenario and then generalize.

Recommended order:

1. **web_pentest**: easiest to demonstrate with controlled local targets and visible tool output.
2. **incident_response**: strong fit for evidence graphs, logs, and report generation.
3. **vulnerability_research**: useful for innovation but should be scoped to controlled fixtures.
4. **reverse_engineering**: valuable for breadth, implemented after the runner and parser patterns are stable.

The shared core must not contain scenario-specific branching. Overlays inject scenario behavior through typed configuration.

## Safety and Responsible Use

EGO-Graph is built for authorized, controlled environments. The implementation must enforce:

- explicit scope on target hosts, files, or datasets;
- deny-by-default tool permissions;
- sandbox profiles for risky commands;
- trajectory logging for every action;
- no hardcoded credentials;
- environment-based API keys;
- clear report limitations;
- local demo fixtures for competition evaluation;
- blocked execution when requested actions exceed allowed scope.

This is both an ethical requirement and an engineering requirement for reliability during the controlled final competition.

## Packaging and Launch

The project is considered packageable when all of the following are true:

- `pnpm install` installs dependencies.
- `pnpm build` compiles the workspace.
- `pnpm test` runs the required automated checks.
- `pnpm link --global` or a packaged tarball exposes `ego`.
- `ego --help` works from a terminal.
- `ego doctor` verifies Node version, package version, config, model provider availability, Docker availability, storage path, and tool runner status.
- `ego run --scenario web_pentest --task "..."` can execute a controlled fixture and write a trajectory.
- Docker-based deployment starts the same CLI/API in a controlled environment.

## Development Memory

`.claude/CLAUDE.MD` is maintained as a living local development memory. It records:

- project identity and competition goal;
- selected technology stack;
- repository structure;
- common commands;
- architecture invariants;
- safety rules;
- testing expectations;
- documentation and submission checklist;
- current milestones.

The file should be updated whenever the architecture, commands, package layout, safety policy, or competition deliverables change.

## Documentation Deliverables

The repository should grow the following docs:

- `docs/architecture.md`: system architecture and mission graph design.
- `docs/development.md`: local setup, package commands, testing, release workflow.
- `docs/user-guide.md`: how to run `ego`, configure models, execute scenarios, review reports.
- `docs/testing.md`: unit, integration, scenario, replay, and eval strategy.
- `docs/security-policy.md`: authorized-use rules, sandbox policy, tool permission model.
- `docs/submission-checklist.md`: competition materials, packaging checks, demo flow.
- `submit/slides/`: answer-defense deck source.
- `submit/demo-video/`: script and assets for the demonstration video.
- `submit/declaration/`: originality and confidentiality declaration templates.

## Testing Strategy

Testing follows the risk of the feature:

- Unit tests cover schemas, parsers, mission graph transitions, storage, and report formatting.
- Integration tests cover CLI commands, tool registry loading, sandbox runner behavior, and trajectory writing.
- Scenario tests cover controlled tasks in `scenarios/`.
- Replay tests ensure a trajectory can reconstruct the decision chain.
- Packaging smoke tests verify `ego --help`, `ego doctor`, and one controlled `ego run`.

Any tool adapter that executes an external command must have parser tests with captured fixture output.

## Milestones

### Milestone 1: TypeScript Foundation

Create the pnpm workspace, CLI package, strict TypeScript config, linting, formatting, test runner, and `ego --help`.

### Milestone 2: Core Mission Graph

Implement typed task specs, mission graph state, trajectory events, storage, and replay.

### Milestone 3: Tool Registry and Sandbox Runner

Implement tool schemas, permission metadata, command runner, Docker profile abstraction, and parser fixtures.

### Milestone 4: First Scenario

Deliver a controlled `web_pentest` overlay with a local fixture, planning path, allowed tools, evidence mapping, report generation, and eval command.

### Milestone 5: Terminal Experience and Packaging

Build the Ink TUI, purple lotus identity, `ego doctor`, packaged CLI, Docker deployment, and user-facing docs.

### Milestone 6: Competition Materials

Prepare technical report, test document, user manual, submission checklist, slides, demo video script, and declaration materials.

## Acceptance Criteria

The design is satisfied when:

1. The repository uses the selected TypeScript-first stack.
2. A user can install or package the project and launch it with `ego`.
3. `ego --help`, `ego doctor`, `ego run`, `ego replay`, and `ego eval` are implemented.
4. At least one controlled cybersecurity scenario completes end to end with trajectory-backed evidence and a report.
5. Tool execution is scoped, logged, and sandbox-aware.
6. The architecture supports additional scenario overlays without changing the core mission graph.
7. `.claude/CLAUDE.MD` is kept current with architecture and workflow decisions.
8. Documentation and submission folders contain the materials needed for competition delivery.
