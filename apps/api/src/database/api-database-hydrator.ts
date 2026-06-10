import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "@fococontext/db";
import { normalizeDatasetPromptTemplates } from "@fococontext/llm";

import type {
  DeletionCleanupItemRecord,
  DeletionCleanupItemStatus,
  DeletionCleanupItemType,
  DeletionCleanupOperationRecord,
  DeletionCleanupPhase,
  DeletionCleanupStatus,
  DeletionCleanupTargetType,
} from "../deletion-cleanup/deletion-cleanup.types.js";
import { DeletionCleanupRepository } from "../deletion-cleanup/deletion-cleanup.repository.js";
import type {
  JobEventRecord,
  JobRecord,
  JobStage,
  JobStatus,
  MediaAssetRecord,
  ParsedContentRecord,
  SourceDocumentRecord,
  SourceDocumentStatus,
  SourceVisibilityOrigin,
  SourceType,
  UploadSessionRecord,
  UploadSessionStatus,
} from "../documents/document.types.js";
import { DocumentRepository } from "../documents/document.repository.js";
import { KnowledgeCheckRepository } from "../knowledge-checks/knowledge-check.repository.js";
import type {
  KnowledgeCheckRecord,
  KnowledgeCheckSemanticRun,
  KnowledgeCheckStatus,
  KnowledgeCheckType,
} from "../knowledge-checks/knowledge-check.types.js";
import { KnowledgeBaseRepository } from "../knowledge-bases/knowledge-base.repository.js";
import type {
  DatasetConfigurationRecord,
  DatasetConfigurationStatus,
  DatasetConfigurationValues,
  DatasetOcrPolicy,
  ForkOwnerRecord,
  ForkOwnerType,
  KnowledgeBaseOutputLanguage,
  KnowledgeBaseRecord,
  KnowledgeBaseStatus,
  KnowledgeBaseSyncStatus,
  KnowledgeBaseTemplate,
  KnowledgeBaseType,
  SystemPageRecord,
  SystemPageType,
} from "../knowledge-bases/knowledge-base.types.js";
import { findKnowledgeBaseTemplate } from "../knowledge-bases/knowledge-base.templates.js";
import { SourceWatchRuleRepository } from "../source-watch/source-watch.repository.js";
import type {
  ScheduledImportJobRecord,
  SourceWatchLatestScanResponse,
  SourceWatchRuleSchedule,
  SourceWatchRuleRecord,
  SourceWatchRuleStatus,
  SourceWatchSchedulerStatus,
  SourceWatchScanResultResponse,
  SourceWatchScanStatus,
  SourceWatchScanTriggerType,
  SourceWatchSourceKind,
} from "../source-watch/source-watch.types.js";
import { WebhookRepository } from "../webhooks/webhook.repository.js";
import type {
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookRecord,
  WebhookStatus,
} from "../webhooks/webhook.types.js";

export const apiDatabaseHydratorToken = Symbol("apiDatabaseHydrator");

export interface ApiDatabaseHydrator {
  refresh(): Promise<void>;
  refreshKnowledgeBaseSystemPages?(knowledgeBaseId: string): Promise<void>;
}

export interface ApiDatabaseHydratorRepositories {
  documentRepository: DocumentRepository;
  deletionCleanupRepository: DeletionCleanupRepository;
  knowledgeBaseRepository: KnowledgeBaseRepository;
  knowledgeCheckRepository: KnowledgeCheckRepository;
  sourceWatchRuleRepository: SourceWatchRuleRepository;
  webhookRepository: WebhookRepository;
}

export function createNoopApiDatabaseHydrator(): ApiDatabaseHydrator {
  return {
    async refresh() {},
    async refreshKnowledgeBaseSystemPages() {},
  };
}

export function createPostgresApiDatabaseHydrator(
  db: Kysely<DatabaseSchema>,
  repositories: ApiDatabaseHydratorRepositories,
): ApiDatabaseHydrator {
  return new PostgresApiDatabaseHydrator(db, repositories);
}

