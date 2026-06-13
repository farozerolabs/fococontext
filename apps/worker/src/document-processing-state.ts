import { randomUUID, createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { createProcessingArtifactObjectKey } from "@fococontext/core";
import type { DatabaseSchema } from "@fococontext/db";

export type DocumentProcessingStage =
  | "parsing"
  | "ocr"
  | "media_extraction"
  | "captioning"
  | "parsed_artifact";

export type DocumentProcessingUnitStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "canceled";

export type DocumentProcessingCheckpointStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface DocumentProcessingUnitInput {
  attemptScope?: string;
  completedAt?: string | null;
  configHash?: string | null;
  contentHash?: string | null;
  counters?: Record<string, unknown>;
  dedupeKey?: string;
  jobId: string;
  locator?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  model?: string | null;
  objectKey?: string | null;
  objectRefs?: readonly Record<string, unknown>[];
  parsedContentId?: string | null;
  parserName?: string | null;
  parserVersion?: string | null;
  policyHash?: string | null;
  promptVersion?: string | null;
  providerName?: string | null;
  retainedUntil?: string | null;
  retryEligible?: boolean;
  safeError?: Record<string, unknown> | null;
  sourceDocumentId: string;
  stage: DocumentProcessingStage;
  status: DocumentProcessingUnitStatus;
  unitIndex?: number | null;
  unitKey: string;
  unitType: string;
  warnings?: readonly Record<string, unknown>[];
}

export interface DocumentProcessingCheckpointInput {
  attemptScope?: string;
  checkpointKey: string;
  completedAt?: string | null;
  configHash?: string | null;
  cursor?: Record<string, unknown>;
  jobId: string;
  parsedContentId?: string | null;
  retainedUntil?: string | null;
  safeError?: Record<string, unknown> | null;
  sourceDocumentId: string;
  stage: DocumentProcessingStage;
  status: DocumentProcessingCheckpointStatus;
  summary?: Record<string, unknown>;
}

export interface DocumentProcessingUnitRecord {
  id: string;
  attemptScope: string;
  completedAt: string | null;
  contentHash: string | null;
  counters: Record<string, unknown>;
  dedupeKey: string;
  jobId: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  objectKey: string | null;
  objectRefs: readonly Record<string, unknown>[];
  parsedContentId: string | null;
  retryEligible: boolean;
  safeError: Record<string, unknown> | null;
  sourceDocumentId: string;
  stage: DocumentProcessingStage;
  status: DocumentProcessingUnitStatus;
  unitIndex: number | null;
  unitKey: string;
  unitType: string;
  updatedAt: string;
  warnings: readonly Record<string, unknown>[];
}

export interface DocumentProcessingCheckpointRecord {
  id: string;
  attemptScope: string;
  checkpointKey: string;
  completedAt: string | null;
  cursor: Record<string, unknown>;
  jobId: string;
  parsedContentId: string | null;
  safeError: Record<string, unknown> | null;
  sourceDocumentId: string;
  stage: DocumentProcessingStage;
  status: DocumentProcessingCheckpointStatus;
  summary: Record<string, unknown>;
  updatedAt: string;
}

export interface DocumentProcessingUnitPage {
  hasMore: boolean;
  items: DocumentProcessingUnitRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DocumentProcessingStateStore {
  cleanupExpired(input: { limit: number; now: string }): Promise<{
    checkpointsDeleted: number;
    unitsDeleted: number;
  }>;
  findCheckpoint(input: {
    attemptScope?: string;
    checkpointKey: string;
    jobId: string;
    sourceDocumentId: string;
    stage: DocumentProcessingStage;
  }): Promise<DocumentProcessingCheckpointRecord | null>;
  listTerminalUnitDedupeKeys(input: {
    attemptScope?: string;
    dedupeKeys: readonly string[];
    jobId: string;
    sourceDocumentId: string;
    stage: DocumentProcessingStage;
    statuses?: readonly DocumentProcessingUnitStatus[];
  }): Promise<Set<string>>;
  listUnits(input: {
    attemptScope?: string;
    jobId?: string;
    page: number;
    pageSize: number;
    sourceDocumentId: string;
    stage?: DocumentProcessingStage;
    status?: DocumentProcessingUnitStatus;
  }): Promise<DocumentProcessingUnitPage>;
  resetUnits(input: {
    attemptScope?: string;
    jobId: string;
    sourceDocumentId: string;
    stage: DocumentProcessingStage;
    unitKeys?: readonly string[];
  }): Promise<number>;
  summarizeUnits(input: {
    attemptScope?: string;
    jobId?: string;
    sourceDocumentId: string;
    stage?: DocumentProcessingStage;
  }): Promise<Record<DocumentProcessingUnitStatus, number>>;
  listExpiredObjectKeys(input: { limit: number; now: string }): Promise<string[]>;
  upsertCheckpoint(input: DocumentProcessingCheckpointInput): Promise<void>;
  upsertUnit(input: DocumentProcessingUnitInput): Promise<void>;
  upsertUnits(inputs: readonly DocumentProcessingUnitInput[]): Promise<void>;
}

export interface DocumentProcessingRetentionOptions {
  failureRetentionDays: number;
  now?: () => Date;
  successRetentionDays: number;
}

export function createDocumentProcessingArtifactKey(input: {
  artifactKind: string;
  contentHash?: string | null;
  documentId: string;
  extension: string;
  jobId: string;
  knowledgeBaseId: string;
  stage: DocumentProcessingStage;
  unitKey: string;
}): string {
  const keyDigest = createHash("sha256")
    .update(
      [
        input.knowledgeBaseId,
        input.documentId,
        input.jobId,
        input.stage,
        input.unitKey,
        input.contentHash ?? "no-hash",
        input.artifactKind,
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 24);

  return createProcessingArtifactObjectKey({
    artifactKind: input.artifactKind,
    contentHash: keyDigest,
    documentId: input.documentId,
    extension: input.extension.replace(/^\./, "") || "bin",
    jobId: input.jobId,
    knowledgeBaseId: input.knowledgeBaseId,
    stage: input.stage,
    unitKey: input.unitKey,
  });
}

export function createDocumentProcessingDedupeKey(input: {
  configHash?: string | null;
  contentHash?: string | null;
  stage: DocumentProcessingStage;
  unitKey: string;
  unitType: string;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        input.stage,
        input.unitType,
        input.unitKey,
        input.contentHash ?? "no-hash",
        input.configHash ?? "default",
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 24);

  return [sanitizeDedupeSegment(input.stage), sanitizeDedupeSegment(input.unitType), digest].join(
    ":",
  );
}

export class DocumentProcessingRetentionDelegate implements DocumentProcessingStateStore {
  private readonly now: () => Date;

  constructor(
    private readonly inner: DocumentProcessingStateStore,
    private readonly options: DocumentProcessingRetentionOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  cleanupExpired(input: { limit: number; now: string }) {
    return this.inner.cleanupExpired(input);
  }

  findCheckpoint(input: Parameters<DocumentProcessingStateStore["findCheckpoint"]>[0]) {
    return this.inner.findCheckpoint(input);
  }

  listTerminalUnitDedupeKeys(
    input: Parameters<DocumentProcessingStateStore["listTerminalUnitDedupeKeys"]>[0],
  ) {
    return this.inner.listTerminalUnitDedupeKeys(input);
  }

  listUnits(input: Parameters<DocumentProcessingStateStore["listUnits"]>[0]) {
    return this.inner.listUnits(input);
  }

  resetUnits(input: Parameters<DocumentProcessingStateStore["resetUnits"]>[0]) {
    return this.inner.resetUnits(input);
  }

  summarizeUnits(input: Parameters<DocumentProcessingStateStore["summarizeUnits"]>[0]) {
    return this.inner.summarizeUnits(input);
  }

  listExpiredObjectKeys(input: { limit: number; now: string }) {
    return this.inner.listExpiredObjectKeys(input);
  }

  upsertCheckpoint(input: DocumentProcessingCheckpointInput) {
    return this.inner.upsertCheckpoint(this.withCheckpointRetention(input));
  }

  upsertUnit(input: DocumentProcessingUnitInput) {
    return this.inner.upsertUnit(this.withUnitRetention(input));
  }

  upsertUnits(inputs: readonly DocumentProcessingUnitInput[]) {
    return this.inner.upsertUnits(inputs.map((input) => this.withUnitRetention(input)));
  }

  private withCheckpointRetention(
    input: DocumentProcessingCheckpointInput,
  ): DocumentProcessingCheckpointInput {
    if (input.retainedUntil !== undefined) {
      return input;
    }

    return {
      ...input,
      retainedUntil: this.createCheckpointRetainedUntil(input.status),
    };
  }

  private withUnitRetention(input: DocumentProcessingUnitInput): DocumentProcessingUnitInput {
    if (input.retainedUntil !== undefined) {
      return input;
    }

    return {
      ...input,
      retainedUntil: this.createUnitRetainedUntil(input.status),
    };
  }

  private createCheckpointRetainedUntil(status: DocumentProcessingCheckpointStatus): string | null {
    switch (status) {
      case "completed":
        return this.createRetainedUntil(this.options.successRetentionDays);
      case "failed":
      case "canceled":
        return this.createRetainedUntil(this.options.failureRetentionDays);
      case "queued":
      case "running":
        return null;
    }
  }

  private createUnitRetainedUntil(status: DocumentProcessingUnitStatus): string | null {
    switch (status) {
      case "succeeded":
      case "skipped":
        return this.createRetainedUntil(this.options.successRetentionDays);
      case "failed":
      case "canceled":
        return this.createRetainedUntil(this.options.failureRetentionDays);
      case "pending":
      case "running":
        return null;
    }
  }

  private createRetainedUntil(days: number): string {
    const milliseconds = Math.max(1, Math.floor(days)) * 24 * 60 * 60 * 1000;

    return new Date(this.now().getTime() + milliseconds).toISOString();
  }
}

export class PostgresDocumentProcessingStateStore implements DocumentProcessingStateStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async upsertUnit(input: DocumentProcessingUnitInput): Promise<void> {
    const dedupeKey =
      input.dedupeKey ??
      createDocumentProcessingDedupeKey({
        configHash: input.configHash ?? input.parserVersion ?? input.providerName ?? null,
        contentHash: input.contentHash ?? null,
        stage: input.stage,
        unitKey: input.unitKey,
        unitType: input.unitType,
      });
    const completedAt = normalizeCompletedAt(input.status, input.completedAt);

    await sql`
      insert into document_processing_units (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_document_id,
        job_id,
        parsed_content_id,
        stage,
        unit_type,
        unit_key,
        unit_index,
        attempt_scope,
        status,
        content_hash,
        config_hash,
        parser_name,
        parser_version,
        provider_name,
        model,
        prompt_version,
        policy_hash,
        dedupe_key,
        object_key,
        object_refs,
        locator,
        counters,
        warnings,
        safe_error,
        metadata,
        retry_eligible,
        retained_until,
        completed_at
      )
      select
        ${createDocumentProcessingUnitId()},
        knowledge_bases.tenant_id,
        knowledge_bases.project_id,
        source_documents.knowledge_base_id,
        source_documents.id,
        ${input.jobId},
        ${input.parsedContentId ?? null},
        ${input.stage},
        ${input.unitType},
        ${input.unitKey},
        ${input.unitIndex ?? null},
        ${input.attemptScope ?? "default"},
        ${input.status},
        ${input.contentHash ?? null},
        ${input.configHash ?? null},
        ${input.parserName ?? null},
        ${input.parserVersion ?? null},
        ${input.providerName ?? null},
        ${input.model ?? null},
        ${input.promptVersion ?? null},
        ${input.policyHash ?? null},
        ${dedupeKey},
        ${input.objectKey ?? null},
        ${JSON.stringify(input.objectRefs ?? [])}::jsonb,
        ${JSON.stringify(input.locator ?? {})}::jsonb,
        ${JSON.stringify(input.counters ?? {})}::jsonb,
        ${JSON.stringify(input.warnings ?? [])}::jsonb,
        ${
          input.safeError === undefined || input.safeError === null
            ? null
            : JSON.stringify(input.safeError)
        }::jsonb,
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        ${input.retryEligible ?? false},
        ${input.retainedUntil ?? null},
        ${completedAt}
      from source_documents
      inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
      where source_documents.id = ${input.sourceDocumentId}
      on conflict (job_id, stage, attempt_scope, dedupe_key) do update set
        parsed_content_id = coalesce(excluded.parsed_content_id, document_processing_units.parsed_content_id),
        unit_index = coalesce(excluded.unit_index, document_processing_units.unit_index),
        status = excluded.status,
        content_hash = coalesce(excluded.content_hash, document_processing_units.content_hash),
        config_hash = coalesce(excluded.config_hash, document_processing_units.config_hash),
        parser_name = coalesce(excluded.parser_name, document_processing_units.parser_name),
        parser_version = coalesce(excluded.parser_version, document_processing_units.parser_version),
        provider_name = coalesce(excluded.provider_name, document_processing_units.provider_name),
        model = coalesce(excluded.model, document_processing_units.model),
        prompt_version = coalesce(excluded.prompt_version, document_processing_units.prompt_version),
        policy_hash = coalesce(excluded.policy_hash, document_processing_units.policy_hash),
        object_key = coalesce(excluded.object_key, document_processing_units.object_key),
        object_refs = excluded.object_refs,
        locator = excluded.locator,
        counters = excluded.counters,
        warnings = excluded.warnings,
        safe_error = excluded.safe_error,
        metadata = excluded.metadata,
        retry_eligible = excluded.retry_eligible,
        retained_until = excluded.retained_until,
        completed_at = coalesce(excluded.completed_at, document_processing_units.completed_at),
        updated_at = now()
    `.execute(this.db);
  }

  async upsertUnits(inputs: readonly DocumentProcessingUnitInput[]): Promise<void> {
    for (const input of inputs) {
      await this.upsertUnit(input);
    }
  }

  async upsertCheckpoint(input: DocumentProcessingCheckpointInput): Promise<void> {
    const completedAt = normalizeCheckpointCompletedAt(input.status, input.completedAt);

    await sql`
      insert into document_processing_checkpoints (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_document_id,
        job_id,
        parsed_content_id,
        stage,
        checkpoint_key,
        attempt_scope,
        status,
        cursor,
        summary,
        config_hash,
        safe_error,
        retained_until,
        completed_at
      )
      select
        ${createDocumentProcessingCheckpointId()},
        knowledge_bases.tenant_id,
        knowledge_bases.project_id,
        source_documents.knowledge_base_id,
        source_documents.id,
        ${input.jobId},
        ${input.parsedContentId ?? null},
        ${input.stage},
        ${input.checkpointKey},
        ${input.attemptScope ?? "default"},
        ${input.status},
        ${JSON.stringify(input.cursor ?? {})}::jsonb,
        ${JSON.stringify(input.summary ?? {})}::jsonb,
        ${input.configHash ?? null},
        ${
          input.safeError === undefined || input.safeError === null
            ? null
            : JSON.stringify(input.safeError)
        }::jsonb,
        ${input.retainedUntil ?? null},
        ${completedAt}
      from source_documents
      inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
      where source_documents.id = ${input.sourceDocumentId}
      on conflict (job_id, stage, attempt_scope, checkpoint_key) do update set
        parsed_content_id = coalesce(
          excluded.parsed_content_id,
          document_processing_checkpoints.parsed_content_id
        ),
        status = excluded.status,
        cursor = excluded.cursor,
        summary = excluded.summary,
        config_hash = coalesce(excluded.config_hash, document_processing_checkpoints.config_hash),
        safe_error = excluded.safe_error,
        retained_until = excluded.retained_until,
        completed_at = coalesce(excluded.completed_at, document_processing_checkpoints.completed_at),
        updated_at = now()
    `.execute(this.db);
  }

  async findCheckpoint(input: {
    attemptScope?: string;
    checkpointKey: string;
    jobId: string;
    sourceDocumentId: string;
    stage: DocumentProcessingStage;
  }): Promise<DocumentProcessingCheckpointRecord | null> {
    const result = await sql<DocumentProcessingCheckpointRow>`
      select
        id,
        source_document_id,
        job_id,
        parsed_content_id,
        stage,
        checkpoint_key,
        attempt_scope,
        status,
        cursor,
        summary,
        safe_error,
        completed_at,
        updated_at
      from document_processing_checkpoints
      where source_document_id = ${input.sourceDocumentId}
        and job_id = ${input.jobId}
        and stage = ${input.stage}
        and attempt_scope = ${input.attemptScope ?? "default"}
        and checkpoint_key = ${input.checkpointKey}
      limit 1
    `.execute(this.db);

    return result.rows[0] === undefined ? null : toCheckpointRecord(result.rows[0]);
  }

  async listTerminalUnitDedupeKeys(input: {
    attemptScope?: string;
    dedupeKeys: readonly string[];
    jobId: string;
    sourceDocumentId: string;
    stage: DocumentProcessingStage;
    statuses?: readonly DocumentProcessingUnitStatus[];
  }): Promise<Set<string>> {
    if (input.dedupeKeys.length === 0) {
      return new Set();
    }

    const statuses = input.statuses ?? ["succeeded", "failed", "skipped", "canceled"];
    const result = await sql<{ dedupe_key: string }>`
      select dedupe_key
      from document_processing_units
      where source_document_id = ${input.sourceDocumentId}
        and job_id = ${input.jobId}
        and stage = ${input.stage}
        and attempt_scope = ${input.attemptScope ?? "default"}
        and dedupe_key in (${sql.join(input.dedupeKeys)})
        and status in (${sql.join(statuses)})
    `.execute(this.db);

    return new Set(result.rows.map((row) => row.dedupe_key));
  }

  async listUnits(input: {
    attemptScope?: string;
    jobId?: string;
    page: number;
    pageSize: number;
    sourceDocumentId: string;
    stage?: DocumentProcessingStage;
    status?: DocumentProcessingUnitStatus;
  }): Promise<DocumentProcessingUnitPage> {
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));
    const offset = (page - 1) * pageSize;
    const conditions = createUnitConditions(input);
    const totalResult = await sql<{ total: string | number | bigint }>`
      select count(*) as total
      from document_processing_units
      where ${conditions}
    `.execute(this.db);
    const total = readCount(totalResult.rows[0]?.total);
    const itemsResult = await sql<DocumentProcessingUnitRow>`
      select
        id,
        source_document_id,
        job_id,
        parsed_content_id,
        stage,
        unit_type,
        unit_key,
        unit_index,
        attempt_scope,
        status,
        content_hash,
        dedupe_key,
        object_key,
        object_refs,
        locator,
        counters,
        warnings,
        safe_error,
        metadata,
        retry_eligible,
        completed_at,
        updated_at
      from document_processing_units
      where ${conditions}
      order by updated_at desc, id desc
      limit ${pageSize}
      offset ${offset}
    `.execute(this.db);

    return {
      hasMore: offset + itemsResult.rows.length < total,
      items: itemsResult.rows.map(toUnitRecord),
      page,
      pageSize,
      total,
    };
  }

  async summarizeUnits(input: {
    attemptScope?: string;
    jobId?: string;
    sourceDocumentId: string;
    stage?: DocumentProcessingStage;
  }): Promise<Record<DocumentProcessingUnitStatus, number>> {
    const result = await sql<{
      status: DocumentProcessingUnitStatus;
      total: string | number | bigint;
    }>`
      select status, count(*) as total
      from document_processing_units
      where ${createUnitConditions(input)}
      group by status
    `.execute(this.db);
    const summary = createEmptyUnitSummary();

    for (const row of result.rows) {
      summary[row.status] = readCount(row.total);
    }

    return summary;
  }

  async resetUnits(input: {
    attemptScope?: string;
    jobId: string;
    sourceDocumentId: string;
    stage: DocumentProcessingStage;
    unitKeys?: readonly string[];
  }): Promise<number> {
    const result = await sql<{ id: string }>`
      update document_processing_units
      set
        status = 'pending',
        safe_error = null,
        retry_eligible = false,
        retained_until = null,
        completed_at = null,
        updated_at = now()
      where source_document_id = ${input.sourceDocumentId}
        and job_id = ${input.jobId}
        and stage = ${input.stage}
        and attempt_scope = ${input.attemptScope ?? "default"}
        and (
          ${input.unitKeys === undefined || input.unitKeys.length === 0}
          or unit_key in (${sql.join(input.unitKeys ?? ["__none__"])})
        )
      returning id
    `.execute(this.db);

    return result.rows.length;
  }

  async listExpiredObjectKeys(input: { limit: number; now: string }): Promise<string[]> {
    const limit = Math.max(1, Math.floor(input.limit));
    const result = await sql<{
      object_key: string | null;
      object_refs: unknown;
    }>`
      select object_key, object_refs
      from document_processing_units
      where retained_until is not null
        and retained_until <= ${input.now}::timestamptz
      order by retained_until asc, id asc
      limit ${limit}
    `.execute(this.db);
    const objectKeys = new Set<string>();

    for (const row of result.rows) {
      if (row.object_key !== null && row.object_key.length > 0) {
        objectKeys.add(row.object_key);
      }

      for (const objectKey of readObjectKeysFromRefs(row.object_refs)) {
        objectKeys.add(objectKey);
      }
    }

    return [...objectKeys];
  }

  async cleanupExpired(input: { limit: number; now: string }): Promise<{
    checkpointsDeleted: number;
    unitsDeleted: number;
  }> {
    const limit = Math.max(1, Math.floor(input.limit));
    const checkpointResult = await sql<{ id: string }>`
      with expired as (
        select id
        from document_processing_checkpoints
        where retained_until is not null
          and retained_until <= ${input.now}::timestamptz
        order by retained_until asc, id asc
        limit ${limit}
      )
      delete from document_processing_checkpoints
      where id in (select id from expired)
      returning id
    `.execute(this.db);
    const unitResult = await sql<{ id: string }>`
      with expired as (
        select id
        from document_processing_units
        where retained_until is not null
          and retained_until <= ${input.now}::timestamptz
        order by retained_until asc, id asc
        limit ${limit}
      )
      delete from document_processing_units
      where id in (select id from expired)
      returning id
    `.execute(this.db);

    return {
      checkpointsDeleted: checkpointResult.rows.length,
      unitsDeleted: unitResult.rows.length,
    };
  }
}

interface DocumentProcessingUnitRow {
  attempt_scope: string;
  completed_at: Date | string | null;
  content_hash: string | null;
  counters: unknown;
  dedupe_key: string;
  id: string;
  job_id: string;
  locator: unknown;
  metadata: unknown;
  object_key: string | null;
  object_refs: unknown;
  parsed_content_id: string | null;
  retry_eligible: boolean;
  safe_error: unknown;
  source_document_id: string;
  stage: DocumentProcessingStage;
  status: DocumentProcessingUnitStatus;
  unit_index: number | null;
  unit_key: string;
  unit_type: string;
  updated_at: Date | string;
  warnings: unknown;
}

interface DocumentProcessingCheckpointRow {
  attempt_scope: string;
  checkpoint_key: string;
  completed_at: Date | string | null;
  cursor: unknown;
  id: string;
  job_id: string;
  parsed_content_id: string | null;
  safe_error: unknown;
  source_document_id: string;
  stage: DocumentProcessingStage;
  status: DocumentProcessingCheckpointStatus;
  summary: unknown;
  updated_at: Date | string;
}

function createDocumentProcessingUnitId(): string {
  return `dpu_${randomUUID().replaceAll("-", "")}`;
}

function createDocumentProcessingCheckpointId(): string {
  return `dpc_${randomUUID().replaceAll("-", "")}`;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");

  return sanitized.length === 0 ? "item" : sanitized.slice(0, 120);
}

function sanitizeDedupeSegment(value: string): string {
  return sanitizePathSegment(value).replaceAll(":", "_");
}

function normalizeCompletedAt(
  status: DocumentProcessingUnitStatus,
  completedAt: string | null | undefined,
): string | null {
  if (completedAt !== undefined) {
    return completedAt;
  }

  return isTerminalUnitStatus(status) ? new Date().toISOString() : null;
}

function normalizeCheckpointCompletedAt(
  status: DocumentProcessingCheckpointStatus,
  completedAt: string | null | undefined,
): string | null {
  if (completedAt !== undefined) {
    return completedAt;
  }

  return ["completed", "failed", "canceled"].includes(status) ? new Date().toISOString() : null;
}

function isTerminalUnitStatus(status: DocumentProcessingUnitStatus): boolean {
  return ["succeeded", "failed", "skipped", "canceled"].includes(status);
}

function createUnitConditions(input: {
  attemptScope?: string;
  jobId?: string;
  sourceDocumentId: string;
  stage?: DocumentProcessingStage;
  status?: DocumentProcessingUnitStatus;
}) {
  return sql`
    source_document_id = ${input.sourceDocumentId}
    and attempt_scope = ${input.attemptScope ?? "default"}
    and (${input.jobId === undefined} or job_id = ${input.jobId ?? "__none__"})
    and (${input.stage === undefined} or stage = ${input.stage ?? "parsing"})
    and (${input.status === undefined} or status = ${input.status ?? "pending"})
  `;
}

function toUnitRecord(row: DocumentProcessingUnitRow): DocumentProcessingUnitRecord {
  return {
    attemptScope: row.attempt_scope,
    completedAt: toIsoStringOrNull(row.completed_at),
    contentHash: row.content_hash,
    counters: toRecord(row.counters),
    dedupeKey: row.dedupe_key,
    id: row.id,
    jobId: row.job_id,
    locator: toRecord(row.locator),
    metadata: toRecord(row.metadata),
    objectKey: row.object_key,
    objectRefs: toRecordArray(row.object_refs),
    parsedContentId: row.parsed_content_id,
    retryEligible: row.retry_eligible,
    safeError: row.safe_error === null ? null : toRecord(row.safe_error),
    sourceDocumentId: row.source_document_id,
    stage: row.stage,
    status: row.status,
    unitIndex: row.unit_index,
    unitKey: row.unit_key,
    unitType: row.unit_type,
    updatedAt: toIsoString(row.updated_at),
    warnings: toRecordArray(row.warnings),
  };
}

function toCheckpointRecord(
  row: DocumentProcessingCheckpointRow,
): DocumentProcessingCheckpointRecord {
  return {
    attemptScope: row.attempt_scope,
    checkpointKey: row.checkpoint_key,
    completedAt: toIsoStringOrNull(row.completed_at),
    cursor: toRecord(row.cursor),
    id: row.id,
    jobId: row.job_id,
    parsedContentId: row.parsed_content_id,
    safeError: row.safe_error === null ? null : toRecord(row.safe_error),
    sourceDocumentId: row.source_document_id,
    stage: row.stage,
    status: row.status,
    summary: toRecord(row.summary),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(toRecord) : [];
}

function readObjectKeysFromRefs(value: unknown): string[] {
  return toRecordArray(value)
    .map((record) => record.object_key)
    .filter(
      (objectKey): objectKey is string => typeof objectKey === "string" && objectKey.length > 0,
    );
}

function readCount(value: string | number | bigint | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }

  return 0;
}

function createEmptyUnitSummary(): Record<DocumentProcessingUnitStatus, number> {
  return {
    canceled: 0,
    failed: 0,
    pending: 0,
    running: 0,
    skipped: 0,
    succeeded: 0,
  };
}

export function createShortConfigHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}
