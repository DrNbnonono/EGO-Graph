import {mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname} from "node:path";
import type {DatabaseSync as DatabaseSyncType} from "node:sqlite";
import {trajectoryEventSchema, type TrajectoryEvent} from "@ego-graph/core";
import type {RunIndexRecord} from "./run-index-store.js";

export type SqliteEvidenceRecord = {
  id: number;
  runId: string;
  summary: string;
  source: string;
  raw: Record<string, unknown>;
  createdAt: string;
};

export type SqliteReportRecord = {
  runId: string;
  markdown: string;
  reportPath?: string;
  createdAt: string;
};

type EventRow = {
  id: string;
  run_id: string;
  timestamp: string;
  type: TrajectoryEvent["type"];
  message: string;
  data: string;
};

type RunRow = {
  run_id: string;
  scenario: string;
  status: "complete" | "blocked";
  event_count: number;
  report_path: string | null;
  updated_at: string;
};

type EvidenceRow = {
  id: number;
  run_id: string;
  summary: string;
  source: string;
  raw: string;
  created_at: string;
};

type ReportRow = {
  run_id: string;
  markdown: string;
  report_path: string | null;
  created_at: string;
};

export class SqliteEgoStore {
  private readonly db: DatabaseSyncType;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), {recursive: true});
    const require = createRequire(import.meta.url);
    const {DatabaseSync} = require("node:sqlite") as typeof import("node:sqlite");
    this.db = new DatabaseSync(path);
    this.migrate();
  }

  append(event: TrajectoryEvent): Promise<void> {
    this.appendSync(event);
    return Promise.resolve();
  }

  appendSync(event: TrajectoryEvent): void {
    this.db
      .prepare(
        [
          "insert or replace into events",
          "(id, run_id, timestamp, type, message, data)",
          "values (?, ?, ?, ?, ?, ?)",
        ].join(" "),
      )
      .run(
        event.id,
        event.runId,
        event.timestamp,
        event.type,
        event.message,
        JSON.stringify(event.data),
      );

    if (event.type === "evidence.created") {
      this.insertEvidence(event);
    }
  }

  async readRun(runId: string): Promise<TrajectoryEvent[]> {
    const rows = this.db
      .prepare("select * from events where run_id = ? order by timestamp asc, id asc")
      .all(runId) as EventRow[];

    return rows.map((row) =>
      trajectoryEventSchema.parse({
        id: row.id,
        runId: row.run_id,
        timestamp: row.timestamp,
        type: row.type,
        message: row.message,
        data: JSON.parse(row.data) as Record<string, unknown>,
      }),
    );
  }

  async upsertRun(record: RunIndexRecord): Promise<void> {
    const existing = this.db
      .prepare("select created_at from runs where run_id = ?")
      .get(record.runId) as {created_at: string} | undefined;
    const createdAt = existing?.created_at ?? record.updatedAt;

    this.db
      .prepare(
        [
          "insert into runs",
          "(run_id, scenario, status, event_count, report_path, created_at, updated_at)",
          "values (?, ?, ?, ?, ?, ?, ?)",
          "on conflict(run_id) do update set",
          "scenario = excluded.scenario,",
          "status = excluded.status,",
          "event_count = excluded.event_count,",
          "report_path = excluded.report_path,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .run(
        record.runId,
        record.scenario,
        record.status,
        record.eventCount,
        record.reportPath ?? null,
        createdAt,
        record.updatedAt,
      );
  }

  async getRun(runId: string): Promise<RunIndexRecord | undefined> {
    const row = this.db.prepare("select * from runs where run_id = ?").get(runId) as
      | RunRow
      | undefined;

    return row ? runRowToRecord(row) : undefined;
  }

  async listRuns(): Promise<RunIndexRecord[]> {
    const rows = this.db
      .prepare("select * from runs order by updated_at desc, run_id asc")
      .all() as RunRow[];
    return rows.map(runRowToRecord);
  }

  async listEvidence(runId: string): Promise<SqliteEvidenceRecord[]> {
    const rows = this.db
      .prepare("select * from evidence where run_id = ? order by id asc")
      .all(runId) as EvidenceRow[];

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      summary: row.summary,
      source: row.source,
      raw: JSON.parse(row.raw) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }

  async saveReport(record: SqliteReportRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into reports (run_id, markdown, report_path, created_at)",
          "values (?, ?, ?, ?)",
          "on conflict(run_id) do update set",
          "markdown = excluded.markdown,",
          "report_path = excluded.report_path,",
          "created_at = excluded.created_at",
        ].join(" "),
      )
      .run(record.runId, record.markdown, record.reportPath ?? null, record.createdAt);
  }

  async getReport(runId: string): Promise<SqliteReportRecord | undefined> {
    const row = this.db.prepare("select * from reports where run_id = ?").get(runId) as
      | ReportRow
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      runId: row.run_id,
      markdown: row.markdown,
      ...(row.report_path ? {reportPath: row.report_path} : {}),
      createdAt: row.created_at,
    };
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      pragma journal_mode = wal;

      create table if not exists runs (
        run_id text primary key,
        scenario text not null,
        status text not null check (status in ('complete', 'blocked')),
        event_count integer not null default 0,
        report_path text,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists events (
        id text primary key,
        run_id text not null,
        timestamp text not null,
        type text not null,
        message text not null,
        data text not null
      );

      create index if not exists idx_events_run_timestamp on events(run_id, timestamp);
      create index if not exists idx_events_type on events(type);

      create table if not exists evidence (
        id integer primary key autoincrement,
        run_id text not null,
        summary text not null,
        source text not null,
        raw text not null,
        created_at text not null
      );

      create index if not exists idx_evidence_run on evidence(run_id);

      create table if not exists artifacts (
        id integer primary key autoincrement,
        run_id text not null,
        path text not null,
        kind text not null,
        description text,
        created_at text not null
      );

      create table if not exists reports (
        run_id text primary key,
        markdown text not null,
        report_path text,
        created_at text not null
      );
    `);
  }

  private insertEvidence(event: TrajectoryEvent): void {
    this.db
      .prepare(
        "insert into evidence (run_id, summary, source, raw, created_at) values (?, ?, ?, ?, ?)",
      )
      .run(
        event.runId,
        event.message,
        String(event.data.source ?? "unknown"),
        JSON.stringify(event.data.raw ?? event.data),
        event.timestamp,
      );
  }
}

function runRowToRecord(row: RunRow): RunIndexRecord {
  return {
    runId: row.run_id,
    scenario: row.scenario,
    status: row.status,
    eventCount: row.event_count,
    ...(row.report_path ? {reportPath: row.report_path} : {}),
    updatedAt: row.updated_at,
  };
}