class PostgresApiDatabaseHydrator implements ApiDatabaseHydrator {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly repositories: ApiDatabaseHydratorRepositories,
  ) {}

  async refresh(): Promise<void> {
    const [
      knowledgeBases,
      systemPages,
      sourceDocuments,
      uploadSessions,
      jobs,
      jobEvents,
      parsedContents,
      mediaAssets,
      sourceWatchRules,
      scheduledImportJobs,
      webhooks,
      webhookDeliveries,
      knowledgeChecks,
      deletionCleanupOperations,
      deletionCleanupItems,
    ] = await Promise.all([
      this.listKnowledgeBases(),
      this.listSystemPages(),
      this.listSourceDocuments(),
      this.listUploadSessions(),
      this.listJobs(),
      this.listJobEvents(),
      this.listParsedContents(),
      this.listMediaAssets(),
      this.listSourceWatchRules(),
      this.listScheduledImportJobs(),
      this.listWebhooks(),
      this.listWebhookDeliveries(),
      this.listKnowledgeChecks(),
      this.listDeletionCleanupOperations(),
      this.listDeletionCleanupItems(),
    ]);

    this.repositories.knowledgeBaseRepository.replaceAll(
      knowledgeBases.map((record) => ({
        ...record,
        systemPages: systemPages.filter((page) => page.knowledgeBaseId === record.id),
      })),
    );
    this.repositories.documentRepository.replaceKnowledgeBaseScopes(
      knowledgeBases.map((record) => ({
        knowledgeBaseId: record.id,
        knowledgeBaseType: record.knowledgeBaseType,
        upstreamKnowledgeBaseId: record.upstreamKnowledgeBaseId,
        upstreamSyncedVersionId: record.upstreamSyncedVersionId,
      })),
    );
    this.repositories.documentRepository.replaceSnapshot({
      documents: sourceDocuments,
      uploadSessions,
      jobs,
      jobEvents,
      parsedContents,
      mediaAssets,
    });
    this.repositories.sourceWatchRuleRepository.replaceSnapshot({
      rules: sourceWatchRules,
      scheduledImportJobs,
    });
    this.repositories.webhookRepository.replaceSnapshot({
      webhooks,
      deliveries: webhookDeliveries,
    });
    this.repositories.knowledgeCheckRepository.replaceAll(knowledgeChecks);
    this.repositories.deletionCleanupRepository.replaceSnapshot({
      operations: deletionCleanupOperations,
      items: deletionCleanupItems,
    });
  }

  async refreshKnowledgeBaseSystemPages(knowledgeBaseId: string): Promise<void> {
    const record = this.repositories.knowledgeBaseRepository.findById(knowledgeBaseId);

    if (record === undefined) {
      await this.refresh();
      return;
    }

    const systemPages = await this.listSystemPagesForKnowledgeBase(knowledgeBaseId);

    this.repositories.knowledgeBaseRepository.update({
      ...record,
      systemPages,
    });
  }

  private async listKnowledgeBases(): Promise<KnowledgeBaseRecord[]> {
    const result = await sql<KnowledgeBaseRow>`
      select
        knowledge_bases.id,
        knowledge_bases.tenant_id,
        knowledge_bases.project_id,
        knowledge_bases.name,
        knowledge_bases.slug,
        knowledge_bases.description,
        knowledge_bases.knowledge_base_type,
        knowledge_bases.upstream_knowledge_base_id,
        knowledge_bases.upstream_base_version_id,
        knowledge_bases.upstream_synced_version_id,
        knowledge_bases.fork_owner_type,
        knowledge_bases.fork_owner_external_id,
        knowledge_bases.fork_owner_display_name,
        knowledge_bases.sync_status,
        knowledge_bases.template,
        knowledge_bases.output_language,
        knowledge_bases.status,
        knowledge_bases.current_version_id,
        knowledge_bases.created_at,
        knowledge_bases.updated_at,
        knowledge_bases.deleted_at,
        knowledge_base_settings.purpose,
        knowledge_base_settings.wiki_schema,
        knowledge_base_settings.retrieval_settings,
        knowledge_base_dataset_configurations.id as dataset_configuration_id,
        knowledge_base_dataset_configurations.preset_id as dataset_configuration_preset_id,
        knowledge_base_dataset_configurations.status as dataset_configuration_status,
        knowledge_base_dataset_configurations.version as dataset_configuration_version,
        knowledge_base_dataset_configurations.values as dataset_configuration_values,
        knowledge_base_dataset_configurations.latest_snapshot_id as dataset_configuration_latest_snapshot_id,
        knowledge_base_dataset_configurations.updated_by as dataset_configuration_updated_by,
        knowledge_base_dataset_configurations.metadata as dataset_configuration_metadata,
        knowledge_base_dataset_configurations.created_at as dataset_configuration_created_at,
        knowledge_base_dataset_configurations.updated_at as dataset_configuration_updated_at
      from knowledge_bases
      left join knowledge_base_settings
        on knowledge_base_settings.knowledge_base_id = knowledge_bases.id
      left join knowledge_base_dataset_configurations
        on knowledge_base_dataset_configurations.knowledge_base_id = knowledge_bases.id
      order by knowledge_bases.created_at asc
    `.execute(this.db);

    return result.rows.map((row) => {
      const template = row.template as KnowledgeBaseTemplate;
      const outputLanguage = row.output_language as KnowledgeBaseOutputLanguage;
      const purpose = readPurposeText(row.purpose);
      const schema = normalizeJsonObject(row.wiki_schema);
      const retrieval = normalizeJsonObject(row.retrieval_settings);

      return {
        id: row.id,
        tenantId: row.tenant_id,
        projectId: row.project_id,
        name: row.name,
        slug: row.slug,
        ...(row.description === null ? {} : { description: row.description }),
        knowledgeBaseType: readKnowledgeBaseType(row.knowledge_base_type),
        upstreamKnowledgeBaseId: row.upstream_knowledge_base_id,
        upstreamBaseVersionId: row.upstream_base_version_id,
        upstreamSyncedVersionId: row.upstream_synced_version_id,
        forkOwner: readForkOwner(row),
        syncStatus: readSyncStatus(row.sync_status),
        template,
        outputLanguage,
        status: row.deleted_at === null ? (row.status as KnowledgeBaseStatus) : "deleted",
        currentVersionId: row.current_version_id ?? "",
        purpose,
        schema,
        retrieval,
        datasetConfiguration: readDatasetConfiguration(row, {
          knowledgeBaseId: row.id,
          template,
          purpose,
          schema,
          retrieval,
          outputLanguage,
          timestamp: normalizeTimestamp(row.updated_at),
        }),
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
        ...(row.deleted_at === null ? {} : { deletedAt: normalizeTimestamp(row.deleted_at) }),
        systemPages: [],
      };
    });
  }

  private async listSystemPages(): Promise<SystemPageRecord[]> {
    const result = await sql<SystemPageRow>`
      select id, knowledge_base_id, system_key, title, markdown, created_at, updated_at
      from system_pages
      order by knowledge_base_id asc, ${systemPageOrderSqlFragment()}, created_at asc
    `.execute(this.db);

    return result.rows.map(toSystemPageRecord);
  }

  private async listSystemPagesForKnowledgeBase(
    knowledgeBaseId: string,
  ): Promise<SystemPageRecord[]> {
    const result = await sql<SystemPageRow>`
      select id, knowledge_base_id, system_key, title, markdown, created_at, updated_at
      from system_pages
      where knowledge_base_id = ${knowledgeBaseId}
      order by ${systemPageOrderSqlFragment()}, created_at asc
    `.execute(this.db);

    return result.rows.map(toSystemPageRecord);
  }

  private async listSourceDocuments(): Promise<SourceDocumentRecord[]> {
    const result = await sql<SourceDocumentRow>`
      select
        id,
        knowledge_base_id,
        source_type,
        name,
        status,
        content_hash,
        object_key,
        mime_type,
        size_bytes::bigint as size_bytes,
        metadata,
        ocr_status,
        ocr_summary,
        visibility_origin,
        owner_knowledge_base_id,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        updated_at
      from source_documents
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => {
      const metadata = normalizeJsonObject(row.metadata);

      return {
        id: row.id,
        knowledgeBaseId: row.knowledge_base_id,
        name: row.name,
        displayName: readString(metadata.display_name) ?? row.name,
        sourceType: row.source_type as SourceType,
        mimeType: row.mime_type ?? "application/octet-stream",
        size: Number(row.size_bytes ?? 0),
        contentHash: row.content_hash ?? "",
        objectKey: row.object_key ?? "",
        status: row.status as SourceDocumentStatus,
        ...(readString(metadata.source_path) === null
          ? {}
          : { sourcePath: readString(metadata.source_path) as string }),
        ...(readString(metadata.source_url) === null
          ? {}
          : { sourceUrl: readString(metadata.source_url) as string }),
        ...(row.ocr_status === null ? {} : { ocrStatus: row.ocr_status }),
        ocrSummary: normalizeJsonObject(row.ocr_summary),
        metadata,
        visibilityOrigin: readSourceVisibilityOrigin(row.visibility_origin),
        ownerKnowledgeBaseId: row.owner_knowledge_base_id,
        upstreamResourceId: row.upstream_resource_id,
        forkTombstonedAt: normalizeNullableTimestamp(row.fork_tombstoned_at),
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
      };
    });
  }

  private async listUploadSessions(): Promise<UploadSessionRecord[]> {
    const result = await sql<UploadSessionRow>`
      select
        id,
        knowledge_base_id,
        document_id,
        object_key,
        file_name,
        display_name,
        mime_type,
        size_bytes::bigint as size_bytes,
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
      from upload_sessions
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      knowledgeBaseId: row.knowledge_base_id,
      documentId: row.document_id,
      objectKey: row.object_key,
      fileName: row.file_name,
      displayName: row.display_name,
      mimeType: row.mime_type,
      size: Number(row.size_bytes),
      contentHash: row.content_hash,
      ...(row.source_path === null ? {} : { sourcePath: row.source_path }),
      metadata: normalizeJsonObject(row.metadata),
      status: row.status as UploadSessionStatus,
      idempotencyKey: row.idempotency_key,
      finalizeIdempotencyKey: row.finalize_idempotency_key,
      finalizedDocumentId: row.finalized_document_id,
      finalizedJobId: row.finalized_job_id,
      cleanupOperationId: row.cleanup_operation_id,
      expiresAt: normalizeTimestamp(row.expires_at),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));
  }

  private async listJobs(): Promise<JobRecord[]> {
    const result = await sql<JobRow>`
      select
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
      from jobs
      order by queued_at asc
    `.execute(this.db);

    return result.rows.map((row) => {
      const metadata = normalizeJsonObject(row.metadata);
      const result = normalizeJsonObject(row.result);

      return {
        id: row.id,
        knowledgeBaseId: row.knowledge_base_id ?? "",
        documentId: row.source_document_id,
        jobType: row.job_type,
        stage: (row.stage ?? "parsing") as JobStage,
        status: row.status as JobStatus,
        progress: row.progress,
        progressMessage: row.progress_message ?? "",
        contentHash: row.dedupe_key ?? readString(metadata.content_hash) ?? "",
        idempotencyKey: row.idempotency_key,
        deduped: readBoolean(metadata.deduped) ?? false,
        lockedByKnowledgeBaseId: readString(metadata.locked_by_knowledge_base_id),
        inputSnapshotId: readString(metadata.input_snapshot_id) ?? row.id,
        retryOfJobId: readString(metadata.retry_of_job_id),
        parsedContentId: readString(result.parsed_content_id),
        changeSetId: readString(result.change_set_id),
        error: row.error === null ? null : normalizeJsonObject(row.error),
        createdAt: normalizeTimestamp(row.queued_at),
        updatedAt: normalizeTimestamp(row.updated_at),
      };
    });
  }

  private async listJobEvents(): Promise<JobEventRecord[]> {
    const result = await sql<JobEventRow>`
      select job_id, event_type, message, metadata, created_at
      from job_events
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => {
      const metadata = normalizeJsonObject(row.metadata);

      return {
        jobId: row.job_id,
        type: row.event_type as JobEventRecord["type"],
        stage: (readString(metadata.stage) ?? "parsing") as JobStage,
        status: (readString(metadata.status) ?? "queued") as JobStatus,
        message: row.message ?? "",
        metadata,
        createdAt: normalizeTimestamp(row.created_at),
      };
    });
  }

  private async listParsedContents(): Promise<ParsedContentRecord[]> {
    const result = await sql<ParsedContentRow>`
      select
        id,
        source_document_id,
        parser_name,
        parser_version,
        normalized_markdown_object_key,
        captioned_markdown_object_key,
        markdown_preview,
        markdown_preview_object_key,
        markdown_preview_truncated,
        plain_text_object_key,
        locators,
        tables,
        warnings,
        ocr_status,
        ocr_summary,
        ocr_warnings,
        ocr_provider_metadata,
        ocr_page_count,
        ocr_block_count,
        ocr_derived_segment_count,
        ocr_completed_at,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ocr_blocks.id,
              'page_number', ocr_blocks.page_number,
              'block_index', ocr_blocks.block_index,
              'text', ocr_blocks.text,
              'confidence', ocr_blocks.confidence,
              'bbox', ocr_blocks.bbox,
              'language', ocr_blocks.language,
              'provider', ocr_blocks.provider_name,
              'engine', ocr_blocks.engine,
              'model_version', ocr_blocks.model_version,
              'locator', ocr_blocks.locator,
              'source_artifact_id', ocr_blocks.source_artifact_id,
              'created_at', ocr_blocks.created_at
            )
            order by ocr_blocks.page_number asc, ocr_blocks.block_index asc
          )
          from ocr_blocks
          where ocr_blocks.parsed_content_id = parsed_contents.id
        ), '[]'::jsonb) as ocr_blocks,
        error,
        created_at
      from parsed_contents
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.source_document_id,
      parserName: row.parser_name,
      parserVersion: row.parser_version,
      normalizedMarkdownObjectKey: row.normalized_markdown_object_key,
      ...(row.captioned_markdown_object_key === null
        ? {}
        : { captionedMarkdownObjectKey: row.captioned_markdown_object_key }),
      ...(row.markdown_preview === null ? {} : { markdownPreview: row.markdown_preview }),
      ...(row.markdown_preview_object_key === null
        ? {}
        : { markdownPreviewObjectKey: row.markdown_preview_object_key }),
      markdownPreviewTruncated: row.markdown_preview_truncated,
      ...(row.plain_text_object_key === null
        ? {}
        : { plainTextObjectKey: row.plain_text_object_key }),
      locators: normalizeJsonArray(row.locators),
      tables: normalizeJsonArray(row.tables),
      warnings: normalizeJsonArray(row.warnings),
      ocrStatus: row.ocr_status ?? "not_required",
      ocrSummary: normalizeJsonObject(row.ocr_summary),
      ocrWarnings: normalizeJsonArray(row.ocr_warnings),
      ocrProviderMetadata: normalizeJsonObject(row.ocr_provider_metadata),
      ocrPageCount: row.ocr_page_count,
      ocrBlockCount: row.ocr_block_count,
      ocrDerivedSegmentCount: row.ocr_derived_segment_count,
      ocrCompletedAt:
        row.ocr_completed_at === null ? null : normalizeTimestamp(row.ocr_completed_at),
      ocrBlocks: normalizeJsonArray(row.ocr_blocks),
      error: row.error === null ? null : normalizeJsonObject(row.error),
      createdAt: normalizeTimestamp(row.created_at),
    }));
  }

  private async listMediaAssets(): Promise<MediaAssetRecord[]> {
    const result = await sql<MediaAssetRow>`
      select
        id,
        source_document_id,
        parsed_content_id,
        mime_type,
        object_key,
        hash,
        locator,
        width,
        height,
        caption_status,
        caption,
        caption_provider_name,
        caption_model,
        caption_prompt_version,
        caption_model_call_id,
        caption_cache_hit,
        caption_attempt_count,
        caption_error,
        caption_generated_at,
        updated_at,
        created_at
      from media_assets
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.source_document_id,
      parsedContentId: row.parsed_content_id,
      mimeType: row.mime_type,
      locator: normalizeJsonObject(row.locator),
      width: row.width,
      height: row.height,
      objectKey: row.object_key,
      sha256: row.hash ?? "",
      captionStatus: row.caption_status as MediaAssetRecord["captionStatus"],
      caption: row.caption,
      captionProviderName: row.caption_provider_name,
      captionModel: row.caption_model,
      captionPromptVersion: row.caption_prompt_version,
      captionModelCallId: row.caption_model_call_id,
      captionCacheHit: row.caption_cache_hit,
      captionAttemptCount: row.caption_attempt_count,
      captionError: row.caption_error === null ? null : normalizeJsonObject(row.caption_error),
      captionGeneratedAt:
        row.caption_generated_at === null ? null : normalizeTimestamp(row.caption_generated_at),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));
  }

  private async listSourceWatchRules(): Promise<SourceWatchRuleRecord[]> {
    const result = await sql<SourceWatchRuleRow>`
      select
        id,
        knowledge_base_id,
        name,
        source_type,
        location,
        auto_ingest_enabled,
        include_patterns,
        exclude_patterns,
        status,
        schedule,
        metadata,
        created_at,
        updated_at
      from source_watch_rules
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => {
      const metadata = normalizeJsonObject(row.metadata);

      return {
        id: row.id,
        knowledgeBaseId: row.knowledge_base_id,
        name: row.name,
        sourceKind: row.source_type as SourceWatchSourceKind,
        location: row.location,
        credentialProfile: readString(metadata.credential_profile),
        adapterOptions: normalizeJsonObject(metadata.adapter_options),
        includeExtensions: normalizeStringArray(row.include_patterns),
        excludeDirs: normalizeStringArray(metadata.exclude_dirs),
        excludeGlobs: normalizeStringArray(row.exclude_patterns),
        maxFileSizeMb: readNumber(metadata.max_file_size_mb),
        autoIngest: row.auto_ingest_enabled,
        status: row.status as SourceWatchRuleStatus,
        schedule: readSourceWatchSchedule(row.schedule),
        latestScan: readLatestScan(metadata.latest_scan),
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
      };
    });
  }

  private async listScheduledImportJobs(): Promise<ScheduledImportJobRecord[]> {
    const result = await sql<ScheduledImportJobRow>`
      select
        id,
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
      from scheduled_import_jobs
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      sourceWatchRuleId: row.source_watch_rule_id ?? "",
      knowledgeBaseId: row.knowledge_base_id,
      status: row.status as SourceWatchScanStatus,
      triggerType: row.trigger_type as SourceWatchScanTriggerType,
      scanResult: readSourceWatchScanResult(row.scan_result),
      startedAt: normalizeTimestamp(row.started_at ?? row.created_at),
      finishedAt: row.finished_at === null ? null : normalizeTimestamp(row.finished_at),
      durationMs: readNumber(row.duration_ms) ?? null,
      retryCount: readNumber(row.retry_count) ?? 0,
      retryable: readBoolean(row.retryable) ?? false,
      nextRetryAt: row.next_retry_at === null ? null : normalizeTimestamp(row.next_retry_at),
      error: normalizeNullableJsonObject(row.error),
      scheduledFor: row.scheduled_for === null ? null : normalizeTimestamp(row.scheduled_for),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));
  }

  private async listWebhooks(): Promise<WebhookRecord[]> {
    const result = await sql<WebhookRow>`
      select
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        target_url,
        event_types,
        status,
        secret_configured,
        secret_ciphertext,
        created_at,
        updated_at
      from webhooks
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      projectId: row.project_id,
      knowledgeBaseId: row.knowledge_base_id,
      url: row.target_url,
      events: normalizeStringArray(row.event_types) as WebhookRecord["events"],
      status: row.status as WebhookStatus,
      secretConfigured: row.secret_configured,
      secret: row.secret_ciphertext,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));
  }

  private async listWebhookDeliveries(): Promise<WebhookDeliveryRecord[]> {
    const result = await sql<WebhookDeliveryRow>`
      select
        id,
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
      from webhook_deliveries
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      webhookId: row.webhook_id ?? "",
      knowledgeBaseId: row.knowledge_base_id,
      eventType: row.event_type as WebhookDeliveryRecord["eventType"],
      payload: normalizeJsonObject(row.payload),
      status: row.status as WebhookDeliveryStatus,
      requestTrace: normalizeJsonObject(row.request_trace),
      responseStatus: row.response_status,
      responseBody: row.response_body,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at === null ? null : normalizeTimestamp(row.next_attempt_at),
      lastAttemptAt: row.last_attempt_at === null ? null : normalizeTimestamp(row.last_attempt_at),
      signing: readWebhookDeliverySigning(row.signing),
      createdAt: normalizeTimestamp(row.created_at),
      deliveredAt: row.delivered_at === null ? null : normalizeTimestamp(row.delivered_at),
    }));
  }

  private async listKnowledgeChecks(): Promise<KnowledgeCheckRecord[]> {
    const result = await sql<KnowledgeCheckRow>`
      select
        id,
        knowledge_base_id,
        status,
        progress,
        findings,
        metadata,
        created_at,
        updated_at
      from knowledge_checks
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => {
      const metadata = normalizeJsonObject(row.metadata);

      return {
        id: row.id,
        knowledgeBaseId: row.knowledge_base_id,
        status: row.status as KnowledgeCheckStatus,
        progress: row.progress,
        checks: normalizeStringArray(metadata.checks) as KnowledgeCheckType[],
        configurationSnapshot: normalizeJsonObject(metadata.configuration_snapshot),
        pageIds: normalizeStringArray(metadata.page_ids),
        sourceDocumentIds: normalizeStringArray(metadata.source_document_ids),
        findings: normalizeJsonArray(row.findings) as unknown as KnowledgeCheckRecord["findings"],
        semanticRun: normalizeKnowledgeCheckSemanticRun(metadata.semantic_run),
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
      };
    });
  }

  private async listDeletionCleanupOperations(): Promise<DeletionCleanupOperationRecord[]> {
    const result = await sql<DeletionCleanupOperationRow>`
      select
        id,
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
      from deletion_cleanup_operations
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      targetType: row.target_type as DeletionCleanupTargetType,
      targetId: row.target_id,
      knowledgeBaseId: row.knowledge_base_id,
      status: row.status as DeletionCleanupStatus,
      phase: row.phase as DeletionCleanupPhase,
      requestedBy: row.requested_by,
      requestId: row.request_id,
      queueJobId: row.queue_job_id,
      manifest: normalizeJsonObject(row.manifest),
      totalItemCount: row.total_item_count,
      pendingItemCount: row.pending_item_count,
      deletedItemCount: row.deleted_item_count,
      skippedItemCount: row.skipped_item_count,
      failedItemCount: row.failed_item_count,
      objectKeyCount: row.object_key_count,
      databaseRowCount: row.database_row_count,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      retryAfter: normalizeNullableTimestamp(row.retry_after),
      retryable: row.retryable,
      lastError: row.last_error === null ? null : normalizeJsonObject(row.last_error),
      retentionExpiresAt: normalizeNullableTimestamp(row.retention_expires_at),
      itemRetentionExpiresAt: normalizeNullableTimestamp(row.item_retention_expires_at),
      startedAt: normalizeNullableTimestamp(row.started_at),
      completedAt: normalizeNullableTimestamp(row.completed_at),
      failedAt: normalizeNullableTimestamp(row.failed_at),
      canceledAt: normalizeNullableTimestamp(row.canceled_at),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    }));
  }

  private async listDeletionCleanupItems(): Promise<DeletionCleanupItemRecord[]> {
    const result = await sql<DeletionCleanupItemRow>`
      select
        id,
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
      from deletion_cleanup_items
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      operationId: row.operation_id,
      itemType: row.item_type as DeletionCleanupItemType,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      objectKey: row.object_key,
      tableName: row.table_name,
      knowledgeBaseId: row.knowledge_base_id,
      sourceDocumentId: row.source_document_id,
      status: row.status as DeletionCleanupItemStatus,
      phase: row.phase as DeletionCleanupPhase,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lastError: row.last_error === null ? null : normalizeJsonObject(row.last_error),
      skipReason: row.skip_reason,
      retryAfter: normalizeNullableTimestamp(row.retry_after),
      retainedUntil: normalizeNullableTimestamp(row.retained_until),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
      completedAt: normalizeNullableTimestamp(row.completed_at),
    }));
  }
}

