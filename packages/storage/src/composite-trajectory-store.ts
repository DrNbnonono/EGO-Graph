import type { TrajectoryEvent } from "@ego-graph/core";

export type TrajectoryStore = {
  append(event: TrajectoryEvent): Promise<void>;
  readRun?(runId: string): Promise<TrajectoryEvent[]>;
};

export class CompositeTrajectoryStore implements TrajectoryStore {
  constructor(private readonly stores: TrajectoryStore[]) {}

  async append(event: TrajectoryEvent): Promise<void> {
    await Promise.all(this.stores.map((store) => store.append(event)));
  }

  async readRun(runId: string): Promise<TrajectoryEvent[]> {
    const readable = this.stores.find((store) => store.readRun);
    if (!readable?.readRun) {
      return [];
    }
    return readable.readRun(runId);
  }
}
