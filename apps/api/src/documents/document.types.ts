import type { DeletionCleanupOperationSummaryResponse } from "../deletion-cleanup/deletion-cleanup.response.js";

export const sourceDocumentStatuses = [
  "uploaded",
  "queued",
  "processing",
  "ready",
  "failed",
  "deleted",
] as const;
export const sourceTypes = ["file", "text", "url", "wiki_draft"] as const;
export const sourceEvidenceKinds = ["text", "image_caption", "ocr"] as const;
export const documentProcessingStages = [
  "parsing",
  "ocr",
  "media_extraction",
  "captioning",
  "parsed_artifact",
] as const;
export const documentProcessingUnitStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "canceled",
] as const;
export const sourceEvidenceLocatorStatuses = [
  "resolved",
  "not_provided",
  "not_found",
  "ambiguous",
  "unsupported",
] as const;

export type SourceDocumentStatus = (typeof sourceDocumentStatuses)[number];
export type SourceType = (typeof sourceTypes)[number];
export type SourceEvidenceKind = (typeof sourceEvidenceKinds)[number];
export type SourceEvidenceLocatorStatus = (typeof sourceEvidenceLocatorStatuses)[number];
export type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled";
export type UploadSessionStatus = "created" | "finalized" | "expired" | "canceled";
export type SourceVisibilityOrigin = "canonical" | "upstream_inherited" | "fork_owned";
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

export interface DocumentKnowledgeBaseScopeRecord {
  knowledgeBaseId: string;
  knowledgeBaseType: "canonical" | "fork";
  upstreamKnowledgeBaseId: string | null;
  upstreamSyncedVersionId: string | null;
}

export type JobStage =
  | "uploading"
  | "parsing"
  | "ocr"
  | "captioning"
  | "analyzing"
  | "generating"
  | "merging"
  | "indexing";

