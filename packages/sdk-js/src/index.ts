export interface FococontextClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  locale?: string | (() => string | undefined);
}

export interface RequestOptions {
  headers?: HeadersInit | undefined;
  idempotencyKey?: string;
}

export interface ListOptions extends RequestOptions {
  cursor?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  [key: string]: string | number | boolean | undefined | HeadersInit;
}

export interface CleanupOperationItemListOptions extends RequestOptions {
  itemsPage?: number;
  itemsPageSize?: number;
}

export interface SourceWatchScanItemListOptions extends ListOptions {
  item_kind?: SourceWatchScanItemKind;
}

export interface UploadSourceDocumentInput extends RequestOptions {
  file: Blob;
  name?: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateUploadSessionInput extends RequestOptions {
  fileName: string;
  mimeType: string;
  size: number;
  contentHash?: string;
  displayName?: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

export interface FinalizeUploadSessionInput extends RequestOptions {
  contentHash: string;
}

export interface UploadSourceDocumentsAndWaitInput extends RequestOptions {
  documents: UploadSourceDocumentInput[];
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export const apiErrorCodes = [
  "invalid_api_key",
  "forbidden",
  "knowledge_base_not_found",
  "document_not_found",
  "job_not_found",
  "upload_session_not_found",
  "page_not_found",
  "version_not_found",
  "unsupported_file_type",
  "parser_failed",
  "parser_timeout",
  "password_protected_pdf",
  "parser_output_empty",
  "parser_limit_exceeded",
  "invalid_request",
  "invalid_locator",
  "unsupported_evidence_kind",
  "evidence_limit_exceeded",
  "parsed_content_not_available",
  "stale_source",
  "ingest_failed",
  "change_set_conflict",
  "retrieve_index_not_ready",
  "durable_backend_unavailable",
  "bounded_retrieval_unavailable",
  "graph_index_unavailable",
  "redis_metrics_degraded",
  "fork_target_invalid",
  "fork_submission_requires_fork",
  "document_delete_preview_required",
  "cleanup_operation_not_found",
  "cleanup_operation_not_retryable",
  "resource_deleted",
  "resource_cleanup_pending",
  "resource_conflict",
  "ingest_lock_conflict",
  "rate_limited",
  "admission_limited",
  "request_size_limit_exceeded",
  "retrieve_limit_exceeded",
  "export_limit_exceeded",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export interface ApiErrorPayload {
  code?: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  locale?: string;
  message_key?: string;
}

export interface StaleResourceErrorDetails {
  cleanup_operation_id?: string | null;
  guidance?: string;
  target_id: string;
  target_type: "knowledge_base" | "source_document";
}

export type CleanupStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export type CleanupPhase =
  | "queued"
  | "manifest"
  | "fencing"
  | "object_cleanup"
  | "database_cleanup"
  | "retention"
  | "completed"
  | "failed"
  | "canceled";

export interface CleanupItemCounts {
  database_rows: number;
  deleted: number;
  failed: number;
  object_keys: number;
  pending: number;
  skipped: number;
  total: number;
}

export interface CleanupPhaseArtifactState extends JsonObject {
  failed: number;
  residual: number;
  status: "pending" | "running" | "completed" | "failed" | "canceled" | "not_applicable";
  total: number;
}

export interface CleanupSettledState extends JsonObject {
  database: CleanupPhaseArtifactState;
  is_settled: boolean;
  object_storage: CleanupPhaseArtifactState;
  phase: CleanupPhase;
  residual_artifacts: {
    failed: number;
    pending: number;
    total: number;
  };
}

export interface CleanupItemSummary extends JsonObject {
  id: string;
  item_type: "object" | "database_row" | "reference" | "audit";
  operation_id: string;
  phase: CleanupPhase;
  status: "pending" | "running" | "deleted" | "skipped" | "failed";
}

export interface CleanupOperation {
  created_at: string;
  id: string;
  item_counts: CleanupItemCounts;
  items?: CleanupItemSummary[];
  items_pagination?: {
    has_more: boolean;
    page: number;
    page_size: number;
    total: number;
  };
  knowledge_base_id: string | null;
  phase: CleanupPhase;
  retryable: boolean;
  settled_state: CleanupSettledState;
  status: CleanupStatus;
  target_id: string;
  target_type:
    | "knowledge_base"
    | "source_document"
    | "source_watch_rule"
    | "webhook"
    | "import_preview"
    | "retrieval_trace";
  updated_at: string;
}

export interface AsyncDeleteResponse extends JsonObject {
  cleanup_operation: CleanupOperation;
  id?: string;
  document_id?: string;
  knowledge_base_id?: string;
  status: "deleted";
}

export interface CleanupRetryResponse {
  cleanup_operation: CleanupOperation;
}

export interface ChangeSet extends JsonObject {
  applied_at: string | null;
  base_version_id: string | null;
  created_at: string;
  description: string | null;
  diff: JsonObject;
  discarded_at: string | null;
  id: string;
  items: JsonObject[];
  knowledge_base_id: string;
  metadata: JsonObject;
  status: string;
  target_version_id: string | null;
  title: string;
  trigger_type: string;
}

export interface ChangeSetSummary extends JsonObject {
  applied_at: string | null;
  base_version_id: string | null;
  created_at: string;
  description: string | null;
  discarded_at: string | null;
  id: string;
  knowledge_base_id: string;
  metadata: JsonObject;
  status: string;
  target_version_id: string | null;
  title: string;
  trigger_type: string;
}

export interface ApiEnvelope<TData> {
  data?: TData;
  error?: ApiErrorPayload;
  pagination?: Pagination;
  request_id?: string;
}

export interface ListResult<TItem = JsonObject> {
  data: TItem[];
  pagination: Pagination;
  requestId?: string;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
  next_cursor?: string | null;
}

export type JsonObject = Record<string, unknown>;
export type RetrievalDisplayMetadataValue = string | number | boolean | string[];
export type RetrievalDisplayMetadata = Record<string, RetrievalDisplayMetadataValue>;
export type ObjectStorageOperationClass = "class_a" | "class_b" | "free" | "unknown";
export type ObjectStorageOperationStatus = "success" | "error";
export type ObjectStorageOperationPressureState = "normal" | "degraded" | "disabled";
export type VisibilityOrigin = "canonical" | "upstream_inherited" | "fork_owned";
export type KnowledgeBaseType = "canonical" | "fork";
export type ForkOwnerType = "user" | "workspace" | "customer" | "session" | "custom";

export interface DurationSummary {
  count: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  latestMs: number;
}

export interface ObjectStorageOperationHotCaller extends JsonObject {
  caller: string;
  count: number;
  classA: number;
  classB: number;
}

export interface ObjectStorageOperationHotOperation extends JsonObject {
  operation: string;
  count: number;
  operationClass: ObjectStorageOperationClass;
}

export interface ObjectStorageOperationMetricsStatus extends JsonObject {
  countsByCaller: Record<string, number>;
  countsByClass: Record<ObjectStorageOperationClass, number>;
  countsByOperation: Record<string, number>;
  countsByStatus: Record<ObjectStorageOperationStatus, number>;
  enabled: boolean;
  hotCallers: readonly ObjectStorageOperationHotCaller[];
  hotOperations: readonly ObjectStorageOperationHotOperation[];
  latency: DurationSummary | null;
  retryCount: number;
  total: number;
  windowSeconds: number;
}

export interface ObjectStorageOperationPressureStatus extends JsonObject {
  classA: {
    count: number;
    warningThreshold: number;
  };
  classB: {
    count: number;
    warningThreshold: number;
  };
  guidanceKeys: readonly string[];
  hotCallers: readonly ObjectStorageOperationHotCaller[];
  hotOperations: readonly ObjectStorageOperationHotOperation[];
  metricsEnabled: boolean;
  status: ObjectStorageOperationPressureState;
  warningsEnabled: boolean;
  windowSeconds: number;
}

export interface RuntimeObjectStorageOperationLimits extends JsonObject {
  metricsEnabled: boolean;
  pressureWarningsEnabled: boolean;
  metricsWindowSeconds: number;
  classAWarningThreshold: number;
  classBWarningThreshold: number;
  previewCacheEnabled: boolean;
  previewMaxChars: number;
  sourceWatchIncrementalScanEnabled: boolean;
  multipartPartSizeBytes: number;
}

export interface SystemHealthStatus extends JsonObject {
  dependencies?: {
    metrics?: {
      objectStorageOperations?: ObjectStorageOperationMetricsStatus;
      [key: string]: unknown;
    };
    pressure?: {
      objectStorageOperations?: ObjectStorageOperationPressureStatus;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  limits?: {
    objectStorageOperations?: RuntimeObjectStorageOperationLimits;
    [key: string]: unknown;
  };
  runtime?: Record<string, unknown>;
  status: string;
}

export interface ForkOwner extends JsonObject {
  display_name: string | null;
  external_owner_id: string;
  owner_type: ForkOwnerType;
}

export interface KnowledgeBase extends JsonObject {
  created_at: string;
  current_version_id: string;
  fork_owner: ForkOwner | null;
  id: string;
  knowledge_base_type: KnowledgeBaseType;
  name: string;
  output_language: string;
  purpose: string;
  retrieval: JsonObject;
  schema: JsonObject;
  slug: string;
  status: "ready" | "indexing" | "outdated" | "failed";
  sync_status: "not_applicable" | "synced" | "outdated" | "syncing" | "failed";
  template: string;
  updated_at: string;
  upstream_base_version_id: string | null;
  upstream_knowledge_base_id: string | null;
  upstream_synced_version_id: string | null;
}

export interface ResolveKnowledgeBaseForkInput extends JsonObject {
  display_name?: string | null;
  external_owner_id: string;
  owner_type: ForkOwnerType;
  upstream_version_id?: string | null;
}

export interface ResolveKnowledgeBaseForkResponse extends JsonObject {
  created: boolean;
  fork: KnowledgeBase;
}

export interface ForkSyncRequest extends JsonObject {
  target_upstream_version_id?: string | null;
}

export interface ForkSyncConflict extends JsonObject {
  fork_page_id: string;
  slug: string;
  title: string;
  type: "fork_page_conflict";
  upstream_page_id: string;
}

export interface ForkSyncResponse extends JsonObject {
  change_set_id: string | null;
  conflicts: ForkSyncConflict[];
  current_fork_version_id: string;
  fork_id: string;
  operation_id: string | null;
  source_upstream_version_id: string | null;
  sync_status: "synced" | "outdated" | "syncing" | "failed";
  target_upstream_version_id: string | null;
}

export interface ForkDeleteResponse extends JsonObject {
  cleanup: CleanupOperation;
  id: string;
  status: "deleted";
}

export interface ForkSubmissionEvidence extends JsonObject {
  metadata?: JsonObject;
  snippet?: string | null;
  source_type?: string | null;
  title?: string | null;
  url?: string | null;
}

export interface ForkSubmissionCitation extends JsonObject {
  label?: string | null;
  locator?: string | null;
  metadata?: JsonObject;
  title?: string | null;
  url?: string | null;
}

export interface CreateForkSubmissionInput extends JsonObject {
  citations?: ForkSubmissionCitation[];
  content: string;
  content_type?: "markdown" | "text";
  evidence?: ForkSubmissionEvidence[];
  metadata?: JsonObject;
  source_path?: string;
  source_url?: string | null;
  title: string;
}

export interface ForkSubmissionResponse extends JsonObject {
  citations: ForkSubmissionCitation[];
  document: JsonObject;
  evidence: ForkSubmissionEvidence[];
  fork_id: string;
  job: JsonObject;
  upstream_knowledge_base_id: string | null;
}

export type SourceWatchScanItemKind =
  | "discovered"
  | "skipped"
  | "new"
  | "changed"
  | "unchanged"
  | "delete_candidate"
  | "failed";

export interface SourceWatchScanItem extends JsonObject {
  comparison_status?: string;
  content_hash?: string;
  cursor?: JsonObject;
  item_kind: SourceWatchScanItemKind;
  payload: JsonObject;
  safe_error?: JsonObject | null;
  source_identity: string;
  source_path?: string;
  source_url?: string;
}

export type KnowledgeCheckType =
  | "orphan_pages"
  | "broken_wikilinks"
  | "missing_pages"
  | "missing_sources"
  | "duplicate_candidates"
  | "contradiction_candidates"
  | "sparse_communities"
  | "bridge_pages"
  | "weak_evidence"
  | "missing_context"
  | "semantic_consistency";

export interface SourceRef extends JsonObject {
  document_id: string;
  evidence_kind?: "text" | "image_caption" | string;
  locator?: string;
  locator_status: SourceEvidenceLocatorStatus;
  media_asset_id?: string;
  parsed_content_id?: string;
  source_anchor_id?: string;
  warning_codes: string[];
  visibility_origin?: VisibilityOrigin;
}

export interface RetrievalMediaEvidence extends JsonObject {
  caption?: string;
  document_id: string;
  evidence_kind: "image_caption";
  locator?: string;
  locator_status: SourceEvidenceLocatorStatus;
  media_asset_id: string;
  parsed_content_id?: string;
  preview: {
    available: boolean;
    endpoint: string;
  };
  source_anchor_id?: string;
  warning_codes: string[];
  visibility_origin?: VisibilityOrigin;
}

export type SourceEvidenceKind = "text" | "image_caption" | "ocr";

export type SourceEvidenceLocatorStatus =
  | "resolved"
  | "not_provided"
  | "not_found"
  | "ambiguous"
  | "unsupported";

export interface SourceEvidenceWarning extends JsonObject {
  code: string;
  details?: JsonObject;
  message: string;
}

export interface SourceEvidenceOcrMetadata extends JsonObject {
  artifact_object_key?: string;
  bbox?: JsonObject;
  block_index: number;
  confidence?: number;
  engine?: string;
  page_number: number;
  provider?: string;
}

export interface SourceEvidenceMediaMetadata extends JsonObject {
  caption_status: "not_configured" | "pending" | "generated" | "skipped" | "failed";
  height?: number | null;
  locator?: JsonObject;
  media_asset_id: string;
  mime_type?: string;
  object_key?: string;
  preview: {
    endpoint: string;
  };
  width?: number | null;
}

export interface SourceEvidenceRequest extends JsonObject {
  allow_fallback?: boolean;
  context_chars?: number;
  evidence_kind?: SourceEvidenceKind;
  knowledge_base_id?: string;
  locator?: string;
  max_chars?: number;
  media_asset_id?: string;
  parsed_content_id?: string;
  source_anchor_id?: string;
}

export interface SourceEvidenceResponse extends JsonObject {
  captioned_markdown_object_key?: string;
  content_hash: string;
  context_after: string;
  context_before: string;
  context_truncated: boolean;
  document_id: string;
  evidence_kind: SourceEvidenceKind;
  knowledge_base_id?: string;
  locator?: string;
  locator_status: SourceEvidenceLocatorStatus;
  media_evidence?: SourceEvidenceMediaMetadata;
  normalized_markdown_object_key?: string;
  ocr_evidence?: SourceEvidenceOcrMetadata;
  owner_knowledge_base_id?: string | null;
  parsed_content_id: string;
  parser_name: string;
  parser_version: string;
  plain_text_object_key?: string;
  source_anchor_id?: string;
  source_object_key: string;
  text: string;
  text_truncated: boolean;
  upstream_resource_id?: string | null;
  visibility_origin?: VisibilityOrigin;
  warnings: SourceEvidenceWarning[];
}

export interface SourceEvidenceResolveItem extends SourceEvidenceRequest {
  document_id: string;
}

export interface SourceEvidenceBatchRequest extends JsonObject {
  items: SourceEvidenceResolveItem[];
}

export interface SourceEvidenceBatchItemResult extends JsonObject {
  document_id: string;
  error?: ApiErrorPayload;
  evidence?: SourceEvidenceResponse;
  index: number;
  status: "resolved" | "error";
}

export interface SourceEvidenceBatchResponse extends JsonObject {
  items: SourceEvidenceBatchItemResult[];
  limits: {
    max_items: number;
    total_output_max_chars: number;
  };
  total_text_chars: number;
  truncated: boolean;
}

export interface ApiNextActionLink extends JsonObject {
  href: string;
  method: "GET" | "POST";
  rel: string;
  resource_type: string;
}

export interface IngestJob extends JsonObject {
  change_set_id?: string | null;
  content_hash?: string;
  created_at?: string;
  deduped?: boolean;
  document_id: string | null;
  error?: JsonObject | null;
  events?: JsonObject[];
  id: string;
  idempotency_key?: string | null;
  input_snapshot_id?: string;
  knowledge_base_id: string;
  locked_by_knowledge_base_id?: string | null;
  parsed_content_id?: string | null;
  progress: number;
  progress_message?: string;
  retry_of_job_id?: string | null;
  stage: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  updated_at?: string;
}

export interface DocumentUploadResponse extends JsonObject {
  document: JsonObject;
  job: IngestJob;
  links: ApiNextActionLink[];
  request_id?: string;
  resources: {
    knowledge_base_id: string;
    source_document_id: string;
    job_id: string;
  };
}

export interface BatchIngestJobStatusResult extends JsonObject {
  error?: ApiErrorPayload;
  index: number;
  job?: IngestJob;
  job_id: string;
  status: "resolved" | "error";
}

export interface BatchIngestJobStatusResponse extends JsonObject {
  items: BatchIngestJobStatusResult[];
  limits: {
    max_items: number;
  };
  request_id?: string;
}

export interface KnowledgeBaseIngestProgress extends JsonObject {
  counts: {
    canceled: number;
    completed: number;
    failed: number;
    queued: number;
    running: number;
    total: number;
  };
  jobs: IngestJob[];
  knowledge_base_id: string;
  latest_job_created_at: string | null;
  latest_job_updated_at: string | null;
  links: ApiNextActionLink[];
  overall_progress: number;
  retrieve_ready: boolean;
  stage_counts: Record<string, number>;
  request_id?: string;
}

export interface UploadSourceDocumentsAndWaitResult extends JsonObject {
  failedJobs: BatchIngestJobStatusResult[];
  jobs: BatchIngestJobStatusResult[];
  progress: KnowledgeBaseIngestProgress;
  requestIds: string[];
  uploads: DocumentUploadResponse[];
}

export interface RetrieveResolvedEvidenceOptions extends JsonObject {
  allow_fallback?: boolean;
  context_chars?: number;
  max_chars?: number;
  max_items?: number;
}

export interface OcrRetryRequest extends JsonObject {
  mode?: "retry_failed" | "reprocess" | "force_for_pdf";
  page_numbers?: number[];
}

export interface ParsedContent extends JsonObject {
  document_id: string;
  id: string;
  normalized_markdown_object_key: string;
  ocr_blocks?: readonly unknown[];
  ocr_status?: string;
}

export interface GraphNode extends JsonObject {
  page_id: string;
  page_version_id?: string;
  source_refs: SourceRef[];
  title: string;
  type: string;
  visibility_origin?: VisibilityOrigin;
}

export interface GraphEdge extends JsonObject {
  algorithm?: GraphAlgorithmMetadata;
  edge_id: string;
  explanation?: string;
  from_page_id: string;
  relation_type: string;
  signal_contributions?: GraphSignalContribution[];
  source_document_ids: string[];
  to_page_id: string;
  visibility_origin?: VisibilityOrigin;
  weight: number;
}

export interface GraphAlgorithmMetadata extends JsonObject {
  name: string;
  version: string;
  weights?: Record<string, number>;
}

export interface GraphSignalContribution extends JsonObject {
  evidence_refs?: JsonObject[];
  reason_codes: string[];
  score: number;
  type: "wikilink" | "shared_source" | "common_neighbor" | "type_affinity" | string;
  weight: number;
}

export interface KnowledgeGraphResponse extends JsonObject {
  edges: GraphEdge[];
  knowledge_base_id: string;
  nodes: GraphNode[];
  version_id?: string;
}

export interface GraphInsightStatus extends JsonObject {
  failure_reason: string | null;
  source_job_id: string | null;
  started_at: string | null;
  state: "queued" | "updating" | "partial" | "stale" | "ready" | "failed";
  updated_at: string | null;
}

export interface GraphInsightSnapshot extends JsonObject {
  algorithm: GraphAlgorithmMetadata;
  edge_count: number;
  graph_hash: string;
  node_count: number;
}

export interface GraphInsightsResponse extends JsonObject {
  bridge_pages: JsonObject[];
  communities: JsonObject[];
  empty_reasons: Record<string, string>;
  isolated_pages: JsonObject[];
  knowledge_base_id: string;
  knowledge_gaps: JsonObject[];
  snapshot: GraphInsightSnapshot;
  sparse_pages: JsonObject[];
  status: GraphInsightStatus;
  surprising_connections: JsonObject[];
}

export interface RetrieveRequest extends JsonObject {
  context_budget_tokens?: number;
  context_pack?: JsonObject;
  graph_depth?: number;
  graph_limit_per_result?: number;
  graph?: JsonObject;
  include_context_pack?: boolean;
  include_expand_hints?: boolean;
  include_graph?: boolean;
  include_resolved_evidence?: boolean;
  include_trace?: boolean;
  min_answer_confidence?: number;
  mode?: "hybrid" | "keyword" | "semantic" | "graph";
  no_answer_behavior?: RetrieveNoAnswerBehavior;
  page_types?: string[];
  query: string;
  relation_types?: string[];
  source_ids?: string[];
  resolved_evidence?: RetrieveResolvedEvidenceOptions;
  strict_evidence?: boolean;
  top_k?: number;
  version_id?: string;
}

export type RetrieveWarningCode =
  | "retrieve.rerank_failed"
  | "retrieve.rerank_timed_out"
  | "retrieve.answerability.low_confidence"
  | "retrieve.answerability.insufficient_evidence"
  | "retrieve.answerability.no_relevant_candidate"
  | "retrieve.answerability.over_filtered"
  | "retrieve.answerability.no_citation_support"
  | "retrieve.answerability.ambiguous_intent"
  | "retrieve.answerability.index_not_ready"
  | string;

export type RetrieveAnswerabilityStatus = "answerable" | "partial" | "not_answerable";

export type RetrieveEvidenceSufficiency = "sufficient" | "partial" | "insufficient";

export type RetrieveRecommendedAction =
  | "answer_with_citations"
  | "answer_with_caveat"
  | "ask_clarifying_question"
  | "refuse_or_escalate"
  | "relax_filters"
  | "retry_after_ingest";

export type RetrieveAnswerabilityReasonCode =
  | "sufficient_evidence"
  | "partial_evidence"
  | "low_confidence"
  | "low_score_margin"
  | "insufficient_citations"
  | "no_relevant_candidate"
  | "over_filtered"
  | "index_not_ready"
  | "ambiguous_intent"
  | "context_pack_diagnostic_only"
  | "strict_evidence_required";

export type RetrieveNoAnswerBehavior = "diagnostic_results" | "empty_results";

export interface RetrieveAnswerability extends JsonObject {
  confidence: number;
  evidence_sufficiency: RetrieveEvidenceSufficiency;
  no_answer: boolean;
  reason_codes: RetrieveAnswerabilityReasonCode[];
  recommended_action: RetrieveRecommendedAction;
  status: RetrieveAnswerabilityStatus;
  thresholds: {
    answerable: number;
    min_citations: number;
    no_answer_behavior: RetrieveNoAnswerBehavior;
    partial: number;
    strict_evidence: boolean;
  };
}

export type RetrieveRerankTraceStatus = "disabled" | "skipped" | "applied" | "failed" | "timed_out";

export interface RetrieveTraceStage extends JsonObject {
  input: JsonObject;
  name: string;
  output: JsonObject;
}

export interface RetrieveTrace extends JsonObject {
  answerability?: RetrieveAnswerability;
  created_at?: string;
  id?: string;
  knowledge_base_id?: string;
  stages: RetrieveTraceStage[];
  warnings?: RetrieveWarningCode[];
}

export interface RetrieveContextBudgetOmittedItem extends JsonObject {
  category:
    | "system_pages"
    | "direct_hits"
    | "graph_expansions"
    | "citations"
    | "media_evidence"
    | "metadata";
  estimated_tokens: number;
  reason:
    | "budget_exceeded"
    | "budget_exhausted"
    | "duplicate_context"
    | "duplicate_source_noise"
    | "graph_neighbor_after_source_evidence"
    | "lower_source_match"
    | "missing_locator_evidence";
  resource_id: string;
  resource_type: "page" | "section" | "edge" | "citation" | "media_asset" | "metadata";
}

export interface RetrieveContextBudget extends JsonObject {
  categories?: JsonObject;
  omitted_items: RetrieveContextBudgetOmittedItem[];
  total_budget_tokens: number;
  total_tokens_estimated?: number;
  truncated?: boolean;
  truncated_categories: string[];
  used_tokens: number;
}

export interface RetrievalResult extends JsonObject {
  citations: JsonObject[];
  display_metadata?: RetrievalDisplayMetadata;
  expand_depth: number;
  expanded_from_page_id: string | null;
  graph_signals: JsonObject[];
  lexical_rank: number | null;
  match_reasons: JsonObject[];
  media_evidence?: RetrievalMediaEvidence[];
  page_id: string;
  page_version_id: string;
  result_id: string;
  retrieval_reason: string;
  score: JsonObject;
  score_contribution?: JsonObject;
  section: string;
  section_id?: string;
  semantic_rank: number | null;
  title: string;
  type: string;
}

export interface RetrievalGraphNode extends JsonObject {
  display_metadata?: RetrievalDisplayMetadata;
  page_id: string;
  page_version_id?: string;
  source_refs: SourceRef[];
  title: string;
  type: string;
  visibility_origin?: VisibilityOrigin;
}

export interface RetrieveResponse extends JsonObject {
  answerability: RetrieveAnswerability;
  citations: JsonObject[];
  context_budget?: RetrieveContextBudget | null;
  context_pack?: JsonObject | null;
  graph_expansions: JsonObject[];
  knowledge_base_id: string;
  media_evidence: RetrievalMediaEvidence[];
  request_id?: string;
  resolved_evidence?: SourceEvidenceBatchResponse;
  results: RetrievalResult[];
  target_knowledge_base_type: KnowledgeBaseType;
  trace?: RetrieveTrace | null;
  visibility_summary: {
    canonical: number;
    fork_owned: number;
    upstream_inherited: number;
  };
  warnings?: RetrieveWarningCode[];
}

export interface RetrieveExpandRequest extends JsonObject {
  context_budget_tokens?: number;
  depth?: number;
  exclude_page_ids?: string[];
  include_context_pack?: boolean;
  include_resolved_evidence?: boolean;
  relation_types?: string[];
  resolved_evidence?: RetrieveResolvedEvidenceOptions;
  seed_edge_ids?: string[];
  seed_page_ids: string[];
}

export interface RetrieveExpandResponse extends JsonObject {
  answerability: RetrieveAnswerability;
  context_pack_delta: JsonObject | null;
  edges: JsonObject[];
  expanded_results: RetrievalResult[];
  knowledge_base_id: string;
  next_expansion: JsonObject;
  nodes: RetrievalGraphNode[];
  request_id?: string;
  resolved_evidence?: SourceEvidenceBatchResponse;
}

export interface CreateKnowledgeCheckInput extends JsonObject {
  checks?: KnowledgeCheckType[];
  page_ids?: string[];
  source_document_ids?: string[];
}

export interface KnowledgeCheckFinding extends JsonObject {
  affected_object_ids?: string[];
  confidence?: number;
  evidence?: JsonObject[];
  finding_id?: string;
  message: string;
  page_id: string | null;
  severity: "low" | "medium" | "high";
  source_refs?: SourceRef[];
  suggested_action?: JsonObject;
  type: KnowledgeCheckType;
}

export interface KnowledgeCheckSemanticRun extends JsonObject {
  failure_reason?: string;
  findings_count: number;
  model?: string;
  model_call_id?: string;
  output_status?: "succeeded" | "failed";
  prompt_version_id?: string;
  provider_name?: string;
  repair_attempts: number;
  status: "skipped" | "completed" | "partial" | "failed";
  structured_output_attempt_count?: number;
  structured_output_final_status?: "succeeded" | "failed";
  structured_output_mode?: "strict_json_schema" | "json_object_fallback";
  structured_output_validation_issues?: string[];
  trace?: JsonObject;
  usage?: JsonObject;
}

export interface KnowledgeCheckResponse extends JsonObject {
  check_id: string;
  checks: KnowledgeCheckType[];
  configuration_snapshot: JsonObject;
  created_at: string;
  findings: KnowledgeCheckFinding[];
  knowledge_base_id: string;
  page_ids: string[];
  progress: number;
  semantic_run: KnowledgeCheckSemanticRun;
  status: "queued" | "running" | "completed" | "failed";
  updated_at: string;
}

export type WebhookEventType =
  | "document.ingest.started"
  | "document.ingest.completed"
  | "document.ingest.failed"
  | "wiki_draft.created"
  | "knowledge_check.completed"
  | "page.created"
  | "page.updated"
  | "change_set.created"
  | "version.created"
  | "rollback.completed"
  | "knowledge_base.reindexed"
  | "cleanup.completed"
  | "cleanup.failed"
  | "retrieve.readiness.changed"
  | "webhook.test";

export interface CreateWebhookInput extends JsonObject {
  events: WebhookEventType[];
  knowledge_base_id?: string | null;
  secret?: string;
  url: string;
}

export interface UpdateWebhookInput extends JsonObject {
  events?: WebhookEventType[];
  secret?: string | null;
  status?: "enabled" | "disabled";
  url?: string;
}

export interface WebhookResponse extends JsonObject {
  created_at: string;
  delivery_backend: JsonObject;
  events: WebhookEventType[];
  id: string;
  knowledge_base_id: string | null;
  latest_delivery: WebhookDeliveryResponse | null;
  secret_configured: boolean;
  status: "enabled" | "disabled";
  updated_at: string;
  url: string;
}

export interface WebhookDeliveryResponse extends JsonObject {
  attempt_count: number;
  created_at: string;
  delivered_at: string | null;
  event_type: WebhookEventType;
  id: string;
  knowledge_base_id: string | null;
  last_attempt_at: string | null;
  max_attempts: number;
  next_attempt_at: string | null;
  payload: JsonObject;
  request_trace: JsonObject;
  response_body: string | null;
  response_status: number | null;
  signing: JsonObject;
  status: "queued" | "delivered" | "failed";
  webhook_id: string;
}

export interface VerifyWebhookSignatureInput {
  body: string;
  contentDigest: string;
  deliveryId: string;
  now?: Date;
  secret: string;
  signature: string;
  timestamp: string;
  toleranceSeconds?: number;
}

const defaultBaseUrl = "http://127.0.0.1:18080/v1";

export class FococontextApiError extends Error {
  readonly code: ApiErrorCode | undefined;
  readonly details: Record<string, unknown> | undefined;
  readonly isStaleResource: boolean;
  readonly locale: string | undefined;
  readonly messageKey: string | undefined;
  readonly staleResource: StaleResourceErrorDetails | undefined;
  readonly status: number;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "FococontextApiError";
    this.status = status;
    this.code = payload?.code;
    this.details = payload?.details;
    this.locale = payload?.locale;
    this.messageKey = payload?.message_key;
    this.isStaleResource = isStaleResourceErrorCode(payload?.code);
    this.staleResource = this.isStaleResource
      ? readStaleResourceErrorDetails(payload?.details)
      : undefined;
  }
}

export class FococontextClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly locale: string | (() => string | undefined) | undefined;

  constructor(options: FococontextClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeFococontextBaseUrl(options.baseUrl);
    this.fetchFn = options.fetchFn ?? fetch;
    this.locale = options.locale;
  }

  listKnowledgeBases<TItem = JsonObject>(options: ListOptions = {}): Promise<ListResult<TItem>> {
    return this.requestList("/knowledge-bases", toPageQuery(options), options);
  }

  createKnowledgeBase<TData = JsonObject>(
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson("/knowledge-bases", input, options);
  }

  getKnowledgeBase<TData = JsonObject>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}`, options);
  }

  updateKnowledgeBase<TData = JsonObject>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}`, options, {
      body: input,
      method: "PATCH",
    });
  }

  deleteKnowledgeBase<TData = AsyncDeleteResponse>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}`, options, {
      method: "DELETE",
    });
  }

  listKnowledgeBaseForks<TItem = KnowledgeBase>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/forks`,
      toPageQuery(options),
      options,
    );
  }

  createKnowledgeBaseFork<TData = ResolveKnowledgeBaseForkResponse>(
    knowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}/forks`, input, options);
  }

  resolveKnowledgeBaseFork<TData = ResolveKnowledgeBaseForkResponse>(
    knowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/forks/resolve`,
      input,
      options,
    );
  }

  getKnowledgeBaseFork<TData = KnowledgeBase>(
    forkId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/forks/${encodePath(forkId)}`, options);
  }

  deleteKnowledgeBaseFork<TData = ForkDeleteResponse>(
    forkId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/forks/${encodePath(forkId)}`, options, {
      method: "DELETE",
    });
  }

  syncKnowledgeBaseFork<TData = ForkSyncResponse>(
    forkId: string,
    input: ForkSyncRequest = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/forks/${encodePath(forkId)}/sync`, input, options);
  }

  submitForkKnowledge<TData = ForkSubmissionResponse>(
    forkId: string,
    input: CreateForkSubmissionInput,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/forks/${encodePath(forkId)}/submissions`, input, options);
  }

  listDatasetConfigurationPresets<TData = JsonObject[]>(
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson("/dataset-configuration-presets", options);
  }

  getDatasetConfiguration<TData = JsonObject>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/dataset-configuration`,
      options,
    );
  }

  updateDatasetConfiguration<TData = JsonObject>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/dataset-configuration`,
      options,
      {
        body: input,
        method: "PATCH",
      },
    );
  }

  listSystemPages<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/system-pages`,
      toPageQuery(options),
      options,
    );
  }

  getSystemPage<TData = JsonObject>(
    knowledgeBaseId: string,
    type: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/system-pages/${encodePath(type)}`,
      options,
    );
  }

  validateMarkdownContract<TData = JsonObject>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/markdown-contract/validate`,
      {},
      options,
    );
  }

  exportMarkdown<TData = JsonObject>(
    knowledgeBaseId: string,
    input: { format?: "single_file" | "zip"; include_sources?: boolean } = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/markdown-export`,
      options,
      {
        method: "GET",
        query: input,
      },
    );
  }

  rebuildKnowledgeBaseIndexes<TData = JsonObject>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}/reindex`, {}, options);
  }

  listSourceDocuments<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/documents`,
      toPageQuery(options),
      options,
    );
  }

  uploadSourceDocument<TData = DocumentUploadResponse>(
    knowledgeBaseId: string,
    input: UploadSourceDocumentInput,
  ): Promise<TData> {
    const formData = new FormData();

    formData.set("file", input.file);
    formData.set(
      "data",
      JSON.stringify({
        ...(input.name === undefined ? {} : { display_name: input.name }),
        ...(input.sourcePath === undefined ? {} : { source_path: input.sourcePath }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      }),
    );

    return this.request<TData>(`/knowledge-bases/${encodePath(knowledgeBaseId)}/documents`, input, {
      body: formData,
      method: "POST",
    });
  }

  async uploadSourceDocumentsAndWait(
    knowledgeBaseId: string,
    input: UploadSourceDocumentsAndWaitInput,
  ): Promise<UploadSourceDocumentsAndWaitResult> {
    const uploads: DocumentUploadResponse[] = [];
    const requestIds: string[] = [];

    for (const documentInput of input.documents) {
      const idempotencyKey = documentInput.idempotencyKey ?? input.idempotencyKey;
      const uploadInput: UploadSourceDocumentInput = {
        ...documentInput,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      };
      const upload = await this.uploadSourceDocument<DocumentUploadResponse>(
        knowledgeBaseId,
        uploadInput,
      );
      uploads.push(upload);
      pushRequestId(requestIds, upload);
    }

    const jobIds = uploads.map((upload) => upload.resources.job_id);
    const startedAt = Date.now();
    const timeoutMs = input.timeoutMs ?? 120_000;
    const pollIntervalMs = input.pollIntervalMs ?? 1000;
    let latestBatch: BatchIngestJobStatusResponse = {
      items: [],
      limits: {
        max_items: 50,
      },
    };
    let latestProgress = await this.getKnowledgeBaseIngestProgress(knowledgeBaseId, input);

    while (Date.now() - startedAt <= timeoutMs) {
      latestBatch = {
        items: [],
        limits: {
          max_items: sdkBatchJobStatusMaxItems,
        },
      };
      for (
        let startIndex = 0;
        startIndex < jobIds.length;
        startIndex += sdkBatchJobStatusMaxItems
      ) {
        const batch = await this.getIngestJobStatuses(
          {
            job_ids: jobIds.slice(startIndex, startIndex + sdkBatchJobStatusMaxItems),
          },
          input,
        );
        latestBatch = mergeBatchIngestJobStatusResponses(latestBatch, batch, startIndex);
        pushRequestId(requestIds, batch);
      }
      latestProgress = await this.getKnowledgeBaseIngestProgress(knowledgeBaseId, input);
      pushRequestId(requestIds, latestProgress);

      const allTerminal = latestBatch.items.every((item) => {
        if (item.status === "error") {
          return true;
        }

        return (
          item.job?.status === "completed" ||
          item.job?.status === "failed" ||
          item.job?.status === "canceled"
        );
      });

      if (allTerminal && latestProgress.retrieve_ready) {
        break;
      }

      await delay(pollIntervalMs);
    }

    return {
      uploads,
      jobs: latestBatch.items,
      failedJobs: latestBatch.items.filter(
        (item) => item.status === "error" || item.job?.status === "failed",
      ),
      progress: latestProgress,
      requestIds,
    };
  }

  createSourceUploadSession<TData = JsonObject>(
    knowledgeBaseId: string,
    input: CreateUploadSessionInput,
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/documents/upload-sessions`,
      {
        file_name: input.fileName,
        mime_type: input.mimeType,
        size: input.size,
        ...(input.contentHash === undefined ? {} : { content_hash: input.contentHash }),
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.sourcePath === undefined ? {} : { source_path: input.sourcePath }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
      input,
    );
  }

  finalizeSourceUploadSession<TData = DocumentUploadResponse>(
    knowledgeBaseId: string,
    uploadSessionId: string,
    input: FinalizeUploadSessionInput,
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/documents/upload-sessions/${encodePath(
        uploadSessionId,
      )}/finalize`,
      {
        content_hash: input.contentHash,
      },
      input,
    );
  }

  createTextSourceDocument<TData = DocumentUploadResponse>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/documents/text`,
      input,
      options,
    );
  }

  createUrlSourceDocument<TData = DocumentUploadResponse>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/documents/url`,
      input,
      options,
    );
  }

  getSourceDocument<TData = JsonObject>(
    documentId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/documents/${encodePath(documentId)}`, options);
  }

  deleteSourceDocument<TData = AsyncDeleteResponse>(
    documentId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/documents/${encodePath(documentId)}`, options, {
      method: "DELETE",
    });
  }

  getSourceDocumentParsedContent<TData = JsonObject>(
    documentId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/documents/${encodePath(documentId)}/parsed-content`, options);
  }

  getSourceDocumentEvidence<TData = SourceEvidenceResponse>(
    documentId: string,
    input: SourceEvidenceRequest = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/documents/${encodePath(documentId)}/evidence`, options, {
      method: "GET",
      query: {
        allow_fallback: input.allow_fallback,
        context_chars: input.context_chars,
        evidence_kind: input.evidence_kind,
        knowledge_base_id: input.knowledge_base_id,
        locator: input.locator,
        max_chars: input.max_chars,
        media_asset_id: input.media_asset_id,
      },
    });
  }

  resolveSourceEvidence<TData = SourceEvidenceBatchResponse>(
    input: SourceEvidenceBatchRequest,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson("/source-evidence/resolve", input, options);
  }

  getCleanupOperation<TData = CleanupOperation>(
    cleanupOperationId: string,
    options: CleanupOperationItemListOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/cleanup-operations/${encodePath(cleanupOperationId)}`, options, {
      method: "GET",
      query: toCleanupItemPageQuery(options),
    });
  }

  retryCleanupOperation<TData = CleanupRetryResponse>(
    cleanupOperationId: string,
    options: CleanupOperationItemListOptions = {},
  ): Promise<TData> {
    return this.requestJson(
      `/cleanup-operations/${encodePath(cleanupOperationId)}/retry`,
      options,
      {
        body: {},
        method: "POST",
        query: toCleanupItemPageQuery(options),
      },
    );
  }

  listSourceDocumentMediaAssets<TData = JsonObject>(
    documentId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/documents/${encodePath(documentId)}/media-assets`, options);
  }

  retryMediaAssetCaption<TData = JsonObject>(
    mediaAssetId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/media-assets/${encodePath(mediaAssetId)}/caption/retry`, {}, options);
  }

  getMediaAssetPreview<TData = JsonObject>(
    mediaAssetId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/media-assets/${encodePath(mediaAssetId)}/preview`, options);
  }

  retrySourceDocumentOcr<TData = JsonObject>(
    documentId: string,
    input: OcrRetryRequest = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/documents/${encodePath(documentId)}/ocr/retry`, input, options);
  }

  previewSourceDeletionImpact<TData = JsonObject>(
    documentId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/documents/${encodePath(documentId)}/delete-preview`, {}, options);
  }

  reingestSourceDocument<TData = JsonObject>(
    documentId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/documents/${encodePath(documentId)}/reingest`, {}, options);
  }

  listKnowledgeBaseJobs<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/jobs`,
      toPageQuery(options),
      options,
    );
  }

  getKnowledgeBaseIngestProgress<TData = KnowledgeBaseIngestProgress>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}/ingest-progress`, options);
  }

  getIngestJobStatus<TData = IngestJob>(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/jobs/${encodePath(jobId)}`, options);
  }

  getIngestJobStatuses<TData = BatchIngestJobStatusResponse>(
    input: { job_ids: string[] },
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson("/jobs/batch", input, options);
  }

  retryIngestJob<TData = JsonObject>(jobId: string, options: RequestOptions = {}): Promise<TData> {
    return this.postJson(`/jobs/${encodePath(jobId)}/retry`, {}, options);
  }

  cancelIngestJob<TData = JsonObject>(jobId: string, options: RequestOptions = {}): Promise<TData> {
    return this.postJson(`/jobs/${encodePath(jobId)}/cancel`, {}, options);
  }

  createBatchImport<TData = JsonObject>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}/imports`, input, options);
  }

  retrieveKnowledgeContext<TData = RetrieveResponse>(
    knowledgeBaseId: string,
    input: RetrieveRequest,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/retrieve`,
      input,
      options,
    );
  }

  retrieveKnowledgeContextWithEvidence<TData = RetrieveResponse>(
    knowledgeBaseId: string,
    input: RetrieveRequest,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.retrieveKnowledgeContext<TData>(
      knowledgeBaseId,
      {
        ...input,
        include_resolved_evidence: true,
      },
      options,
    );
  }

  expandRetrievedGraphContext<TData = RetrieveExpandResponse>(
    knowledgeBaseId: string,
    input: RetrieveExpandRequest,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/retrieve/expand`,
      input,
      options,
    );
  }

  expandRetrievedGraphContextWithEvidence<TData = RetrieveExpandResponse>(
    knowledgeBaseId: string,
    input: RetrieveExpandRequest,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.expandRetrievedGraphContext<TData>(
      knowledgeBaseId,
      {
        ...input,
        include_resolved_evidence: true,
      },
      options,
    );
  }

  getKnowledgeGraph<TData = KnowledgeGraphResponse>(
    knowledgeBaseId: string,
    query: Record<string, string | number | boolean | undefined> = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}/graph`, options, {
      method: "GET",
      query,
    });
  }

  getGraphInsights<TData = GraphInsightsResponse>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/knowledge-bases/${encodePath(knowledgeBaseId)}/graph/insights`, options);
  }

  refreshGraphInsights<TData = JsonObject>(
    knowledgeBaseId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/graph/insights/refresh`,
      {},
      options,
    );
  }

  listWikiPages<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/pages`,
      toPageQuery(options),
      options,
    );
  }

  getWikiPage<TData = JsonObject>(pageId: string, options: RequestOptions = {}): Promise<TData> {
    return this.getJson(`/pages/${encodePath(pageId)}`, options);
  }

  updateWikiPage<TData = JsonObject>(
    pageId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/pages/${encodePath(pageId)}`, options, {
      body: input,
      method: "PATCH",
    });
  }

  listRelatedWikiPages<TItem = JsonObject>(
    pageId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(`/pages/${encodePath(pageId)}/related`, toPageQuery(options), options);
  }

  listWikiPageVersions<TItem = JsonObject>(
    pageId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(`/pages/${encodePath(pageId)}/versions`, toPageQuery(options), options);
  }

  listKnowledgeBasePageVersions<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/page-versions`,
      toPageQuery(options),
      options,
    );
  }

  listSourceWatchRules<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/source-watch-rules`,
      toPageQuery(options),
      options,
    );
  }

  createSourceWatchRule<TData = JsonObject>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/source-watch-rules`,
      input,
      options,
    );
  }

  getSourceWatchRuleStatus<TData = JsonObject>(
    ruleId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/source-watch-rules/${encodePath(ruleId)}`, options);
  }

  updateSourceWatchRule<TData = JsonObject>(
    ruleId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.requestJson(`/source-watch-rules/${encodePath(ruleId)}`, options, {
      body: input,
      method: "PATCH",
    });
  }

  scanSourceWatchRule<TData = JsonObject>(
    ruleId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/source-watch-rules/${encodePath(ruleId)}/scan`, {}, options);
  }

  getScheduledImportJob<TData = JsonObject>(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/scheduled-import-jobs/${encodePath(jobId)}`, options);
  }

  listScheduledImportJobItems<TItem = SourceWatchScanItem>(
    jobId: string,
    options: SourceWatchScanItemListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/scheduled-import-jobs/${encodePath(jobId)}/items`,
      toPageQuery(options),
      options,
    );
  }

  listSourceWatchScanHistory<TItem = JsonObject>(
    ruleId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/source-watch-rules/${encodePath(ruleId)}/scans`,
      toPageQuery(options),
      options,
    );
  }

  disableSourceWatchRule<TData = JsonObject>(
    ruleId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/source-watch-rules/${encodePath(ruleId)}/disable`, {}, options);
  }

  enableSourceWatchRule<TData = JsonObject>(
    ruleId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/source-watch-rules/${encodePath(ruleId)}/enable`, {}, options);
  }

  createKnowledgeCheck<TData = KnowledgeCheckResponse>(
    knowledgeBaseId: string,
    input: CreateKnowledgeCheckInput,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/knowledge-checks`,
      input,
      options,
    );
  }

  getKnowledgeCheck<TData = KnowledgeCheckResponse>(
    checkId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/knowledge-checks/${encodePath(checkId)}`, options);
  }

  listKnowledgeCheckFindings<TItem = KnowledgeCheckFinding>(
    checkId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-checks/${encodePath(checkId)}/findings`,
      toPageQuery(options),
      options,
    );
  }

  listKnowledgeBaseVersions<TItem = JsonObject>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/versions`,
      toPageQuery(options),
      options,
    );
  }

  getChangeSet<TData = JsonObject>(
    changeSetId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/change-sets/${encodePath(changeSetId)}`, options);
  }

  listKnowledgeBaseChangeSets<TItem = ChangeSetSummary>(
    knowledgeBaseId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/change-sets`,
      toPageQuery(options),
      options,
    );
  }

  applyChangeSet<TData = JsonObject>(
    changeSetId: string,
    input: JsonObject = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/change-sets/${encodePath(changeSetId)}/apply`, input, options);
  }

  discardChangeSet<TData = JsonObject>(
    changeSetId: string,
    input: JsonObject = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/change-sets/${encodePath(changeSetId)}/discard`, input, options);
  }

  rollbackKnowledgeBase<TData = JsonObject>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/rollback`,
      input,
      options,
    );
  }

  rollbackWikiPage<TData = JsonObject>(
    pageId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/pages/${encodePath(pageId)}/rollback`, input, options);
  }

  createWebhook<TData = { webhook: WebhookResponse }>(
    input: CreateWebhookInput,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson("/webhooks", input, options);
  }

  listWebhooks<TItem = WebhookResponse>(options: ListOptions = {}): Promise<ListResult<TItem>> {
    return this.requestList("/webhooks", toPageQuery(options), options);
  }

  getWebhook<TData = { webhook: WebhookResponse }>(
    webhookId: string,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.getJson(`/webhooks/${encodePath(webhookId)}`, options);
  }

  updateWebhook<TData = { webhook: WebhookResponse }>(
    webhookId: string,
    input: UpdateWebhookInput,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.patchJson(`/webhooks/${encodePath(webhookId)}`, input, options);
  }

  sendWebhookTestEvent<TData = { delivery: WebhookDeliveryResponse }>(
    webhookId: string,
    input: JsonObject = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(`/webhooks/${encodePath(webhookId)}/test`, input, options);
  }

  listWebhookDeliveries<TItem = WebhookDeliveryResponse>(
    webhookId: string,
    options: ListOptions = {},
  ): Promise<ListResult<TItem>> {
    return this.requestList(
      `/webhooks/${encodePath(webhookId)}/deliveries`,
      toPageQuery(options),
      options,
    );
  }

  submitWikiDraft<TData = JsonObject>(
    knowledgeBaseId: string,
    input: JsonObject,
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson(
      `/knowledge-bases/${encodePath(knowledgeBaseId)}/wiki-drafts`,
      input,
      options,
    );
  }

  createApiKeyBoundary<TData = JsonObject>(
    input: JsonObject = {},
    options: RequestOptions = {},
  ): Promise<TData> {
    return this.postJson("/api-keys", input, options);
  }

  private getJson<TData>(path: string, options: RequestOptions): Promise<TData> {
    return this.requestJson(path, options, { method: "GET" });
  }

  private postJson<TData>(path: string, body: JsonObject, options: RequestOptions): Promise<TData> {
    return this.requestJson(path, options, { body, method: "POST" });
  }

  private patchJson<TData>(
    path: string,
    body: JsonObject,
    options: RequestOptions,
  ): Promise<TData> {
    return this.requestJson(path, options, { body, method: "PATCH" });
  }

  private requestJson<TData>(
    path: string,
    options: RequestOptions,
    init: JsonRequestInit,
  ): Promise<TData> {
    return this.request(path, options, {
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      method: init.method,
      query: init.query,
    });
  }

  private async requestList<TItem>(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
    options: RequestOptions,
  ): Promise<ListResult<TItem>> {
    const envelope = await this.requestEnvelope<TItem[]>(path, options, {
      method: "GET",
      query,
    });

    return {
      data: envelope.data ?? [],
      pagination: envelope.pagination ?? {
        has_more: false,
        page: 1,
        page_size: envelope.data?.length ?? 0,
        total: envelope.data?.length ?? 0,
      },
      ...(envelope.request_id === undefined ? {} : { requestId: envelope.request_id }),
    };
  }

  private async request<TData>(
    path: string,
    options: RequestOptions,
    init: ClientRequestInit,
  ): Promise<TData> {
    const envelope = await this.requestEnvelope<TData>(path, options, init);

    return attachRequestId(envelope.data as TData, envelope.request_id);
  }

  private async requestEnvelope<TData>(
    path: string,
    options: RequestOptions,
    init: ClientRequestInit,
  ): Promise<ApiEnvelope<TData>> {
    const requestInit: RequestInit = {
      headers: createHeaders(this.apiKey, this.locale, options, init.headers),
      method: init.method,
    };

    if (init.body !== undefined) {
      requestInit.body = init.body;
    }

    const response = await this.fetchFn(buildUrl(this.baseUrl, path, init.query), requestInit);
    const envelope = (await readEnvelope(response)) as ApiEnvelope<TData>;

    if (!response.ok || envelope.error !== undefined) {
      throw new FococontextApiError(
        envelope.error?.message ?? response.statusText,
        response.status,
        envelope.error,
      );
    }

    return envelope;
  }
}

