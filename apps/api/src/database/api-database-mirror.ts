import { createHash } from "node:crypto";

import { sql, type Kysely } from "kysely";
import {
  requireCleanupItemTenantProject,
  requireCleanupOperationTenantProject,
  createPostgresBackgroundOperationCheckpointRepository,
  requireJobTenantProject,
  requireKnowledgeBaseTenantProject,
  type BackgroundOperationCheckpointRecord,
  type BackgroundOperationCheckpointTransitionInput,
  type CompleteBackgroundOperationCheckpointInput,
  type CreateBackgroundOperationCheckpointInput,
  requireWebhookTenantProject,
  type DatabaseSchema,
  type DefaultIdentitySeed,
  type FailBackgroundOperationCheckpointInput,
  type SaveBackgroundOperationCheckpointProgressInput,
} from "@fococontext/db";

import type {
  DeletionCleanupItemRecord,
  DeletionCleanupOperationRecord,
} from "../deletion-cleanup/deletion-cleanup.types.js";
import type {
  JobEventRecord,
  JobRecord,
  SourceDocumentRecord,
  UploadSessionRecord,
} from "../documents/document.types.js";
import type { BatchImportItemRecord, BatchImportRecord } from "../imports/batch-import.types.js";
import type {
  KnowledgeCheckFinding,
  KnowledgeCheckRecord,
} from "../knowledge-checks/knowledge-check.types.js";
import type { KnowledgeBaseRecord } from "../knowledge-bases/knowledge-base.types.js";
import type {
  ScheduledImportJobRecord,
  SourceWatchScanResultResponse,
  SourceWatchScanStageItem,
  SourceWatchRuleRecord,
} from "../source-watch/source-watch.types.js";
import type { WebhookDeliveryRecord, WebhookRecord } from "../webhooks/webhook.types.js";

export const apiDatabaseMirrorToken = Symbol("apiDatabaseMirror");
export { createNoopApiDatabaseMirror } from "./api-database-mirror.noop.js";

const knowledgeCheckFindingsPreviewLimit = 100;
const sourceWatchScanResultPreviewLimit = 100;

