# EGO-Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first deliverable EGO-Graph product line: a TypeScript monorepo that packages an `ego` terminal command, executes a controlled web security scenario, records auditable trajectories, and exports a report.

**Architecture:** The implementation replaces the empty Python scaffold with a TypeScript-first pnpm workspace while keeping existing competition docs and submission folders. The core is a typed mission graph engine with scenario overlays, a tool registry, JSONL trajectories, and a CLI/TUI package that exposes `ego`. The first end-to-end scenario is `web_pentest` using controlled local fixtures; later scenarios extend the same overlay interfaces.

**Tech Stack:** Node.js 22, TypeScript 5 strict mode, pnpm workspace, commander, Ink + React, Hono, Zod, Vitest, ESLint, Prettier, execa, SQLite/Drizzle-compatible storage boundaries, JSONL trajectories.

---

## Scope Check

The design spec covers a full competition project. This plan implements the first complete vertical slice and the architecture needed to extend it:

- TypeScript workspace and `ego` command.
- Core task spec, mission graph, trajectory, and replay contracts.
- JSONL trajectory storage and a SQLite-ready storage package boundary.
- Tool registry, deny-by-default permissions, and controlled fixture tools.
- `web_pentest` overlay with one deterministic scenario.
- CLI commands: `ego --help`, `ego doctor`, `ego run`, `ego replay`, `ego eval`, and `ego serve`.
- Ink TUI shell with the 紫莲花 identity.
- Report generation and competition-facing docs.

Additional real-world tool adapters and the remaining three scenarios should be implemented in follow-up plans after this vertical slice is green.

## File Structure

Create or modify these files:

- `package.json`: root package scripts, workspace commands, and `ego` bin for local development.
- `pnpm-workspace.yaml`: workspace package globs.
- `tsconfig.base.json`: shared strict TypeScript config.
- `eslint.config.js`: flat ESLint config.
- `.prettierrc.json`: formatting config.
- `vitest.config.ts`: Vitest workspace config.
- `apps/ego-cli/package.json`: CLI package metadata and bin entry.
- `apps/ego-cli/src/index.ts`: executable entry.
- `apps/ego-cli/src/cli.ts`: commander program.
- `apps/ego-cli/src/tui.tsx`: Ink UI entry.
- `apps/ego-cli/src/commands/*.ts`: command handlers.
- `apps/ego-cli/test/*.test.ts`: CLI tests.
- `apps/ego-api/package.json`: optional local API package.
- `apps/ego-api/src/server.ts`: Hono server used by `ego serve`.
- `packages/shared/src/*.ts`: shared constants, result helpers, and schemas.
- `packages/core/src/*.ts`: task spec, mission graph, planner, evaluator, agent runner.
- `packages/storage/src/*.ts`: trajectory writer, replay reader, storage paths.
- `packages/tools/src/*.ts`: tool registry, permission policy, fixture tools.
- `packages/overlays/src/*.ts`: scenario overlay loader and web pentest overlay.
- `packages/report/src/*.ts`: markdown report generator.
- `scenarios/web_pentest/basic/task.json`: deterministic scenario input.
- `scenarios/web_pentest/basic/target.html`: controlled fixture evidence source.
- `datasets/evals/web_pentest.jsonl`: eval dataset.
- `docs/architecture.md`, `docs/development.md`, `docs/user-guide.md`, `docs/testing.md`, `docs/security-policy.md`, `docs/submission-checklist.md`: delivery docs.
- `.claude/CLAUDE.MD`: local development memory updated after this plan.

## Task 1: Bootstrap TypeScript Workspace and CLI Help

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `vitest.config.ts`
- Create: `apps/ego-cli/package.json`
- Create: `apps/ego-cli/src/index.ts`
- Create: `apps/ego-cli/src/cli.ts`
- Create: `apps/ego-cli/test/cli-help.test.ts`

- [ ] **Step 1: Write the failing CLI help test**

Create `apps/ego-cli/test/cli-help.test.ts`:

