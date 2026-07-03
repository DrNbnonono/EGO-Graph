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
