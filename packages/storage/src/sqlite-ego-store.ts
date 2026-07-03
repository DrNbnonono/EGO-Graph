import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { trajectoryEventSchema, type TrajectoryEvent } from "@ego-graph/core";
import type { RunIndexRecord } from "./run-index-store.js";

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

export type AgentRunStatus = "inspect" | "pending_approval" | "needs_model" | "applied" | "blocked";

export type AgentRunRecord = {
  runId: string;
  message: string;
  mode: string;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentEditRecord = {
  id?: number;
  runId: string;
  previewId: string;
  status: "pending" | "applied" | "blocked";
  diff: string;
  plan: Record<string, unknown>;
  files: string[];
  createdAt: string;
  appliedAt?: string;
};

export type AgentCheckRecord = {
  id?: number;
  runId: string;
  name: string;
  command: string;
  status: "passed" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
  createdAt: string;
};

export type ApprovalRecord = {
  id: string;
  runId: string;
  kind: "agent_edit" | "tool_call";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
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

type AgentRunRow = {
  run_id: string;
  message: string;
  mode: string;
  status: AgentRunStatus;
  created_at: string;
  updated_at: string;
};

type AgentEditRow = {
  id: number;
  run_id: string;
  preview_id: string;
  status: "pending" | "applied" | "blocked";
  diff: string;
  plan_json: string;
  files_json: string;
  created_at: string;
  applied_at: string | null;
};

type AgentCheckRow = {
  id: number;
  run_id: string;
  name: string;
  command: string;
  status: "passed" | "failed";
  exit_code: number;
  stdout: string;
  stderr: string;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  run_id: string;
  kind: "agent_edit" | "tool_call";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

type DatabaseSyncConstructor = new (path: string) => DatabaseSyncType;

export class SqliteEgoStore {
  private readonly db: DatabaseSyncType;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
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
      .get(record.runId) as { created_at: string } | undefined;
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
      RunRow | undefined;

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
      ReportRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      runId: row.run_id,
      markdown: row.markdown,
      ...(row.report_path ? { reportPath: row.report_path } : {}),
      createdAt: row.created_at,
    };
  }

  async saveAgentRun(record: AgentRunRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into agent_runs (run_id, message, mode, status, created_at, updated_at)",
          "values (?, ?, ?, ?, ?, ?)",
          "on conflict(run_id) do update set",
          "message = excluded.message,",
          "mode = excluded.mode,",
          "status = excluded.status,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .run(
        record.runId,
        record.message,
        record.mode,
        record.status,
        record.createdAt,
        record.updatedAt,
      );
  }

  async getAgentRun(runId: string): Promise<AgentRunRecord | undefined> {
    const row = this.db.prepare("select * from agent_runs where run_id = ?").get(runId) as
      AgentRunRow | undefined;
    return row ? agentRunRowToRecord(row) : undefined;
  }

  async saveAgentEdit(record: AgentEditRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into agent_edits",
          "(run_id, preview_id, status, diff, plan_json, files_json, created_at, applied_at)",
          "values (?, ?, ?, ?, ?, ?, ?, ?)",
          "on conflict(preview_id) do update set",
          "status = excluded.status,",
          "diff = excluded.diff,",
          "plan_json = excluded.plan_json,",
          "files_json = excluded.files_json,",
          "applied_at = excluded.applied_at",
        ].join(" "),
      )
      .run(
        record.runId,
        record.previewId,
        record.status,
        record.diff,
        JSON.stringify(record.plan),
        JSON.stringify(record.files),
        record.createdAt,
        record.appliedAt ?? null,
      );
  }

  async getPendingAgentEdit(runId: string): Promise<AgentEditRecord | undefined> {
    const row = this.db
      .prepare(
        [
          "select * from agent_edits",
          "where run_id = ? and status = 'pending'",
          "order by created_at desc, id desc limit 1",
        ].join(" "),
      )
      .get(runId) as AgentEditRow | undefined;
    return row ? agentEditRowToRecord(row) : undefined;
  }

  async getLatestAgentEdit(runId: string): Promise<AgentEditRecord | undefined> {
    const row = this.db
      .prepare(
        "select * from agent_edits where run_id = ? order by created_at desc, id desc limit 1",
      )
      .get(runId) as AgentEditRow | undefined;
    return row ? agentEditRowToRecord(row) : undefined;
  }

  async listPendingAgentEdits(): Promise<AgentEditRecord[]> {
    const rows = this.db
      .prepare("select * from agent_edits where status = 'pending' order by created_at desc")
      .all() as AgentEditRow[];
    return rows.map(agentEditRowToRecord);
  }

  async updateAgentEditStatus(
    runId: string,
    status: AgentEditRecord["status"],
    appliedAt?: string,
  ): Promise<void> {
    this.db
      .prepare(
        "update agent_edits set status = ?, applied_at = ? where run_id = ? and status = 'pending'",
      )
      .run(status, appliedAt ?? null, runId);
  }

  async saveAgentCheck(record: AgentCheckRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into agent_checks",
          "(run_id, name, command, status, exit_code, stdout, stderr, created_at)",
          "values (?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
      )
      .run(
        record.runId,
        record.name,
        record.command,
        record.status,
        record.exitCode,
        record.stdout,
        record.stderr,
        record.createdAt,
      );
  }

  async listAgentChecks(runId: string): Promise<AgentCheckRecord[]> {
    const rows = this.db
      .prepare("select * from agent_checks where run_id = ? order by created_at asc, id asc")
      .all(runId) as AgentCheckRow[];
    return rows.map(agentCheckRowToRecord);
  }

  async listRecentAgentChecks(limit = 8): Promise<AgentCheckRecord[]> {
    const rows = this.db
      .prepare("select * from agent_checks order by created_at desc, id desc limit ?")
      .all(limit) as AgentCheckRow[];
    return rows.map(agentCheckRowToRecord);
  }

  async saveApproval(record: ApprovalRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into approvals (id, run_id, kind, status, created_at, updated_at)",
          "values (?, ?, ?, ?, ?, ?)",
          "on conflict(id) do update set",
          "status = excluded.status,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .run(record.id, record.runId, record.kind, record.status, record.createdAt, record.updatedAt);
  }

  async listApprovals(status?: ApprovalRecord["status"]): Promise<ApprovalRecord[]> {
    const rows = (
      status
        ? this.db
            .prepare("select * from approvals where status = ? order by created_at desc")
            .all(status)
        : this.db.prepare("select * from approvals order by created_at desc").all()
    ) as ApprovalRow[];
    return rows.map(approvalRowToRecord);
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

      create table if not exists agent_runs (
        run_id text primary key,
        message text not null,
        mode text not null,
        status text not null check (status in ('inspect', 'pending_approval', 'needs_model', 'applied', 'blocked')),
        created_at text not null,
        updated_at text not null
      );

      create table if not exists agent_edits (
        id integer primary key autoincrement,
        run_id text not null,
        preview_id text not null unique,
        status text not null check (status in ('pending', 'applied', 'blocked')),
        diff text not null,
        plan_json text not null,
        files_json text not null,
        created_at text not null,
        applied_at text
      );

      create index if not exists idx_agent_edits_run_status on agent_edits(run_id, status);

      create table if not exists agent_checks (
        id integer primary key autoincrement,
        run_id text not null,
        name text not null,
        command text not null,
        status text not null check (status in ('passed', 'failed')),
        exit_code integer not null,
        stdout text not null,
        stderr text not null,
        created_at text not null
      );

      create index if not exists idx_agent_checks_run on agent_checks(run_id);

      create table if not exists approvals (
        id text primary key,
        run_id text not null,
        kind text not null check (kind in ('agent_edit', 'tool_call')),
        status text not null check (status in ('pending', 'approved', 'rejected')),
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_approvals_status on approvals(status);

      create table if not exists tool_calls (
        id integer primary key autoincrement,
        run_id text not null,
        tool_name text not null,
        status text not null,
        input_json text not null,
        output_json text,
        created_at text not null
      );
    `);
    this.ensureAgentRunsStatusConstraint();
  }

  private ensureAgentRunsStatusConstraint(): void {
    const row = this.db
      .prepare("select sql from sqlite_master where type = 'table' and name = 'agent_runs'")
      .get() as { sql: string } | undefined;

    if (!row?.sql || row.sql.includes("'needs_model'")) {
      return;
    }

    // 中文注释：旧库的 CHECK 约束缺少 needs_model，只能通过重建表完成兼容迁移。
    this.db.exec(`
      drop table if exists agent_runs_needs_model_migration;
      alter table agent_runs rename to agent_runs_needs_model_migration;

      create table agent_runs (
        run_id text primary key,
        message text not null,
        mode text not null,
        status text not null check (status in ('inspect', 'pending_approval', 'needs_model', 'applied', 'blocked')),
        created_at text not null,
        updated_at text not null
      );

      insert into agent_runs (run_id, message, mode, status, created_at, updated_at)
      select run_id, message, mode, status, created_at, updated_at
      from agent_runs_needs_model_migration;

      drop table agent_runs_needs_model_migration;
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
    ...(row.report_path ? { reportPath: row.report_path } : {}),
    updatedAt: row.updated_at,
  };
}

function agentRunRowToRecord(row: AgentRunRow): AgentRunRecord {
  return {
    runId: row.run_id,
    message: row.message,
    mode: row.mode,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentEditRowToRecord(row: AgentEditRow): AgentEditRecord {
  return {
    id: row.id,
    runId: row.run_id,
    previewId: row.preview_id,
    status: row.status,
    diff: row.diff,
    plan: JSON.parse(row.plan_json) as Record<string, unknown>,
    files: JSON.parse(row.files_json) as string[],
    createdAt: row.created_at,
    ...(row.applied_at ? { appliedAt: row.applied_at } : {}),
  };
}

function agentCheckRowToRecord(row: AgentCheckRow): AgentCheckRecord {
  return {
    id: row.id,
    runId: row.run_id,
    name: row.name,
    command: row.command,
    status: row.status,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    createdAt: row.created_at,
  };
}

function approvalRowToRecord(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