```ts
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego cli help", () => {
  it("prints the public command surface", async () => {
    const result = await execa("node", ["apps/ego-cli/dist/index.js", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("EGO-Graph");
    expect(result.stdout).toContain("run");
    expect(result.stdout).toContain("replay");
    expect(result.stdout).toContain("eval");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("serve");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the workspace is not built**

Run:

```bash
pnpm vitest run apps/ego-cli/test/cli-help.test.ts
```

Expected: command fails because `pnpm` dependencies and `apps/ego-cli/dist/index.js` do not exist.

- [ ] **Step 3: Create root workspace files**

Create `package.json`:

```json
{
  "name": "ego-graph",
  "version": "0.1.0",
  "private": true,
  "description": "Evidence-Guided Orchestration Graph cybersecurity agent",
  "type": "module",
  "bin": {
    "ego": "apps/ego-cli/dist/index.js"
  },
  "scripts": {
    "build": "pnpm -r --sort build",
    "clean": "node scripts/clean.mjs",
    "dev": "tsx apps/ego-cli/src/index.ts",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "typecheck": "tsc -b",
    "ego": "node apps/ego-cli/dist/index.js"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "packageManager": "pnpm@9.15.0",
  "devDependencies": {
    "@eslint/js": "^9.18.0",
    "@types/node": "^22.10.7",
    "@types/react": "^18.3.18",
    "eslint": "^9.18.0",
    "execa": "^9.5.2",
    "prettier": "^3.4.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0",
    "vitest": "^2.1.8"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "outDir": "dist"
  }
}
```

Create `eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
```

Create `.prettierrc.json`:

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all"
}
```

Create `vitest.config.ts`:

```ts
import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    globals: false,
    testTimeout: 15_000,
  },
});
```

- [ ] **Step 4: Create the CLI package**

Create `apps/ego-cli/package.json`:

```json
{
  "name": "@ego-graph/ego-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "ego": "dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0"
  },
  "devDependencies": {}
}
```

Create `apps/ego-cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/ego-cli/src/index.ts`:

```ts
#!/usr/bin/env node
import {runCli} from "./cli.js";

await runCli(process.argv);
```

Create `apps/ego-cli/src/cli.ts`:

```ts
import {Command} from "commander";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ego")
    .description("EGO-Graph cybersecurity agent")
    .version("0.1.0");

  program
    .command("run")
    .description("Run an EGO-Graph mission")
    .option("--scenario <name>", "scenario overlay name", "web_pentest")
    .option("--task <text>", "natural-language task")
    .option("--input <path>", "path to a task input file")
    .action(() => {
      console.log("ego run is not wired yet");
    });

  program
    .command("replay")
    .description("Replay a recorded trajectory")
    .requiredOption("--trajectory-id <id>", "trajectory id")
    .action(() => {
      console.log("ego replay is not wired yet");
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(() => {
      console.log("ego eval is not wired yet");
    });

  program.command("doctor").description("Check local EGO-Graph readiness").action(() => {
    console.log("ego doctor is not wired yet");
  });

  program.command("serve").description("Start the local EGO-Graph API").action(() => {
    console.log("ego serve is not wired yet");
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
```

- [ ] **Step 5: Install dependencies, build, and confirm the help test passes**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run apps/ego-cli/test/cli-help.test.ts
```

Expected: build succeeds and the test passes.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.js .prettierrc.json vitest.config.ts apps/ego-cli
git commit -m "feat: bootstrap TypeScript CLI workspace"
```

## Task 2: Add Shared Types, Result Helpers, and Domain Schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/result.ts`
- Create: `packages/shared/src/scenario.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/task-spec.ts`
- Create: `packages/core/src/mission-graph.ts`
- Create: `packages/core/src/trajectory.ts`
- Test: `packages/core/test/task-spec.test.ts`
- Test: `packages/core/test/mission-graph.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `packages/core/test/task-spec.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {parseTaskSpec} from "../src/task-spec.js";

describe("TaskSpec", () => {
  it("normalizes a controlled web pentest task", () => {
    const task = parseTaskSpec({
      scenario: "web_pentest",
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: ["fixture://web-pentest/basic"],
      constraints: ["authorized-fixture-only"],
    });

    expect(task.scenario).toBe("web_pentest");
    expect(task.targets[0]).toBe("fixture://web-pentest/basic");
    expect(task.allowedScope.kind).toBe("fixture");
  });

  it("rejects an empty target list", () => {
    expect(() =>
      parseTaskSpec({
        scenario: "web_pentest",
        goal: "Assess nothing",
        targets: [],
        constraints: ["authorized-fixture-only"],
      }),
    ).toThrow("TaskSpec");
  });
});
```

Create `packages/core/test/mission-graph.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {createInitialMissionGraph} from "../src/mission-graph.js";
import {parseTaskSpec} from "../src/task-spec.js";

describe("MissionGraph", () => {
  it("creates parse, plan, execute, evaluate, and report nodes", () => {
    const task = parseTaskSpec({
      scenario: "web_pentest",
      goal: "Assess the controlled fixture for exposed admin hints",
      targets: ["fixture://web-pentest/basic"],
      constraints: ["authorized-fixture-only"],
    });

    const graph = createInitialMissionGraph(task);

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "parse_task",
      "plan",
      "safety_gate",
      "execute_tools",
      "evaluate",
      "report",
    ]);
    expect(graph.status).toBe("planned");
  });
});
```

- [ ] **Step 2: Run tests and confirm missing modules fail**

Run:

```bash
pnpm vitest run packages/core/test/task-spec.test.ts packages/core/test/mission-graph.test.ts
```

Expected: tests fail because `packages/core` does not exist.

- [ ] **Step 3: Create shared package**

Create `packages/shared/package.json`:

```json
{
  "name": "@ego-graph/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/shared/src/result.ts`:

```ts
export type Result<T, E extends Error = Error> =
  | {ok: true; value: T}
  | {ok: false; error: E};

export function ok<T>(value: T): Result<T> {
  return {ok: true, value};
}

export function err<E extends Error>(error: E): Result<never, E> {
  return {ok: false, error};
}
```

Create `packages/shared/src/scenario.ts`:

```ts
export const scenarioNames = [
  "web_pentest",
  "incident_response",
  "vulnerability_research",
  "reverse_engineering",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export function isScenarioName(value: string): value is ScenarioName {
  return scenarioNames.includes(value as ScenarioName);
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./result.js";
export * from "./scenario.js";
```

- [ ] **Step 4: Create core package and schemas**

Create `packages/core/package.json`:

```json
{
  "name": "@ego-graph/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ego-graph/shared": "workspace:*",
    "zod": "^3.24.1"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{"path": "../shared"}],
  "include": ["src/**/*.ts"]
}
```

Create `packages/core/src/task-spec.ts`:

```ts
import {z} from "zod";

export const taskSpecSchema = z.object({
  scenario: z.enum([
    "web_pentest",
    "incident_response",
    "vulnerability_research",
    "reverse_engineering",
  ]),
  goal: z.string().min(8),
  targets: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)).default([]),
});

export type TaskSpecInput = z.input<typeof taskSpecSchema>;
export type TaskSpec = z.output<typeof taskSpecSchema> & {
  id: string;
  allowedScope: {kind: "fixture" | "network" | "file"; values: string[]};
};

export function parseTaskSpec(input: TaskSpecInput): TaskSpec {
  const parsed = taskSpecSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`TaskSpec validation failed: ${parsed.error.message}`);
  }

  const firstTarget = parsed.data.targets[0] ?? "";
  const scopeKind = firstTarget.startsWith("fixture://")
    ? "fixture"
    : firstTarget.startsWith("file://")
      ? "file"
      : "network";

  return {
    ...parsed.data,
    id: `task-${Buffer.from(`${parsed.data.scenario}:${parsed.data.goal}`).toString("hex").slice(0, 12)}`,
    allowedScope: {kind: scopeKind, values: parsed.data.targets},
  };
}
```

Create `packages/core/src/mission-graph.ts`:

```ts
import type {TaskSpec} from "./task-spec.js";

export type MissionNodeKind =
  | "parse_task"
  | "plan"
  | "safety_gate"
  | "execute_tools"
  | "evaluate"
  | "report";

export type MissionNodeStatus = "pending" | "ready" | "running" | "complete" | "blocked";

export type MissionNode = {
  id: string;
  kind: MissionNodeKind;
  status: MissionNodeStatus;
  dependsOn: string[];
  rationale: string;
};

export type MissionGraph = {
  id: string;
  taskId: string;
  status: "planned" | "running" | "complete" | "blocked";
  nodes: MissionNode[];
};

export function createInitialMissionGraph(task: TaskSpec): MissionGraph {
  const kinds: MissionNodeKind[] = [
    "parse_task",
    "plan",
    "safety_gate",
    "execute_tools",
    "evaluate",
    "report",
  ];

  const nodes = kinds.map((kind, index): MissionNode => {
    const previous = index === 0 ? [] : [`node-${index}`];
    return {
      id: `node-${index + 1}`,
      kind,
      status: index === 0 ? "complete" : index === 1 ? "ready" : "pending",
      dependsOn: previous,
      rationale: `${kind} is required to complete ${task.scenario}`,
    };
  });

  return {
    id: `graph-${task.id}`,
    taskId: task.id,
    status: "planned",
    nodes,
  };
}
```

Create `packages/core/src/trajectory.ts`:

```ts
import {z} from "zod";

export const trajectoryEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: z.enum([
    "task.parsed",
    "graph.created",
    "safety.checked",
    "tool.started",
    "tool.completed",
    "evidence.created",
    "report.created",
    "run.completed",
    "run.blocked",
  ]),
  message: z.string().min(1),
  data: z.record(z.unknown()).default({}),
});

export type TrajectoryEvent = z.output<typeof trajectoryEventSchema>;

export function createTrajectoryEvent(
  runId: string,
  type: TrajectoryEvent["type"],
  message: string,
  data: Record<string, unknown> = {},
): TrajectoryEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    runId,
    timestamp: new Date().toISOString(),
    type,
    message,
    data,
  };
}
```

Create `packages/core/src/index.ts`:

```ts
export * from "./task-spec.js";
export * from "./mission-graph.js";
export * from "./trajectory.js";
```

- [ ] **Step 5: Build and test**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run packages/core/test/task-spec.test.ts packages/core/test/mission-graph.test.ts
```

Expected: both tests pass.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add packages/shared packages/core package.json pnpm-lock.yaml
git commit -m "feat: add mission graph domain schemas"
```

## Task 3: Implement Trajectory Storage and Replay Reader

**Files:**
- Create: `packages/storage/package.json`
- Create: `packages/storage/tsconfig.json`
- Create: `packages/storage/src/index.ts`
- Create: `packages/storage/src/paths.ts`
- Create: `packages/storage/src/jsonl-trajectory-store.ts`
- Test: `packages/storage/test/jsonl-trajectory-store.test.ts`

- [ ] **Step 1: Write failing trajectory storage test**

Create `packages/storage/test/jsonl-trajectory-store.test.ts`:

```ts
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {createTrajectoryEvent} from "@ego-graph/core";
import {JsonlTrajectoryStore} from "../src/jsonl-trajectory-store.js";

describe("JsonlTrajectoryStore", () => {
  it("appends and replays trajectory events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-trajectory-"));
    try {
      const store = new JsonlTrajectoryStore(dir);
      const event = createTrajectoryEvent("run-test-001", "task.parsed", "Task parsed", {
        scenario: "web_pentest",
      });

      await store.append(event);
      const events = await store.readRun("run-test-001");
      const raw = await readFile(join(dir, "run-test-001.jsonl"), "utf8");

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("task.parsed");
      expect(raw.trim()).toContain("Task parsed");
    } finally {
      await rm(dir, {recursive: true, force: true});
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm missing storage package fails**

Run:

```bash
pnpm vitest run packages/storage/test/jsonl-trajectory-store.test.ts
```

Expected: test fails because `packages/storage` does not exist.

- [ ] **Step 3: Create storage package**

Create `packages/storage/package.json`:

```json
{
  "name": "@ego-graph/storage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ego-graph/core": "workspace:*"
  }
}
```

Create `packages/storage/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{"path": "../core"}],
  "include": ["src/**/*.ts"]
}
```

Create `packages/storage/src/paths.ts`:

```ts
import {join} from "node:path";

export function defaultEgoHome(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.EGO_HOME ?? join(process.cwd(), ".ego");
  return base;
}

export function trajectoryDir(egoHome = defaultEgoHome()): string {
  return join(egoHome, "trajectories");
}
```

Create `packages/storage/src/jsonl-trajectory-store.ts`:

```ts
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {trajectoryEventSchema, type TrajectoryEvent} from "@ego-graph/core";