export function createFococontextClient(options: FococontextClientOptions = {}): FococontextClient {
  return new FococontextClient(options);
}

export async function verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean> {
  const prefix = "sha256=";

  if (!input.signature.startsWith(prefix)) {
    return false;
  }

  const timestampTime = parseWebhookTimestamp(input.timestamp);

  if (!Number.isFinite(timestampTime)) {
    return false;
  }

  const toleranceSeconds = input.toleranceSeconds ?? 300;
  const now = input.now ?? new Date();
  const skewSeconds = Math.abs(now.getTime() - timestampTime) / 1000;

  if (skewSeconds > toleranceSeconds) {
    return false;
  }

  const expectedSignature = await createWebhookSignature(input);

  return constantTimeEqual(input.signature, expectedSignature);
}

export function normalizeFococontextBaseUrl(value?: string): string {
  const normalized = value?.trim() || defaultBaseUrl;
  const withoutTrailingSlash = normalized.replace(/\/+$/u, "");

  if (withoutTrailingSlash.endsWith("/v1")) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/v1`;
}

interface JsonRequestInit {
  body?: JsonObject | undefined;
  method: string;
  query?: Record<string, string | number | boolean | undefined> | undefined;
}

interface ClientRequestInit {
  body?: BodyInit | undefined;
  headers?: HeadersInit | undefined;
  method: string;
  query?: Record<string, string | number | boolean | undefined> | undefined;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): string {
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function createHeaders(
  apiKey: string | undefined,
  clientLocale: string | (() => string | undefined) | undefined,
  options: RequestOptions,
  requestHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(requestHeaders);

  if (options.headers !== undefined) {
    for (const [key, value] of new Headers(options.headers).entries()) {
      headers.set(key, value);
    }
  }
  if (apiKey !== undefined && apiKey.length > 0) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }
  if (options.idempotencyKey !== undefined) {
    headers.set("idempotency-key", options.idempotencyKey);
  }
  const locale = resolveClientLocale(clientLocale);

  if (locale !== undefined) {
    headers.set("x-fococontext-locale", locale);
    headers.set("accept-language", locale);
  }

  return headers;
}

function resolveClientLocale(
  locale: string | (() => string | undefined) | undefined,
): string | undefined {
  const resolved = typeof locale === "function" ? locale() : locale;
  const normalized = resolved?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

async function readEnvelope(response: Response): Promise<ApiEnvelope<unknown>> {
  const text = await response.text();

  if (text.trim().length === 0) {
    return {};
  }

  return JSON.parse(text) as ApiEnvelope<unknown>;
}

function toPageQuery(options: ListOptions): Record<string, string | number | boolean | undefined> {
  const query: Record<string, string | number | boolean | undefined> = {
    page: options.page,
    page_size: options.pageSize,
  };

  for (const [key, value] of Object.entries(options)) {
    if (
      key !== "headers" &&
      key !== "idempotencyKey" &&
      key !== "page" &&
      key !== "pageSize" &&
      typeof value !== "object"
    ) {
      query[key] = value;
    }
  }

  return query;
}

function toCleanupItemPageQuery(
  options: CleanupOperationItemListOptions,
): Record<string, string | number | boolean | undefined> {
  return {
    items_page: options.itemsPage,
    items_page_size: options.itemsPageSize,
  };
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function parseWebhookTimestamp(value: string): number {
  if (/^\d+$/u.test(value)) {
    return Number.parseInt(value, 10) * 1000;
  }

  return Date.parse(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const sdkBatchJobStatusMaxItems = 50;

function mergeBatchIngestJobStatusResponses(
  current: BatchIngestJobStatusResponse,
  next: BatchIngestJobStatusResponse,
  indexOffset: number,
): BatchIngestJobStatusResponse {
  return {
    items: [
      ...current.items,
      ...next.items.map((item) => ({
        ...item,
        index: indexOffset + item.index,
      })),
    ],
    limits: {
      max_items: Math.min(current.limits.max_items, next.limits.max_items),
    },
  };
}

function attachRequestId<TData>(data: TData, requestId: string | undefined): TData {
  if (requestId === undefined || typeof data !== "object" || data === null || Array.isArray(data)) {
    return data;
  }

  return {
    ...(data as Record<string, unknown>),
    request_id: requestId,
  } as TData;
}

function pushRequestId(requestIds: string[], value: { request_id?: string }): void {
  if (value.request_id !== undefined) {
    requestIds.push(value.request_id);
  }
}

async function createWebhookSignature(input: VerifyWebhookSignatureInput): Promise<string> {
  const signed = [input.deliveryId, input.timestamp, input.contentDigest, input.body].join(".");
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    {
      hash: "SHA-256",
      name: "HMAC",
    },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signed),
  );

  return `sha256=${arrayBufferToHex(signature)}`;
}

function arrayBufferToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function isStaleResourceErrorCode(code: ApiErrorCode | undefined): boolean {
  return code === "resource_deleted" || code === "resource_cleanup_pending";
}

function readStaleResourceErrorDetails(
  details: Record<string, unknown> | undefined,
): StaleResourceErrorDetails | undefined {
  if (details === undefined) {
    return undefined;
  }
  if (
    (details.target_type !== "knowledge_base" && details.target_type !== "source_document") ||
    typeof details.target_id !== "string"
  ) {
    return undefined;
  }

  return {
    target_type: details.target_type,
    target_id: details.target_id,
    ...(typeof details.cleanup_operation_id === "string" || details.cleanup_operation_id === null
      ? { cleanup_operation_id: details.cleanup_operation_id }
      : {}),
    ...(typeof details.guidance === "string" ? { guidance: details.guidance } : {}),
  };
}
