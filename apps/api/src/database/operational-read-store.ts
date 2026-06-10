import { sql, type Kysely } from "kysely";
import { webhookEventTypes, type WebhookEventType } from "@fococontext/contracts";
import type { DatabaseSchema } from "@fococontext/db";

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
} from "../documents/document.types.js";
import type {
  DeletionCleanupItemRecord,
  DeletionCleanupItemStatus,
  DeletionCleanupOperationRecord,
  DeletionCleanupPhase,
  DeletionCleanupStatus,
  DeletionCleanupTargetType,
} from "../deletion-cleanup/deletion-cleanup.types.js";
import type {
  ScheduledImportJobRecord,
  SourceWatchLatestScanResponse,
  SourceWatchRuleRecord,
  SourceWatchRuleSchedule,
  SourceWatchRuleStatus,
  SourceWatchScanResultResponse,
  SourceWatchScanStatus,
  SourceWatchScanTriggerType,
  SourceWatchSchedulerStatus,
  SourceWatchSourceKind,
} from "../source-watch/source-watch.types.js";
import type {
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookRecord,
  WebhookStatus,
} from "../webhooks/webhook.types.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import type {
  ForkOwnerType,
  KnowledgeBaseOutputLanguage,
  KnowledgeBaseResponse,
  KnowledgeBaseStatus,
  KnowledgeBaseSyncStatus,
  KnowledgeBaseTemplate,
  KnowledgeBaseType,
} from "../knowledge-bases/knowledge-base.types.js";
import {
  knowledgeCheckTypes,
  type KnowledgeCheckRecord,
  type KnowledgeCheckSemanticRun,
  type KnowledgeCheckStatus,
  type KnowledgeCheckType,
} from "../knowledge-checks/knowledge-check.types.js";

export const operationalReadStoreToken = Symbol("operationalReadStore");

export interface PaginatedReadInput {
  knowledgeBaseId: string;
  page: number;
  pageSize: number;
}

export interface PaginatedJobReadResult {
  items: JobRecord[];
  total: number;
  hasMore: boolean;
}

export interface SourceDocumentReadInput extends PaginatedReadInput {
  keyword?: string;
  status?: SourceDocumentStatus;
  sourceType?: SourceType;
}

export interface SourceWatchDocumentReadInput {
  knowledgeBaseId: string;
  sourceWatchRuleId: string;
}

export interface PaginatedSourceDocumentReadResult {
  items: SourceDocumentRecord[];
  total: number;
  hasMore: boolean;
}

export interface PaginatedMediaAssetReadResult {
  items: MediaAssetRecord[];
  total: number;
  hasMore: boolean;
}

export interface ReferencedObjectKeyReadInput {
  knowledgeBaseId: string;
  documentId: string;
  objectKeys: readonly string[];
}

export interface PaginatedSourceWatchRuleReadResult {
  items: SourceWatchRuleRecord[];
  total: number;
  hasMore: boolean;
}

export interface PaginatedScheduledImportJobReadResult {
  items: ScheduledImportJobRecord[];
  total: number;
  hasMore: boolean;
}

export interface PaginatedWebhookReadResult {
  items: WebhookRecord[];
  latestDeliveriesByWebhookId: Map<string, WebhookDeliveryRecord>;
  total: number;
  hasMore: boolean;
}

export interface PaginatedWebhookDeliveryReadResult {
  items: WebhookDeliveryRecord[];
  total: number;
  hasMore: boolean;
}

export interface WebhookDetailReadResult {
  webhook: WebhookRecord;
  latestDelivery: WebhookDeliveryRecord | null;
}

export interface KnowledgeBaseReadInput extends Omit<PaginatedReadInput, "knowledgeBaseId"> {
  keyword?: string;
  status?: string;
}

export interface KnowledgeBaseForkReadInput extends KnowledgeBaseReadInput {
  upstreamKnowledgeBaseId: string;
}

export interface PaginatedKnowledgeBaseReadResult {
  items: KnowledgeBaseResponse[];
  total: number;
  hasMore: boolean;
}

export interface KnowledgeCheckReadInput extends PaginatedReadInput {
  status?: KnowledgeCheckStatus;
}

export interface PaginatedKnowledgeCheckReadResult {
  items: KnowledgeCheckRecord[];
  total: number;
  hasMore: boolean;
}

export interface DeletionCleanupReadInput extends Omit<PaginatedReadInput, "knowledgeBaseId"> {
  knowledgeBaseId?: string;
  status?: DeletionCleanupStatus;
}

export interface PaginatedDeletionCleanupReadResult {
  items: DeletionCleanupOperationRecord[];
  itemsByOperationId: Map<string, DeletionCleanupItemRecord[]>;
  total: number;
  hasMore: boolean;
}

export interface DeletionCleanupDetailReadResult {
  operation: DeletionCleanupOperationRecord;
  items: DeletionCleanupItemRecord[];
  itemTotal: number;
  itemHasMore: boolean;
}

export interface KnowledgeBaseIngestProgressReadResult {
  counts: Record<JobStatus, number>;
  stageCounts: Record<JobStage, number>;
  latestJobCreatedAt: string | null;
  latestJobUpdatedAt: string | null;
  overallProgress: number;
  representativeJobs: JobRecord[];
}