export class JsonlTrajectoryStore {
  constructor(private readonly directory: string) {}

  async append(event: TrajectoryEvent): Promise<void> {
    await mkdir(this.directory, {recursive: true});
    const path = join(this.directory, `${event.runId}.jsonl`);
    await writeFile(path, `${JSON.stringify(event)}\n`, {encoding: "utf8", flag: "a"});
  }

  async readRun(runId: string): Promise<TrajectoryEvent[]> {
    const path = join(this.directory, `${runId}.jsonl`);
    const raw = await readFile(path, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => trajectoryEventSchema.parse(JSON.parse(line)));
  }
}
```

Create `packages/storage/src/index.ts`:

```ts
export * from "./paths.js";
export * from "./jsonl-trajectory-store.js";
```

- [ ] **Step 4: Test storage**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run packages/storage/test/jsonl-trajectory-store.test.ts
```

Expected: storage test passes.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add packages/storage package.json pnpm-lock.yaml
git commit -m "feat: add JSONL trajectory storage"
```

## Task 4: Implement Tool Registry and Deny-by-Default Permission Policy

**Files:**
- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/src/index.ts`
- Create: `packages/tools/src/tool-definition.ts`
- Create: `packages/tools/src/tool-registry.ts`
- Create: `packages/tools/src/permission-policy.ts`
- Create: `packages/tools/src/fixture-tools.ts`
- Test: `packages/tools/test/tool-registry.test.ts`
- Test: `packages/tools/test/permission-policy.test.ts`

- [ ] **Step 1: Write failing tool registry tests**

Create `packages/tools/test/tool-registry.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {createFixtureReadTool, ToolRegistry} from "../src/index.js";

describe("ToolRegistry", () => {
  it("registers and retrieves a fixture tool", () => {
    const registry = new ToolRegistry();
    const tool = createFixtureReadTool();

    registry.register(tool);

    expect(registry.get("fixture.read").name).toBe("fixture.read");
    expect(registry.list().map((entry) => entry.name)).toEqual(["fixture.read"]);
  });
});
```

Create `packages/tools/test/permission-policy.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {checkToolPermission, createFixtureReadTool} from "../src/index.js";

describe("permission policy", () => {
  it("allows fixture tools for fixture scope", () => {
    const decision = checkToolPermission(createFixtureReadTool(), {
      kind: "fixture",
      values: ["fixture://web-pentest/basic"],
    });

    expect(decision.allowed).toBe(true);
  });

  it("blocks fixture tools for network scope", () => {
    const decision = checkToolPermission(createFixtureReadTool(), {
      kind: "network",
      values: ["https://example.com"],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("fixture");
  });
});
```

- [ ] **Step 2: Run tests and confirm missing package fails**

Run:

```bash
pnpm vitest run packages/tools/test/tool-registry.test.ts packages/tools/test/permission-policy.test.ts
```

Expected: tests fail because `packages/tools` does not exist.

- [ ] **Step 3: Create tool registry package**

Create `packages/tools/package.json`:

```json
{
  "name": "@ego-graph/tools",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  }
}
```

Create `packages/tools/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/tools/src/tool-definition.ts`:

```ts
import type {ZodTypeAny, z} from "zod";

export type ToolScopeKind = "fixture" | "network" | "file";

export type ToolPermission = {
  scope: ToolScopeKind;
  risk: "low" | "medium" | "high";
  requiresSandbox: boolean;
};

export type ToolExecutionContext = {
  workspaceRoot: string;
};

export type ToolDefinition<InputSchema extends ZodTypeAny, OutputSchema extends ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  permission: ToolPermission;
  execute: (
    input: z.output<InputSchema>,
    context: ToolExecutionContext,
  ) => Promise<z.output<OutputSchema>>;
};
```

Create `packages/tools/src/tool-registry.ts`:

```ts
import type {ZodTypeAny} from "zod";
import type {ToolDefinition} from "./tool-definition.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<ZodTypeAny, ZodTypeAny>>();

  register(tool: ToolDefinition<ZodTypeAny, ZodTypeAny>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<ZodTypeAny, ZodTypeAny> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return tool;
  }

  list(): ToolDefinition<ZodTypeAny, ZodTypeAny>[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
```

Create `packages/tools/src/permission-policy.ts`:

```ts
import type {ZodTypeAny} from "zod";
import type {ToolDefinition, ToolScopeKind} from "./tool-definition.js";

export type AllowedScope = {kind: ToolScopeKind; values: string[]};

export type PermissionDecision =
  | {allowed: true; reason: string}
  | {allowed: false; reason: string};

export function checkToolPermission(
  tool: ToolDefinition<ZodTypeAny, ZodTypeAny>,
  allowedScope: AllowedScope,
): PermissionDecision {
  if (tool.permission.scope !== allowedScope.kind) {
    return {
      allowed: false,
      reason: `Tool ${tool.name} requires ${tool.permission.scope} scope but task allows ${allowedScope.kind}`,
    };
  }

  if (allowedScope.values.length === 0) {
    return {allowed: false, reason: "Task scope is empty"};
  }

  return {allowed: true, reason: `Tool ${tool.name} is allowed for ${allowedScope.kind} scope`};
}
```

Create `packages/tools/src/fixture-tools.ts`:

```ts
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {z} from "zod";
import type {ToolDefinition} from "./tool-definition.js";

const fixtureReadInputSchema = z.object({
  fixture: z.literal("fixture://web-pentest/basic"),
});

const fixtureReadOutputSchema = z.object({
  title: z.string(),
  body: z.string(),
  findings: z.array(z.string()),
});

export function createFixtureReadTool(): ToolDefinition<
  typeof fixtureReadInputSchema,
  typeof fixtureReadOutputSchema
> {
  return {
    name: "fixture.read",
    description: "Read the controlled web pentest fixture",
    inputSchema: fixtureReadInputSchema,
    outputSchema: fixtureReadOutputSchema,
    permission: {scope: "fixture", risk: "low", requiresSandbox: false},
    async execute(input, context) {
      const path = join(context.workspaceRoot, "scenarios", "web_pentest", "basic", "target.html");
      const body = await readFile(path, "utf8");
      const title = body.match(/<title>(?<title>[^<]+)<\/title>/)?.groups?.title ?? "Untitled";
      const findings = body.includes("admin")
        ? ["Fixture contains an exposed admin hint"]
        : ["Fixture contains no admin hint"];
      return fixtureReadOutputSchema.parse({title, body, findings});
    },
  };
}
```

Create `packages/tools/src/index.ts`:

```ts
export * from "./tool-definition.js";
export * from "./tool-registry.js";
export * from "./permission-policy.js";
export * from "./fixture-tools.js";
```

- [ ] **Step 4: Test tools**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run packages/tools/test/tool-registry.test.ts packages/tools/test/permission-policy.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add packages/tools package.json pnpm-lock.yaml
git commit -m "feat: add tool registry and permission policy"
```

## Task 5: Add Web Pentest Overlay and Controlled Fixture

**Files:**
- Create: `packages/overlays/package.json`
- Create: `packages/overlays/tsconfig.json`
- Create: `packages/overlays/src/index.ts`
- Create: `packages/overlays/src/overlay.ts`
- Create: `packages/overlays/src/web-pentest.ts`
- Create: `scenarios/web_pentest/basic/task.json`
- Create: `scenarios/web_pentest/basic/target.html`
- Create: `datasets/evals/web_pentest.jsonl`
- Test: `packages/overlays/test/web-pentest-overlay.test.ts`

- [ ] **Step 1: Write failing overlay test**

Create `packages/overlays/test/web-pentest-overlay.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {loadOverlay} from "../src/index.js";

