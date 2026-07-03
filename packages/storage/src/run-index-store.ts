import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type RunIndexRecord = {
  runId: string;
  scenario: string;
  status: "complete" | "blocked";
  eventCount: number;
  reportPath?: string;
  updatedAt: string;
};

export class JsonRunIndexStore {
  constructor(private readonly directory: string) {}

  async upsert(record: RunIndexRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const records = await this.list();
    const next = [...records.filter((candidate) => candidate.runId !== record.runId), record].sort(
      (a, b) => a.runId.localeCompare(b.runId),
    );
    await writeFile(this.path(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  async list(): Promise<RunIndexRecord[]> {
    try {
      const raw = await readFile(this.path(), "utf8");
      return JSON.parse(raw) as RunIndexRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async get(runId: string): Promise<RunIndexRecord | undefined> {
    return (await this.list()).find((record) => record.runId === runId);
  }

  private path(): string {
    return join(this.directory, "runs.json");
  }
}