export interface OperationalReadStore {
  readonly supportsOperationalReads: boolean;
  listKnowledgeBases(
    scope: ApiResourceScope,
    input: KnowledgeBaseReadInput,
  ): Promise<PaginatedKnowledgeBaseReadResult | null>;
  listKnowledgeBaseForks(
    scope: ApiResourceScope,
    input: KnowledgeBaseForkReadInput,
  ): Promise<PaginatedKnowledgeBaseReadResult | null>;
  listKnowledgeChecks(
    input: KnowledgeCheckReadInput,
  ): Promise<PaginatedKnowledgeCheckReadResult | null>;
  listJobs(input: PaginatedReadInput): Promise<PaginatedJobReadResult | null>;
  listSourceDocuments(
    input: SourceDocumentReadInput,
  ): Promise<PaginatedSourceDocumentReadResult | null>;
  listSourceWatchDocuments(
    input: SourceWatchDocumentReadInput,
  ): Promise<SourceDocumentRecord[] | null>;
  getSourceDocumentById(documentId: string): Promise<SourceDocumentRecord | null>;
  getLatestJobByDocumentId(documentId: string): Promise<JobRecord | null>;
  listJobsByDocumentId(documentId: string): Promise<JobRecord[]>;
  getParsedContentByDocumentId(documentId: string): Promise<ParsedContentRecord | null>;
  listMediaAssetsByDocumentId(
    documentId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedMediaAssetReadResult | null>;
  findReferencedObjectKeys(input: ReferencedObjectKeyReadInput): Promise<Set<string>>;
  listWikiPageRecordsBySourceDocumentId(
    knowledgeBaseId: string,
    documentId: string,
    limit: number,
  ): Promise<Record<string, unknown>[] | null>;
  listWikiPageVersionRecordsByPageIds(
    pageIds: readonly string[],
    limit: number,
  ): Promise<Record<string, unknown>[] | null>;
  listSourceWatchRules(
    input: PaginatedReadInput,
  ): Promise<PaginatedSourceWatchRuleReadResult | null>;
  getSourceWatchRuleById(ruleId: string): Promise<SourceWatchRuleRecord | null>;
  getJobById(jobId: string): Promise<JobRecord | null>;
  listJobsByIds(jobIds: readonly string[]): Promise<Map<string, JobRecord>>;
  listScheduledImportJobsByRuleId(
    ruleId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedScheduledImportJobReadResult | null>;
  listWebhooks(
    scope: ApiResourceScope,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedWebhookReadResult | null>;
  getWebhookById(
    scope: ApiResourceScope,
    webhookId: string,
  ): Promise<WebhookDetailReadResult | null>;
  listWebhookDeliveriesByWebhookId(
    webhookId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedWebhookDeliveryReadResult | null>;
  listDeletionCleanupOperations(
    scope: ApiResourceScope,
    input: DeletionCleanupReadInput,
  ): Promise<PaginatedDeletionCleanupReadResult | null>;
  getDeletionCleanupOperationById(
    scope: ApiResourceScope,
    operationId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<DeletionCleanupDetailReadResult | null>;
  listJobEventsByJobIds(jobIds: readonly string[]): Promise<Map<string, JobEventRecord[]>>;
  getKnowledgeBaseIngestProgress(
    knowledgeBaseId: string,
    representativeJobLimit: number,
  ): Promise<KnowledgeBaseIngestProgressReadResult | null>;
}

export function createNoopOperationalReadStore(): OperationalReadStore {
  return {
    supportsOperationalReads: false,
    async listKnowledgeBases() {
      return null;
    },
    async listKnowledgeBaseForks() {
      return null;
    },
    async listKnowledgeChecks() {
      return null;
    },
    async listJobs() {
      return null;
    },
    async listSourceDocuments() {
      return null;
    },
    async listSourceWatchDocuments() {
      return null;
    },
    async getSourceDocumentById() {
      return null;
    },
    async getLatestJobByDocumentId() {
      return null;
    },
    async listJobsByDocumentId() {
      return [];
    },
    async getParsedContentByDocumentId() {
      return null;
    },
    async listMediaAssetsByDocumentId() {
      return null;
    },
    async findReferencedObjectKeys() {
      return new Set();
    },
    async listWikiPageRecordsBySourceDocumentId() {
      return null;
    },
    async listWikiPageVersionRecordsByPageIds() {
      return null;
    },
    async listSourceWatchRules() {
      return null;
    },
    async getSourceWatchRuleById() {
      return null;
    },
    async getJobById() {
      return null;
    },
    async listJobsByIds() {
      return new Map();
    },
    async listScheduledImportJobsByRuleId() {
      return null;
    },
    async listWebhooks() {
      return null;
    },
    async getWebhookById() {
      return null;
    },
    async listWebhookDeliveriesByWebhookId() {
      return null;
    },
    async listDeletionCleanupOperations() {
      return null;
    },
    async getDeletionCleanupOperationById() {
      return null;
    },
    async listJobEventsByJobIds() {
      return new Map();
    },
    async getKnowledgeBaseIngestProgress() {
      return null;
    },
  };
}

export function createPostgresOperationalReadStore(
  db: Kysely<DatabaseSchema>,
): OperationalReadStore {
  return new PostgresOperationalReadStore(db);
}

class PostgresOperationalReadStore implements OperationalReadStore {
  readonly supportsOperationalReads = true;

  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listKnowledgeBases(
    scope: ApiResourceScope,
    input: KnowledgeBaseReadInput,
  ): Promise<PaginatedKnowledgeBaseReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const keyword = input.keyword?.trim().toLowerCase() || null;
    const status = input.status?.trim() || null;
    const [itemsResult, totalResult] = await Promise.all([
      sql<KnowledgeBaseRow>`
        select
          knowledge_bases.id,
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
          knowledge_base_settings.purpose,
          knowledge_base_settings.wiki_schema,
          knowledge_base_settings.retrieval_settings
        from knowledge_bases
        left join knowledge_base_settings
          on knowledge_base_settings.knowledge_base_id = knowledge_bases.id
        where knowledge_bases.tenant_id = ${scope.tenantId}
          and knowledge_bases.project_id = ${scope.projectId}
          and knowledge_bases.deleted_at is null
          and knowledge_bases.status <> 'deleted'
          and (${status}::text is null or knowledge_bases.status = ${status})
          and (
            ${keyword}::text is null
            or position(
              ${keyword}::text in lower(concat_ws(
                ' ',
                knowledge_bases.id,
                knowledge_bases.name,
                knowledge_bases.slug
              ))
            ) > 0
          )
        order by knowledge_bases.updated_at desc, knowledge_bases.id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from knowledge_bases
        where tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
          and deleted_at is null
          and status <> 'deleted'
          and (${status}::text is null or status = ${status})
          and (
            ${keyword}::text is null
            or position(
              ${keyword}::text in lower(concat_ws(' ', id, name, slug))
            ) > 0
          )
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toKnowledgeBaseResponse),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listKnowledgeBaseForks(
    scope: ApiResourceScope,
    input: KnowledgeBaseForkReadInput,
  ): Promise<PaginatedKnowledgeBaseReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const keyword = input.keyword?.trim().toLowerCase() || null;
    const status = input.status?.trim() || null;
    const [itemsResult, totalResult] = await Promise.all([
      sql<KnowledgeBaseRow>`
        select
          knowledge_bases.id,
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
          knowledge_base_settings.purpose,
          knowledge_base_settings.wiki_schema,
          knowledge_base_settings.retrieval_settings
        from knowledge_bases
        left join knowledge_base_settings
          on knowledge_base_settings.knowledge_base_id = knowledge_bases.id
        where knowledge_bases.tenant_id = ${scope.tenantId}
          and knowledge_bases.project_id = ${scope.projectId}
          and knowledge_bases.deleted_at is null
          and knowledge_bases.status <> 'deleted'
          and knowledge_bases.knowledge_base_type = 'fork'
          and knowledge_bases.upstream_knowledge_base_id = ${input.upstreamKnowledgeBaseId}
          and (${status}::text is null or knowledge_bases.status = ${status})
          and (
            ${keyword}::text is null
            or position(
              ${keyword}::text in lower(concat_ws(
                ' ',
                knowledge_bases.id,
                knowledge_bases.name,
                knowledge_bases.slug,
                knowledge_bases.fork_owner_external_id,
                knowledge_bases.fork_owner_display_name
              ))
            ) > 0
          )
        order by knowledge_bases.updated_at desc, knowledge_bases.id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from knowledge_bases
        where tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
          and deleted_at is null
          and status <> 'deleted'
          and knowledge_base_type = 'fork'
          and upstream_knowledge_base_id = ${input.upstreamKnowledgeBaseId}
          and (${status}::text is null or status = ${status})
          and (
            ${keyword}::text is null
            or position(
              ${keyword}::text in lower(concat_ws(
                ' ',
                id,
                name,
                slug,
                fork_owner_external_id,
                fork_owner_display_name
              ))
            ) > 0
          )
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toKnowledgeBaseResponse),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listKnowledgeChecks(
    input: KnowledgeCheckReadInput,
  ): Promise<PaginatedKnowledgeCheckReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const status = input.status ?? null;
    const [itemsResult, totalResult] = await Promise.all([
      sql<KnowledgeCheckRow>`
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
        where knowledge_base_id = ${input.knowledgeBaseId}
          and (${status}::text is null or status = ${status})
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from knowledge_checks
        where knowledge_base_id = ${input.knowledgeBaseId}
          and (${status}::text is null or status = ${status})
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toKnowledgeCheckRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listJobs(input: PaginatedReadInput): Promise<PaginatedJobReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<JobRow>`
        select
          id,
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
        where knowledge_base_id = ${input.knowledgeBaseId}
          and coalesce(job_type, '') <> 'graph.insights.refresh'
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from jobs
        where knowledge_base_id = ${input.knowledgeBaseId}
          and coalesce(job_type, '') <> 'graph.insights.refresh'
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toJobRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listSourceDocuments(
    input: SourceDocumentReadInput,
  ): Promise<PaginatedSourceDocumentReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const keyword = input.keyword?.trim().toLowerCase() || null;
    const status = input.status ?? null;
    const sourceType = input.sourceType ?? null;
    const [itemsResult, totalResult] = await Promise.all([
      sql<SourceDocumentRow>`
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
        where knowledge_base_id = ${input.knowledgeBaseId}
          and owner_knowledge_base_id is null
          and fork_tombstoned_at is null
          and deleted_at is null
          and status <> 'deleted'
          and (${status}::text is null or status = ${status})
          and (${sourceType}::text is null or source_type = ${sourceType})
          and (
            ${keyword}::text is null
            or position(
              ${keyword}::text in lower(concat_ws(
                ' ',
                name,
                metadata->>'display_name',
                metadata->>'source_path',
                metadata->>'source_url'
              ))
            ) > 0
          )
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from source_documents
        where knowledge_base_id = ${input.knowledgeBaseId}
          and owner_knowledge_base_id is null
          and fork_tombstoned_at is null
          and deleted_at is null
          and status <> 'deleted'
          and (${status}::text is null or status = ${status})
          and (${sourceType}::text is null or source_type = ${sourceType})
          and (
            ${keyword}::text is null
            or position(
              ${keyword}::text in lower(concat_ws(
                ' ',
                name,
                metadata->>'display_name',
                metadata->>'source_path',
                metadata->>'source_url'
              ))
            ) > 0
          )
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toSourceDocumentRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listSourceWatchDocuments(
    input: SourceWatchDocumentReadInput,
  ): Promise<SourceDocumentRecord[]> {
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
      where knowledge_base_id = ${input.knowledgeBaseId}
        and owner_knowledge_base_id is null
        and fork_tombstoned_at is null
        and deleted_at is null
        and status <> 'deleted'
        and metadata->>'source_path' is not null
        and metadata->>'source_watch_rule_id' = ${input.sourceWatchRuleId}
      order by lower(metadata->>'source_path') asc, updated_at desc, id desc
    `.execute(this.db);

    return result.rows.map(toSourceDocumentRecord);
  }

  async getSourceDocumentById(documentId: string): Promise<SourceDocumentRecord | null> {
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
      where id = ${documentId}
        and deleted_at is null
        and fork_tombstoned_at is null
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    return row === undefined ? null : toSourceDocumentRecord(row);
  }

  async getLatestJobByDocumentId(documentId: string): Promise<JobRecord | null> {
    const result = await sql<JobRow>`
      select
        id,
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
      where source_document_id = ${documentId}
      order by queued_at desc, id desc
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    return row === undefined ? null : toJobRecord(row);
  }

  async listJobsByDocumentId(documentId: string): Promise<JobRecord[]> {
    const result = await sql<JobRow>`
      select
        id,
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
      where source_document_id = ${documentId}
      order by updated_at desc, id desc
    `.execute(this.db);

    return result.rows.map(toJobRecord);
  }

  async getParsedContentByDocumentId(documentId: string): Promise<ParsedContentRecord | null> {
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
      where source_document_id = ${documentId}
        and fork_tombstoned_at is null
      order by created_at desc, id desc
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    return row === undefined ? null : toParsedContentRecord(row);
  }

  async listMediaAssetsByDocumentId(
    documentId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedMediaAssetReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<MediaAssetRow>`
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
        where source_document_id = ${documentId}
          and fork_tombstoned_at is null
        order by created_at asc, id asc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from media_assets
        where source_document_id = ${documentId}
          and fork_tombstoned_at is null
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toMediaAssetRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async findReferencedObjectKeys(input: ReferencedObjectKeyReadInput): Promise<Set<string>> {
    const objectKeys = [...new Set(input.objectKeys.filter((key) => key.trim().length > 0))];

    if (objectKeys.length === 0) {
      return new Set();
    }

    const [sourceDocumentResult, parsedContentResult, mediaAssetResult] = await Promise.all([
      sql<{ object_key: string }>`
        select distinct object_key
        from source_documents
        where knowledge_base_id = ${input.knowledgeBaseId}
          and id <> ${input.documentId}
          and deleted_at is null
          and status <> 'deleted'
          and fork_tombstoned_at is null
          and object_key in (${sql.join(objectKeys)})
      `.execute(this.db),
      sql<{ object_key: string }>`
        select distinct refs.object_key
        from (
          select source_document_id, normalized_markdown_object_key as object_key
          from parsed_contents
          union all
          select source_document_id, plain_text_object_key as object_key
          from parsed_contents
          where plain_text_object_key is not null
          union all
          select source_document_id, captioned_markdown_object_key as object_key
          from parsed_contents
          where captioned_markdown_object_key is not null
        ) refs
        inner join source_documents on source_documents.id = refs.source_document_id
        where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
          and source_documents.id <> ${input.documentId}
          and source_documents.deleted_at is null
          and source_documents.status <> 'deleted'
          and source_documents.fork_tombstoned_at is null
          and refs.object_key in (${sql.join(objectKeys)})
      `.execute(this.db),
      sql<{ object_key: string }>`
        select distinct media_assets.object_key
        from media_assets
        inner join source_documents on source_documents.id = media_assets.source_document_id
        where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
          and source_documents.id <> ${input.documentId}
          and source_documents.deleted_at is null
          and source_documents.status <> 'deleted'
          and source_documents.fork_tombstoned_at is null
          and media_assets.fork_tombstoned_at is null
          and media_assets.object_key in (${sql.join(objectKeys)})
      `.execute(this.db),
    ]);

    return new Set([
      ...sourceDocumentResult.rows.map((row) => row.object_key),
      ...parsedContentResult.rows.map((row) => row.object_key),
      ...mediaAssetResult.rows.map((row) => row.object_key),
    ]);
  }

  async listWikiPageRecordsBySourceDocumentId(
    knowledgeBaseId: string,
    documentId: string,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const result = await sql<WikiPageRecordRow>`
      select
        id,
        knowledge_base_id,
        slug,
        title,
        page_type,
        status,
        current_version_id,
        frontmatter,
        source_document_ids,
        metadata,
        created_at,
        updated_at
      from wiki_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and source_document_ids @> array[${documentId}]::text[]
        and deleted_at is null
        and fork_tombstoned_at is null
      order by updated_at desc, id desc
      limit ${limit}
    `.execute(this.db);

    return result.rows.map(toWikiPageRecordResponse);
  }

  async listWikiPageVersionRecordsByPageIds(
    pageIds: readonly string[],
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    if (pageIds.length === 0) {
      return [];
    }

    const result = await sql<WikiPageVersionRecordRow>`
      select
        id,
        page_id,
        knowledge_version_id,
        version_number,
        title,
        frontmatter,
        source_snapshot,
        prompt_version,
        created_by,
        created_at
      from wiki_page_versions
      where page_id in (${sql.join(pageIds)})
        and fork_tombstoned_at is null
      order by created_at desc, id desc
      limit ${limit}
    `.execute(this.db);

    return result.rows.map(toWikiPageVersionRecordResponse);
  }

  async listSourceWatchRules(
    input: PaginatedReadInput,
  ): Promise<PaginatedSourceWatchRuleReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<SourceWatchRuleRow>`
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
        where knowledge_base_id = ${input.knowledgeBaseId}
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from source_watch_rules
        where knowledge_base_id = ${input.knowledgeBaseId}
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toSourceWatchRuleRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async getSourceWatchRuleById(ruleId: string): Promise<SourceWatchRuleRecord | null> {
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
      where id = ${ruleId}
    `.execute(this.db);
    const row = result.rows[0];

    return row === undefined ? null : toSourceWatchRuleRecord(row);
  }

  async getJobById(jobId: string): Promise<JobRecord | null> {
    const jobs = await this.listJobsByIds([jobId]);

    return jobs.get(jobId) ?? null;
  }

  async listJobsByIds(jobIds: readonly string[]): Promise<Map<string, JobRecord>> {
    const jobs = new Map<string, JobRecord>();

    if (jobIds.length === 0) {
      return jobs;
    }

    const result = await sql<JobRow>`
      select
        id,
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
      where id in (${sql.join(jobIds)})
    `.execute(this.db);

    for (const row of result.rows) {
      const job = toJobRecord(row);
      jobs.set(job.id, job);
    }

    return jobs;
  }

  async listScheduledImportJobsByRuleId(
    ruleId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedScheduledImportJobReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<ScheduledImportJobRow>`
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
        where source_watch_rule_id = ${ruleId}
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from scheduled_import_jobs
        where source_watch_rule_id = ${ruleId}
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toScheduledImportJobRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listWebhooks(
    scope: ApiResourceScope,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedWebhookReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<WebhookRow>`
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
        where tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from webhooks
        where tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
      `.execute(this.db),
    ]);
    const items = itemsResult.rows.map(toWebhookRecord);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items,
      latestDeliveriesByWebhookId: await this.listLatestWebhookDeliveriesByWebhookIds(
        items.map((item) => item.id),
      ),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async getWebhookById(
    scope: ApiResourceScope,
    webhookId: string,
  ): Promise<WebhookDetailReadResult | null> {
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
      where id = ${webhookId}
        and tenant_id = ${scope.tenantId}
        and project_id = ${scope.projectId}
      limit 1
    `.execute(this.db);
    const webhook = result.rows[0] === undefined ? null : toWebhookRecord(result.rows[0]);

    if (webhook === null) {
      return null;
    }

    const latestDeliveries = await this.listLatestWebhookDeliveriesByWebhookIds([webhook.id]);

    return {
      webhook,
      latestDelivery: latestDeliveries.get(webhook.id) ?? null,
    };
  }

  async listWebhookDeliveriesByWebhookId(
    webhookId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<PaginatedWebhookDeliveryReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<WebhookDeliveryRow>`
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
        where webhook_id = ${webhookId}
        order by created_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from webhook_deliveries
        where webhook_id = ${webhookId}
      `.execute(this.db),
    ]);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items: itemsResult.rows.map(toWebhookDeliveryRecord),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async listDeletionCleanupOperations(
    scope: ApiResourceScope,
    input: DeletionCleanupReadInput,
  ): Promise<PaginatedDeletionCleanupReadResult> {
    const offset = (input.page - 1) * input.pageSize;
    const knowledgeBaseId = input.knowledgeBaseId ?? null;
    const status = input.status ?? null;
    const [itemsResult, totalResult] = await Promise.all([
      sql<DeletionCleanupOperationRow>`
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
        where tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
          and (${knowledgeBaseId}::text is null or knowledge_base_id = ${knowledgeBaseId})
          and (${status}::text is null or status = ${status})
        order by updated_at desc, id desc
        limit ${input.pageSize}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from deletion_cleanup_operations
        where tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
          and (${knowledgeBaseId}::text is null or knowledge_base_id = ${knowledgeBaseId})
          and (${status}::text is null or status = ${status})
      `.execute(this.db),
    ]);
    const items = itemsResult.rows.map(toDeletionCleanupOperationRecord);
    const total = readCount(totalResult.rows[0]?.total);

    return {
      items,
      itemsByOperationId: new Map(),
      total,
      hasMore: offset + input.pageSize < total,
    };
  }

  async getDeletionCleanupOperationById(
    scope: ApiResourceScope,
    operationId: string,
    input: Omit<PaginatedReadInput, "knowledgeBaseId">,
  ): Promise<DeletionCleanupDetailReadResult | null> {
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
      where id = ${operationId}
        and tenant_id = ${scope.tenantId}
        and project_id = ${scope.projectId}
      limit 1
    `.execute(this.db);
    const operation =
      result.rows[0] === undefined ? null : toDeletionCleanupOperationRecord(result.rows[0]);

    if (operation === null) {
      return null;
    }

    const itemOffset = (input.page - 1) * input.pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      sql<DeletionCleanupItemRow>`
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
        where operation_id = ${operation.id}
        order by created_at asc, id asc
        limit ${input.pageSize}
        offset ${itemOffset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from deletion_cleanup_items
        where operation_id = ${operation.id}
      `.execute(this.db),
    ]);
    const itemTotal = readCount(totalResult.rows[0]?.total);

    return {
      operation,
      items: itemsResult.rows.map(toDeletionCleanupItemRecord),
      itemTotal,
      itemHasMore: itemOffset + input.pageSize < itemTotal,
    };
  }

  async listJobEventsByJobIds(jobIds: readonly string[]): Promise<Map<string, JobEventRecord[]>> {
    const grouped = new Map<string, JobEventRecord[]>();

    if (jobIds.length === 0) {
      return grouped;
    }

    const result = await sql<JobEventRow>`
      select job_id, event_type, message, metadata, created_at
      from job_events
      where job_id in (${sql.join(jobIds)})
      order by job_id asc, created_at asc, id asc
    `.execute(this.db);

    for (const row of result.rows) {
      const event = toJobEventRecord(row);
      const events = grouped.get(event.jobId) ?? [];
      events.push(event);
      grouped.set(event.jobId, events);
    }

    return grouped;
  }

  async getKnowledgeBaseIngestProgress(
    knowledgeBaseId: string,
    representativeJobLimit: number,
  ): Promise<KnowledgeBaseIngestProgressReadResult> {
    const [countsResult, stageResult, jobsResult] = await Promise.all([
      sql<ProgressCountsRow>`
        select
          count(*)::bigint as total,
          count(*) filter (where status = 'queued')::bigint as queued,
          count(*) filter (where status = 'running')::bigint as running,
          count(*) filter (where status = 'completed')::bigint as completed,
          count(*) filter (where status = 'failed')::bigint as failed,
          count(*) filter (where status = 'canceled')::bigint as canceled,
          coalesce(sum(
            case
              when status = 'completed' then 100
              when status in ('failed', 'canceled') then least(greatest(progress, 0), 99)
              else least(greatest(progress, 0), 99)
            end
          ), 0)::bigint as progress_sum,
          to_char(max(queued_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            as latest_job_created_at,
          to_char(max(updated_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            as latest_job_updated_at
        from jobs
        where knowledge_base_id = ${knowledgeBaseId}
          and coalesce(job_type, '') <> 'graph.insights.refresh'
      `.execute(this.db),
      sql<StageCountRow>`
        select coalesce(stage, 'parsing') as stage, count(*)::bigint as total
        from jobs
        where knowledge_base_id = ${knowledgeBaseId}
          and coalesce(job_type, '') <> 'graph.insights.refresh'
        group by coalesce(stage, 'parsing')
      `.execute(this.db),
      sql<JobRow>`
        select
          id,
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
        where knowledge_base_id = ${knowledgeBaseId}
          and coalesce(job_type, '') <> 'graph.insights.refresh'
        order by updated_at desc, id desc
        limit ${representativeJobLimit}
      `.execute(this.db),
    ]);
    const countsRow = countsResult.rows[0];
    const counts: Record<JobStatus, number> = {
      canceled: readCount(countsRow?.canceled),
      completed: readCount(countsRow?.completed),
      failed: readCount(countsRow?.failed),
      queued: readCount(countsRow?.queued),
      running: readCount(countsRow?.running),
    };
    const total = readCount(countsRow?.total);
    const stageCounts = createEmptyStageCounts();

    for (const row of stageResult.rows) {
      const stage = readJobStage(row.stage);
      stageCounts[stage] = readCount(row.total);
    }

    return {
      counts,
      stageCounts,
      latestJobCreatedAt: countsRow?.latest_job_created_at ?? null,
      latestJobUpdatedAt: countsRow?.latest_job_updated_at ?? null,
      overallProgress:
        total === 0
          ? 100
          : Math.min(100, Math.max(0, Math.round(readCount(countsRow?.progress_sum) / total))),
      representativeJobs: jobsResult.rows.map(toJobRecord),
    };
  }

  private async listLatestWebhookDeliveriesByWebhookIds(
    webhookIds: readonly string[],
  ): Promise<Map<string, WebhookDeliveryRecord>> {
    const grouped = new Map<string, WebhookDeliveryRecord>();

    if (webhookIds.length === 0) {
      return grouped;
    }

    const result = await sql<WebhookDeliveryRow>`
      select distinct on (webhook_id)
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
      where webhook_id in (${sql.join(webhookIds)})
      order by webhook_id asc, created_at desc, id desc
    `.execute(this.db);

    for (const row of result.rows) {
      const record = toWebhookDeliveryRecord(row);
      grouped.set(record.webhookId, record);
    }

    return grouped;
  }

  private async listDeletionCleanupItemsByOperationIds(
    operationIds: readonly string[],
  ): Promise<Map<string, DeletionCleanupItemRecord[]>> {
    const grouped = new Map<string, DeletionCleanupItemRecord[]>();

    if (operationIds.length === 0) {
      return grouped;
    }

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
      where operation_id in (${sql.join(operationIds)})
      order by operation_id asc, created_at asc, id asc
    `.execute(this.db);

    for (const row of result.rows) {
      const record = toDeletionCleanupItemRecord(row);
      const current = grouped.get(record.operationId) ?? [];
      current.push(record);
      grouped.set(record.operationId, current);
    }

    return grouped;
  }
}

interface JobRow {
  id: string;
  knowledge_base_id: string | null;
  source_document_id: string | null;
  job_type: string | null;
  status: string;
  stage: string | null;
  progress: number;
  progress_message: string | null;
  idempotency_key: string | null;
  dedupe_key: string | null;
  result: unknown;
  error: unknown;
  metadata: unknown;
  queued_at: unknown;
  updated_at: unknown;
}

interface KnowledgeBaseRow {
  id: string;
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
  created_at: unknown;
  updated_at: unknown;
  purpose: unknown;
  wiki_schema: unknown;
  retrieval_settings: unknown;
}

interface KnowledgeCheckRow {
  id: string;
  knowledge_base_id: string;
  status: string;
  progress: number;
  findings: unknown;
  metadata: unknown;
  created_at: unknown;
  updated_at: unknown;
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
  size_bytes: string | number | bigint | null;
  metadata: unknown;
  ocr_status: string | null;
  ocr_summary: unknown;
  visibility_origin: string | null;
  owner_knowledge_base_id: string | null;
  upstream_resource_id: string | null;
  fork_tombstoned_at: unknown;
  created_at: unknown;
  updated_at: unknown;
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
  ocr_completed_at: unknown;
  ocr_blocks: unknown;
  error: unknown;
  created_at: unknown;
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
  caption_generated_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface WikiPageRecordRow {
  id: string;
  knowledge_base_id: string;
  slug: string;
  title: string;
  page_type: string;
  status: string;
  current_version_id: string | null;
  frontmatter: unknown;
  source_document_ids: string[] | null;
  metadata: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface WikiPageVersionRecordRow {
  id: string;
  page_id: string;
  knowledge_version_id: string | null;
  version_number: number;
  title: string;
  frontmatter: unknown;
  source_snapshot: unknown;
  prompt_version: string | null;
  created_by: string | null;
  created_at: unknown;
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
  created_at: unknown;
  updated_at: unknown;
}

interface ScheduledImportJobRow {
  id: string;
  source_watch_rule_id: string | null;
  knowledge_base_id: string;
  status: string;
  trigger_type: string;
  scan_result: unknown;
  started_at: unknown;
  finished_at: unknown;
  duration_ms: number | null;
  retry_count: number | null;
  retryable: boolean | null;
  next_retry_at: unknown;
  error: unknown;
  scheduled_for: unknown;
  created_at: unknown;
  updated_at: unknown;
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
  created_at: unknown;
  updated_at: unknown;
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
  next_attempt_at: unknown;
  last_attempt_at: unknown;
  signing: unknown;
  created_at: unknown;
  delivered_at: unknown;
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
  retry_after: unknown;
  retryable: boolean;
  last_error: unknown;
  retention_expires_at: unknown;
  item_retention_expires_at: unknown;
  started_at: unknown;
  completed_at: unknown;
  failed_at: unknown;
  canceled_at: unknown;
  created_at: unknown;
  updated_at: unknown;
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
  retry_after: unknown;
  retained_until: unknown;
  created_at: unknown;
  updated_at: unknown;
  completed_at: unknown;
}

interface JobEventRow {
  job_id: string;
  event_type: string;
  message: string | null;
  metadata: unknown;
  created_at: unknown;
}

interface ProgressCountsRow {
  total: string | number | bigint;
  queued: string | number | bigint;
  running: string | number | bigint;
  completed: string | number | bigint;
  failed: string | number | bigint;
  canceled: string | number | bigint;
  progress_sum: string | number | bigint;
  latest_job_created_at: string | null;
  latest_job_updated_at: string | null;
}

interface StageCountRow {
  stage: string;
  total: string | number | bigint;
}

const jobStages: readonly JobStage[] = [
  "uploading",
  "parsing",
  "ocr",
  "captioning",
  "analyzing",
  "generating",
  "merging",
  "indexing",
];

function toKnowledgeBaseResponse(row: KnowledgeBaseRow): KnowledgeBaseResponse {
  const response: KnowledgeBaseResponse = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    knowledge_base_type: readKnowledgeBaseType(row.knowledge_base_type),
    upstream_knowledge_base_id: row.upstream_knowledge_base_id,
    upstream_base_version_id: row.upstream_base_version_id,
    upstream_synced_version_id: row.upstream_synced_version_id,
    fork_owner: readKnowledgeBaseForkOwner(row),
    sync_status: readKnowledgeBaseSyncStatus(row.sync_status),
    template: readKnowledgeBaseTemplate(row.template),
    output_language: readKnowledgeBaseOutputLanguage(row.output_language),
    status: readKnowledgeBaseStatus(row.status),
    current_version_id: row.current_version_id ?? "",
    purpose: readPurposeText(row.purpose),
    schema: normalizeJsonObject(row.wiki_schema),
    retrieval: normalizeJsonObject(row.retrieval_settings),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };

  if (row.description !== null) {
    response.description = row.description;
  }

  return response;
}

function toKnowledgeCheckRecord(row: KnowledgeCheckRow): KnowledgeCheckRecord {
  const metadata = normalizeJsonObject(row.metadata);

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    status: readKnowledgeCheckStatus(row.status),
    progress: row.progress,
    checks: readKnowledgeCheckArray(metadata.checks),
    pageIds: readStringArray(metadata.page_ids),
    sourceDocumentIds: readStringArray(metadata.source_document_ids),
    findings: readJsonArray(row.findings) as KnowledgeCheckRecord["findings"],
    semanticRun: readKnowledgeCheckSemanticRun(metadata.semantic_run),
    configurationSnapshot: normalizeJsonObject(metadata.configuration_snapshot),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toJobRecord(row: JobRow): JobRecord {
  const metadata = normalizeJsonObject(row.metadata);
  const result = normalizeJsonObject(row.result);

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id ?? "",
    documentId: row.source_document_id,
    ...(row.job_type === null ? {} : { jobType: row.job_type }),
    stage: readJobStage(row.stage),
    status: readJobStatus(row.status),
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
}

function toJobEventRecord(row: JobEventRow): JobEventRecord {
  const metadata = normalizeJsonObject(row.metadata);

  return {
    jobId: row.job_id,
    type: readJobEventType(row.event_type),
    stage: readJobStage(readString(metadata.stage)),
    status: readJobStatus(readString(metadata.status)),
    message: row.message ?? "",
    metadata,
    createdAt: normalizeTimestamp(row.created_at),
  };
}

function toSourceDocumentRecord(row: SourceDocumentRow): SourceDocumentRecord {
  const metadata = normalizeJsonObject(row.metadata);
  const sourcePath = readString(metadata.source_path);
  const sourceUrl = readString(metadata.source_url);

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    name: row.name,
    displayName: readString(metadata.display_name) ?? row.name,
    sourceType: readSourceType(row.source_type),
    mimeType: row.mime_type ?? "application/octet-stream",
    size: readCount(row.size_bytes ?? undefined),
    contentHash: row.content_hash ?? "",
    objectKey: row.object_key ?? "",
    status: readSourceDocumentStatus(row.status),
    ...(sourcePath === null ? {} : { sourcePath }),
    ...(sourceUrl === null ? {} : { sourceUrl }),
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
}

function toParsedContentRecord(row: ParsedContentRow): ParsedContentRecord {
  return {
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
    locators: readJsonObjectArray(row.locators),
    tables: readJsonObjectArray(row.tables),
    warnings: readJsonObjectArray(row.warnings),
    ocrStatus: row.ocr_status ?? "not_required",
    ocrSummary: normalizeJsonObject(row.ocr_summary),
    ocrWarnings: readJsonObjectArray(row.ocr_warnings),
    ocrProviderMetadata: normalizeJsonObject(row.ocr_provider_metadata),
    ocrPageCount: row.ocr_page_count,
    ocrBlockCount: row.ocr_block_count,
    ocrDerivedSegmentCount: row.ocr_derived_segment_count,
    ocrCompletedAt: normalizeNullableTimestamp(row.ocr_completed_at),
    ocrBlocks: readJsonObjectArray(row.ocr_blocks),
    error: normalizeNullableJsonObject(row.error),
    createdAt: normalizeTimestamp(row.created_at),
  };
}

function toMediaAssetRecord(row: MediaAssetRow): MediaAssetRecord {
  return {
    id: row.id,
    documentId: row.source_document_id,
    parsedContentId: row.parsed_content_id,
    mimeType: row.mime_type,
    locator: normalizeJsonObject(row.locator),
    width: row.width,
    height: row.height,
    objectKey: row.object_key,
    sha256: row.hash ?? "",
    captionStatus: readMediaCaptionStatus(row.caption_status),
    caption: row.caption,
    captionProviderName: row.caption_provider_name,
    captionModel: row.caption_model,
    captionPromptVersion: row.caption_prompt_version,
    captionModelCallId: row.caption_model_call_id,
    captionCacheHit: row.caption_cache_hit,
    captionAttemptCount: row.caption_attempt_count,
    captionError: normalizeNullableJsonObject(row.caption_error),
    captionGeneratedAt: normalizeNullableTimestamp(row.caption_generated_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toWikiPageRecordResponse(row: WikiPageRecordRow): Record<string, unknown> {
  return {
    id: row.id,
    knowledge_base_id: row.knowledge_base_id,
    slug: row.slug,
    title: row.title,
    page_type: row.page_type,
    status: row.status,
    current_version_id: row.current_version_id,
    frontmatter: normalizeJsonObject(row.frontmatter),
    source_document_ids: readStringArray(row.source_document_ids),
    metadata: normalizeJsonObject(row.metadata),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };
}

function toWikiPageVersionRecordResponse(row: WikiPageVersionRecordRow): Record<string, unknown> {
  return {
    id: row.id,
    page_id: row.page_id,
    knowledge_version_id: row.knowledge_version_id,
    version_number: row.version_number,
    title: row.title,
    frontmatter: normalizeJsonObject(row.frontmatter),
    source_snapshot: readJsonArray(row.source_snapshot),
    prompt_version: row.prompt_version,
    created_by: row.created_by,
    created_at: normalizeTimestamp(row.created_at),
  };
}

function toSourceWatchRuleRecord(row: SourceWatchRuleRow): SourceWatchRuleRecord {
  const metadata = normalizeJsonObject(row.metadata);

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    name: row.name,
    sourceKind: readSourceWatchSourceKind(row.source_type),
    location: row.location,
    credentialProfile: readString(metadata.credential_profile),
    adapterOptions: normalizeJsonObject(metadata.adapter_options),
    includeExtensions: readStringArray(row.include_patterns),
    excludeDirs: readStringArray(metadata.exclude_dirs),
    excludeGlobs: readStringArray(row.exclude_patterns),
    maxFileSizeMb: readNumber(metadata.max_file_size_mb),
    autoIngest: row.auto_ingest_enabled,
    status: readSourceWatchRuleStatus(row.status),
    schedule: readSourceWatchSchedule(row.schedule),
    latestScan: readSourceWatchLatestScan(metadata.latest_scan),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toScheduledImportJobRecord(row: ScheduledImportJobRow): ScheduledImportJobRecord {
  return {
    id: row.id,
    sourceWatchRuleId: row.source_watch_rule_id ?? "",
    knowledgeBaseId: row.knowledge_base_id,
    status: readSourceWatchScanStatus(row.status),
    triggerType: readSourceWatchScanTriggerType(row.trigger_type),
    scanResult: readSourceWatchScanResult(row.scan_result),
    startedAt: normalizeTimestamp(row.started_at ?? row.created_at),
    finishedAt: normalizeNullableTimestamp(row.finished_at),
    durationMs: row.duration_ms,
    retryCount: row.retry_count ?? 0,
    retryable: row.retryable ?? false,
    nextRetryAt: normalizeNullableTimestamp(row.next_retry_at),
    error: normalizeNullableJsonObject(row.error),
    scheduledFor: normalizeNullableTimestamp(row.scheduled_for),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toWebhookRecord(row: WebhookRow): WebhookRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    knowledgeBaseId: row.knowledge_base_id,
    url: row.target_url,
    events: readWebhookEventArray(row.event_types),
    status: readWebhookStatus(row.status),
    secretConfigured: row.secret_configured,
    secret: row.secret_ciphertext,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toWebhookDeliveryRecord(row: WebhookDeliveryRow): WebhookDeliveryRecord {
  return {
    id: row.id,
    webhookId: row.webhook_id ?? "",
    knowledgeBaseId: row.knowledge_base_id,
    eventType: readWebhookEventType(row.event_type),
    payload: normalizeJsonObject(row.payload),
    status: readWebhookDeliveryStatus(row.status),
    requestTrace: normalizeJsonObject(row.request_trace),
    responseStatus: row.response_status,
    responseBody: row.response_body,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: normalizeNullableTimestamp(row.next_attempt_at),
    lastAttemptAt: normalizeNullableTimestamp(row.last_attempt_at),
    signing: readWebhookDeliverySigning(row.signing),
    createdAt: normalizeTimestamp(row.created_at),
    deliveredAt: normalizeNullableTimestamp(row.delivered_at),
  };
}

function toDeletionCleanupOperationRecord(
  row: DeletionCleanupOperationRow,
): DeletionCleanupOperationRecord {
  return {
    id: row.id,
    targetType: readDeletionCleanupTargetType(row.target_type),
    targetId: row.target_id,
    knowledgeBaseId: row.knowledge_base_id,
    status: readDeletionCleanupStatus(row.status),
    phase: readDeletionCleanupPhase(row.phase),
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
    lastError: normalizeNullableJsonObject(row.last_error),
    retentionExpiresAt: normalizeNullableTimestamp(row.retention_expires_at),
    itemRetentionExpiresAt: normalizeNullableTimestamp(row.item_retention_expires_at),
    startedAt: normalizeNullableTimestamp(row.started_at),
    completedAt: normalizeNullableTimestamp(row.completed_at),
    failedAt: normalizeNullableTimestamp(row.failed_at),
    canceledAt: normalizeNullableTimestamp(row.canceled_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toDeletionCleanupItemRecord(row: DeletionCleanupItemRow): DeletionCleanupItemRecord {
  return {
    id: row.id,
    operationId: row.operation_id,
    itemType: readDeletionCleanupItemType(row.item_type),
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    objectKey: row.object_key,
    tableName: row.table_name,
    knowledgeBaseId: row.knowledge_base_id,
    sourceDocumentId: row.source_document_id,
    status: readDeletionCleanupItemStatus(row.status),
    phase: readDeletionCleanupPhase(row.phase),
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lastError: normalizeNullableJsonObject(row.last_error),
    skipReason: row.skip_reason,
    retryAfter: normalizeNullableTimestamp(row.retry_after),
    retainedUntil: normalizeNullableTimestamp(row.retained_until),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
    completedAt: normalizeNullableTimestamp(row.completed_at),
  };
}

function createEmptyStageCounts(): Record<JobStage, number> {
  return Object.fromEntries(jobStages.map((stage) => [stage, 0])) as Record<JobStage, number>;
}

function readDeletionCleanupTargetType(value: unknown): DeletionCleanupTargetType {
  if (
    value === "knowledge_base" ||
    value === "source_document" ||
    value === "source_watch_rule" ||
    value === "webhook" ||
    value === "import_preview" ||
    value === "retrieval_trace"
  ) {
    return value;
  }

  return "knowledge_base";
}

function readDeletionCleanupStatus(value: unknown): DeletionCleanupStatus {
  if (value === "running" || value === "completed" || value === "failed" || value === "canceled") {
    return value;
  }

  return "queued";
}

function readDeletionCleanupPhase(value: unknown): DeletionCleanupPhase {
  if (
    value === "manifest" ||
    value === "fencing" ||
    value === "object_cleanup" ||
    value === "database_cleanup" ||
    value === "retention" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  ) {
    return value;
  }

  return "queued";
}

function readDeletionCleanupItemType(value: unknown): DeletionCleanupItemRecord["itemType"] {
  if (value === "database_row" || value === "reference" || value === "audit") {
    return value;
  }

  return "object";
}

function readDeletionCleanupItemStatus(value: unknown): DeletionCleanupItemStatus {
  if (value === "running" || value === "deleted" || value === "skipped" || value === "failed") {
    return value;
  }

  return "pending";
}

function readWebhookStatus(value: unknown): WebhookStatus {
  return value === "enabled" ? "enabled" : "disabled";
}

function readWebhookDeliveryStatus(value: unknown): WebhookDeliveryStatus {
  if (value === "delivered" || value === "failed") {
    return value;
  }

  return "queued";
}

function readWebhookEventType(value: unknown): WebhookEventType {
  return typeof value === "string" && webhookEventTypes.includes(value as WebhookEventType)
    ? (value as WebhookEventType)
    : "webhook.test";
}

function readWebhookEventArray(value: unknown): WebhookEventType[] {
  return readStringArray(value).filter((item): item is WebhookEventType =>
    webhookEventTypes.includes(item as WebhookEventType),
  );
}

function readWebhookDeliverySigning(value: unknown): WebhookDeliveryRecord["signing"] {
  const record = normalizeJsonObject(value);
  const algorithm = readString(record.algorithm);

  return {
    algorithm: algorithm === "hmac-sha256" ? "hmac-sha256" : null,
    contentDigest: readString(record.content_digest),
    secretConfigured: readBoolean(record.secret_configured) ?? false,
  };
}

function readSourceWatchSourceKind(value: unknown): SourceWatchSourceKind {
  if (
    value === "s3_prefix" ||
    value === "url_list" ||
    value === "git_repo" ||
    value === "mounted_directory"
  ) {
    return value;
  }

  return "mounted_directory";
}

function readSourceWatchRuleStatus(value: unknown): SourceWatchRuleStatus {
  return value === "disabled" ? "disabled" : "enabled";
}

function readSourceWatchScanStatus(value: unknown): SourceWatchScanStatus {
  if (value === "disabled" || value === "failed") {
    return value;
  }

  return "completed";
}

function readSourceWatchScanTriggerType(value: unknown): SourceWatchScanTriggerType {
  if (value === "scheduled" || value === "retry") {
    return value;
  }

  return "manual";
}

function readSourceWatchLatestScan(value: unknown): SourceWatchLatestScanResponse | null {
  const record = normalizeJsonObject(value);
  const scheduledImportJobId = readString(record.scheduled_import_job_id);
  const status = readString(record.status);
  const scannedAt = readString(record.scanned_at);

  if (scheduledImportJobId === null || status === null || scannedAt === null) {
    return null;
  }

  return {
    scheduled_import_job_id: scheduledImportJobId,
    status: readSourceWatchScanStatus(status),
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
  const schedulerStatus = readString(record.scheduler_status);
  const lastStatus = readString(record.last_status);

  return {
    enabled,
    intervalSeconds: readNumber(record.interval_seconds),
    cron: readString(record.cron),
    timezone: readString(record.timezone),
    nextRunAt: readString(record.next_run_at),
    lastRunAt: readString(record.last_run_at),
    lastStatus:
      lastStatus === null || !["completed", "disabled", "failed"].includes(lastStatus)
        ? null
        : readSourceWatchScanStatus(lastStatus),
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
    new_sources: readJsonArray(record.new_sources) as SourceWatchScanResultResponse["new_sources"],
    changed_sources: readJsonArray(
      record.changed_sources,
    ) as SourceWatchScanResultResponse["changed_sources"],
    delete_candidates: readJsonArray(
      record.delete_candidates,
    ) as SourceWatchScanResultResponse["delete_candidates"],
    skipped: readJsonArray(record.skipped) as SourceWatchScanResultResponse["skipped"],
  };
}

function readPurposeText(value: unknown): string {
  const record = normalizeJsonObject(value);

  return readString(record.text) ?? "";
}

function readKnowledgeBaseType(value: unknown): KnowledgeBaseType {
  return value === "fork" ? "fork" : "canonical";
}

function readKnowledgeBaseSyncStatus(value: unknown): KnowledgeBaseSyncStatus {
  if (value === "synced" || value === "outdated" || value === "syncing" || value === "failed") {
    return value;
  }

  return "not_applicable";
}

function readKnowledgeBaseTemplate(value: unknown): KnowledgeBaseTemplate {
  if (value === "research" || value === "team_knowledge") {
    return value;
  }

  return "general";
}

function readKnowledgeBaseOutputLanguage(value: unknown): KnowledgeBaseOutputLanguage {
  if (value === "zh-CN" || value === "en-US") {
    return value;
  }

  return "auto";
}

function readKnowledgeBaseStatus(value: unknown): Exclude<KnowledgeBaseStatus, "deleted"> {
  if (value === "indexing" || value === "outdated" || value === "failed") {
    return value;
  }

  return "ready";
}

function readKnowledgeBaseForkOwner(row: KnowledgeBaseRow): KnowledgeBaseResponse["fork_owner"] {
  if (row.fork_owner_type === null || row.fork_owner_external_id === null) {
    return null;
  }

  return {
    owner_type: readForkOwnerType(row.fork_owner_type),
    external_owner_id: row.fork_owner_external_id,
    display_name: row.fork_owner_display_name,
  };
}

function readForkOwnerType(value: unknown): ForkOwnerType {
  if (value === "workspace" || value === "customer" || value === "session" || value === "custom") {
    return value;
  }

  return "user";
}

function readKnowledgeCheckStatus(value: unknown): KnowledgeCheckStatus {
  if (value === "running" || value === "completed" || value === "failed") {
    return value;
  }

  return "queued";
}

function readKnowledgeCheckArray(value: unknown): KnowledgeCheckType[] {
  const checks = readStringArray(value).filter((check): check is KnowledgeCheckType =>
    knowledgeCheckTypes.includes(check as KnowledgeCheckType),
  );

  return checks.length === 0 ? ["missing_sources"] : checks;
}

function readKnowledgeCheckSemanticRun(value: unknown): KnowledgeCheckSemanticRun {
  const record = normalizeJsonObject(value);
  const status = readString(record.status);
  const outputStatus = readString(record.output_status);
  const finalStatus = readString(record.structured_output_final_status);
  const semanticRun: KnowledgeCheckSemanticRun = {
    status:
      status === "completed" || status === "partial" || status === "failed" ? status : "skipped",
    findings_count: readNumber(record.findings_count) ?? 0,
    repair_attempts: readNumber(record.repair_attempts) ?? 0,
    structured_output_validation_issues: readStringArray(
      record.structured_output_validation_issues,
    ),
    trace: normalizeJsonObject(record.trace),
  };
  const failureReason = readString(record.failure_reason);
  const model = readString(record.model);
  const modelCallId = readString(record.model_call_id);
  const promptVersionId = readString(record.prompt_version_id);
  const providerName = readString(record.provider_name);
  const attemptCount = readNumber(record.structured_output_attempt_count);
  const structuredOutputMode = readStructuredOutputMode(record.structured_output_mode);
  const usage = normalizeJsonObject(record.usage);

  if (failureReason !== null) {
    semanticRun.failure_reason = failureReason;
  }
  if (model !== null) {
    semanticRun.model = model;
  }
  if (modelCallId !== null) {
    semanticRun.model_call_id = modelCallId;
  }
  if (outputStatus === "succeeded" || outputStatus === "failed") {
    semanticRun.output_status = outputStatus;
  }
  if (promptVersionId !== null) {
    semanticRun.prompt_version_id = promptVersionId;
  }
  if (providerName !== null) {
    semanticRun.provider_name = providerName;
  }
  if (attemptCount !== null) {
    semanticRun.structured_output_attempt_count = attemptCount;
  }
  if (finalStatus === "succeeded" || finalStatus === "failed") {
    semanticRun.structured_output_final_status = finalStatus;
  }
  if (structuredOutputMode !== null) {
    semanticRun.structured_output_mode = structuredOutputMode;
  }
  if (Object.keys(usage).length > 0) {
    semanticRun.usage = usage as NonNullable<KnowledgeCheckSemanticRun["usage"]>;
  }

  return semanticRun;
}

function readStructuredOutputMode(
  value: unknown,
): "strict_json_schema" | "json_object_fallback" | null {
  if (value === "strict_json_schema" || value === "json_object_fallback") {
    return value;
  }

  return null;
}

function readSourceType(value: unknown): SourceType {
  if (value === "file" || value === "text" || value === "url" || value === "wiki_draft") {
    return value;
  }

  return "file";
}

function readSourceDocumentStatus(value: unknown): SourceDocumentStatus {
  if (
    value === "uploaded" ||
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed" ||
    value === "deleted"
  ) {
    return value;
  }

  return "uploaded";
}

function readSourceVisibilityOrigin(value: unknown): SourceVisibilityOrigin {
  if (value === "canonical" || value === "upstream_inherited" || value === "fork_owned") {
    return value;
  }

  return "canonical";
}

function readMediaCaptionStatus(value: unknown): MediaAssetRecord["captionStatus"] {
  if (
    value === "not_configured" ||
    value === "pending" ||
    value === "generated" ||
    value === "skipped" ||
    value === "failed"
  ) {
    return value;
  }

  return "not_configured";
}

function readJobStage(value: unknown): JobStage {
  return typeof value === "string" && jobStages.includes(value as JobStage)
    ? (value as JobStage)
    : "parsing";
}

function readJobStatus(value: unknown): JobStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  ) {
    return value;
  }

  return "queued";
}

function readJobEventType(value: unknown): JobEventRecord["type"] {
  if (
    value === "job.queued" ||
    value === "job.running" ||
    value === "job.completed" ||
    value === "job.failed" ||
    value === "job.canceled"
  ) {
    return value;
  }

  return "job.queued";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readCount(value: string | number | bigint | undefined): number {
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (JSON.parse(JSON.stringify(value)) as unknown[]) : [];
}

function readJsonObjectArray(value: unknown): Record<string, unknown>[] {
  return readJsonArray(value).filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeJsonObject(parsed);
    } catch {
      return {};
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  return {};
}

function normalizeNullableJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeJsonObject(value);
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    return new Date(value).toISOString();
  }

  return new Date(0).toISOString();
}

function normalizeNullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeTimestamp(value);
}