describe("web pentest overlay", () => {
  it("loads fixture tools and report sections", () => {
    const overlay = loadOverlay("web_pentest");

    expect(overlay.name).toBe("web_pentest");
    expect(overlay.tools.map((tool) => tool.name)).toEqual(["fixture.read"]);
    expect(overlay.reportSections).toContain("Findings");
  });
});
```

- [ ] **Step 2: Run the test and confirm missing overlay package fails**

Run:

```bash
pnpm vitest run packages/overlays/test/web-pentest-overlay.test.ts
```

Expected: test fails because `packages/overlays` does not exist.

- [ ] **Step 3: Create overlay package**

Create `packages/overlays/package.json`:

```json
{
  "name": "@ego-graph/overlays",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ego-graph/shared": "workspace:*",
    "@ego-graph/tools": "workspace:*"
  }
}
```

Create `packages/overlays/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{"path": "../shared"}, {"path": "../tools"}],
  "include": ["src/**/*.ts"]
}
```

Create `packages/overlays/src/overlay.ts`:

```ts
import type {ScenarioName} from "@ego-graph/shared";
import type {ToolDefinition} from "@ego-graph/tools";
import type {ZodTypeAny} from "zod";

export type ScenarioOverlay = {
  name: ScenarioName;
  displayName: string;
  tools: ToolDefinition<ZodTypeAny, ZodTypeAny>[];
  reportSections: string[];
  defaultTarget: string;
};
```

Create `packages/overlays/src/web-pentest.ts`:

```ts
import {createFixtureReadTool} from "@ego-graph/tools";
import type {ScenarioOverlay} from "./overlay.js";

export function createWebPentestOverlay(): ScenarioOverlay {
  return {
    name: "web_pentest",
    displayName: "Web Pentest",
    tools: [createFixtureReadTool()],
    reportSections: ["Summary", "Findings", "Evidence", "Reproduction"],
    defaultTarget: "fixture://web-pentest/basic",
  };
}
```

Create `packages/overlays/src/index.ts`:

```ts
import type {ScenarioName} from "@ego-graph/shared";
import type {ScenarioOverlay} from "./overlay.js";
import {createWebPentestOverlay} from "./web-pentest.js";

export * from "./overlay.js";
export * from "./web-pentest.js";

export function loadOverlay(name: ScenarioName): ScenarioOverlay {
  if (name === "web_pentest") {
    return createWebPentestOverlay();
  }
  throw new Error(`Overlay is not implemented yet: ${name}`);
}
```

- [ ] **Step 4: Add controlled web pentest fixture**

Create `scenarios/web_pentest/basic/task.json`:

```json
{
  "scenario": "web_pentest",
  "goal": "Assess the controlled fixture for exposed admin hints",
  "targets": ["fixture://web-pentest/basic"],
  "constraints": ["authorized-fixture-only"]
}
```

Create `scenarios/web_pentest/basic/target.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>EGO Fixture Shop</title>
  </head>
  <body>
    <h1>EGO Fixture Shop</h1>
    <p>Public demo page for authorized EGO-Graph tests.</p>
    <a href="/admin">Admin panel hint for controlled evidence extraction</a>
  </body>
</html>
```

Create `datasets/evals/web_pentest.jsonl`:

```jsonl
{"id":"web-pentest-smoke-001","scenario":"web_pentest","taskFile":"scenarios/web_pentest/basic/task.json","expectedFinding":"Fixture contains an exposed admin hint"}
```

- [ ] **Step 5: Test overlay**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run packages/overlays/test/web-pentest-overlay.test.ts
```

Expected: test passes.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add packages/overlays scenarios/web_pentest/basic datasets/evals/web_pentest.jsonl package.json pnpm-lock.yaml
git commit -m "feat: add web pentest overlay fixture"
```

## Task 6: Implement Agent Runner, Report Generator, and `ego run`

**Files:**
- Create: `packages/core/src/agent-runner.ts`
- Create: `packages/report/package.json`
- Create: `packages/report/tsconfig.json`
- Create: `packages/report/src/index.ts`
- Create: `packages/report/src/markdown-report.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/ego-cli/package.json`
- Modify: `apps/ego-cli/src/cli.ts`
- Create: `apps/ego-cli/src/commands/run.ts`
- Test: `packages/core/test/agent-runner.test.ts`
- Test: `packages/report/test/markdown-report.test.ts`
- Test: `apps/ego-cli/test/run-command.test.ts`

- [ ] **Step 1: Write failing agent runner test**

Create `packages/core/test/agent-runner.test.ts`:

```ts
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {createWebPentestOverlay} from "@ego-graph/overlays";
import {JsonlTrajectoryStore} from "@ego-graph/storage";
import {runMission} from "../src/agent-runner.js";

describe("runMission", () => {
  it("runs the controlled web pentest fixture and records evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ego-run-"));
    try {
      const result = await runMission({
        workspaceRoot: process.cwd(),
        task: {
          scenario: "web_pentest",
          goal: "Assess the controlled fixture for exposed admin hints",
          targets: ["fixture://web-pentest/basic"],
          constraints: ["authorized-fixture-only"],
        },
        overlay: createWebPentestOverlay(),
        trajectoryStore: new JsonlTrajectoryStore(dir),
        runId: "run-test-001",
      });

      expect(result.status).toBe("complete");
      expect(result.evidence[0]?.summary).toContain("admin hint");
      expect(result.events.map((event) => event.type)).toContain("run.completed");
    } finally {
      await rm(dir, {recursive: true, force: true});
    }
  });
});
```

- [ ] **Step 2: Write failing report test**

Create `packages/report/test/markdown-report.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {renderMarkdownReport} from "../src/markdown-report.js";

describe("renderMarkdownReport", () => {
  it("renders a trajectory-backed report", () => {
    const markdown = renderMarkdownReport({
      runId: "run-test-001",
      scenario: "web_pentest",
      goal: "Assess fixture",
      status: "complete",
      evidence: [{summary: "Fixture contains an exposed admin hint", source: "fixture.read"}],
    });

    expect(markdown).toContain("# EGO-Graph Report");
    expect(markdown).toContain("Fixture contains an exposed admin hint");
    expect(markdown).toContain("run-test-001");
  });
});
```

- [ ] **Step 3: Write failing run command test**

Create `apps/ego-cli/test/run-command.test.ts`:

```ts
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego run", () => {
  it("runs the controlled web pentest fixture", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-cli-run-"));
    try {
      const result = await execa(
        "node",
        [
          "apps/ego-cli/dist/index.js",
          "run",
          "--scenario",
          "web_pentest",
          "--input",
          "scenarios/web_pentest/basic/task.json",
          "--run-id",
          "run-cli-001",
        ],
        {env: {EGO_HOME: egoHome}},
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("run-cli-001");
      expect(result.stdout).toContain("complete");
      expect(result.stdout).toContain("Fixture contains an exposed admin hint");
    } finally {
      await rm(egoHome, {recursive: true, force: true});
    }
  });
});
```

- [ ] **Step 4: Run tests and confirm missing runner/report behavior fails**

Run:

```bash
pnpm vitest run packages/core/test/agent-runner.test.ts packages/report/test/markdown-report.test.ts apps/ego-cli/test/run-command.test.ts
```

Expected: tests fail because runner, report, and command handler are not implemented.

- [ ] **Step 5: Implement agent runner**

Create `packages/core/src/agent-runner.ts`:

```ts
import type {ScenarioOverlay} from "@ego-graph/overlays";
import type {JsonlTrajectoryStore} from "@ego-graph/storage";
import {checkToolPermission} from "@ego-graph/tools";
import {createInitialMissionGraph} from "./mission-graph.js";
import {parseTaskSpec, type TaskSpecInput} from "./task-spec.js";
import {createTrajectoryEvent, type TrajectoryEvent} from "./trajectory.js";

export type Evidence = {
  summary: string;
  source: string;
  raw: Record<string, unknown>;
};

export type MissionRunInput = {
  workspaceRoot: string;
  task: TaskSpecInput;
  overlay: ScenarioOverlay;
  trajectoryStore: JsonlTrajectoryStore;
  runId: string;
};

export type MissionRunResult = {
  runId: string;
  status: "complete" | "blocked";
  evidence: Evidence[];
  events: TrajectoryEvent[];
};

