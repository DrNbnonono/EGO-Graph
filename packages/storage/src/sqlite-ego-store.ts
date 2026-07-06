import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { trajectoryEventSchema, type TrajectoryEvent } from "@ego-graph/core";
import type { RunIndexRecord } from "./run-index-store.js";
import type {
  AppendMessageInput,
  ConversationStore,
  ListMessagesOptions,
  StoredMessage,
} from "./conversation-store.js";
import { createStoredMessageId } from "./conversation-store.js";

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
  kind: "agent_edit" | "agent_plan" | "tool_call";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type HermesEventRecord = {
  id: string;
  type: string;
  sessionId: string;
  runId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  source: string;
};

export type MemoryScope = "session" | "project" | "task";
export type MemoryKind =
  | "project_fact"
  | "user_preference"
  | "decision"
  | "failure"
  | "tool_result"
  | "security_scope"
  | "run_summary";
export type MemoryStatus = "active" | "archived" | "forgotten";

export type MemoryRecord = {
  id: string;
  scope: MemoryScope;
  kind?: MemoryKind;
  content: string;
  summary?: string;
  rawContent?: string;
  source: string;
  sourceRunId?: string;
  evidenceRefs?: string[];
  tags: string[];
  references: string[];
  importance?: number;
  confidence?: number;
  expiresAt?: string;
  status?: MemoryStatus;
  lastAccessedAt?: string;
  accessCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentPlanStatus = "draft" | "approved" | "rejected" | "executed" | "blocked";

export type AgentPlanRecord = {
  planId: string;
  sessionId: string;
  runId?: string;
  mode: "coding" | "ctf" | "research";
  message: string;
  status: AgentPlanStatus;
  plan: string[];
  contextSummary: string;
  memoryIds: string[];
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
  kind: "agent_edit" | "agent_plan" | "tool_call";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

type HermesEventRow = {
  id: string;
  type: string;
  session_id: string;
  run_id: string | null;
  payload_json: string;
  created_at: string;
  source: string;
};

type MemoryRow = {
  id: string;
  scope: MemoryScope;
  kind: MemoryKind | null;
  content: string;
  summary: string;
  raw_content: string | null;
  source: string;
  source_run_id: string | null;
  evidence_refs_json: string;
  tags_json: string;
  references_json: string;
  importance: number;
  confidence: number;
  expires_at: string | null;
  status: MemoryStatus;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
};

type AgentPlanRow = {
  plan_id: string;
  session_id: string;
  run_id: string | null;
  mode: "coding" | "ctf" | "research";
  message: string;
  status: AgentPlanStatus;
  plan_json: string;
  context_summary: string;
  memory_ids_json: string;
  created_at: string;
  updated_at: string;
};

type DatabaseSyncConstructor = new (path: string) => DatabaseSyncType;

function loadDatabaseSyncConstructor(): DatabaseSyncConstructor {
  const require = createRequire(import.meta.url);
  if ((process.versions as Record<string, string | undefined>).bun) {
    const { Database } = require("bun:sqlite") as { Database: DatabaseSyncConstructor };
    return Database;
  }
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
  return DatabaseSync;
}

export class SqliteEgoStore implements ConversationStore {
  private readonly db: DatabaseSyncType;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const DatabaseSync = loadDatabaseSyncConstructor();
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

  async saveHermesEvent(record: HermesEventRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into hermes_events",
          "(id, type, session_id, run_id, payload_json, created_at, source)",
          "values (?, ?, ?, ?, ?, ?, ?)",
          "on conflict(id) do update set",
          "type = excluded.type,",
          "session_id = excluded.session_id,",
          "run_id = excluded.run_id,",
          "payload_json = excluded.payload_json,",
          "created_at = excluded.created_at,",
          "source = excluded.source",
        ].join(" "),
      )
      .run(
        record.id,
        record.type,
        record.sessionId,
        record.runId ?? null,
        JSON.stringify(record.payload),
        record.createdAt,
        record.source,
      );
  }

  async listHermesEvents(
    filter: {
      sessionId?: string;
      runId?: string;
      type?: string;
      limit?: number;
    } = {},
  ): Promise<HermesEventRecord[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter.sessionId) {
      clauses.push("session_id = ?");
      params.push(filter.sessionId);
    }
    if (filter.runId) {
      clauses.push("run_id = ?");
      params.push(filter.runId);
    }
    if (filter.type) {
      clauses.push("type = ?");
      params.push(filter.type);
    }
    params.push(filter.limit ?? 50);
    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from hermes_events ${where} order by created_at desc, id desc limit ?`)
      .all(...params) as HermesEventRow[];
    return rows.map(hermesEventRowToRecord);
  }

  async saveMemory(record: MemoryRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into memory_items",
          "(id, scope, kind, content, summary, raw_content, source, source_run_id, evidence_refs_json, tags_json, references_json, importance, confidence, expires_at, status, last_accessed_at, access_count, created_at, updated_at)",
          "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          "on conflict(id) do update set",
          "scope = excluded.scope,",
          "kind = excluded.kind,",
          "content = excluded.content,",
          "summary = excluded.summary,",
          "raw_content = excluded.raw_content,",
          "source = excluded.source,",
          "source_run_id = excluded.source_run_id,",
          "evidence_refs_json = excluded.evidence_refs_json,",
          "tags_json = excluded.tags_json,",
          "references_json = excluded.references_json,",
          "importance = excluded.importance,",
          "confidence = excluded.confidence,",
          "expires_at = excluded.expires_at,",
          "status = excluded.status,",
          "last_accessed_at = excluded.last_accessed_at,",
          "access_count = excluded.access_count,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .run(
        record.id,
        record.scope,
        record.kind ?? null,
        record.content,
        record.summary ?? record.content,
        record.rawContent ?? null,
        record.source,
        record.sourceRunId ?? null,
        JSON.stringify(record.evidenceRefs ?? []),
        JSON.stringify(record.tags),
        JSON.stringify(record.references),
        record.importance ?? 3,
        record.confidence ?? 0.7,
        record.expiresAt ?? null,
        record.status ?? "active",
        record.lastAccessedAt ?? null,
        record.accessCount ?? 0,
        record.createdAt,
        record.updatedAt,
      );
  }

  async listMemories(
    filter: {
      scope?: MemoryScope;
      status?: MemoryStatus;
      includeArchived?: boolean;
      limit?: number;
    } = {},
  ): Promise<MemoryRecord[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter.scope) {
      clauses.push("scope = ?");
      params.push(filter.scope);
    }
    if (filter.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    } else if (!filter.includeArchived) {
      clauses.push("status = 'active'");
    }
    params.push(filter.limit ?? 50);
    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from memory_items ${where} order by updated_at desc, id desc limit ?`)
      .all(...params) as MemoryRow[];
    return rows.map(memoryRowToRecord);
  }

  async archiveMemory(id: string, updatedAt = new Date().toISOString()): Promise<boolean> {
    const result = this.db
      .prepare("update memory_items set status = 'archived', updated_at = ? where id = ?")
      .run(updatedAt, id);
    return Number(result.changes ?? 0) > 0;
  }

  async forgetMemory(id: string, updatedAt = new Date().toISOString()): Promise<boolean> {
    const result = this.db
      .prepare(
        [
          "update memory_items set",
          "status = 'forgotten',",
          "content = '',",
          "summary = 'Memory forgotten by user request.',",
          "raw_content = '',",
          "updated_at = ?",
          "where id = ?",
        ].join(" "),
      )
      .run(updatedAt, id);
    return Number(result.changes ?? 0) > 0;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const result = this.db.prepare("delete from memory_items where id = ?").run(id);
    return Number(result.changes ?? 0) > 0;
  }

  async saveAgentPlan(record: AgentPlanRecord): Promise<void> {
    this.db
      .prepare(
        [
          "insert into agent_plans",
          "(plan_id, session_id, run_id, mode, message, status, plan_json, context_summary, memory_ids_json, created_at, updated_at)",
          "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          "on conflict(plan_id) do update set",
          "session_id = excluded.session_id,",
          "run_id = excluded.run_id,",
          "mode = excluded.mode,",
          "message = excluded.message,",
          "status = excluded.status,",
          "plan_json = excluded.plan_json,",
          "context_summary = excluded.context_summary,",
          "memory_ids_json = excluded.memory_ids_json,",
          "updated_at = excluded.updated_at",
        ].join(" "),
      )
      .run(
        record.planId,
        record.sessionId,
        record.runId ?? null,
        record.mode,
        record.message,
        record.status,
        JSON.stringify(record.plan),
        record.contextSummary,
        JSON.stringify(record.memoryIds),
        record.createdAt,
        record.updatedAt,
      );
  }

  async getAgentPlan(planId: string): Promise<AgentPlanRecord | undefined> {
    const row = this.db.prepare("select * from agent_plans where plan_id = ?").get(planId) as
      AgentPlanRow | undefined;
    return row ? agentPlanRowToRecord(row) : undefined;
  }

  async listAgentPlans(
    filter: {
      status?: AgentPlanStatus;
      limit?: number;
    } = {},
  ): Promise<AgentPlanRecord[]> {
    const rows = (
      filter.status
        ? this.db
            .prepare("select * from agent_plans where status = ? order by updated_at desc limit ?")
            .all(filter.status, filter.limit ?? 20)
        : this.db
            .prepare("select * from agent_plans order by updated_at desc limit ?")
            .all(filter.limit ?? 20)
    ) as AgentPlanRow[];
    return rows.map(agentPlanRowToRecord);
  }

  async updateAgentPlanStatus(
    planId: string,
    status: AgentPlanStatus,
    runId?: string,
    updatedAt = new Date().toISOString(),
  ): Promise<void> {
    this.db
      .prepare(
        [
          "update agent_plans",
          "set status = ?,",
          "run_id = coalesce(?, run_id),",
          "updated_at = ?",
          "where plan_id = ?",
        ].join(" "),
      )
      .run(status, runId ?? null, updatedAt, planId);
  }

  async appendMessage(input: AppendMessageInput): Promise<StoredMessage> {
    const id = input.id ?? createStoredMessageId();
    const createdAt = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `insert into conversation_messages
          (id, session_id, run_id, role, content_json, tool_call_id, tool_name, token_count, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.sessionId,
        input.runId ?? null,
        input.role,
        input.contentJson,
        input.toolCallId ?? null,
        input.toolName ?? null,
        input.tokenCount ?? null,
        createdAt,
      );
    return {
      id,
      sessionId: input.sessionId,
      ...(input.runId ? { runId: input.runId } : {}),
      role: input.role,
      contentJson: input.contentJson,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.tokenCount !== undefined ? { tokenCount: input.tokenCount } : {}),
      createdAt,
    };
  }

  async listMessages(
    sessionId: string,
    options?: ListMessagesOptions,
  ): Promise<StoredMessage[]> {
    const limit = options?.limit ?? 200;
    if (options?.beforeId) {
      const boundary = this.db
        .prepare("select created_at from conversation_messages where id = ?")
        .get(options.beforeId) as { created_at: string } | undefined;
      if (!boundary) {
        return [];
      }
      const rows = this.db
        .prepare(
          `select * from conversation_messages
           where session_id = ? and created_at < ?
           order by created_at desc, id desc limit ?`,
        )
        .all(sessionId, boundary.created_at, limit) as ConversationMessageRow[];
      return rows.reverse().map(rowToStoredMessage);
    }
    const rows = this.db
      .prepare(
        `select * from conversation_messages
         where session_id = ?
         order by created_at desc, id desc limit ?`,
      )
      .all(sessionId, limit) as ConversationMessageRow[];
    return rows.reverse().map(rowToStoredMessage);
  }

  async recallForPrompt(sessionId: string, tokenBudget: number): Promise<StoredMessage[]> {
    if (tokenBudget <= 0) {
      return [];
    }
    const rows = this.db
      .prepare(
        `select * from conversation_messages
         where session_id = ?
         order by created_at desc, id desc`,
      )
      .all(sessionId) as ConversationMessageRow[];

    const selected: ConversationMessageRow[] = rows.filter((row) => row.role === "system");
    let used = 0;
    for (const row of rows) {
      if (row.role === "system") {
        continue;
      }
      const cost = row.token_count ?? estimateRowCountTokens(row.content_json);
      if (used + cost > tokenBudget) {
        break;
      }
      used += cost;
      selected.push(row);
    }
    return selected
      .sort((left, right) =>
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
      )
      .map(rowToStoredMessage);
  }

  async clearSession(sessionId: string): Promise<void> {
    this.db
      .prepare("delete from conversation_messages where session_id = ?")
      .run(sessionId);
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
        kind text not null check (kind in ('agent_edit', 'agent_plan', 'tool_call')),
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

      create table if not exists hermes_events (
        id text primary key,
        type text not null,
        session_id text not null,
        run_id text,
        payload_json text not null,
        created_at text not null,
        source text not null
      );

      create index if not exists idx_hermes_session on hermes_events(session_id, created_at);
      create index if not exists idx_hermes_run on hermes_events(run_id, created_at);
      create index if not exists idx_hermes_type on hermes_events(type);

      create table if not exists memory_items (
        id text primary key,
        scope text not null check (scope in ('session', 'project', 'task')),
        kind text check (kind in ('project_fact', 'user_preference', 'decision', 'failure', 'tool_result', 'security_scope', 'run_summary')),
        content text not null,
        summary text not null default '',
        raw_content text,
        source text not null,
        source_run_id text,
        evidence_refs_json text not null default '[]',
        tags_json text not null,
        references_json text not null,
        importance integer not null default 3 check (importance between 1 and 5),
        confidence real not null default 0.7 check (confidence >= 0 and confidence <= 1),
        expires_at text,
        status text not null check (status in ('active', 'archived', 'forgotten')),
        last_accessed_at text,
        access_count integer not null default 0,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_memory_scope_status on memory_items(scope, status, updated_at);

      create table if not exists agent_plans (
        plan_id text primary key,
        session_id text not null,
        run_id text,
        mode text not null check (mode in ('coding', 'ctf', 'research')),
        message text not null,
        status text not null check (status in ('draft', 'approved', 'rejected', 'executed', 'blocked')),
        plan_json text not null,
        context_summary text not null,
        memory_ids_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_agent_plans_status on agent_plans(status, updated_at);
      create index if not exists idx_agent_plans_session on agent_plans(session_id, updated_at);

      create table if not exists conversation_messages (
        id text primary key,
        session_id text not null,
        run_id text,
        role text not null check (role in ('system', 'user', 'assistant', 'tool')),
        content_json text not null,
        tool_call_id text,
        tool_name text,
        token_count integer,
        created_at text not null
      );

      create index if not exists idx_messages_session on conversation_messages(session_id, created_at);
    `);
    this.ensureAgentRunsStatusConstraint();
    this.ensureApprovalsKindConstraint();
    this.ensureMemoryV2Schema();
  }

  private ensureMemoryV2Schema(): void {
    const row = this.db
      .prepare("select sql from sqlite_master where type = 'table' and name = 'memory_items'")
      .get() as { sql: string } | undefined;

    if (row?.sql?.includes("raw_content") && row.sql.includes("'forgotten'")) {
      return;
    }

    this.db.exec(`
      drop table if exists memory_items_v2_migration;

      create table memory_items_v2_migration (
        id text primary key,
        scope text not null check (scope in ('session', 'project', 'task')),
        kind text check (kind in ('project_fact', 'user_preference', 'decision', 'failure', 'tool_result', 'security_scope', 'run_summary')),
        content text not null,
        summary text not null default '',
        raw_content text,
        source text not null,
        source_run_id text,
        evidence_refs_json text not null default '[]',
        tags_json text not null,
        references_json text not null,
        importance integer not null default 3 check (importance between 1 and 5),
        confidence real not null default 0.7 check (confidence >= 0 and confidence <= 1),
        expires_at text,
        status text not null check (status in ('active', 'archived', 'forgotten')),
        last_accessed_at text,
        access_count integer not null default 0,
        created_at text not null,
        updated_at text not null
      );

      insert into memory_items_v2_migration (
        id,
        scope,
        kind,
        content,
        summary,
        raw_content,
        source,
        source_run_id,
        evidence_refs_json,
        tags_json,
        references_json,
        importance,
        confidence,
        expires_at,
        status,
        last_accessed_at,
        access_count,
        created_at,
        updated_at
      )
      select
        id,
        scope,
        null,
        content,
        content,
        content,
        source,
        null,
        '[]',
        tags_json,
        references_json,
        3,
        0.7,
        null,
        status,
        null,
        0,
        created_at,
        updated_at
      from memory_items;

      drop table memory_items;
      alter table memory_items_v2_migration rename to memory_items;
      create index if not exists idx_memory_scope_status on memory_items(scope, status, updated_at);
    `);
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

  private ensureApprovalsKindConstraint(): void {
    const row = this.db
      .prepare("select sql from sqlite_master where type = 'table' and name = 'approvals'")
      .get() as { sql: string } | undefined;

    if (!row?.sql || row.sql.includes("'agent_plan'")) {
      return;
    }

    // 中文注释：旧库 approvals.kind 只允许 agent_edit/tool_call，需要重建表以支持计划审批。
    this.db.exec(`
      drop table if exists approvals_agent_plan_migration;
      alter table approvals rename to approvals_agent_plan_migration;

      create table approvals (
        id text primary key,
        run_id text not null,
        kind text not null check (kind in ('agent_edit', 'agent_plan', 'tool_call')),
        status text not null check (status in ('pending', 'approved', 'rejected')),
        created_at text not null,
        updated_at text not null
      );

      insert into approvals (id, run_id, kind, status, created_at, updated_at)
      select id, run_id, kind, status, created_at, updated_at
      from approvals_agent_plan_migration;

      drop table approvals_agent_plan_migration;
      create index if not exists idx_approvals_status on approvals(status);
    `);
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

function hermesEventRowToRecord(row: HermesEventRow): HermesEventRecord {
  return {
    id: row.id,
    type: row.type,
    sessionId: row.session_id,
    ...(row.run_id ? { runId: row.run_id } : {}),
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
    source: row.source,
  };
}

function memoryRowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    ...(row.kind ? { kind: row.kind } : {}),
    content: row.content,
    summary: row.summary,
    ...(row.raw_content !== null ? { rawContent: row.raw_content } : {}),
    source: row.source,
    ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
    evidenceRefs: JSON.parse(row.evidence_refs_json) as string[],
    tags: JSON.parse(row.tags_json) as string[],
    references: JSON.parse(row.references_json) as string[],
    importance: row.importance,
    confidence: row.confidence,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    status: row.status,
    ...(row.last_accessed_at ? { lastAccessedAt: row.last_accessed_at } : {}),
    accessCount: row.access_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentPlanRowToRecord(row: AgentPlanRow): AgentPlanRecord {
  return {
    planId: row.plan_id,
    sessionId: row.session_id,
    ...(row.run_id ? { runId: row.run_id } : {}),
    mode: row.mode,
    message: row.message,
    status: row.status,
    plan: JSON.parse(row.plan_json) as string[],
    contextSummary: row.context_summary,
    memoryIds: JSON.parse(row.memory_ids_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ConversationMessageRow = {
  id: string;
  session_id: string;
  run_id: string | null;
  role: "system" | "user" | "assistant" | "tool";
  content_json: string;
  tool_call_id: string | null;
  tool_name: string | null;
  token_count: number | null;
  created_at: string;
};

function rowToStoredMessage(row: ConversationMessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    ...(row.run_id ? { runId: row.run_id } : {}),
    role: row.role,
    contentJson: row.content_json,
    ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
    ...(row.tool_name ? { toolName: row.tool_name } : {}),
    ...(row.token_count !== null ? { tokenCount: row.token_count } : {}),
    createdAt: row.created_at,
  };
}

/**
 * Cheap fallback token estimate when a row was written without token_count.
 * Uses byte/4 over the raw JSON string. The agent layer is expected to pass
 * accurate token_count at write time; this only matters for legacy rows.
 */
function estimateRowCountTokens(contentJson: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(contentJson, "utf8") / 4));
}