export interface SourceDocumentRecord {
  id: string;
  knowledgeBaseId: string;
  name: string;
  displayName: string;
  sourceType: SourceType;
  mimeType: string;
  size: number;
  contentHash: string;
  objectKey: string;
  status: SourceDocumentStatus;
  ocrStatus?: string;
  ocrSummary?: Record<string, unknown>;
  sourcePath?: string;
  sourceUrl?: string;
  metadata: Record<string, unknown>;
  visibilityOrigin?: SourceVisibilityOrigin;
  ownerKnowledgeBaseId?: string | null;
  upstreamResourceId?: string | null;
  forkTombstonedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadSessionRecord {
  id: string;
  tenantId: string;
  projectId: string;
  actorType: "api_key" | "admin_session" | "system" | "unknown";
  actorId: string;
  actorSource: string;
  actorAccountId: string | null;
  knowledgeBaseId: string;
  documentId: string;
  objectKey: string;
  fileName: string;
  displayName: string;
  mimeType: string;
  size: number;
  contentHash: string | null;
  sourcePath?: string;
  metadata: Record<string, unknown>;
  status: UploadSessionStatus;
  idempotencyKey: string | null;
  finalizeIdempotencyKey: string | null;
  finalizedDocumentId: string | null;
  finalizedJobId: string | null;
  cleanupOperationId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  knowledgeBaseId: string;
  documentId: string | null;
  jobType?: string;
  stage: JobStage;
  status: JobStatus;
  progress: number;
  progressMessage: string;
  contentHash: string;
  idempotencyKey: string | null;
  deduped: boolean;
  lockedByKnowledgeBaseId: string | null;
  inputSnapshotId: string;
  retryOfJobId: string | null;
  parsedContentId: string | null;
  changeSetId: string | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobEventRecord {
  jobId: string;
  type: "job.queued" | "job.running" | "job.completed" | "job.failed" | "job.canceled";
  stage: JobStage;
  status: JobStatus;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ParsedContentRecord {
  id: string;
  documentId: string;
  parserName: string;
  parserVersion: string;
  normalizedMarkdownObjectKey: string;
  captionedMarkdownObjectKey?: string;
  markdownPreview?: string;
  markdownPreviewObjectKey?: string;
  markdownPreviewTruncated?: boolean;
  plainTextObjectKey?: string;
  locators: readonly Record<string, unknown>[];
  tables: readonly Record<string, unknown>[];
  warnings: readonly Record<string, unknown>[];
  ocrStatus: string;
  ocrSummary: Record<string, unknown>;
  ocrWarnings: readonly Record<string, unknown>[];
  ocrProviderMetadata: Record<string, unknown>;
  ocrPageCount: number;
  ocrBlockCount: number;
  ocrDerivedSegmentCount: number;
  ocrCompletedAt: string | null;
  ocrBlocks: readonly Record<string, unknown>[];
  error: Record<string, unknown> | null;
  createdAt: string;
}

export interface MediaAssetRecord {
  id: string;
  documentId: string;
  parsedContentId: string | null;
  mimeType: string;
  locator: Record<string, unknown>;
  width: number | null;
  height: number | null;
  objectKey: string;
  sha256: string;
  captionStatus: "not_configured" | "pending" | "generated" | "skipped" | "failed";
  caption: string | null;
  captionProviderName: string | null;
  captionModel: string | null;
  captionPromptVersion: string | null;
  captionModelCallId: string | null;
  captionCacheHit: boolean;
  captionAttemptCount: number;
  captionError: Record<string, unknown> | null;
  captionGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentProcessingUnitRecord {
  id: string;
  sourceDocumentId: string;
  jobId: string;
  parsedContentId: string | null;
  stage: DocumentProcessingStage;
  unitType: string;
  unitKey: string;
  unitIndex: number | null;
  attemptScope: string;
  status: DocumentProcessingUnitStatus;
  contentHash: string | null;
  dedupeKey: string;
  objectKey: string | null;
  objectRefs: readonly Record<string, unknown>[];
  locator: Record<string, unknown>;
  counters: Record<string, unknown>;
  warnings: readonly Record<string, unknown>[];
  safeError: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  retryEligible: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export interface SourceDocumentResponse {
  id: string;
  knowledge_base_id: string;
  name: string;
  display_name: string;
  source_type: SourceType;
  mime_type: string;
  size: number;
  content_hash: string;
  object_key: string;
  status: SourceDocumentStatus;
  ocr_status?: string;
  ocr_summary?: Record<string, unknown>;
  source_path?: string;
  source_url?: string;
  metadata: Record<string, unknown>;
  visibility_origin?: SourceVisibilityOrigin;
  owner_knowledge_base_id?: string | null;
  upstream_resource_id?: string | null;
  fork_tombstoned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentProcessingUnitResponse {
  id: string;
  source_document_id: string;
  job_id: string;
  parsed_content_id: string | null;
  stage: DocumentProcessingStage;
  unit_type: string;
  unit_key: string;
  unit_index: number | null;
  attempt_scope: string;
  status: DocumentProcessingUnitStatus;
  content_hash: string | null;
  dedupe_key: string;
  object_key: string | null;
  object_refs: readonly Record<string, unknown>[];
  locator: Record<string, unknown>;
  counters: Record<string, unknown>;
  warnings: readonly Record<string, unknown>[];
  safe_error: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  retry_eligible: boolean;
  completed_at: string | null;
  updated_at: string;
}

export interface JobResponse {
  id: string;
  knowledge_base_id: string;
  document_id: string | null;
  stage: JobStage;
  status: JobStatus;
  progress: number;
  progress_message: string;
  content_hash: string;
  idempotency_key: string | null;
  deduped: boolean;
  locked_by_knowledge_base_id: string | null;
  input_snapshot_id: string;
  retry_of_job_id: string | null;
  parsed_content_id: string | null;
  change_set_id: string | null;
  error: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface JobEventResponse {
  type: JobEventRecord["type"];
  stage: JobStage;
  status: JobStatus;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BackgroundOperationRecord {
  id: string;
  jobId: string | null;
  knowledgeBaseId: string | null;
  operationKind: string;
  stage: string;
  status: string;
  cursor: Record<string, unknown>;
  processedCount: number;
  failedCount: number;
  totalCount: number | null;
  lastItemId: string | null;
  safeError: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundOperationResponse {
  id: string;
  job_id: string | null;
  knowledge_base_id: string | null;
  operation_kind: string;
  stage: string;
  status: string;
  cursor: Record<string, unknown>;
  processed_count: number;
  failed_count: number;
  total_count: number | null;
  last_item_id: string | null;
  safe_error: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface JobDetailResponse extends JobResponse {
  background_operations: readonly BackgroundOperationResponse[];
  events: readonly JobEventResponse[];
}

export interface BatchIngestJobStatusInput {
  job_ids?: unknown;
}

export interface BatchIngestJobStatusResultResponse {
  index: number;
  job_id: string;
  status: "resolved" | "error";
  job?: JobDetailResponse;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    message_key?: string;
  };
}

export interface BatchIngestJobStatusResponse {
  items: readonly BatchIngestJobStatusResultResponse[];
  limits: {
    max_items: number;
  };
}

export interface KnowledgeBaseIngestProgressResponse {
  knowledge_base_id: string;
  overall_progress: number;
  retrieve_ready: boolean;
  latest_job_created_at: string | null;
  latest_job_updated_at: string | null;
  counts: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    canceled: number;
  };
  stage_counts: Record<JobStage, number>;
  jobs: readonly JobDetailResponse[];
  links: readonly ApiNextActionLinkResponse[];
}

export interface ParsedContentResponse {
  id: string;
  document_id: string;
  parser_name: string;
  parser_version: string;
  normalized_markdown_object_key: string;
  captioned_markdown_object_key?: string;
  plain_text_object_key?: string;
  markdown_preview: string | null;
  markdown_preview_error?: string;
  markdown_preview_object_key: string | null;
  markdown_preview_truncated: boolean;
  locators: readonly Record<string, unknown>[];
  tables: readonly Record<string, unknown>[];
  media_assets: readonly MediaAssetResponse[];
  ocr_status: string;
  ocr_summary: Record<string, unknown>;
  ocr_warnings: readonly Record<string, unknown>[];
  ocr_provider_metadata: Record<string, unknown>;
  ocr_page_count: number;
  ocr_block_count: number;
  ocr_derived_segment_count: number;
  ocr_completed_at: string | null;
  ocr_blocks: readonly Record<string, unknown>[];
  warnings: readonly Record<string, unknown>[];
  error: Record<string, unknown> | null;
  created_at: string;
}

export interface MediaAssetResponse {
  id: string;
  document_id: string;
  parsed_content_id: string | null;
  mime_type: string;
  locator: Record<string, unknown>;
  width: number | null;
  height: number | null;
  object_key: string;
  sha256: string;
  caption_status: "not_configured" | "pending" | "generated" | "skipped" | "failed";
  caption: string | null;
  caption_provider_name: string | null;
  caption_model: string | null;
  caption_prompt_version: string | null;
  caption_model_call_id: string | null;
  caption_cache_hit: boolean;
  caption_attempt_count: number;
  caption_error: Record<string, unknown> | null;
  caption_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaAssetPreviewResponse {
  media_asset_id: string;
  document_id: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  locator: Record<string, unknown>;
  caption_status: MediaAssetResponse["caption_status"];
  caption: string | null;
  object_key: string;
  preview_url: string | null;
  expires_at: string | null;
}

export interface MediaAssetPreviewEnvelope {
  media_asset_preview: MediaAssetPreviewResponse;
}

export interface DocumentUploadResponse {
  document: SourceDocumentResponse;
  job: JobResponse;
  resources: {
    knowledge_base_id: string;
    source_document_id: string;
    job_id: string;
  };
  links: readonly ApiNextActionLinkResponse[];
}

export interface ApiNextActionLinkResponse {
  rel:
    | "job"
    | "source_document"
    | "knowledge_base_jobs"
    | "knowledge_base_ingest_progress"
    | "retrieve_readiness"
    | "developer_documentation";
  method: "GET" | "POST";
  href: string;
  resource_type:
    | "ingest_job"
    | "source_document"
    | "job_list"
    | "ingest_progress"
    | "retrieve_readiness"
    | "developer_documentation";
}

export interface UploadSessionResponse {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  object_key: string;
  file_name: string;
  display_name: string;
  mime_type: string;
  size: number;
  content_hash: string | null;
  source_path?: string;
  metadata: Record<string, unknown>;
  status: UploadSessionStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface PresignedUploadResponse {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_at: string;
}

export interface CreateUploadSessionResponse {
  upload_session: UploadSessionResponse;
  presigned_upload: PresignedUploadResponse;
}

export interface ListSourceDocumentsInput {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: SourceDocumentStatus;
  sourceType?: SourceType;
}

export interface ListSourceDocumentsResult {
  items: readonly SourceDocumentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface SourceDocumentDetailResponse {
  document: SourceDocumentResponse;
  latest_job: JobResponse | null;
  parsed_content: ParsedContentResponse | null;
  media_assets: readonly MediaAssetResponse[];
  wiki_pages: readonly Record<string, unknown>[];
  page_versions: readonly Record<string, unknown>[];
  delete_preview_required: boolean;
  update_preview_required: boolean;
}

export interface DeleteImpactPreviewResponse {
  document_id: string;
  knowledge_base_id: string;
  status: "ready";
  affected_page_ids: string[];
  affected_edge_ids: string[];
  system_page_keys: string[];
  change_set_id: string;
  impact: {
    affected_resources: readonly Record<string, unknown>[];
    unsafe_reasons: string[];
    retrieval_index_update: {
      required: boolean;
      reason: string;
    };
  };
  apply_action: {
    method: "DELETE";
    path: string;
    requires_preview_confirmation: boolean;
  };
  can_apply: boolean;
}

export interface SourceDocumentDeleteResponse extends SourceDocumentResponse {
  document_id: string;
  cleanup_operation: DeletionCleanupOperationSummaryResponse;
  lifecycle_operation: {
    type: "delete_apply";
    status: "applied";
    affected_page_ids: string[];
    affected_edge_ids: string[];
  };
  change_set: {
    id: string;
    trigger: "source_delete";
    status: "applied";
  };
  index_update: {
    queued: boolean;
    reason: "source_delete";
  };
}

export interface DocumentParsedContentResponse {
  document_id: string;
  parsed_content: ParsedContentResponse | null;
  status: "available" | "not_available";
}

export interface SourceEvidenceInput {
  allow_fallback?: unknown;
  context_chars?: unknown;
  evidence_kind?: unknown;
  knowledge_base_id?: unknown;
  locator?: unknown;
  max_chars?: unknown;
  media_asset_id?: unknown;
  parsed_content_id?: unknown;
  source_anchor_id?: unknown;
}

export interface SourceEvidenceResolveItemInput extends SourceEvidenceInput {
  document_id?: unknown;
}

export interface SourceEvidenceBatchInput {
  items?: unknown;
}

export interface SourceEvidenceWarningResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SourceEvidenceOcrMetadataResponse {
  page_number: number;
  block_index: number;
  block_end_index?: number;
  confidence?: number;
  bbox?: unknown;
  provider?: string;
  engine?: string;
  artifact_object_key?: string;
}

export interface SourceEvidenceMediaMetadataResponse {
  media_asset_id: string;
  mime_type: string;
  object_key: string;
  locator: Record<string, unknown>;
  width: number | null;
  height: number | null;
  caption_status: MediaAssetResponse["caption_status"];
  preview: {
    endpoint: string;
  };
}

export interface SourceEvidenceResponse {
  document_id: string;
  knowledge_base_id?: string;
  visibility_origin?: SourceVisibilityOrigin;
  owner_knowledge_base_id?: string | null;
  upstream_resource_id?: string | null;
  parsed_content_id: string;
  source_anchor_id?: string;
  locator?: string;
  locator_status: SourceEvidenceLocatorStatus;
  evidence_kind: SourceEvidenceKind;
  text: string;
  text_truncated: boolean;
  context_before: string;
  context_after: string;
  context_truncated: boolean;
  content_hash: string;
  parser_name: string;
  parser_version: string;
  normalized_markdown_object_key?: string;
  captioned_markdown_object_key?: string;
  plain_text_object_key?: string;
  source_object_key: string;
  warnings: readonly SourceEvidenceWarningResponse[];
  ocr_evidence?: SourceEvidenceOcrMetadataResponse;
  media_evidence?: SourceEvidenceMediaMetadataResponse;
}

export interface SourceEvidenceBatchItemResultResponse {
  index: number;
  document_id: string;
  status: "resolved" | "error";
  evidence?: SourceEvidenceResponse;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    message_key?: string;
  };
}

export interface SourceEvidenceBatchResponse {
  items: readonly SourceEvidenceBatchItemResultResponse[];
  limits: {
    max_items: number;
    total_output_max_chars: number;
  };
  total_text_chars: number;
  truncated: boolean;
}

export interface ListMediaAssetsInput {
  page: number;
  pageSize: number;
}

export interface ListMediaAssetsResult {
  items: readonly MediaAssetResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