export async function runMission(input: MissionRunInput): Promise<MissionRunResult> {
  const events: TrajectoryEvent[] = [];
  const append = async (
    type: TrajectoryEvent["type"],
    message: string,
    data: Record<string, unknown> = {},
  ) => {
    const event = createTrajectoryEvent(input.runId, type, message, data);
    events.push(event);
    await input.trajectoryStore.append(event);
  };

  const task = parseTaskSpec(input.task);
  await append("task.parsed", "Task parsed", {task});

  const graph = createInitialMissionGraph(task);
  await append("graph.created", "Mission graph created", {graph});

  const evidence: Evidence[] = [];

  for (const tool of input.overlay.tools) {
    const decision = checkToolPermission(tool, task.allowedScope);
    await append("safety.checked", decision.reason, {
      tool: tool.name,
      allowed: decision.allowed,
    });

    if (!decision.allowed) {
      await append("run.blocked", decision.reason, {tool: tool.name});
      return {runId: input.runId, status: "blocked", evidence, events};
    }

    await append("tool.started", `Started ${tool.name}`, {tool: tool.name});
    const parsedInput = tool.inputSchema.parse({fixture: task.targets[0]});
    const output = await tool.execute(parsedInput, {workspaceRoot: input.workspaceRoot});
    await append("tool.completed", `Completed ${tool.name}`, {tool: tool.name, output});

    const findings = Array.isArray(output.findings) ? output.findings : [];
    for (const finding of findings) {
      const item = {summary: String(finding), source: tool.name, raw: output};
      evidence.push(item);
      await append("evidence.created", item.summary, item);
    }
  }

  await append("run.completed", "Mission completed", {evidenceCount: evidence.length});
  return {runId: input.runId, status: "complete", evidence, events};
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from "./task-spec.js";
export * from "./mission-graph.js";
export * from "./trajectory.js";
export * from "./agent-runner.js";
```

- [ ] **Step 6: Implement report package**

Create `packages/report/package.json`:

```json
{
  "name": "@ego-graph/report",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Create `packages/report/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/report/src/markdown-report.ts`:

```ts
export type ReportEvidence = {
  summary: string;
  source: string;
};

export type ReportInput = {
  runId: string;
  scenario: string;
  goal: string;
  status: "complete" | "blocked";
  evidence: ReportEvidence[];
};

export function renderMarkdownReport(input: ReportInput): string {
  const evidenceLines = input.evidence
    .map((item, index) => `${index + 1}. ${item.summary} (source: ${item.source})`)
    .join("\n");

  return [
    "# EGO-Graph Report",
    "",
    `- Run ID: ${input.runId}`,
    `- Scenario: ${input.scenario}`,
    `- Goal: ${input.goal}`,
    `- Status: ${input.status}`,
    "",
    "## Findings",
    "",
    evidenceLines || "No evidence was collected.",
    "",
    "## Limitations",
    "",
    "This report was generated from an authorized controlled scenario fixture.",
    "",
  ].join("\n");
}
```

Create `packages/report/src/index.ts`:

```ts
export * from "./markdown-report.js";
```

- [ ] **Step 7: Wire `ego run`**

Modify `apps/ego-cli/package.json` dependencies:

```json
{
  "name": "@ego-graph/ego-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "ego": "dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ego-graph/core": "workspace:*",
    "@ego-graph/overlays": "workspace:*",
    "@ego-graph/report": "workspace:*",
    "@ego-graph/shared": "workspace:*",
    "@ego-graph/storage": "workspace:*",
    "commander": "^12.1.0"
  },
  "devDependencies": {}
}
```

Create `apps/ego-cli/src/commands/run.ts`:

```ts
import {readFile} from "node:fs/promises";
import {runMission, type TaskSpecInput} from "@ego-graph/core";
import {loadOverlay} from "@ego-graph/overlays";
import {renderMarkdownReport} from "@ego-graph/report";
import {JsonlTrajectoryStore, trajectoryDir} from "@ego-graph/storage";
import type {ScenarioName} from "@ego-graph/shared";

export type RunCommandOptions = {
  scenario: ScenarioName;
  task?: string;
  input?: string;
  runId?: string;
};

export async function handleRunCommand(options: RunCommandOptions): Promise<void> {
  const overlay = loadOverlay(options.scenario);
  const task = await loadTask(options, overlay.defaultTarget);
  const runId = options.runId ?? `run-${Date.now()}`;
  const store = new JsonlTrajectoryStore(trajectoryDir());

  const result = await runMission({
    workspaceRoot: process.cwd(),
    task,
    overlay,
    trajectoryStore: store,
    runId,
  });

  const report = renderMarkdownReport({
    runId: result.runId,
    scenario: task.scenario,
    goal: task.goal,
    status: result.status,
    evidence: result.evidence,
  });

  console.log(`EGO-Graph run ${result.runId} ${result.status}`);
  console.log(report);
}

async function loadTask(options: RunCommandOptions, defaultTarget: string): Promise<TaskSpecInput> {
  if (options.input) {
    return JSON.parse(await readFile(options.input, "utf8")) as TaskSpecInput;
  }

  return {
    scenario: options.scenario,
    goal: options.task ?? "Assess the controlled fixture for exposed admin hints",
    targets: [defaultTarget],
    constraints: ["authorized-fixture-only"],
  };
}
```

Modify `apps/ego-cli/src/cli.ts`:

```ts
import {Command} from "commander";
import {handleRunCommand} from "./commands/run.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ego")
    .description("EGO-Graph cybersecurity agent")
    .version("0.1.0");

  program
    .command("run")
    .description("Run an EGO-Graph mission")
    .option("--scenario <name>", "scenario overlay name", "web_pentest")
    .option("--task <text>", "natural-language task")
    .option("--input <path>", "path to a task input file")
    .option("--run-id <id>", "stable run id for tests and replay")
    .action(async (options) => {
      await handleRunCommand(options);
    });

  program
    .command("replay")
    .description("Replay a recorded trajectory")
    .requiredOption("--trajectory-id <id>", "trajectory id")
    .action(() => {
      console.log("ego replay is not wired yet");
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(() => {
      console.log("ego eval is not wired yet");
    });

  program.command("doctor").description("Check local EGO-Graph readiness").action(() => {
    console.log("ego doctor is not wired yet");
  });

  program.command("serve").description("Start the local EGO-Graph API").action(() => {
    console.log("ego serve is not wired yet");
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
```

- [ ] **Step 8: Build and test run path**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run packages/core/test/agent-runner.test.ts packages/report/test/markdown-report.test.ts apps/ego-cli/test/run-command.test.ts
```

Expected: all three tests pass.

- [ ] **Step 9: Commit Task 6**

Run:

```bash
git add packages/core packages/report apps/ego-cli package.json pnpm-lock.yaml
git commit -m "feat: run controlled web pentest mission"
```

## Task 7: Implement Replay, Eval, Doctor, and Serve Commands

**Files:**
- Create: `apps/ego-cli/src/commands/replay.ts`
- Create: `apps/ego-cli/src/commands/eval.ts`
- Create: `apps/ego-cli/src/commands/doctor.ts`
- Create: `apps/ego-cli/src/commands/serve.ts`
- Modify: `apps/ego-cli/src/cli.ts`
- Create: `apps/ego-api/package.json`
- Create: `apps/ego-api/tsconfig.json`
- Create: `apps/ego-api/src/server.ts`
- Test: `apps/ego-cli/test/replay-command.test.ts`
- Test: `apps/ego-cli/test/eval-command.test.ts`
- Test: `apps/ego-cli/test/doctor-command.test.ts`
- Test: `apps/ego-api/test/server.test.ts`

- [ ] **Step 1: Write command tests**

Create `apps/ego-cli/test/doctor-command.test.ts`:

```ts
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego doctor", () => {
  it("prints readiness checks", async () => {
    const result = await execa("node", ["apps/ego-cli/dist/index.js", "doctor"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Node.js");
    expect(result.stdout).toContain("EGO_HOME");
    expect(result.stdout).toContain("Trajectory storage");
  });
});
```

Create `apps/ego-cli/test/replay-command.test.ts`:

```ts
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego replay", () => {
  it("prints recorded trajectory events", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-replay-"));
    try {
      await execa(
        "node",
        [
          "apps/ego-cli/dist/index.js",
          "run",
          "--scenario",
          "web_pentest",
          "--input",
          "scenarios/web_pentest/basic/task.json",
          "--run-id",
          "run-replay-001",
        ],
        {env: {EGO_HOME: egoHome}},
      );

      const result = await execa(
        "node",
        ["apps/ego-cli/dist/index.js", "replay", "--trajectory-id", "run-replay-001"],
        {env: {EGO_HOME: egoHome}},
      );

      expect(result.stdout).toContain("task.parsed");
      expect(result.stdout).toContain("run.completed");
    } finally {
      await rm(egoHome, {recursive: true, force: true});
    }
  });
});
```

Create `apps/ego-cli/test/eval-command.test.ts`:

```ts
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego eval", () => {
  it("runs the web pentest dataset", async () => {
    const egoHome = await mkdtemp(join(tmpdir(), "ego-eval-"));
    try {
      const result = await execa(
        "node",
        ["apps/ego-cli/dist/index.js", "eval", "--dataset", "datasets/evals/web_pentest.jsonl"],
        {env: {EGO_HOME: egoHome}},
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("web-pentest-smoke-001");
      expect(result.stdout).toContain("PASS");
    } finally {
      await rm(egoHome, {recursive: true, force: true});
    }
  });
});
```

Create `apps/ego-api/test/server.test.ts`:

```ts
import {describe, expect, it} from "vitest";
import {createServer} from "../src/server.js";

