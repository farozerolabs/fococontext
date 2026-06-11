import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";

import type { DatabaseSchema } from "./index.js";

export const backgroundOperationIdPrefix = "bgop_";

export type BackgroundOperationKind =
  | "retrieval_reindex"
  | "graph_signal_refresh"
  | "graph_insight_refresh"
  | "knowledge_check"
  | "source_watch_scan"
  | "source_ocr"
  | "media_caption"
  | "deletion_cleanup";

export type BackgroundOperationStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface BackgroundOperationCheckpointRecord {
  id: string;
  tenantId: string;
  projectId: string;
  knowledgeBaseId: string | null;
  jobId: string | null;
  operationKind: BackgroundOperationKind;
  stage: string;
  status: BackgroundOperationStatus;
  cursor: Record<string, unknown>;
  processedCount: number;
  failedCount: number;
  totalCount: number | null;
  lastItemId: string | null;
  safeError: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  lockKey: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundOperationCheckpointRepository {
  createOrReuse(
    input: CreateBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  getById(id: string): Promise<BackgroundOperationCheckpointRecord | null>;
  markRunning(
    input: BackgroundOperationCheckpointTransitionInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  saveProgress(
    input: SaveBackgroundOperationCheckpointProgressInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  markCompleted(
    input: CompleteBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  markFailed(
    input: FailBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
}

export interface CreateBackgroundOperationCheckpointInput {
  id?: string;
  tenantId: string;
  projectId: string;
  knowledgeBaseId?: string | null;
  jobId?: string | null;
  operationKind: BackgroundOperationKind;
  stage: string;
  cursor?: Record<string, unknown>;
  processedCount?: number;
  failedCount?: number;
  totalCount?: number | null;
  lastItemId?: string | null;
  metadata?: Record<string, unknown>;
  lockKey?: string | null;
  now: string;
}

export interface BackgroundOperationCheckpointTransitionInput {
  id: string;
  stage?: string;
  now: string;
}

export interface SaveBackgroundOperationCheckpointProgressInput {
  id: string;
  stage?: string;
  cursor?: Record<string, unknown>;
  processedCount?: number;
  failedCount?: number;
  totalCount?: number | null;
  lastItemId?: string | null;
  metadata?: Record<string, unknown>;
  now: string;
}

export interface CompleteBackgroundOperationCheckpointInput {
  id: string;
  stage?: string;
  processedCount?: number;
  failedCount?: number;
  totalCount?: number | null;
  lastItemId?: string | null;
  metadata?: Record<string, unknown>;
  now: string;
}

export interface FailBackgroundOperationCheckpointInput {
  id: string;
  stage?: string;
  safeError: Record<string, unknown>;
  processedCount?: number;
  failedCount?: number;
  totalCount?: number | null;
  lastItemId?: string | null;
  metadata?: Record<string, unknown>;
  now: string;
}

interface BackgroundOperationCheckpointRow {
  id: string;
  tenant_id: string;
  project_id: string;
  knowledge_base_id: string | null;
  job_id: string | null;
  operation_kind: BackgroundOperationKind;
  stage: string;
  status: BackgroundOperationStatus;
  cursor: unknown;
  processed_count: string | number | bigint;
  failed_count: string | number | bigint;
  total_count: string | number | bigint | null;
  last_item_id: string | null;
  safe_error: unknown;
  metadata: unknown;
  lock_key: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export function createPostgresBackgroundOperationCheckpointRepository(
  db: Kysely<DatabaseSchema>,
): BackgroundOperationCheckpointRepository {
  return new PostgresBackgroundOperationCheckpointRepository(db);
}

export function createBackgroundOperationId(): string {
  return `${backgroundOperationIdPrefix}${randomUUID().replaceAll("-", "")}`;
}

class PostgresBackgroundOperationCheckpointRepository implements BackgroundOperationCheckpointRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async createOrReuse(
    input: CreateBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    const id = input.id ?? createBackgroundOperationId();
    const result = await sql<BackgroundOperationCheckpointRow>`
      insert into background_operations (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        job_id,
        operation_kind,
        stage,
        status,
        cursor,
        processed_count,
        failed_count,
        total_count,
        last_item_id,
        metadata,
        lock_key,
        queued_at,
        updated_at
      )
      values (
        ${id},
        ${input.tenantId},
        ${input.projectId},
        ${input.knowledgeBaseId ?? null},
        ${input.jobId ?? null},
        ${input.operationKind},
        ${input.stage},
        'queued',
        ${JSON.stringify(input.cursor ?? {})}::jsonb,
        ${input.processedCount ?? 0},
        ${input.failedCount ?? 0},
        ${input.totalCount ?? null},
        ${input.lastItemId ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        ${input.lockKey ?? null},
        ${input.now},
        ${input.now}
      )
      on conflict (id) do update set
        stage = case
          when background_operations.status in ('completed', 'failed', 'canceled')
            then background_operations.stage
          else excluded.stage
        end,
        cursor = case
          when background_operations.status in ('completed', 'failed', 'canceled')
            then background_operations.cursor
          else excluded.cursor
        end,
        metadata = background_operations.metadata || excluded.metadata,
        lock_key = coalesce(excluded.lock_key, background_operations.lock_key),
        updated_at = excluded.updated_at
      returning *
    `.execute(this.db);

    return toBackgroundOperationCheckpointRecord(requireRow(result.rows[0], id));
  }

  async getById(id: string): Promise<BackgroundOperationCheckpointRecord | null> {
    const result = await sql<BackgroundOperationCheckpointRow>`
      select *
      from background_operations
      where id = ${id}
      limit 1
    `.execute(this.db);

    return result.rows[0] === undefined
      ? null
      : toBackgroundOperationCheckpointRecord(result.rows[0]);
  }

  async markRunning(
    input: BackgroundOperationCheckpointTransitionInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    const result = await sql<BackgroundOperationCheckpointRow>`
      update background_operations
      set
        status = 'running',
        stage = coalesce(${input.stage ?? null}, stage),
        started_at = coalesce(started_at, ${input.now}),
        updated_at = ${input.now}
      where id = ${input.id}
      returning *
    `.execute(this.db);

    return toBackgroundOperationCheckpointRecord(requireRow(result.rows[0], input.id));
  }

  async saveProgress(
    input: SaveBackgroundOperationCheckpointProgressInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    const result = await sql<BackgroundOperationCheckpointRow>`
      update background_operations
      set
        status = 'running',
        stage = coalesce(${input.stage ?? null}, stage),
        cursor = coalesce(${JSON.stringify(input.cursor ?? null)}::jsonb, cursor),
        processed_count = coalesce(${input.processedCount ?? null}, processed_count),
        failed_count = coalesce(${input.failedCount ?? null}, failed_count),
        total_count = coalesce(${input.totalCount ?? null}, total_count),
        last_item_id = coalesce(${input.lastItemId ?? null}, last_item_id),
        metadata = metadata || ${JSON.stringify(input.metadata ?? {})}::jsonb,
        updated_at = ${input.now}
      where id = ${input.id}
      returning *
    `.execute(this.db);

    return toBackgroundOperationCheckpointRecord(requireRow(result.rows[0], input.id));
  }

  async markCompleted(
    input: CompleteBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    const result = await sql<BackgroundOperationCheckpointRow>`
      update background_operations
      set
        status = 'completed',
        stage = coalesce(${input.stage ?? null}, stage),
        processed_count = coalesce(${input.processedCount ?? null}, processed_count),
        failed_count = coalesce(${input.failedCount ?? null}, failed_count),
        total_count = coalesce(${input.totalCount ?? null}, total_count),
        last_item_id = coalesce(${input.lastItemId ?? null}, last_item_id),
        metadata = metadata || ${JSON.stringify(input.metadata ?? {})}::jsonb,
        completed_at = ${input.now},
        updated_at = ${input.now}
      where id = ${input.id}
      returning *
    `.execute(this.db);

    return toBackgroundOperationCheckpointRecord(requireRow(result.rows[0], input.id));
  }

  async markFailed(
    input: FailBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    const result = await sql<BackgroundOperationCheckpointRow>`
      update background_operations
      set
        status = 'failed',
        stage = coalesce(${input.stage ?? null}, stage),
        processed_count = coalesce(${input.processedCount ?? null}, processed_count),
        failed_count = coalesce(${input.failedCount ?? null}, failed_count),
        total_count = coalesce(${input.totalCount ?? null}, total_count),
        last_item_id = coalesce(${input.lastItemId ?? null}, last_item_id),
        safe_error = ${JSON.stringify(input.safeError)}::jsonb,
        metadata = metadata || ${JSON.stringify(input.metadata ?? {})}::jsonb,
        failed_at = ${input.now},
        updated_at = ${input.now}
      where id = ${input.id}
      returning *
    `.execute(this.db);

    return toBackgroundOperationCheckpointRecord(requireRow(result.rows[0], input.id));
  }
}

function requireRow(
  row: BackgroundOperationCheckpointRow | undefined,
  id: string,
): BackgroundOperationCheckpointRow {
  if (row === undefined) {
    throw new Error(`Background operation checkpoint was not found: ${id}.`);
  }

  return row;
}

function toBackgroundOperationCheckpointRecord(
  row: BackgroundOperationCheckpointRow,
): BackgroundOperationCheckpointRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    knowledgeBaseId: row.knowledge_base_id,
    jobId: row.job_id,
    operationKind: row.operation_kind,
    stage: row.stage,
    status: row.status,
    cursor: normalizeJsonObject(row.cursor),
    processedCount: readCount(row.processed_count),
    failedCount: readCount(row.failed_count),
    totalCount: row.total_count === null ? null : readCount(row.total_count),
    lastItemId: row.last_item_id,
    safeError: row.safe_error === null ? null : normalizeJsonObject(row.safe_error),
    metadata: normalizeJsonObject(row.metadata),
    lockKey: row.lock_key,
    queuedAt: normalizeTimestamp(row.queued_at),
    startedAt: normalizeTimestamp(row.started_at),
    completedAt: normalizeTimestamp(row.completed_at),
    failedAt: normalizeTimestamp(row.failed_at),
    canceledAt: normalizeTimestamp(row.canceled_at),
    createdAt: normalizeTimestamp(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: normalizeTimestamp(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeTimestamp(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function readCount(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value, 10);
}
