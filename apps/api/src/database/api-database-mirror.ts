import { sql, type Kysely } from "kysely";
import {
  requireCleanupItemTenantProject,
  requireCleanupOperationTenantProject,
  requireJobTenantProject,
  requireKnowledgeBaseTenantProject,
  requireWebhookTenantProject,
  type DatabaseSchema,
  type DefaultIdentitySeed,
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
import type { KnowledgeCheckRecord } from "../knowledge-checks/knowledge-check.types.js";
import type { KnowledgeBaseRecord } from "../knowledge-bases/knowledge-base.types.js";
import type {
  ScheduledImportJobRecord,
  SourceWatchRuleRecord,
} from "../source-watch/source-watch.types.js";
import type { WebhookDeliveryRecord, WebhookRecord } from "../webhooks/webhook.types.js";

export const apiDatabaseMirrorToken = Symbol("apiDatabaseMirror");

export interface ApiDatabaseMirror {
  saveKnowledgeBase(record: KnowledgeBaseRecord): Promise<void>;
  updateKnowledgeBase(record: KnowledgeBaseRecord): Promise<void>;
  saveSourceDocument(record: SourceDocumentRecord): Promise<void>;
  updateSourceDocument(record: SourceDocumentRecord): Promise<void>;
  saveUploadSession(record: UploadSessionRecord): Promise<void>;
  updateUploadSession(record: UploadSessionRecord): Promise<void>;
  saveDeletionCleanupOperation(record: DeletionCleanupOperationRecord): Promise<void>;
  updateDeletionCleanupOperation(record: DeletionCleanupOperationRecord): Promise<void>;
  saveDeletionCleanupItems(records: readonly DeletionCleanupItemRecord[]): Promise<void>;
  updateDeletionCleanupItem(record: DeletionCleanupItemRecord): Promise<void>;
  saveJob(record: JobRecord): Promise<void>;
  updateJob(record: JobRecord): Promise<void>;
  appendJobEvent(record: JobEventRecord): Promise<void>;
  saveSourceWatchRule(record: SourceWatchRuleRecord): Promise<void>;
  updateSourceWatchRule(record: SourceWatchRuleRecord): Promise<void>;
  saveScheduledImportJob(record: ScheduledImportJobRecord): Promise<void>;
  saveWebhook(record: WebhookRecord): Promise<void>;
  saveWebhookDelivery(record: WebhookDeliveryRecord): Promise<void>;
  saveKnowledgeCheck(record: KnowledgeCheckRecord): Promise<void>;
}

export function createNoopApiDatabaseMirror(): ApiDatabaseMirror {
  return {
    async saveKnowledgeBase() {},
    async updateKnowledgeBase() {},
    async saveSourceDocument() {},
    async updateSourceDocument() {},
    async saveUploadSession() {},
    async updateUploadSession() {},
    async saveDeletionCleanupOperation() {},
    async updateDeletionCleanupOperation() {},
    async saveDeletionCleanupItems() {},
    async updateDeletionCleanupItem() {},
    async saveJob() {},
    async updateJob() {},
    async appendJobEvent() {},
    async saveSourceWatchRule() {},
    async updateSourceWatchRule() {},
    async saveScheduledImportJob() {},
    async saveWebhook() {},
    async saveWebhookDelivery() {},
    async saveKnowledgeCheck() {},
  };
}

export function createPostgresApiDatabaseMirror(
  db: Kysely<DatabaseSchema>,
  identity: DefaultIdentitySeed,
): ApiDatabaseMirror {
  return new PostgresApiDatabaseMirror(db, identity);
}

class PostgresApiDatabaseMirror implements ApiDatabaseMirror {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly identity: DefaultIdentitySeed,
  ) {}

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

  async saveUploadSession(record: UploadSessionRecord): Promise<void> {
    await sql`
      insert into upload_sessions (
        id,
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
        ${JSON.stringify(record.scanResult)}::jsonb,
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
        ${JSON.stringify(record.findings)}::jsonb,
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

function toPostgresTextArray(values: readonly string[]) {
  return values.length === 0 ? sql`array[]::text[]` : sql`array[${sql.join(values)}]::text[]`;
}