describe("ego api server", () => {
  it("responds to health checks", async () => {
    const app = createServer();
    const response = await app.request("/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ok: true, service: "ego-api"});
  });
});
```

- [ ] **Step 2: Run tests and confirm commands are not wired**

Run:

```bash
pnpm vitest run apps/ego-cli/test/doctor-command.test.ts apps/ego-cli/test/replay-command.test.ts apps/ego-cli/test/eval-command.test.ts apps/ego-api/test/server.test.ts
```

Expected: tests fail because command handlers and API package are not implemented.

- [ ] **Step 3: Implement doctor, replay, eval, and serve handlers**

Create `apps/ego-cli/src/commands/doctor.ts`:

```ts
import {access, mkdir} from "node:fs/promises";
import {defaultEgoHome, trajectoryDir} from "@ego-graph/storage";

export async function handleDoctorCommand(): Promise<void> {
  const egoHome = defaultEgoHome();
  const trajectories = trajectoryDir(egoHome);
  await mkdir(trajectories, {recursive: true});
  await access(trajectories);

  console.log(`Node.js ${process.version}`);
  console.log(`EGO_HOME ${egoHome}`);
  console.log(`Trajectory storage ${trajectories}`);
  console.log("EGO-Graph doctor complete");
}
```

Create `apps/ego-cli/src/commands/replay.ts`:

```ts
import {JsonlTrajectoryStore, trajectoryDir} from "@ego-graph/storage";

export async function handleReplayCommand(options: {trajectoryId: string}): Promise<void> {
  const store = new JsonlTrajectoryStore(trajectoryDir());
  const events = await store.readRun(options.trajectoryId);

  for (const event of events) {
    console.log(`${event.timestamp} ${event.type} ${event.message}`);
  }
}
```

Create `apps/ego-cli/src/commands/eval.ts`:

```ts
import {readFile} from "node:fs/promises";
import {handleRunCommand} from "./run.js";

type EvalCase = {
  id: string;
  scenario: "web_pentest";
  taskFile: string;
  expectedFinding: string;
};

export async function handleEvalCommand(options: {dataset: string}): Promise<void> {
  const raw = await readFile(options.dataset, "utf8");
  const cases = raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvalCase);

  for (const testCase of cases) {
    const chunks: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      chunks.push(String(message));
    };
    try {
      await handleRunCommand({
        scenario: testCase.scenario,
        input: testCase.taskFile,
        runId: testCase.id,
      });
    } finally {
      console.log = originalLog;
    }

    const output = chunks.join("\n");
    const status = output.includes(testCase.expectedFinding) ? "PASS" : "FAIL";
    console.log(`${testCase.id} ${status}`);
  }
}
```

Create `apps/ego-cli/src/commands/serve.ts`:

```ts
export async function handleServeCommand(): Promise<void> {
  const {serve} = await import("@hono/node-server");
  const {createServer} = await import("@ego-graph/ego-api");
  const port = Number(process.env.EGO_PORT ?? 4317);

  serve({fetch: createServer().fetch, port});
  console.log(`EGO-Graph API listening on http://127.0.0.1:${port}`);
}
```

Modify `apps/ego-cli/src/cli.ts` to import and use all handlers:

```ts
import {Command} from "commander";
import {handleDoctorCommand} from "./commands/doctor.js";
import {handleEvalCommand} from "./commands/eval.js";
import {handleReplayCommand} from "./commands/replay.js";
import {handleRunCommand} from "./commands/run.js";
import {handleServeCommand} from "./commands/serve.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ego")
    .description("EGO-Graph cybersecurity agent")
    .version("0.1.0");

  program
    .command("run")
    .description("Run an EGO-Graph mission")
    .option("--scenario <name>", "scenario overlay name", "web_pentest")
    .option("--task <text>", "natural-language task")
    .option("--input <path>", "path to a task input file")
    .option("--run-id <id>", "stable run id for tests and replay")
    .action(async (options) => {
      await handleRunCommand(options);
    });

  program
    .command("replay")
    .description("Replay a recorded trajectory")
    .requiredOption("--trajectory-id <trajectoryId>", "trajectory id")
    .action(async (options) => {
      await handleReplayCommand(options);
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(async (options) => {
      await handleEvalCommand(options);
    });

  program.command("doctor").description("Check local EGO-Graph readiness").action(async () => {
    await handleDoctorCommand();
  });

  program.command("serve").description("Start the local EGO-Graph API").action(async () => {
    await handleServeCommand();
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
```

- [ ] **Step 4: Add API package**

Create `apps/ego-api/package.json`:

```json
{
  "name": "@ego-graph/ego-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/server.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run test",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.16"
  }
}
```

Create `apps/ego-api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/ego-api/src/server.ts`:

```ts
import {Hono} from "hono";

export function createServer(): Hono {
  const app = new Hono();

  app.get("/health", (context) => {
    return context.json({ok: true, service: "ego-api"});
  });

  return app;
}
```

Modify `apps/ego-cli/package.json` to include:

```json
{
  "dependencies": {
    "@ego-graph/core": "workspace:*",
    "@ego-graph/ego-api": "workspace:*",
    "@ego-graph/overlays": "workspace:*",
    "@ego-graph/report": "workspace:*",
    "@ego-graph/shared": "workspace:*",
    "@ego-graph/storage": "workspace:*",
    "@hono/node-server": "^1.13.7",
    "commander": "^12.1.0"
  }
}
```

- [ ] **Step 5: Build and test commands**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run apps/ego-cli/test/doctor-command.test.ts apps/ego-cli/test/replay-command.test.ts apps/ego-cli/test/eval-command.test.ts apps/ego-api/test/server.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 7**

Run:

```bash
git add apps/ego-cli apps/ego-api package.json pnpm-lock.yaml
git commit -m "feat: add replay eval doctor and serve commands"
```

## Task 8: Add Ink TUI and Purple Lotus Identity

**Files:**
- Modify: `apps/ego-cli/package.json`
- Create: `apps/ego-cli/src/tui.tsx`
- Create: `apps/ego-cli/src/commands/tui.ts`
- Modify: `apps/ego-cli/src/cli.ts`
- Test: `apps/ego-cli/test/tui-command.test.ts`

- [ ] **Step 1: Write failing default TUI test**

Create `apps/ego-cli/test/tui-command.test.ts`:

```ts
import {execa} from "execa";
import {describe, expect, it} from "vitest";

describe("ego default TUI", () => {
  it("prints the non-interactive welcome when CI is true", async () => {
    const result = await execa("node", ["apps/ego-cli/dist/index.js"], {
      env: {CI: "true"},
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("EGO-Graph");
    expect(result.stdout).toContain("紫莲花");
    expect(result.stdout).toContain("ego run --scenario web_pentest");
  });
});
```

- [ ] **Step 2: Run test and confirm default command is not implemented**

Run:

```bash
pnpm vitest run apps/ego-cli/test/tui-command.test.ts
```

Expected: test fails because running `ego` without a subcommand only prints commander help or exits differently.

- [ ] **Step 3: Add TUI dependencies**

Modify `apps/ego-cli/package.json` dependencies:

```json
{
  "dependencies": {
    "@ego-graph/core": "workspace:*",
    "@ego-graph/ego-api": "workspace:*",
    "@ego-graph/overlays": "workspace:*",
    "@ego-graph/report": "workspace:*",
    "@ego-graph/shared": "workspace:*",
    "@ego-graph/storage": "workspace:*",
    "@hono/node-server": "^1.13.7",
    "commander": "^12.1.0",
    "ink": "^5.1.0",
    "react": "^18.3.1"
  }
}
```

- [ ] **Step 4: Implement TUI entry**

Create `apps/ego-cli/src/tui.tsx`:

```tsx
import React from "react";
import {Box, Text, render} from "ink";

export function EgoTui(): JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="magentaBright">紫莲花 EGO-Graph</Text>
      <Text>Evidence-Guided Orchestration Graph</Text>
      <Text>Run a controlled mission with:</Text>
      <Text color="cyan">ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json</Text>
    </Box>
  );
}

export function renderTui(): void {
  render(<EgoTui />);
}
```

Create `apps/ego-cli/src/commands/tui.ts`:

```ts
import {renderTui} from "../tui.js";

export async function handleTuiCommand(): Promise<void> {
  if (process.env.CI === "true") {
    console.log("紫莲花 EGO-Graph");
    console.log("Evidence-Guided Orchestration Graph");
    console.log("ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json");
    return;
  }

  renderTui();
}
```

Modify `apps/ego-cli/src/cli.ts` so the default action runs the TUI:

```ts
import {Command} from "commander";
import {handleDoctorCommand} from "./commands/doctor.js";
import {handleEvalCommand} from "./commands/eval.js";
import {handleReplayCommand} from "./commands/replay.js";
import {handleRunCommand} from "./commands/run.js";
import {handleServeCommand} from "./commands/serve.js";
import {handleTuiCommand} from "./commands/tui.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ego")
    .description("EGO-Graph cybersecurity agent")
    .version("0.1.0")
    .action(async () => {
      await handleTuiCommand();
    });

  program
    .command("run")
    .description("Run an EGO-Graph mission")
    .option("--scenario <name>", "scenario overlay name", "web_pentest")
    .option("--task <text>", "natural-language task")
    .option("--input <path>", "path to a task input file")
    .option("--run-id <id>", "stable run id for tests and replay")
    .action(async (options) => {
      await handleRunCommand(options);
    });

  program
    .command("replay")
    .description("Replay a recorded trajectory")
    .requiredOption("--trajectory-id <trajectoryId>", "trajectory id")
    .action(async (options) => {
      await handleReplayCommand(options);
    });

  program
    .command("eval")
    .description("Run an evaluation dataset")
    .requiredOption("--dataset <path>", "JSONL evaluation dataset")
    .action(async (options) => {
      await handleEvalCommand(options);
    });

  program.command("doctor").description("Check local EGO-Graph readiness").action(async () => {
    await handleDoctorCommand();
  });

  program.command("serve").description("Start the local EGO-Graph API").action(async () => {
    await handleServeCommand();
  });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
```

Update `apps/ego-cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 5: Build and test TUI**

Run:

```bash
pnpm install
pnpm build
pnpm vitest run apps/ego-cli/test/tui-command.test.ts
```

Expected: test passes and `CI=true node apps/ego-cli/dist/index.js` prints the 紫莲花 welcome.

- [ ] **Step 6: Commit Task 8**

Run:

```bash
git add apps/ego-cli package.json pnpm-lock.yaml
git commit -m "feat: add terminal lotus welcome"
```

## Task 9: Add Packaging, Cleanup Script, and Docker Smoke Path

**Files:**
- Create: `scripts/clean.mjs`
- Create: `scripts/smoke.mjs`
- Create: `docker/Dockerfile`
- Create: `.dockerignore`
- Modify: `package.json`
- Test: `scripts/smoke.mjs`

- [ ] **Step 1: Create smoke script**

Create `scripts/smoke.mjs`:

```js
import {execa} from "execa";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const egoHome = await mkdtemp(join(tmpdir(), "ego-smoke-"));

try {
  await execa("pnpm", ["build"], {stdio: "inherit"});

  const help = await execa("node", ["apps/ego-cli/dist/index.js", "--help"]);
  if (!help.stdout.includes("EGO-Graph")) {
    throw new Error("ego --help did not include EGO-Graph");
  }

  const doctor = await execa("node", ["apps/ego-cli/dist/index.js", "doctor"], {
    env: {EGO_HOME: egoHome},
  });
  if (!doctor.stdout.includes("Trajectory storage")) {
    throw new Error("ego doctor did not verify trajectory storage");
  }

  const run = await execa(
    "node",
    [
      "apps/ego-cli/dist/index.js",
      "run",
      "--scenario",
      "web_pentest",
      "--input",
      "scenarios/web_pentest/basic/task.json",
      "--run-id",
      "smoke-run-001",
    ],
    {env: {EGO_HOME: egoHome}},
  );
  if (!run.stdout.includes("Fixture contains an exposed admin hint")) {
    throw new Error("ego run did not emit expected finding");
  }

  console.log("EGO-Graph smoke PASS");
} finally {
  await rm(egoHome, {recursive: true, force: true});
}
```

Create `scripts/clean.mjs`:

```js
import {rm} from "node:fs/promises";

const paths = ["apps/ego-cli/dist", "apps/ego-api/dist", "packages", ".ego"];

for (const path of paths) {
  if (path === "packages") {
    continue;
  }
  await rm(path, {recursive: true, force: true});
}

console.log("Cleaned generated EGO-Graph artifacts");
```

- [ ] **Step 2: Add Docker packaging files**

Create `.dockerignore`:

```text
node_modules
**/dist
.ego
.git
*.log
```

Create `docker/Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scenarios ./scenarios
COPY datasets ./datasets
COPY scripts ./scripts

RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

ENTRYPOINT ["node", "apps/ego-cli/dist/index.js"]
```

- [ ] **Step 3: Update root scripts**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "build": "pnpm -r --sort build",
    "clean": "node scripts/clean.mjs",
    "dev": "tsx apps/ego-cli/src/index.ts",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "smoke": "node scripts/smoke.mjs",
    "test": "vitest run",
    "typecheck": "tsc -b",
    "ego": "node apps/ego-cli/dist/index.js"
  }
}
```

- [ ] **Step 4: Run packaging checks**

Run:

```bash
pnpm build
pnpm smoke
docker build -f docker/Dockerfile -t ego-graph:local .
docker run --rm ego-graph:local --help
```

Expected: `pnpm smoke` prints `EGO-Graph smoke PASS`, Docker build succeeds, and Docker help output contains `EGO-Graph`.

- [ ] **Step 5: Commit Task 9**

Run:

```bash
git add scripts docker/Dockerfile .dockerignore package.json
git commit -m "feat: add packaging smoke path"
```

## Task 10: Add Competition Delivery Documentation

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/development.md`
- Create: `docs/user-guide.md`
- Create: `docs/testing.md`
- Create: `docs/security-policy.md`
- Create: `docs/submission-checklist.md`
- Create: `submit/demo-video/script.md`
- Create: `submit/slides/outline.md`
- Create: `submit/declaration/originality-confidentiality-template.md`