interface KnowledgeBaseRow {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  knowledge_base_type: string | null;
  upstream_knowledge_base_id: string | null;
  upstream_base_version_id: string | null;
  upstream_synced_version_id: string | null;
  fork_owner_type: string | null;
  fork_owner_external_id: string | null;
  fork_owner_display_name: string | null;
  sync_status: string | null;
  template: string;
  output_language: string;
  status: string;
  current_version_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  purpose: unknown;
  wiki_schema: unknown;
  retrieval_settings: unknown;
  dataset_configuration_id: string | null;
  dataset_configuration_preset_id: string | null;
  dataset_configuration_status: string | null;
  dataset_configuration_version: number | null;
  dataset_configuration_values: unknown;
  dataset_configuration_latest_snapshot_id: string | null;
  dataset_configuration_updated_by: string | null;
  dataset_configuration_metadata: unknown;
  dataset_configuration_created_at: Date | string | null;
  dataset_configuration_updated_at: Date | string | null;
}

interface SystemPageRow {
  id: string;
  knowledge_base_id: string;
  system_key: string;
  title: string;
  markdown: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function toSystemPageRecord(row: SystemPageRow): SystemPageRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    type: row.system_key as SystemPageType,
    title: row.title,
    markdown: row.markdown,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function systemPageOrderSqlFragment() {
  return sql`
    case system_key
      when 'index' then 1
      when 'overview' then 2
      when 'log' then 3
      when 'purpose' then 4
      when 'schema' then 5
      else 100
    end
  `;
}

interface SourceDocumentRow {
  id: string;
  knowledge_base_id: string;
  source_type: string;
  name: string;
  status: string;
  content_hash: string | null;
  object_key: string | null;
  mime_type: string | null;
  size_bytes: bigint | number | string | null;
  metadata: unknown;
  ocr_status: string | null;
  ocr_summary: unknown;
  visibility_origin: string | null;
  owner_knowledge_base_id: string | null;
  upstream_resource_id: string | null;
  fork_tombstoned_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface UploadSessionRow {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  object_key: string;
  file_name: string;
  display_name: string;
  mime_type: string;
  size_bytes: bigint | number | string;
  content_hash: string | null;
  source_path: string | null;
  metadata: unknown;
  status: string;
  idempotency_key: string | null;
  finalize_idempotency_key: string | null;
  finalized_document_id: string | null;
  finalized_job_id: string | null;
  cleanup_operation_id: string | null;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface JobRow {
  id: string;
  knowledge_base_id: string | null;
  source_document_id: string | null;
  job_type: string;
  status: string;
  stage: string | null;
  progress: number;
  progress_message: string | null;
  idempotency_key: string | null;
  dedupe_key: string | null;
  result: unknown;
  error: unknown;
  metadata: unknown;
  queued_at: Date | string;
  updated_at: Date | string;
}

interface JobEventRow {
  job_id: string;
  event_type: string;
  message: string | null;
  metadata: unknown;
  created_at: Date | string;
}

interface ParsedContentRow {
  id: string;
  source_document_id: string;
  parser_name: string;
  parser_version: string;
  normalized_markdown_object_key: string;
  captioned_markdown_object_key: string | null;
  markdown_preview: string | null;
  markdown_preview_object_key: string | null;
  markdown_preview_truncated: boolean;
  plain_text_object_key: string | null;
  locators: unknown;
  tables: unknown;
  warnings: unknown;
  ocr_status: string | null;
  ocr_summary: unknown;
  ocr_warnings: unknown;
  ocr_provider_metadata: unknown;
  ocr_page_count: number;
  ocr_block_count: number;
  ocr_derived_segment_count: number;
  ocr_completed_at: Date | string | null;
  ocr_blocks: unknown;
  error: unknown;
  created_at: Date | string;
}

interface MediaAssetRow {
  id: string;
  source_document_id: string;
  parsed_content_id: string | null;
  mime_type: string;
  object_key: string;
  hash: string | null;
  locator: unknown;
  width: number | null;
  height: number | null;
  caption_status: string;
  caption: string | null;
  caption_provider_name: string | null;
  caption_model: string | null;
  caption_prompt_version: string | null;
  caption_model_call_id: string | null;
  caption_cache_hit: boolean;
  caption_attempt_count: number;
  caption_error: unknown;
  caption_generated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SourceWatchRuleRow {
  id: string;
  knowledge_base_id: string;
  name: string;
  source_type: string;
  location: string;
  auto_ingest_enabled: boolean;
  include_patterns: string[] | null;
  exclude_patterns: string[] | null;
  status: string;
  schedule: unknown;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ScheduledImportJobRow {
  id: string;
  source_watch_rule_id: string | null;
  knowledge_base_id: string;
  status: string;
  trigger_type: string;
  scan_result: unknown;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  duration_ms: number | null;
  retry_count: number | null;
  retryable: boolean | null;
  next_retry_at: Date | string | null;
  error: unknown;
  scheduled_for: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface WebhookRow {
  id: string;
  tenant_id: string;
  project_id: string;
  knowledge_base_id: string | null;
  target_url: string;
  event_types: string[] | null;
  status: string;
  secret_configured: boolean;
  secret_ciphertext: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface WebhookDeliveryRow {
  id: string;
  webhook_id: string | null;
  knowledge_base_id: string | null;
  event_type: string;
  payload: unknown;
  status: string;
  request_trace: unknown;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date | string | null;
  last_attempt_at: Date | string | null;
  signing: unknown;
  created_at: Date | string;
  delivered_at: Date | string | null;
}

interface KnowledgeCheckRow {
  id: string;
  knowledge_base_id: string;
  status: string;
  progress: number;
  findings: unknown;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DeletionCleanupOperationRow {
  id: string;
  target_type: string;
  target_id: string;
  knowledge_base_id: string | null;
  status: string;
  phase: string;
  requested_by: string | null;
  request_id: string | null;
  queue_job_id: string | null;
  manifest: unknown;
  total_item_count: number;
  pending_item_count: number;
  deleted_item_count: number;
  skipped_item_count: number;
  failed_item_count: number;
  object_key_count: number;
  database_row_count: number;
  attempt_count: number;
  max_attempts: number;
  retry_after: Date | string | null;
  retryable: boolean;
  last_error: unknown;
  retention_expires_at: Date | string | null;
  item_retention_expires_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  failed_at: Date | string | null;
  canceled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DeletionCleanupItemRow {
  id: string;
  operation_id: string;
  item_type: string;
  resource_type: string | null;
  resource_id: string | null;
  object_key: string | null;
  table_name: string | null;
  knowledge_base_id: string | null;
  source_document_id: string | null;
  status: string;
  phase: string;
  attempt_count: number;
  max_attempts: number;
  last_error: unknown;
  skip_reason: string | null;
  retry_after: Date | string | null;
  retained_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

function readPurposeText(value: unknown): string {
  const normalized = normalizeJsonObject(value);

  return readString(normalized.text) ?? "";
}

function readKnowledgeBaseType(value: string | null): KnowledgeBaseType {
  return value === "fork" ? "fork" : "canonical";
}

function readSyncStatus(value: string | null): KnowledgeBaseSyncStatus {
  if (value === "synced" || value === "outdated" || value === "syncing" || value === "failed") {
    return value;
  }

  return "not_applicable";
}

function readSourceVisibilityOrigin(value: string | null): SourceVisibilityOrigin {
  if (value === "canonical" || value === "upstream_inherited" || value === "fork_owned") {
    return value;
  }

  return "canonical";
}

function readForkOwner(row: KnowledgeBaseRow): ForkOwnerRecord | null {
  if (row.fork_owner_type === null || row.fork_owner_external_id === null) {
    return null;
  }

  return {
    ownerType: readForkOwnerType(row.fork_owner_type),
    externalOwnerId: row.fork_owner_external_id,
    displayName: row.fork_owner_display_name,
  };
}

function readForkOwnerType(value: string): ForkOwnerType {
  if (value === "workspace" || value === "customer" || value === "session" || value === "custom") {
    return value;
  }

  return "user";
}

function readDatasetConfiguration(
  row: KnowledgeBaseRow,
  fallback: {
    knowledgeBaseId: string;
    template: KnowledgeBaseTemplate;
    purpose: string;
    schema: Record<string, unknown>;
    retrieval: Record<string, unknown>;
    outputLanguage: KnowledgeBaseOutputLanguage;
    timestamp: string;
  },
): DatasetConfigurationRecord {
  if (row.dataset_configuration_id !== null) {
    const presetId = readPresetId(row.dataset_configuration_preset_id, fallback.template);

    return {
      id: row.dataset_configuration_id,
      knowledgeBaseId: fallback.knowledgeBaseId,
      presetId,
      status: readDatasetConfigurationStatus(row.dataset_configuration_status),
      version: row.dataset_configuration_version ?? 1,
      values: normalizeDatasetConfigurationValues(
        row.dataset_configuration_values,
        fallback,
        presetId,
      ),
      latestSnapshotId:
        row.dataset_configuration_latest_snapshot_id ??
        `${fallback.knowledgeBaseId}:dataset_configuration_snapshot:1`,
      createdAt: normalizeTimestamp(row.dataset_configuration_created_at ?? fallback.timestamp),
      updatedAt: normalizeTimestamp(row.dataset_configuration_updated_at ?? fallback.timestamp),
      updatedBy: row.dataset_configuration_updated_by,
      metadata: normalizeJsonObject(row.dataset_configuration_metadata),
    };
  }

  return {
    id: `${fallback.knowledgeBaseId}:dataset_configuration`,
    knowledgeBaseId: fallback.knowledgeBaseId,
    presetId: fallback.template,
    status: "active",
    version: 1,
    values: normalizeDatasetConfigurationValues(null, fallback, fallback.template),
    latestSnapshotId: `${fallback.knowledgeBaseId}:dataset_configuration_snapshot:1`,
    createdAt: fallback.timestamp,
    updatedAt: fallback.timestamp,
    updatedBy: null,
    metadata: {
      backfill_status: "active_backfill",
    },
  };
}

function normalizeDatasetConfigurationValues(
  value: unknown,
  fallback: {
    purpose: string;
    schema: Record<string, unknown>;
    retrieval: Record<string, unknown>;
    outputLanguage: KnowledgeBaseOutputLanguage;
  },
  presetId: KnowledgeBaseTemplate,
): DatasetConfigurationValues {
  const record = normalizeJsonObject(value);
  const templateConfig = findKnowledgeBaseTemplate(presetId)?.dataset_configuration;

  return {
    purpose: readString(record.purpose) ?? fallback.purpose,
    schema: normalizeJsonObject(record.schema ?? fallback.schema),
    markdown_contract: normalizeJsonObject(
      record.markdown_contract ?? templateConfig?.markdown_contract,
    ),
    output_language:
      readOutputLanguage(record.output_language) ??
      templateConfig?.output_language ??
      fallback.outputLanguage,
    retrieval: normalizeJsonObject(record.retrieval ?? fallback.retrieval),
    source_lifecycle: normalizeJsonObject(
      record.source_lifecycle ?? templateConfig?.source_lifecycle,
    ),
    knowledge_check: normalizeJsonObject(record.knowledge_check ?? templateConfig?.knowledge_check),
    source_watch: normalizeJsonObject(record.source_watch ?? templateConfig?.source_watch),
    ocr_policy: normalizeJsonObject(
      record.ocr_policy ?? templateConfig?.ocr_policy,
    ) as DatasetOcrPolicy,
    prompt_templates: normalizeDatasetPromptTemplates(
      record.prompt_templates ?? templateConfig?.prompt_templates,
    ),
  };
}

function readPresetId(
  value: string | null,
  fallback: KnowledgeBaseTemplate,
): KnowledgeBaseTemplate {
  if (value === "general" || value === "research" || value === "team_knowledge") {
    return value;
  }

  return fallback;
}

function readDatasetConfigurationStatus(value: string | null): DatasetConfigurationStatus {
  if (value === "active") {
    return value;
  }

  return "active";
}

function readOutputLanguage(value: unknown): KnowledgeBaseOutputLanguage | null {
  if (value === "auto" || value === "zh-CN" || value === "en-US") {
    return value;
  }

  return null;
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeNullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeKnowledgeCheckSemanticRun(value: unknown): KnowledgeCheckSemanticRun {
  const record = normalizeJsonObject(value);
  const status =
    record.status === "completed" ||
    record.status === "partial" ||
    record.status === "failed" ||
    record.status === "skipped"
      ? record.status
      : "skipped";

  return {
    ...(typeof record.failure_reason === "string" ? { failure_reason: record.failure_reason } : {}),
    findings_count: readNumber(record.findings_count) ?? 0,
    ...(typeof record.model === "string" ? { model: record.model } : {}),
    ...(typeof record.model_call_id === "string" ? { model_call_id: record.model_call_id } : {}),
    ...(record.output_status === "succeeded" || record.output_status === "failed"
      ? { output_status: record.output_status }
      : {}),
    ...(typeof record.prompt_version_id === "string"
      ? { prompt_version_id: record.prompt_version_id }
      : {}),
    ...(typeof record.provider_name === "string" ? { provider_name: record.provider_name } : {}),
    repair_attempts: readNumber(record.repair_attempts) ?? 0,
    status,
    ...(typeof record.trace === "object" && record.trace !== null && !Array.isArray(record.trace)
      ? { trace: record.trace as Record<string, unknown> }
      : {}),
    ...(typeof record.usage === "object" && record.usage !== null && !Array.isArray(record.usage)
      ? { usage: record.usage as NonNullable<KnowledgeCheckSemanticRun["usage"]> }
      : {}),
  };
}

function readWebhookDeliverySigning(value: unknown): WebhookDeliveryRecord["signing"] {
  const record = normalizeJsonObject(value);
  const algorithm = record.algorithm === "hmac-sha256" ? "hmac-sha256" : null;
  const contentDigest =
    typeof record.contentDigest === "string"
      ? record.contentDigest
      : typeof record.content_digest === "string"
        ? record.content_digest
        : null;

  return {
    algorithm,
    contentDigest,
    secretConfigured: record.secretConfigured === true || record.secret_configured === true,
  };
}

function normalizeJsonArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function normalizeNullableJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeJsonObject(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLatestScan(value: unknown): SourceWatchLatestScanResponse | null {
  const record = normalizeJsonObject(value);
  const scheduledImportJobId = readString(record.scheduled_import_job_id);
  const status = readString(record.status);
  const scannedAt = readString(record.scanned_at);

  if (scheduledImportJobId === null || status === null || scannedAt === null) {
    return null;
  }

  return {
    scheduled_import_job_id: scheduledImportJobId,
    status: status as SourceWatchScanStatus,
    scanned_at: scannedAt,
    new_source_count: readNumber(record.new_source_count) ?? 0,
    changed_source_count: readNumber(record.changed_source_count) ?? 0,
    delete_candidate_count: readNumber(record.delete_candidate_count) ?? 0,
    skipped_count: readNumber(record.skipped_count) ?? 0,
  };
}

function readSourceWatchSchedule(value: unknown): SourceWatchRuleSchedule {
  const record = normalizeJsonObject(value);
  const enabled = readBoolean(record.enabled) ?? false;
  const intervalSeconds = readNumber(record.interval_seconds);
  const schedulerStatus = readString(record.scheduler_status);
  const lastStatus = readString(record.last_status);

  return {
    enabled,
    intervalSeconds,
    cron: readString(record.cron),
    timezone: readString(record.timezone),
    nextRunAt: readString(record.next_run_at),
    lastRunAt: readString(record.last_run_at),
    lastStatus:
      lastStatus === null || !["completed", "disabled", "failed"].includes(lastStatus)
        ? null
        : (lastStatus as SourceWatchScanStatus),
    lastError: normalizeNullableJsonObject(record.last_error),
    schedulerStatus:
      schedulerStatus === null ||
      !["disabled", "paused", "scheduled", "running"].includes(schedulerStatus)
        ? enabled
          ? "scheduled"
          : "disabled"
        : (schedulerStatus as SourceWatchSchedulerStatus),
  };
}

function readSourceWatchScanResult(value: unknown): SourceWatchScanResultResponse {
  const record = normalizeJsonObject(value);

  return {
    new_sources: normalizeJsonArray(
      record.new_sources,
    ) as unknown as SourceWatchScanResultResponse["new_sources"],
    changed_sources: normalizeJsonArray(
      record.changed_sources,
    ) as unknown as SourceWatchScanResultResponse["changed_sources"],
    delete_candidates: normalizeJsonArray(
      record.delete_candidates,
    ) as unknown as SourceWatchScanResultResponse["delete_candidates"],
    skipped: normalizeJsonArray(
      record.skipped,
    ) as unknown as SourceWatchScanResultResponse["skipped"],
  };
}