export interface ApiDatabaseMirror {
  saveKnowledgeBase(record: KnowledgeBaseRecord): Promise<void>;
  updateKnowledgeBase(record: KnowledgeBaseRecord): Promise<void>;
  saveSourceDocument(record: SourceDocumentRecord): Promise<void>;
  updateSourceDocument(record: SourceDocumentRecord): Promise<void>;
  markSourceDocumentsDeletedForKnowledgeBase(
    knowledgeBaseId: string,
    deletedAt: string,
  ): Promise<void>;
  saveUploadSession(record: UploadSessionRecord): Promise<void>;
  updateUploadSession(record: UploadSessionRecord): Promise<void>;
  saveBatchImport(record: BatchImportRecord): Promise<void>;
  updateBatchImport(record: BatchImportRecord): Promise<void>;
  saveBatchImportItems(records: readonly BatchImportItemRecord[]): Promise<void>;
  updateBatchImportItem(record: BatchImportItemRecord): Promise<void>;
  saveDeletionCleanupOperation(record: DeletionCleanupOperationRecord): Promise<void>;
  updateDeletionCleanupOperation(record: DeletionCleanupOperationRecord): Promise<void>;
  saveDeletionCleanupItems(records: readonly DeletionCleanupItemRecord[]): Promise<void>;
  updateDeletionCleanupItem(record: DeletionCleanupItemRecord): Promise<void>;
  saveJob(record: JobRecord): Promise<void>;
  updateJob(record: JobRecord): Promise<void>;
  cancelOpenJobsForKnowledgeBase(input: {
    knowledgeBaseId: string;
    message: string;
    metadata: Record<string, unknown>;
    now: string;
  }): Promise<number>;
  cancelOpenJobsForSourceDocument(input: {
    sourceDocumentId: string;
    message: string;
    metadata: Record<string, unknown>;
    now: string;
  }): Promise<number>;
  appendJobEvent(record: JobEventRecord): Promise<void>;
  saveSourceWatchRule(record: SourceWatchRuleRecord): Promise<void>;
  updateSourceWatchRule(record: SourceWatchRuleRecord): Promise<void>;
  saveScheduledImportJob(record: ScheduledImportJobRecord): Promise<void>;
  saveSourceWatchScanItems(input: {
    knowledgeBaseId: string;
    scheduledImportJobId: string;
    sourceWatchRuleId: string;
    sourceKind: string;
    items: readonly SourceWatchScanStageItem[];
    now: string;
  }): Promise<void>;
  saveWebhook(record: WebhookRecord): Promise<void>;
  saveWebhookDelivery(record: WebhookDeliveryRecord): Promise<void>;
  saveKnowledgeCheck(record: KnowledgeCheckRecord): Promise<void>;
  cleanupExpiredMaintenanceIntermediateState(input: { now: string; limit: number }): Promise<{
    knowledgeCheckFindings: number;
    knowledgeCheckWindowCheckpoints: number;
    sourceWatchScanItems: number;
  }>;
  createOrReuseBackgroundOperationCheckpoint(
    input: CreateBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  getBackgroundOperationCheckpointById(
    id: string,
  ): Promise<BackgroundOperationCheckpointRecord | null>;
  markBackgroundOperationCheckpointRunning(
    input: BackgroundOperationCheckpointTransitionInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  saveBackgroundOperationCheckpointProgress(
    input: SaveBackgroundOperationCheckpointProgressInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  completeBackgroundOperationCheckpoint(
    input: CompleteBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
  failBackgroundOperationCheckpoint(
    input: FailBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord>;
}

export function createPostgresApiDatabaseMirror(
  db: Kysely<DatabaseSchema>,
  identity: DefaultIdentitySeed,
): ApiDatabaseMirror {
  return new PostgresApiDatabaseMirror(db, identity);
}

class PostgresApiDatabaseMirror implements ApiDatabaseMirror {
  private readonly backgroundOperationCheckpoints =
    createPostgresBackgroundOperationCheckpointRepository(this.db);

  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly identity: DefaultIdentitySeed,
  ) {}

  async createOrReuseBackgroundOperationCheckpoint(
    input: CreateBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    return this.backgroundOperationCheckpoints.createOrReuse(input);
  }

  async getBackgroundOperationCheckpointById(
    id: string,
  ): Promise<BackgroundOperationCheckpointRecord | null> {
    return this.backgroundOperationCheckpoints.getById(id);
  }

  async markBackgroundOperationCheckpointRunning(
    input: BackgroundOperationCheckpointTransitionInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    return this.backgroundOperationCheckpoints.markRunning(input);
  }

  async saveBackgroundOperationCheckpointProgress(
    input: SaveBackgroundOperationCheckpointProgressInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    return this.backgroundOperationCheckpoints.saveProgress(input);
  }

  async completeBackgroundOperationCheckpoint(
    input: CompleteBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    return this.backgroundOperationCheckpoints.markCompleted(input);
  }

  async failBackgroundOperationCheckpoint(
    input: FailBackgroundOperationCheckpointInput,
  ): Promise<BackgroundOperationCheckpointRecord> {
    return this.backgroundOperationCheckpoints.markFailed(input);
  }

  async saveKnowledgeBase(record: KnowledgeBaseRecord): Promise<void> {
    await sql`
      insert into knowledge_bases (
        id,
        tenant_id,
        project_id,
        name,
        slug,
        description,
        knowledge_base_type,
        upstream_knowledge_base_id,
        upstream_base_version_id,
        upstream_synced_version_id,
        fork_owner_type,
        fork_owner_external_id,
        fork_owner_display_name,
        sync_status,
        template,
        output_language,
        status,
        current_version_id,
        created_at,
        updated_at,
        deleted_at
      )
      values (
        ${record.id},
        ${record.tenantId},
        ${record.projectId},
        ${record.name},
        ${record.slug},
        ${record.description ?? null},
        ${record.knowledgeBaseType},
        ${record.upstreamKnowledgeBaseId},
        ${record.upstreamBaseVersionId},
        ${record.upstreamSyncedVersionId},
        ${record.forkOwner?.ownerType ?? null},
        ${record.forkOwner?.externalOwnerId ?? null},
        ${record.forkOwner?.displayName ?? null},
        ${record.syncStatus},
        ${record.template},
        ${record.outputLanguage},
        ${record.status},
        ${record.currentVersionId},
        ${record.createdAt},
        ${record.updatedAt},
        ${record.deletedAt ?? null}
      )
      on conflict (id) do update set
        name = excluded.name,
        slug = excluded.slug,
        description = excluded.description,
        knowledge_base_type = excluded.knowledge_base_type,
        upstream_knowledge_base_id = excluded.upstream_knowledge_base_id,
        upstream_base_version_id = excluded.upstream_base_version_id,
        upstream_synced_version_id = excluded.upstream_synced_version_id,
        fork_owner_type = excluded.fork_owner_type,
        fork_owner_external_id = excluded.fork_owner_external_id,
        fork_owner_display_name = excluded.fork_owner_display_name,
        sync_status = excluded.sync_status,
        template = excluded.template,
        output_language = excluded.output_language,
        status = excluded.status,
        current_version_id = excluded.current_version_id,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `.execute(this.db);

    await sql`
      insert into knowledge_base_settings (
        id,
        knowledge_base_id,
        purpose,
        wiki_schema,
        retrieval_settings,
        markdown_contract,
        created_at,
        updated_at
      )
      values (
        ${`${record.id}:settings`},
        ${record.id},
        ${JSON.stringify({ text: record.purpose })}::jsonb,
        ${JSON.stringify(record.schema)}::jsonb,
        ${JSON.stringify(record.retrieval)}::jsonb,
        ${JSON.stringify({ version: 1 })}::jsonb,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (knowledge_base_id) do update set
        purpose = excluded.purpose,
        wiki_schema = excluded.wiki_schema,
        retrieval_settings = excluded.retrieval_settings,
        updated_at = excluded.updated_at
    `.execute(this.db);

    await sql`
      insert into knowledge_base_dataset_configurations (
        id,
        knowledge_base_id,
        preset_id,
        status,
        version,
        values,
        latest_snapshot_id,
        updated_by,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${record.datasetConfiguration.id},
        ${record.id},
        ${record.datasetConfiguration.presetId},
        ${record.datasetConfiguration.status},
        ${record.datasetConfiguration.version},
        ${JSON.stringify(record.datasetConfiguration.values)}::jsonb,
        ${record.datasetConfiguration.latestSnapshotId},
        ${record.datasetConfiguration.updatedBy},
        ${JSON.stringify(record.datasetConfiguration.metadata)}::jsonb,
        ${record.datasetConfiguration.createdAt},
        ${record.datasetConfiguration.updatedAt}
      )
      on conflict (knowledge_base_id) do update set
        preset_id = excluded.preset_id,
        status = excluded.status,
        version = excluded.version,
        values = excluded.values,
        latest_snapshot_id = excluded.latest_snapshot_id,
        updated_by = excluded.updated_by,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `.execute(this.db);

    await sql`
      insert into knowledge_base_dataset_configuration_snapshots (
        id,
        configuration_id,
        knowledge_base_id,
        preset_id,
        version,
        values,
        reason,
        metadata,
        created_by,
        created_at
      )
      values (
        ${record.datasetConfiguration.latestSnapshotId},
        ${record.datasetConfiguration.id},
        ${record.id},
        ${record.datasetConfiguration.presetId},
        ${record.datasetConfiguration.version},
        ${JSON.stringify(record.datasetConfiguration.values)}::jsonb,
        'configuration_saved',
        ${JSON.stringify(record.datasetConfiguration.metadata)}::jsonb,
        ${record.datasetConfiguration.updatedBy},
        ${record.datasetConfiguration.updatedAt}
      )
      on conflict (id) do nothing
    `.execute(this.db);

    await sql`
      insert into knowledge_versions (
        id,
        knowledge_base_id,
        version_number,
        status,
        summary,
        created_by,
        created_at
      )
      values (
        ${record.currentVersionId},
        ${record.id},
        0,
        'active',
        'Initial Knowledge Base version.',
        ${this.identity.account.id},
        ${record.createdAt}
      )
      on conflict (id) do nothing
    `.execute(this.db);

    for (const page of record.systemPages) {
      await sql`
        insert into system_pages (
          id,
          knowledge_base_id,
          system_key,
          title,
          markdown,
          created_at,
          updated_at
        )
        values (
          ${page.id},
          ${page.knowledgeBaseId},
          ${page.type},
          ${page.title},
          ${page.markdown},
          ${page.createdAt},
          ${page.updatedAt}
        )
        on conflict (knowledge_base_id, system_key) do update set
          title = excluded.title,
          markdown = excluded.markdown,
          updated_at = excluded.updated_at
      `.execute(this.db);
    }
  }

  async updateKnowledgeBase(record: KnowledgeBaseRecord): Promise<void> {
    await this.saveKnowledgeBase(record);
  }

  async saveDeletionCleanupOperation(record: DeletionCleanupOperationRecord): Promise<void> {
    const scope = await requireCleanupOperationTenantProject(this.db, record);

    await sql`
      insert into deletion_cleanup_operations (
        id,
        tenant_id,
        project_id,
        target_type,
        target_id,
        knowledge_base_id,
        status,
        phase,
        requested_by,
        request_id,
        queue_job_id,
        manifest,
        total_item_count,
        pending_item_count,
        deleted_item_count,
        skipped_item_count,
        failed_item_count,
        object_key_count,
        database_row_count,
        attempt_count,
        max_attempts,
        retry_after,
        retryable,
        last_error,
        retention_expires_at,
        item_retention_expires_at,
        started_at,
        completed_at,
        failed_at,
        canceled_at,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.targetType},
        ${record.targetId},
        ${record.knowledgeBaseId},
        ${record.status},
        ${record.phase},
        ${record.requestedBy},
        ${record.requestId},
        ${record.queueJobId},
        ${JSON.stringify(record.manifest)}::jsonb,
        ${record.totalItemCount},
        ${record.pendingItemCount},
        ${record.deletedItemCount},
        ${record.skippedItemCount},
        ${record.failedItemCount},
        ${record.objectKeyCount},
        ${record.databaseRowCount},
        ${record.attemptCount},
        ${record.maxAttempts},
        ${record.retryAfter},
        ${record.retryable},
        ${record.lastError === null ? null : JSON.stringify(record.lastError)}::jsonb,
        ${record.retentionExpiresAt},
        ${record.itemRetentionExpiresAt},
        ${record.startedAt},
        ${record.completedAt},
        ${record.failedAt},
        ${record.canceledAt},
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        phase = excluded.phase,
        queue_job_id = excluded.queue_job_id,
        manifest = excluded.manifest,
        total_item_count = excluded.total_item_count,
        pending_item_count = excluded.pending_item_count,
        deleted_item_count = excluded.deleted_item_count,
        skipped_item_count = excluded.skipped_item_count,
        failed_item_count = excluded.failed_item_count,
        object_key_count = excluded.object_key_count,
        database_row_count = excluded.database_row_count,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        retry_after = excluded.retry_after,
        retryable = excluded.retryable,
        last_error = excluded.last_error,
        retention_expires_at = excluded.retention_expires_at,
        item_retention_expires_at = excluded.item_retention_expires_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        failed_at = excluded.failed_at,
        canceled_at = excluded.canceled_at,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async updateDeletionCleanupOperation(record: DeletionCleanupOperationRecord): Promise<void> {
    await this.saveDeletionCleanupOperation(record);
  }

  async saveDeletionCleanupItems(records: readonly DeletionCleanupItemRecord[]): Promise<void> {
    for (const record of records) {
      await this.updateDeletionCleanupItem(record);
    }
  }

  async updateDeletionCleanupItem(record: DeletionCleanupItemRecord): Promise<void> {
    const scope = await requireCleanupItemTenantProject(this.db, record);

    await sql`
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.operationId},
        ${record.itemType},
        ${record.resourceType},
        ${record.resourceId},
        ${record.objectKey},
        ${record.tableName},
        ${record.knowledgeBaseId},
        ${record.sourceDocumentId},
        ${record.status},
        ${record.phase},
        ${record.attemptCount},
        ${record.maxAttempts},
        ${record.lastError === null ? null : JSON.stringify(record.lastError)}::jsonb,
        ${record.skipReason},
        ${record.retryAfter},
        ${record.retainedUntil},
        ${record.createdAt},
        ${record.updatedAt},
        ${record.completedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        phase = excluded.phase,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        last_error = excluded.last_error,
        skip_reason = excluded.skip_reason,
        retry_after = excluded.retry_after,
        retained_until = excluded.retained_until,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `.execute(this.db);
  }

  async saveSourceDocument(record: SourceDocumentRecord): Promise<void> {
    await sql`
      insert into source_documents (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_type,
        name,
        status,
        content_hash,
        object_key,
        mime_type,
        size_bytes,
        metadata,
        ocr_status,
        ocr_summary,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${record.tenantId},
        ${record.projectId},
        ${record.knowledgeBaseId},
        ${record.sourceType},
        ${record.name},
        ${record.status},
        ${record.contentHash},
        ${record.objectKey},
        ${record.mimeType},
        ${record.size},
        ${JSON.stringify(toSourceDocumentMetadata(record))}::jsonb,
        ${record.ocrStatus ?? "not_required"},
        ${JSON.stringify(record.ocrSummary ?? {})}::jsonb,
        ${record.ownerKnowledgeBaseId ?? null},
        ${record.visibilityOrigin ?? "canonical"},
        ${record.upstreamResourceId ?? null},
        ${record.forkTombstonedAt ?? null},
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        name = excluded.name,
        status = excluded.status,
        content_hash = excluded.content_hash,
        object_key = excluded.object_key,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        metadata = excluded.metadata,
        ocr_status = excluded.ocr_status,
        ocr_summary = excluded.ocr_summary,
        owner_knowledge_base_id = excluded.owner_knowledge_base_id,
        visibility_origin = excluded.visibility_origin,
        upstream_resource_id = excluded.upstream_resource_id,
        fork_tombstoned_at = excluded.fork_tombstoned_at,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async updateSourceDocument(record: SourceDocumentRecord): Promise<void> {
    await this.saveSourceDocument(record);
  }

  async markSourceDocumentsDeletedForKnowledgeBase(
    knowledgeBaseId: string,
    deletedAt: string,
  ): Promise<void> {
    await sql`
      update source_documents
      set status = 'deleted',
          deleted_at = coalesce(deleted_at, ${deletedAt}),
          updated_at = ${deletedAt}
      where knowledge_base_id = ${knowledgeBaseId}
        and deleted_at is null
        and status <> 'deleted'
    `.execute(this.db);
  }

  async saveUploadSession(record: UploadSessionRecord): Promise<void> {
    await sql`
      insert into upload_sessions (
        id,
        tenant_id,
        project_id,
        actor_type,
        actor_id,
        actor_source,
        actor_account_id,
        knowledge_base_id,
        document_id,
        object_key,
        file_name,
        display_name,
        mime_type,
        size_bytes,
        content_hash,
        source_path,
        metadata,
        status,
        idempotency_key,
        finalize_idempotency_key,
        finalized_document_id,
        finalized_job_id,
        cleanup_operation_id,
        expires_at,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${record.tenantId},
        ${record.projectId},
        ${record.actorType},
        ${record.actorId},
        ${record.actorSource},
        ${record.actorAccountId},
        ${record.knowledgeBaseId},
        ${record.documentId},
        ${record.objectKey},
        ${record.fileName},
        ${record.displayName},
        ${record.mimeType},
        ${record.size},
        ${record.contentHash},
        ${record.sourcePath ?? null},
        ${JSON.stringify(record.metadata)}::jsonb,
        ${record.status},
        ${record.idempotencyKey},
        ${record.finalizeIdempotencyKey},
        ${record.finalizedDocumentId},
        ${record.finalizedJobId},
        ${record.cleanupOperationId},
        ${record.expiresAt},
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        actor_type = excluded.actor_type,
        actor_id = excluded.actor_id,
        actor_source = excluded.actor_source,
        actor_account_id = excluded.actor_account_id,
        object_key = excluded.object_key,
        file_name = excluded.file_name,
        display_name = excluded.display_name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        content_hash = excluded.content_hash,
        source_path = excluded.source_path,
        metadata = excluded.metadata,
        status = excluded.status,
        idempotency_key = excluded.idempotency_key,
        finalize_idempotency_key = excluded.finalize_idempotency_key,
        finalized_document_id = excluded.finalized_document_id,
        finalized_job_id = excluded.finalized_job_id,
        cleanup_operation_id = excluded.cleanup_operation_id,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async updateUploadSession(record: UploadSessionRecord): Promise<void> {
    await this.saveUploadSession(record);
  }

  async saveBatchImport(record: BatchImportRecord): Promise<void> {
    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledgeBaseId);

    await sql`
      insert into upload_batches (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_type,
        status,
        total_items,
        accepted_items,
        skipped_items,
        validation_error_count,
        completed_items,
        failed_items,
        enqueue_cursor,
        retry_cursor,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.knowledgeBaseId},
        ${record.sourceType},
        ${record.status},
        ${record.totalItems},
        ${record.acceptedItems},
        ${record.skippedItems},
        ${record.validationErrorCount},
        ${record.completedItems},
        ${record.failedItems},
        ${record.enqueueCursor},
        ${record.retryCursor},
        ${JSON.stringify(record.metadata)}::jsonb,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        status = excluded.status,
        total_items = excluded.total_items,
        accepted_items = excluded.accepted_items,
        skipped_items = excluded.skipped_items,
        validation_error_count = excluded.validation_error_count,
        completed_items = excluded.completed_items,
        failed_items = excluded.failed_items,
        enqueue_cursor = excluded.enqueue_cursor,
        retry_cursor = excluded.retry_cursor,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async updateBatchImport(record: BatchImportRecord): Promise<void> {
    await this.saveBatchImport(record);
  }

  async saveBatchImportItems(records: readonly BatchImportItemRecord[]): Promise<void> {
    for (const record of records) {
      await this.updateBatchImportItem(record);
    }
  }

  async updateBatchImportItem(record: BatchImportItemRecord): Promise<void> {
    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledgeBaseId);

    await sql`
      insert into upload_batch_items (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        batch_id,
        item_index,
        source_type,
        external_id,
        idempotency_key,
        status,
        source_document_id,
        ingest_job_id,
        safe_error,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.knowledgeBaseId},
        ${record.batchId},
        ${record.itemIndex},
        ${record.sourceType},
        ${record.externalId},
        ${record.idempotencyKey},
        ${record.status},
        ${record.sourceDocumentId},
        ${record.ingestJobId},
        ${record.safeError === null ? null : JSON.stringify(record.safeError)}::jsonb,
        ${JSON.stringify(record.metadata)}::jsonb,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        status = excluded.status,
        source_document_id = excluded.source_document_id,
        ingest_job_id = excluded.ingest_job_id,
        safe_error = excluded.safe_error,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async saveJob(record: JobRecord): Promise<void> {
    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledgeBaseId);

    await sql`
      insert into jobs (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_document_id,
        job_type,
        status,
        stage,
        progress,
        progress_message,
        idempotency_key,
        dedupe_key,
        result,
        error,
        metadata,
        queued_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.knowledgeBaseId},
        ${record.documentId},
        ${
          record.jobType ??
          (record.documentId === null && record.stage === "indexing"
            ? "index.update"
            : "source.parse")
        },
        ${record.status},
        ${record.stage},
        ${record.progress},
        ${record.progressMessage},
        ${record.idempotencyKey},
        ${record.contentHash},
        ${JSON.stringify({
          parsed_content_id: record.parsedContentId,
          change_set_id: record.changeSetId,
        })}::jsonb,
        ${record.error === null ? null : JSON.stringify(record.error)}::jsonb,
        ${JSON.stringify(toJobMetadata(record))}::jsonb,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        stage = excluded.stage,
        progress = excluded.progress,
        progress_message = excluded.progress_message,
        result = excluded.result,
        error = excluded.error,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async updateJob(record: JobRecord): Promise<void> {
    await this.saveJob(record);
  }

  async cancelOpenJobsForKnowledgeBase(input: {
    knowledgeBaseId: string;
    message: string;
    metadata: Record<string, unknown>;
    now: string;
  }): Promise<number> {
    const result = await sql<{ count: string | number | bigint }>`
      with canceled_jobs as (
        update jobs
        set status = 'canceled',
            progress_message = ${input.message},
            updated_at = ${input.now}
        where knowledge_base_id = ${input.knowledgeBaseId}
          and status in ('queued', 'running')
        returning id, tenant_id, project_id, stage, status
      ),
      inserted_events as (
        insert into job_events (
          id,
          tenant_id,
          project_id,
          job_id,
          event_type,
          message,
          metadata,
          created_at
        )
        select
          canceled_jobs.id || ':job.canceled:' || ${input.now},
          canceled_jobs.tenant_id,
          canceled_jobs.project_id,
          canceled_jobs.id,
          'job.canceled',
          ${input.message},
          ${JSON.stringify(input.metadata)}::jsonb
            || jsonb_build_object('stage', canceled_jobs.stage, 'status', canceled_jobs.status),
          ${input.now}
        from canceled_jobs
        on conflict (id) do nothing
        returning job_id
      ),
      job_counts as (
        select count(*)::text as count from canceled_jobs
      )
      select job_counts.count
      from job_counts
      cross join (select count(*) from inserted_events) inserted_event_counts
    `.execute(this.db);

    return Number(result.rows[0]?.count ?? 0);
  }

  async cancelOpenJobsForSourceDocument(input: {
    sourceDocumentId: string;
    message: string;
    metadata: Record<string, unknown>;
    now: string;
  }): Promise<number> {
    const result = await sql<{ count: string | number | bigint }>`
      with canceled_jobs as (
        update jobs
        set status = 'canceled',
            progress_message = ${input.message},
            updated_at = ${input.now}
        where source_document_id = ${input.sourceDocumentId}
          and status in ('queued', 'running')
        returning id, tenant_id, project_id, stage, status
      ),
      inserted_events as (
        insert into job_events (
          id,
          tenant_id,
          project_id,
          job_id,
          event_type,
          message,
          metadata,
          created_at
        )
        select
          canceled_jobs.id || ':job.canceled:' || ${input.now},
          canceled_jobs.tenant_id,
          canceled_jobs.project_id,
          canceled_jobs.id,
          'job.canceled',
          ${input.message},
          ${JSON.stringify(input.metadata)}::jsonb
            || jsonb_build_object('stage', canceled_jobs.stage, 'status', canceled_jobs.status),
          ${input.now}
        from canceled_jobs
        on conflict (id) do nothing
        returning job_id
      ),
      job_counts as (
        select count(*)::text as count from canceled_jobs
      )
      select job_counts.count
      from job_counts
      cross join (select count(*) from inserted_events) inserted_event_counts
    `.execute(this.db);

    return Number(result.rows[0]?.count ?? 0);
  }

  async appendJobEvent(record: JobEventRecord): Promise<void> {
    const scope = await requireJobTenantProject(this.db, record.jobId);

    await sql`
      insert into job_events (
        id,
        tenant_id,
        project_id,
        job_id,
        event_type,
        message,
        metadata,
        created_at
      )
      values (
        ${`${record.jobId}:${record.type}:${record.createdAt}`},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.jobId},
        ${record.type},
        ${record.message},
        ${JSON.stringify({
          ...record.metadata,
          stage: record.stage,
          status: record.status,
        })}::jsonb,
        ${record.createdAt}
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  async saveSourceWatchRule(record: SourceWatchRuleRecord): Promise<void> {
    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledgeBaseId);

    await sql`
      insert into source_watch_rules (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        name,
        source_type,
        location,
        auto_ingest_enabled,
        include_patterns,
        exclude_patterns,
        status,
        latest_scan_at,
        schedule,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.knowledgeBaseId},
        ${record.name},
        ${record.sourceKind},
        ${record.location},
        ${record.autoIngest},
        ${toPostgresTextArray(record.includeExtensions)},
        ${toPostgresTextArray(record.excludeGlobs)},
        ${record.status},
        ${record.latestScan?.scanned_at ?? null},
        ${JSON.stringify(toSourceWatchScheduleMetadata(record.schedule))}::jsonb,
        ${JSON.stringify(toSourceWatchMetadata(record))}::jsonb,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        name = excluded.name,
        source_type = excluded.source_type,
        location = excluded.location,
        auto_ingest_enabled = excluded.auto_ingest_enabled,
        include_patterns = excluded.include_patterns,
        exclude_patterns = excluded.exclude_patterns,
        status = excluded.status,
        latest_scan_at = excluded.latest_scan_at,
        schedule = excluded.schedule,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async updateSourceWatchRule(record: SourceWatchRuleRecord): Promise<void> {
    await this.saveSourceWatchRule(record);
  }

  async saveScheduledImportJob(record: ScheduledImportJobRecord): Promise<void> {
    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledgeBaseId);
    const scanResultPreview = createSourceWatchScanResultPreview(record.scanResult);

    await sql`
      insert into scheduled_import_jobs (
        id,
        tenant_id,
        project_id,
        source_watch_rule_id,
        knowledge_base_id,
        status,
        trigger_type,
        scan_result,
        started_at,
        finished_at,
        duration_ms,
        retry_count,
        retryable,
        next_retry_at,
        error,
        scheduled_for,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.sourceWatchRuleId},
        ${record.knowledgeBaseId},
        ${record.status},
        ${record.triggerType},
        ${JSON.stringify(scanResultPreview)}::jsonb,
        ${record.startedAt},
        ${record.finishedAt},
        ${record.durationMs},
        ${record.retryCount},
        ${record.retryable},
        ${record.nextRetryAt},
        ${record.error === null ? null : JSON.stringify(record.error)}::jsonb,
        ${record.scheduledFor},
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        trigger_type = excluded.trigger_type,
        scan_result = excluded.scan_result,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        duration_ms = excluded.duration_ms,
        retry_count = excluded.retry_count,
        retryable = excluded.retryable,
        next_retry_at = excluded.next_retry_at,
        error = excluded.error,
        scheduled_for = excluded.scheduled_for,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async saveSourceWatchScanItems(input: {
    knowledgeBaseId: string;
    scheduledImportJobId: string;
    sourceWatchRuleId: string;
    sourceKind: string;
    items: readonly SourceWatchScanStageItem[];
    now: string;
  }): Promise<void> {
    if (input.items.length === 0) {
      return;
    }

    const scope = await requireKnowledgeBaseTenantProject(this.db, input.knowledgeBaseId);

    for (const item of input.items) {
      const dedupeKey = createSourceWatchScanItemDedupeKey({
        itemKind: item.item_kind,
        scheduledImportJobId: input.scheduledImportJobId,
        sourceIdentity: item.source_identity,
      });
      const itemId = `swsi_${dedupeKey.slice(0, 32)}`;

      await sql`
        insert into source_watch_scan_items (
          id,
          tenant_id,
          project_id,
          knowledge_base_id,
          source_watch_rule_id,
          scheduled_import_job_id,
          adapter_kind,
          item_kind,
          source_identity,
          source_path,
          source_url,
          content_hash,
          comparison_status,
          cursor,
          payload,
          safe_error,
          dedupe_key,
          updated_at
        )
        values (
          ${itemId},
          ${scope.tenantId},
          ${scope.projectId},
          ${input.knowledgeBaseId},
          ${input.sourceWatchRuleId},
          ${input.scheduledImportJobId},
          ${input.sourceKind},
          ${item.item_kind},
          ${item.source_identity},
          ${item.source_path ?? null},
          ${item.source_url ?? null},
          ${item.content_hash ?? null},
          ${item.comparison_status ?? null},
          ${JSON.stringify(item.cursor ?? {})}::jsonb,
          ${JSON.stringify(item.payload)}::jsonb,
          ${
            item.safe_error === null || item.safe_error === undefined
              ? null
              : JSON.stringify(item.safe_error)
          }::jsonb,
          ${dedupeKey},
          ${input.now}
        )
        on conflict (scheduled_import_job_id, item_kind, dedupe_key) do update set
          source_path = excluded.source_path,
          source_url = excluded.source_url,
          content_hash = excluded.content_hash,
          comparison_status = excluded.comparison_status,
          cursor = excluded.cursor,
          payload = excluded.payload,
          safe_error = excluded.safe_error,
          updated_at = excluded.updated_at
      `.execute(this.db);
    }
  }

  async saveWebhook(record: WebhookRecord): Promise<void> {
    await sql`
      insert into webhooks (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        target_url,
        event_types,
        status,
        secret_configured,
        secret_ciphertext,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${record.tenantId},
        ${record.projectId},
        ${record.knowledgeBaseId},
        ${record.url},
        ${toPostgresTextArray(record.events)},
        ${record.status},
        ${record.secretConfigured},
        ${record.secret},
        '{}'::jsonb,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        knowledge_base_id = excluded.knowledge_base_id,
        target_url = excluded.target_url,
        event_types = excluded.event_types,
        status = excluded.status,
        secret_configured = excluded.secret_configured,
        secret_ciphertext = excluded.secret_ciphertext,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async saveWebhookDelivery(record: WebhookDeliveryRecord): Promise<void> {
    const scope = await requireWebhookTenantProject(this.db, record.webhookId);

    await sql`
      insert into webhook_deliveries (
        id,
        tenant_id,
        project_id,
        webhook_id,
        knowledge_base_id,
        event_type,
        payload,
        status,
        request_trace,
        response_status,
        response_body,
        attempt_count,
        max_attempts,
        next_attempt_at,
        last_attempt_at,
        signing,
        created_at,
        delivered_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.webhookId},
        ${record.knowledgeBaseId},
        ${record.eventType},
        ${JSON.stringify(record.payload)}::jsonb,
        ${record.status},
        ${JSON.stringify(record.requestTrace)}::jsonb,
        ${record.responseStatus},
        ${record.responseBody},
        ${record.attemptCount},
        ${record.maxAttempts},
        ${record.nextAttemptAt},
        ${record.lastAttemptAt},
        ${JSON.stringify(record.signing)}::jsonb,
        ${record.createdAt},
        ${record.deliveredAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        request_trace = excluded.request_trace,
        response_status = excluded.response_status,
        response_body = excluded.response_body,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        next_attempt_at = excluded.next_attempt_at,
        last_attempt_at = excluded.last_attempt_at,
        signing = excluded.signing,
        delivered_at = excluded.delivered_at
    `.execute(this.db);
  }

  async saveKnowledgeCheck(record: KnowledgeCheckRecord): Promise<void> {
    const visibility = await this.createKnowledgeBaseVisibilityMetadata(record.knowledgeBaseId);
    const findingsPreview = record.findings.slice(0, knowledgeCheckFindingsPreviewLimit);

    await sql`
      insert into knowledge_checks (
        id,
        knowledge_base_id,
        status,
        progress,
        findings,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${record.knowledgeBaseId},
        ${record.status},
        ${record.progress},
        ${JSON.stringify(findingsPreview)}::jsonb,
        ${JSON.stringify({
          checks: record.checks,
          configuration_snapshot: record.configurationSnapshot,
          page_ids: record.pageIds,
          source_document_ids: record.sourceDocumentIds,
          semantic_run: record.semanticRun,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        status = excluded.status,
        progress = excluded.progress,
        findings = excluded.findings,
        metadata = excluded.metadata,
        owner_knowledge_base_id = excluded.owner_knowledge_base_id,
        visibility_origin = excluded.visibility_origin,
        upstream_resource_id = excluded.upstream_resource_id,
        fork_tombstoned_at = excluded.fork_tombstoned_at,
        updated_at = excluded.updated_at
    `.execute(this.db);

    await this.saveKnowledgeCheckFindings(record);

    if (record.findings.length > findingsPreview.length) {
      await sql`
        update knowledge_checks
        set findings = ${JSON.stringify(findingsPreview)}::jsonb,
          updated_at = ${record.updatedAt}
        where id = ${record.id}
      `.execute(this.db);
    }
  }

  async cleanupExpiredMaintenanceIntermediateState(input: { now: string; limit: number }): Promise<{
    knowledgeCheckFindings: number;
    knowledgeCheckWindowCheckpoints: number;
    sourceWatchScanItems: number;
  }> {
    const limit = Math.max(1, input.limit);
    const [findingsResult, checkpointsResult, scanItemsResult] = await Promise.all([
      sql<{ deleted_count: string | number | bigint }>`
        with expired as (
          select id
          from knowledge_check_findings
          where retained_until is not null
            and retained_until <= ${input.now}
          order by retained_until asc, id asc
          limit ${limit}
        ),
        deleted as (
          delete from knowledge_check_findings
          where id in (select id from expired)
          returning id
        )
        select count(*) as deleted_count from deleted
      `.execute(this.db),
      sql<{ deleted_count: string | number | bigint }>`
        with expired as (
          select id
          from knowledge_check_window_checkpoints
          where retained_until is not null
            and retained_until <= ${input.now}
          order by retained_until asc, id asc
          limit ${limit}
        ),
        deleted as (
          delete from knowledge_check_window_checkpoints
          where id in (select id from expired)
          returning id
        )
        select count(*) as deleted_count from deleted
      `.execute(this.db),
      sql<{ deleted_count: string | number | bigint }>`
        with expired as (
          select id
          from source_watch_scan_items
          where retained_until is not null
            and retained_until <= ${input.now}
          order by retained_until asc, id asc
          limit ${limit}
        ),
        deleted as (
          delete from source_watch_scan_items
          where id in (select id from expired)
          returning id
        )
        select count(*) as deleted_count from deleted
      `.execute(this.db),
    ]);

    return {
      knowledgeCheckFindings: readDatabaseCount(findingsResult.rows[0]?.deleted_count),
      knowledgeCheckWindowCheckpoints: readDatabaseCount(checkpointsResult.rows[0]?.deleted_count),
      sourceWatchScanItems: readDatabaseCount(scanItemsResult.rows[0]?.deleted_count),
    };
  }

  private async saveKnowledgeCheckFindings(record: KnowledgeCheckRecord): Promise<void> {
    if (record.findings.length === 0) {
      return;
    }

    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledgeBaseId);

    for (const finding of record.findings) {
      const dedupeKey = createKnowledgeCheckFindingDedupeKey(record.id, finding);
      const findingId = finding.finding_id ?? `finding_${dedupeKey.slice(0, 32)}`;

      await sql`
        insert into knowledge_check_findings (
          id,
          tenant_id,
          project_id,
          knowledge_base_id,
          check_id,
          finding_type,
          severity,
          page_id,
          affected_object_ids,
          message,
          confidence,
          evidence,
          source_refs,
          suggested_action,
          finding,
          stage,
          status,
          dedupe_key,
          updated_at
        )
        values (
          ${findingId},
          ${scope.tenantId},
          ${scope.projectId},
          ${record.knowledgeBaseId},
          ${record.id},
          ${finding.type},
          ${finding.severity},
          ${finding.page_id},
          ${finding.affected_object_ids ?? []}::text[],
          ${finding.message},
          ${finding.confidence ?? null},
          ${JSON.stringify(finding.evidence ?? [])}::jsonb,
          ${JSON.stringify(finding.source_refs ?? [])}::jsonb,
          ${JSON.stringify(finding.suggested_action ?? {})}::jsonb,
          ${JSON.stringify({ ...finding, finding_id: findingId })}::jsonb,
          'structural',
          'active',
          ${dedupeKey},
          ${record.updatedAt}
        )
        on conflict (check_id, dedupe_key) do update set
          severity = excluded.severity,
          page_id = excluded.page_id,
          affected_object_ids = excluded.affected_object_ids,
          message = excluded.message,
          confidence = excluded.confidence,
          evidence = excluded.evidence,
          source_refs = excluded.source_refs,
          suggested_action = excluded.suggested_action,
          finding = excluded.finding,
          stage = excluded.stage,
          status = excluded.status,
          updated_at = excluded.updated_at
      `.execute(this.db);
    }
  }

  private async createKnowledgeBaseVisibilityMetadata(
    knowledgeBaseId: string,
  ): Promise<{ ownerKnowledgeBaseId: string | null; visibilityOrigin: string }> {
    const result = await sql<{ knowledge_base_type: string }>`
      select knowledge_base_type
      from knowledge_bases
      where id = ${knowledgeBaseId}
      limit 1
    `.execute(this.db);

    if (result.rows[0]?.knowledge_base_type === "fork") {
      return {
        ownerKnowledgeBaseId: knowledgeBaseId,
        visibilityOrigin: "fork_owned",
      };
    }

    return {
      ownerKnowledgeBaseId: null,
      visibilityOrigin: "canonical",
    };
  }
}

function toSourceDocumentMetadata(record: SourceDocumentRecord): Record<string, unknown> {
  return {
    ...record.metadata,
    display_name: record.displayName,
    ...(record.sourcePath === undefined ? {} : { source_path: record.sourcePath }),
    ...(record.sourceUrl === undefined ? {} : { source_url: record.sourceUrl }),
  };
}

function toJobMetadata(record: JobRecord): Record<string, unknown> {
  return {
    content_hash: record.contentHash,
    deduped: record.deduped,
    input_snapshot_id: record.inputSnapshotId,
    locked_by_knowledge_base_id: record.lockedByKnowledgeBaseId,
    retry_of_job_id: record.retryOfJobId,
  };
}

function toSourceWatchMetadata(record: SourceWatchRuleRecord): Record<string, unknown> {
  return {
    adapter_options: { ...record.adapterOptions },
    credential_profile: record.credentialProfile,
    exclude_dirs: [...record.excludeDirs],
    max_file_size_mb: record.maxFileSizeMb,
    latest_scan: record.latestScan,
  };
}

function toSourceWatchScheduleMetadata(
  schedule: SourceWatchRuleRecord["schedule"],
): Record<string, unknown> {
  return {
    enabled: schedule.enabled,
    interval_seconds: schedule.intervalSeconds,
    cron: schedule.cron,
    timezone: schedule.timezone,
    next_run_at: schedule.nextRunAt,
    last_run_at: schedule.lastRunAt,
    last_status: schedule.lastStatus,
    last_error: schedule.lastError,
    scheduler_status: schedule.schedulerStatus,
  };
}

function createSourceWatchScanResultPreview(
  scanResult: SourceWatchScanResultResponse,
): SourceWatchScanResultResponse {
  return {
    changed_sources: scanResult.changed_sources.slice(0, sourceWatchScanResultPreviewLimit),
    delete_candidates: scanResult.delete_candidates.slice(0, sourceWatchScanResultPreviewLimit),
    new_sources: scanResult.new_sources.slice(0, sourceWatchScanResultPreviewLimit),
    skipped: scanResult.skipped.slice(0, sourceWatchScanResultPreviewLimit),
  };
}

function toPostgresTextArray(values: readonly string[]) {
  return values.length === 0 ? sql`array[]::text[]` : sql`array[${sql.join(values)}]::text[]`;
}

function createKnowledgeCheckFindingDedupeKey(
  checkId: string,
  finding: KnowledgeCheckFinding,
): string {
  const stableFinding = { ...finding };

  delete stableFinding.finding_id;

  return createHash("sha256")
    .update(
      JSON.stringify({
        check_id: checkId,
        finding: stableFinding,
      }),
    )
    .digest("hex");
}

function createSourceWatchScanItemDedupeKey(input: {
  itemKind: string;
  scheduledImportJobId: string;
  sourceIdentity: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        item_kind: input.itemKind,
        scheduled_import_job_id: input.scheduledImportJobId,
        source_identity: input.sourceIdentity,
      }),
    )
    .digest("hex");
}

function readDatabaseCount(value: string | number | bigint | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