- [ ] **Step 1: Write architecture documentation**

Create `docs/architecture.md`:

```md
# EGO-Graph Architecture

EGO-Graph means Evidence-Guided Orchestration Graph. The system converts an authorized security task into a typed `TaskSpec`, creates a `MissionGraph`, executes scenario tools through a deny-by-default policy, stores JSONL trajectory events, and renders a report.

The first delivery slice uses the `web_pentest` overlay and the controlled fixture at `scenarios/web_pentest/basic`. The shared core stays scenario-neutral; overlays provide tools, prompts, report sections, and default targets.

Primary packages:

- `apps/ego-cli`: terminal command and Ink TUI.
- `apps/ego-api`: local Hono API for `ego serve`.
- `packages/core`: task spec, mission graph, trajectory events, and agent runner.
- `packages/tools`: tool registry, permission policy, and fixture tools.
- `packages/overlays`: scenario overlays.
- `packages/storage`: JSONL trajectory storage.
- `packages/report`: markdown report rendering.
```

- [ ] **Step 2: Write development documentation**

Create `docs/development.md`:

```md
# EGO-Graph Development

Requirements:

- Node.js 22 or newer.
- pnpm 9.
- Docker for container packaging checks.

Common commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm smoke
pnpm ego -- --help
```

Local run:

```bash
pnpm build
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id local-run-001
node apps/ego-cli/dist/index.js replay --trajectory-id local-run-001
```
```

- [ ] **Step 3: Write user guide**

Create `docs/user-guide.md`:

```md
# EGO-Graph User Guide

