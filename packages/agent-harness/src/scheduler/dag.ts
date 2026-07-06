import type { ScheduledToolJob } from "./types.js";

/**
 * DAG utilities for the tool scheduler. Pure functions over job lists: no
 * side effects, no async. The scheduler uses these to order jobs and to
 * refuse cycles before execution begins.
 */

export type CycleError = {
  cycle: string[];
};

export class SchedulerCycleError extends Error {
  readonly cycle: string[];
  constructor(cycle: string[]) {
    super(`Scheduler dependency cycle detected: ${cycle.join(" -> ")}`);
    this.name = "SchedulerCycleError";
    this.cycle = cycle;
  }
}

/**
 * Topologically sort jobs so that every job runs after all its dependencies.
 * Throws {@link SchedulerCycleError} if the dependency graph contains a
 * cycle. Ties (independent jobs in the same layer) are preserved in input
 * order so the scheduler can run them in parallel deterministically.
 */
export function topologicalSort(jobs: ScheduledToolJob[]): ScheduledToolJob[] {
  detectCycle(jobs);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const sorted: ScheduledToolJob[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(job: ScheduledToolJob): void {
    if (visited.has(job.id)) {
      return;
    }
    if (visiting.has(job.id)) {
      // detectCycle already guards this, but keep the assertion for safety.
      throw new SchedulerCycleError([job.id]);
    }
    visiting.add(job.id);
    for (const depId of job.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (dep) {
        visit(dep);
      }
    }
    visiting.delete(job.id);
    visited.add(job.id);
    sorted.push(job);
  }

  for (const job of jobs) {
    visit(job);
  }
  return sorted;
}

/**
 * Detect a dependency cycle and throw with the offending node chain. Returns
 * void when the graph is acyclic.
 */
export function detectCycle(jobs: ScheduledToolJob[]): void {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const white = new Set(byId.keys());
  const gray = new Set<string>();
  const black = new Set<string>();
  const path: string[] = [];

  function dfs(id: string): void {
    if (black.has(id)) {
      return;
    }
    if (gray.has(id)) {
      const cycleStart = path.indexOf(id);
      throw new SchedulerCycleError([...path.slice(cycleStart), id]);
    }
    const job = byId.get(id);
    if (!job) {
      return;
    }
    gray.add(id);
    path.push(id);
    for (const depId of job.dependsOn ?? []) {
      dfs(depId);
    }
    path.pop();
    gray.delete(id);
    black.add(id);
    white.delete(id);
  }

  for (const id of [...white]) {
    if (!black.has(id)) {
      dfs(id);
    }
  }
}

/**
 * Partition jobs into layers: layer 0 has no dependencies, layer N has all
 * dependencies in layers < N. Jobs within a layer are independent and may be
 * executed in parallel (subject to the scheduler's parallelSafe filter).
 */
export function layerJobs(jobs: ScheduledToolJob[]): ScheduledToolJob[][] {
  const ordered = topologicalSort(jobs);
  const layerOf = new Map<string, number>();
  const layers: ScheduledToolJob[][] = [];
  for (const job of ordered) {
    const depLayers = (job.dependsOn ?? [])
      .map((depId) => layerOf.get(depId))
      .filter((layer): layer is number => typeof layer === "number");
    const layer = depLayers.length === 0 ? 0 : Math.max(...depLayers) + 1;
    layerOf.set(job.id, layer);
    if (!layers[layer]) {
      layers[layer] = [];
    }
    layers[layer].push(job);
  }
  // Filter out any undefined layers created by sparse indexing.
  return layers.filter((layer): layer is ScheduledToolJob[] => Array.isArray(layer));
}

/**
 * Return the jobs whose dependencies are all in `completedJobIds`. Used by
 * the scheduler to pick the next ready batch.
 */
export function readyJobs(
  jobs: ScheduledToolJob[],
  completedJobIds: ReadonlySet<string>,
): ScheduledToolJob[] {
  return jobs.filter(
    (job) =>
      !completedJobIds.has(job.id) &&
      (job.dependsOn ?? []).every((depId) => completedJobIds.has(depId)),
  );
}