Start the terminal experience:

```bash
ego
```

Run the controlled web pentest scenario:

```bash
ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id demo-run-001
```

Replay the decision trail:

```bash
ego replay --trajectory-id demo-run-001
```

Check readiness:

```bash
ego doctor
```

Run the evaluation dataset:

```bash
ego eval --dataset datasets/evals/web_pentest.jsonl
```
```

- [ ] **Step 4: Write testing documentation**

Create `docs/testing.md`:

```md
# EGO-Graph Testing

Automated checks:

- `pnpm test`: unit and integration tests.
- `pnpm build`: TypeScript compilation.
- `pnpm smoke`: package-level smoke path for help, doctor, run, and report output.

The first scenario test uses only a controlled local fixture. External security tools must be added with parser fixtures and permission-policy tests before use in live runs.
```

- [ ] **Step 5: Write security policy**

Create `docs/security-policy.md`:

```md
# EGO-Graph Security Policy

EGO-Graph is for authorized and controlled security work.

Execution rules:

- Tool execution is denied unless the task scope matches the tool permission scope.
- The first shipped scenario uses `fixture://web-pentest/basic`.
- API keys are read from environment variables.
- Trajectory events record planning, safety checks, tool execution, evidence, and reports.
- Reports must include limitations and reproduction context.

Real network scanners, exploit tools, fuzzers, and reverse-engineering tools must run through sandbox profiles and explicit scope checks.
```

- [ ] **Step 6: Write submission checklist and presentation materials**

Create `docs/submission-checklist.md`:

```md
# EGO-Graph Submission Checklist

Program materials:

- Source code.
- `ego` terminal command.
- Deployment manual.
- Docker packaging path.
- Controlled demo scenario.

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
```

Create `submit/demo-video/script.md`:

```md
# EGO-Graph Demo Video Script

1. Show the 紫莲花 EGO-Graph terminal welcome.
2. Run `ego doctor`.
3. Run `ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id demo-run-001`.
4. Highlight the finding and report.
5. Run `ego replay --trajectory-id demo-run-001`.
6. Explain that every decision and evidence item is trajectory-backed.
```

Create `submit/slides/outline.md`:

```md
# EGO-Graph Slide Outline

1. Problem and competition requirements.
2. EGO-Graph concept: Evidence-Guided Orchestration Graph.
3. Architecture: CLI, mission graph, overlays, tools, storage, reports.
4. Safety: deny-by-default scope checks and controlled execution.
5. Demo: controlled web pentest scenario.
6. Evaluation and trajectory replay.
7. Roadmap for incident response, vulnerability research, and reverse engineering.
```

Create `submit/declaration/originality-confidentiality-template.md`:

```md
# Originality and Confidentiality Declaration Template

Project: EGO-Graph

The team declares that the submitted design, implementation, documentation, and demonstration materials are original competition work except for clearly identified open-source dependencies and tools.

The team agrees to follow the competition confidentiality requirements and to use EGO-Graph only in authorized controlled environments.
```

- [ ] **Step 7: Commit Task 10**

Run:

```bash
git add docs/architecture.md docs/development.md docs/user-guide.md docs/testing.md docs/security-policy.md docs/submission-checklist.md submit/demo-video/script.md submit/slides/outline.md submit/declaration/originality-confidentiality-template.md
git commit -m "docs: add competition delivery guides"
```

## Task 11: Remove Empty Python Scaffold After TypeScript Replacement

**Files:**
- Delete: `backend/app/**/*.py`
- Delete: `backend/tests/__init__.py`
- Delete: empty `backend/` directories after tracked files are removed
- Delete: `frontend/.gitkeep`
- Modify: `docs/README.md`

- [ ] **Step 1: Verify TypeScript replacement is green before deletion**

Run:

```bash
pnpm build
pnpm test
pnpm smoke
```

Expected: all commands pass.

- [ ] **Step 2: Remove empty Python scaffold files**

Run:

```bash
git rm backend/app/__init__.py backend/app/agent/__init__.py backend/app/agent/nodes/__init__.py backend/app/api/__init__.py backend/app/cli/__init__.py backend/app/core/__init__.py backend/app/domain/__init__.py backend/app/overlays/__init__.py backend/app/sandbox/__init__.py backend/app/storage/__init__.py backend/app/tools/__init__.py backend/app/tools/parsers/__init__.py backend/tests/__init__.py
git rm backend/app/overlays/incident_response/.gitkeep backend/app/overlays/reverse_engineering/.gitkeep backend/app/overlays/vulnerability_research/.gitkeep backend/app/overlays/web_pentest/.gitkeep
git rm frontend/.gitkeep
```

Expected: Git removes only empty scaffold files that were replaced by the TypeScript workspace.

- [ ] **Step 3: Rewrite `docs/README.md` for the new structure**

Replace `docs/README.md` with:

```md
# EGO-Graph Repository Guide

EGO-Graph is a TypeScript-first cybersecurity agent project for the XH-202609 competition. It packages a terminal command named `ego`.

Primary structure:

- `apps/ego-cli`: terminal CLI and TUI.
- `apps/ego-api`: local API for `ego serve`.
- `packages/core`: task specs, mission graph, trajectories, and runner.
- `packages/tools`: tool registry and permission policy.
- `packages/overlays`: scenario overlays.
- `packages/storage`: trajectory storage.
- `packages/report`: report generation.
- `scenarios`: controlled scenario fixtures.
- `datasets`: evaluation datasets and prompt assets.
- `docs`: design, development, testing, user, and submission docs.
- `submit`: competition delivery materials.

Start with:

```bash
pnpm install
pnpm build
pnpm smoke
node apps/ego-cli/dist/index.js run --scenario web_pentest --input scenarios/web_pentest/basic/task.json
```
```

- [ ] **Step 4: Re-run verification**

Run:

```bash
pnpm build
pnpm test
pnpm smoke
```

Expected: all commands still pass after scaffold cleanup.

- [ ] **Step 5: Commit Task 11**

Run:

```bash
git add docs/README.md
git commit -m "chore: replace empty Python scaffold with TypeScript guide"
```

## Task 12: Final Acceptance Audit

**Files:**
- Inspect: `package.json`
- Inspect: `apps/ego-cli/package.json`
- Inspect: `apps/ego-cli/dist/index.js`
- Inspect: `datasets/evals/web_pentest.jsonl`
- Inspect: `docs/submission-checklist.md`
- Inspect: `.claude/CLAUDE.MD`

- [ ] **Step 1: Verify package launch path**

Run:

```bash
pnpm install
pnpm build
pnpm link --global
ego --help
ego doctor
ego run --scenario web_pentest --input scenarios/web_pentest/basic/task.json --run-id acceptance-run-001
ego replay --trajectory-id acceptance-run-001
ego eval --dataset datasets/evals/web_pentest.jsonl
```

Expected:

- `ego --help` includes all public commands.
- `ego doctor` prints Node.js, EGO_HOME, and trajectory storage checks.
- `ego run` prints `acceptance-run-001`, `complete`, and `Fixture contains an exposed admin hint`.
- `ego replay` prints `task.parsed`, `graph.created`, `safety.checked`, and `run.completed`.
- `ego eval` prints `web-pentest-smoke-001 PASS`.

- [ ] **Step 2: Verify automated checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm smoke
```

Expected: all checks pass.

- [ ] **Step 3: Verify Docker packaging**

Run:

```bash
docker build -f docker/Dockerfile -t ego-graph:acceptance .
docker run --rm ego-graph:acceptance --help
docker run --rm ego-graph:acceptance doctor
```

Expected: Docker commands complete successfully and print EGO-Graph command information.

- [ ] **Step 4: Update `.claude/CLAUDE.MD` current milestone**

Modify `.claude/CLAUDE.MD` current milestone section to:

```md
## Current Milestone

Implementation vertical slice is complete when `pnpm build`, `pnpm test`, `pnpm smoke`, `ego --help`, `ego doctor`, `ego run`, `ego replay`, and `ego eval` pass against the controlled `web_pentest` fixture.
```

- [ ] **Step 5: Commit acceptance updates**

Run:

```bash
git add .claude/CLAUDE.MD
git commit -m "docs: update development memory for implementation slice"
```

If `.claude/CLAUDE.MD` remains intentionally ignored, record the local update in the final implementation summary instead of committing it.

