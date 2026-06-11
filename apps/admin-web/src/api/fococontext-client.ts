export interface FococontextApiClientOptions {
  adminBaseUrl?: string
  apiKey?: string
  baseUrl?: string
  fetchFn?: typeof fetch
  locale?: string | (() => string | undefined)
}

export interface ListOptions {
  cursor?: string
  limit?: number
  page?: number
  pageSize?: number
}

export interface CleanupOperationItemListOptions {
  itemsPage?: number
  itemsPageSize?: number
}

export interface FococontextApiClient {
  cancelJob(jobId: string): Promise<JobDetail>
  createKnowledgeCheck(
    knowledgeBaseId: string,
    input: CreateKnowledgeCheckInput
  ): Promise<KnowledgeCheckResponse>
  createKnowledgeBaseFork(
    knowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput
  ): Promise<ResolveKnowledgeBaseForkResponse>
  createKnowledgeBase(input: CreateKnowledgeBaseInput): Promise<KnowledgeBase>
  submitForkKnowledge(
    forkId: string,
    input: CreateForkSubmissionInput
  ): Promise<ForkSubmissionResponse>
  createSourceWatchRule(
    knowledgeBaseId: string,
    input: CreateSourceWatchRuleInput
  ): Promise<SourceWatchRuleEnvelope>
  disableSourceWatchRule(ruleId: string): Promise<SourceWatchRuleEnvelope>
  enableSourceWatchRule(ruleId: string): Promise<SourceWatchRuleEnvelope>
  deleteKnowledgeBaseFork(forkId: string): Promise<DeletedFork>
  deleteSourceDocument(documentId: string): Promise<DeletedSourceDocument>
  deleteKnowledgeBase(id: string): Promise<DeletedKnowledgeBase>
  getCleanupOperation(
    operationId: string,
    options?: CleanupOperationItemListOptions
  ): Promise<CleanupOperation>
  listCleanupOperations(
    options?: ListOptions
  ): Promise<CleanupOperationListResult>
  retryCleanupOperation(
    operationId: string,
    options?: CleanupOperationItemListOptions
  ): Promise<CleanupOperationRetryResult>
  reingestSourceDocument(documentId: string): Promise<DocumentUploadResult>
  retryMediaAssetCaption(mediaAssetId: string): Promise<JobDetail>
  retrySourceDocumentOcr(
    documentId: string,
    input?: OcrRetryRequest
  ): Promise<JobDetail>
  getGraph(knowledgeBaseId: string): Promise<GraphResponse>
  getGraphInsights(knowledgeBaseId: string): Promise<GraphInsightsResponse>
  refreshGraphInsights(knowledgeBaseId: string): Promise<JobDetail>
  getJob(jobId: string): Promise<JobDetail>
  getIngestJobStatuses(input: {
    job_ids: string[]
  }): Promise<BatchIngestJobStatusResponse>
  getKnowledgeBase(id: string): Promise<KnowledgeBase>
  getKnowledgeBaseIngestProgress(
    knowledgeBaseId: string
  ): Promise<KnowledgeBaseIngestProgress>
  getKnowledgeBaseFork(forkId: string): Promise<KnowledgeBase>
  getDatasetConfiguration(
    knowledgeBaseId: string
  ): Promise<DatasetConfiguration>
  getKnowledgeCheck(checkId: string): Promise<KnowledgeCheckResponse>
  getChangeSet(changeSetId: string): Promise<ChangeSet>
  getAdminSession(): Promise<AdminLoginResult>
  getScheduledImportJob(jobId: string): Promise<ScheduledImportJobEnvelope>
  getMediaAssetPreview(mediaAssetId: string): Promise<MediaAssetPreviewEnvelope>
  getSourceDocument(documentId: string): Promise<SourceDocumentDetail>
  getSystemSettings(): Promise<SystemSettingsStatus>
  getSystemStatus(): Promise<SystemHealthStatus>
  getWikiPage(pageId: string): Promise<WikiPage>
  listKnowledgeBases(options?: ListOptions): Promise<KnowledgeBaseListResult>
  listKnowledgeBaseForks(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<KnowledgeBaseListResult>
  listJobs(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<JobListResult>
  listDatasetConfigurationPresets(): Promise<DatasetConfigurationPreset[]>
  listKnowledgeVersions(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<KnowledgeVersionListResult>
  listKnowledgeBaseChangeSets(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<ChangeSetListResult>
  listKnowledgeBasePageVersions(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<WikiPageVersionListResult>
  listPageVersions(
    pageId: string,
    options?: ListOptions
  ): Promise<WikiPageVersionListResult>
  listRelatedPages(
    pageId: string,
    options?: ListOptions
  ): Promise<RelatedPageListResult>
  listSourceDocuments(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<SourceDocumentListResult>
  listSourceWatchRules(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<SourceWatchRuleListResult>
  listSourceWatchScans(
    ruleId: string,
    options?: ListOptions
  ): Promise<ScheduledImportJobListResult>
  listSystemPages(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<SystemPageListResult>
  listWikiPages(
    knowledgeBaseId: string,
    options?: ListOptions
  ): Promise<WikiPageListResult>
  loginAdmin(input: AdminLoginInput): Promise<AdminLoginResult>
  logoutAdmin(): Promise<AdminLogoutResult>
  previewSourceDeleteImpact(documentId: string): Promise<DeleteImpactPreview>
  request<TData>(path: string, init?: RequestInit): Promise<TData>
  resolveKnowledgeBaseFork(
    knowledgeBaseId: string,
    input: ResolveKnowledgeBaseForkInput
  ): Promise<ResolveKnowledgeBaseForkResponse>
  exportMarkdown(knowledgeBaseId: string): Promise<MarkdownExportResult>
  rollbackKnowledgeBase(
    knowledgeBaseId: string,
    input: RollbackKnowledgeBaseInput
  ): Promise<RollbackResult>
  rollbackPage(
    pageId: string,
    input: RollbackPageInput
  ): Promise<RollbackResult>
  validateMarkdownContract(
    knowledgeBaseId: string
  ): Promise<MarkdownContractValidationResult>
  retrieveKnowledgeContext(
    knowledgeBaseId: string,
    input: RetrieveRequestInput
  ): Promise<RetrieveResponse>
  expandRetrievedGraphContext(
    knowledgeBaseId: string,
    input: RetrieveExpandRequestInput
  ): Promise<RetrieveExpandResponse>
  retryJob(jobId: string): Promise<JobDetail>
  rebuildKnowledgeBaseIndexes(knowledgeBaseId: string): Promise<JobDetail>
  scanSourceWatchRule(ruleId: string): Promise<SourceWatchScanEnvelope>
  syncKnowledgeBaseFork(
    forkId: string,
    input?: SyncKnowledgeBaseForkInput
  ): Promise<SyncKnowledgeBaseForkResponse>
  uploadSourceDocument(
    knowledgeBaseId: string,
    input: UploadSourceDocumentInput
  ): Promise<DocumentUploadResult>
  createSourceUploadSession(
    knowledgeBaseId: string,
    input: CreateSourceUploadSessionInput
  ): Promise<CreateUploadSessionResult>
  finalizeSourceUploadSession(
    knowledgeBaseId: string,
    uploadSessionId: string,
    input: FinalizeSourceUploadSessionInput
  ): Promise<DocumentUploadResult>
  updateKnowledgeBase(
    id: string,
    input: UpdateKnowledgeBaseInput
  ): Promise<KnowledgeBase>
  updateSourceWatchRule(
    ruleId: string,
    input: UpdateSourceWatchRuleInput
  ): Promise<SourceWatchRuleEnvelope>
  updateDatasetConfiguration(
    knowledgeBaseId: string,
    input: UpdateDatasetConfigurationInput
  ): Promise<DatasetConfiguration>
}

interface ApiEnvelope<TData> {
  data?: TData
  error?: {
    code: string
    message: string
    details?: unknown
    locale?: string
    message_key?: string
  }
  request_id?: string
}

interface ApiListEnvelope<TData> {
  data: TData[]
  pagination: Pagination
  request_id?: string
}

export interface Pagination {
  has_more: boolean
  next_cursor?: string | null
  page: number
  page_size: number
  total: number
}

export interface AdminLoginInput {
  password: string
  username: string
}

export interface AdminLoginResult {
  authenticated: boolean
  username: string
}

export interface AdminLogoutResult {
  authenticated: boolean
  cookie: string
}

export type KnowledgeBaseStatus = "ready" | "indexing" | "outdated" | "failed"
export type KnowledgeBaseType = "canonical" | "fork"
export type VisibilityOrigin = "canonical" | "upstream_inherited" | "fork_owned"
export type KnowledgeBaseTemplate = "general" | "research" | "team_knowledge"
export type KnowledgeBaseOutputLanguage = "auto" | "zh-CN" | "en-US"
export type KnowledgeBaseSyncStatus =
  | "failed"
  | "not_applicable"
  | "outdated"
  | "synced"
  | "syncing"
export type ForkOwnerType =
  | "custom"
  | "customer"
  | "session"
  | "user"
  | "workspace"

export interface ForkOwner {
  display_name: string | null
  external_owner_id: string
  owner_type: ForkOwnerType
}

export interface KnowledgeBase {
  created_at: string
  current_version_id: string
  description?: string
  fork_owner: ForkOwner | null
  id: string
  knowledge_base_type: KnowledgeBaseType
  name: string
  output_language: KnowledgeBaseOutputLanguage
  purpose: string
  retrieval: Record<string, unknown>
  schema: Record<string, unknown>
  slug: string
  status: KnowledgeBaseStatus
  sync_status: KnowledgeBaseSyncStatus
  template: KnowledgeBaseTemplate
  updated_at: string
  upstream_base_version_id: string | null
  upstream_knowledge_base_id: string | null
  upstream_synced_version_id: string | null
}

export interface KnowledgeBaseListResult {
  data: KnowledgeBase[]
  pagination: Pagination
}

export interface DatasetConfigurationValues {
  knowledge_check: Record<string, unknown>
  markdown_contract: Record<string, unknown>
  ocr_policy: DatasetOcrPolicy
  output_language: KnowledgeBaseOutputLanguage
  prompt_templates: DatasetPromptTemplateValues
  purpose: string
  retrieval: Record<string, unknown>
  schema: Record<string, unknown>
  source_lifecycle: Record<string, unknown>
  source_watch: Record<string, unknown>
}

export type PromptPurpose =
  | "analysis"
  | "generation"
  | "merge"
  | "vision_caption"
  | "knowledge_check"
  | "wiki_draft"

export type PromptTemplateMode =
  | "built_in"
  | "custom_instructions"
  | "override_template"

export type DatasetPromptTemplateValues = Record<
  PromptPurpose,
  DatasetPromptTemplateValue
>

export interface DatasetPromptTemplateValue {
  built_in_prompt_id: string
  custom_instructions: string | null
  mode: PromptTemplateMode
  override_template: string | null
  updated_at?: string | null
}

export interface DatasetOcrPolicy {
  max_pages_per_document: number | null
  min_text_chars_per_page: number | null
  mode: "auto" | "disabled" | "force_for_pdf"
}

export interface DatasetConfiguration {
  created_at: string
  id: string
  knowledge_base_id: string
  latest_snapshot_id: string
  metadata: Record<string, unknown>
  preset_id: KnowledgeBaseTemplate
  status: "active"
  updated_at: string
  updated_by: string | null
  values: DatasetConfigurationValues
  version: number
}

export interface DatasetConfigurationPreset {
  default_values: DatasetConfigurationValues
  description: string
  id: KnowledgeBaseTemplate
  name: string
  validation: Record<string, unknown>
  version: string
}

export interface UpdateDatasetConfigurationInput {
  metadata?: Record<string, unknown>
  preset_id?: KnowledgeBaseTemplate
  values?: Partial<DatasetConfigurationValues>
}

export interface CreateKnowledgeBaseInput {
  description?: string
  name?: string
  output_language?: KnowledgeBaseOutputLanguage
  template?: KnowledgeBaseTemplate
}

export interface UpdateKnowledgeBaseInput {
  description?: string
  name?: string
  output_language?: KnowledgeBaseOutputLanguage
  purpose?: string
  reset_to_template?: Array<"purpose" | "schema">
  retrieval?: Record<string, unknown>
  schema?: Record<string, unknown>
}

export interface DeletedKnowledgeBase {
  cleanup_operation: CleanupOperation
  id: string
  status: "deleted"
}

export interface DeletedFork {
  cleanup: CleanupOperation
  id: string
  status: "deleted"
}

export interface DeletedSourceDocument extends SourceDocument {
  cleanup_operation: CleanupOperation
  document_id: string
}

export interface ResolveKnowledgeBaseForkInput {
  display_name?: string | null
  external_owner_id: string
  owner_type: ForkOwnerType
}

export interface ResolveKnowledgeBaseForkResponse {
  created: boolean
  fork: KnowledgeBase
}

export interface SyncKnowledgeBaseForkInput {
  target_upstream_version_id?: string | null
}

export interface SyncKnowledgeBaseForkConflict {
  fork_page_id: string
  slug: string
  title: string
  type: "fork_page_conflict"
  upstream_page_id: string
}

export interface SyncKnowledgeBaseForkResponse {
  change_set_id: string | null
  conflicts: SyncKnowledgeBaseForkConflict[]
  current_fork_version_id: string
  fork_id: string
  operation_id: string | null
  source_upstream_version_id: string | null
  sync_status: Exclude<KnowledgeBaseSyncStatus, "not_applicable">
  target_upstream_version_id: string | null
}

export interface ForkSubmissionEvidence {
  metadata?: Record<string, unknown>
  snippet?: string | null
  source_type?: string | null
  title?: string | null
  url?: string | null
}

export interface ForkSubmissionCitation {
  label?: string | null
  locator?: string | null
  metadata?: Record<string, unknown>
  title?: string | null
  url?: string | null
}

export interface CreateForkSubmissionInput {
  citations?: ForkSubmissionCitation[]
  content: string
  content_type?: "markdown" | "text"
  evidence?: ForkSubmissionEvidence[]
  metadata?: Record<string, unknown>
  source_path?: string
  source_url?: string | null
  title: string
}

export interface ForkSubmissionResponse {
  citations: ForkSubmissionCitation[]
  document: SourceDocumentDetail
  evidence: ForkSubmissionEvidence[]
  fork_id: string
  job: JobDetail
  upstream_knowledge_base_id: string | null
}

export interface CleanupOperation {
  attempt_count?: number
  canceled_at?: string | null
  completed_at?: string | null
  created_at: string
  failed_at?: string | null
  id: string
  item_counts: {
    database_rows: number
    deleted: number
    failed: number
    object_keys: number
    pending: number
    skipped: number
    total: number
  }
  items_pagination?: {
    has_more: boolean
    page: number
    page_size: number
    total: number
  }
  items?: CleanupOperationItem[]
  knowledge_base_id: string | null
  last_error?: Record<string, unknown> | null
  max_attempts?: number
  phase:
    | "queued"
    | "manifest"
    | "fencing"
    | "object_cleanup"
    | "database_cleanup"
    | "retention"
    | "completed"
    | "failed"
    | "canceled"
  retryable: boolean
  settled_state: CleanupSettledState
  retry_after?: string | null
  queue_job_id?: string | null
  status: "queued" | "running" | "completed" | "failed" | "canceled"
  started_at?: string | null
  target_id: string
  target_type:
    | "knowledge_base"
    | "source_document"
    | "source_watch_rule"
    | "webhook"
    | "import_preview"
    | "retrieval_trace"
  updated_at: string
}

export interface CleanupSettledState {
  database: CleanupPhaseArtifactState
  is_settled: boolean
  object_storage: CleanupPhaseArtifactState
  phase: CleanupOperation["phase"]
  residual_artifacts: {
    failed: number
    pending: number
    total: number
  }
}

export interface CleanupPhaseArtifactState {
  failed: number
  residual: number
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "canceled"
    | "not_applicable"
  total: number
}

export interface CleanupOperationItem {
  attempt_count: number
  completed_at: string | null
  id: string
  item_type: "object" | "database_row" | "reference" | "audit"
  last_error: Record<string, unknown> | null
  max_attempts: number
  object_key: string | null
  operation_id: string
  phase: CleanupOperation["phase"]
  resource_id: string | null
  resource_type: string | null
  retry_after: string | null
  retained_until: string | null
  skip_reason: string | null
  status: "pending" | "running" | "deleted" | "skipped" | "failed"
  table_name: string | null
}

export interface CleanupOperationListResult {
  data: CleanupOperation[]
  pagination: Pagination
}

export interface CleanupOperationRetryResult {
  cleanup_operation: CleanupOperation
}

export type SourceDocumentStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "deleted"
export type SourceType = "file" | "text" | "url" | "wiki_draft"
export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
export type JobStage =
  | "uploading"
  | "parsing"
  | "ocr"
  | "captioning"
  | "analyzing"
  | "generating"
  | "merging"
  | "indexing"

export interface SourceDocument {
  content_hash: string
  created_at: string
  display_name: string
  id: string
  knowledge_base_id: string
  metadata: Record<string, unknown>
  mime_type: string
  name: string
  object_key: string
  ocr_status?: string
  ocr_summary?: Record<string, unknown>
  size: number
  source_path?: string
  source_type: SourceType
  source_url?: string
  status: SourceDocumentStatus
  updated_at: string
}

export interface Job {
  change_set_id: string | null
  content_hash: string
  created_at: string
  deduped: boolean
  document_id: string | null
  error: Record<string, unknown> | null
  id: string
  idempotency_key: string | null
  input_snapshot_id: string
  knowledge_base_id: string
  locked_by_knowledge_base_id: string | null
  parsed_content_id: string | null
  progress: number
  progress_message: string
  retry_of_job_id: string | null
  stage: JobStage
  status: JobStatus
  updated_at: string
}

export interface JobEvent {
  created_at: string
  message: string
  metadata: Record<string, unknown>
  stage: JobStage
  status: JobStatus
  type:
    | "job.queued"
    | "job.running"
    | "job.completed"
    | "job.failed"
    | "job.canceled"
}

export interface BackgroundOperation {
  created_at: string
  cursor: Record<string, unknown>
  failed_count: number
  id: string
  job_id: string | null
  knowledge_base_id: string | null
  last_item_id: string | null
  metadata: Record<string, unknown>
  operation_kind: string
  processed_count: number
  safe_error: Record<string, unknown> | null
  stage: string
  status: string
  total_count: number | null
  updated_at: string
}

export interface JobDetail extends Job {
  background_operations: readonly BackgroundOperation[]
  events: readonly JobEvent[]
}

export interface JobListResult {
  data: Job[]
  pagination: Pagination
}

export interface BatchIngestJobStatusResponse {
  items: Array<{
    error?: {
      code: string
      details?: unknown
      message: string
      message_key?: string
    }
    index: number
    job?: JobDetail
    job_id: string
    status: "resolved" | "error"
  }>
  limits: {
    max_items: number
  }
}

export interface KnowledgeBaseIngestProgress {
  counts: {
    canceled: number
    completed: number
    failed: number
    queued: number
    running: number
    total: number
  }
  jobs: JobDetail[]
  knowledge_base_id: string
  latest_job_created_at: string | null
  latest_job_updated_at: string | null
  links: Array<{
    href: string
    method: "GET" | "POST"
    rel: string
    resource_type: string
  }>
  overall_progress: number
  retrieve_ready: boolean
  stage_counts: Record<JobStage, number>
}

export interface ParsedContent {
  created_at: string
  document_id: string
  error: Record<string, unknown> | null
  id: string
  locators: readonly Record<string, unknown>[]
  markdown_preview: string | null
  markdown_preview_error?: string
  markdown_preview_object_key: string | null
  markdown_preview_truncated: boolean
  media_assets: readonly MediaAsset[]
  normalized_markdown_object_key: string
  ocr_block_count?: number
  ocr_blocks?: readonly Record<string, unknown>[]
  ocr_completed_at?: string | null
  ocr_derived_segment_count?: number
  ocr_page_count?: number
  ocr_provider_metadata?: Record<string, unknown>
  ocr_status?: string
  ocr_summary?: Record<string, unknown>
  ocr_warnings?: readonly Record<string, unknown>[]
  parser_name: string
  parser_version: string
  tables: readonly Record<string, unknown>[]
  warnings: readonly Record<string, unknown>[]
}

export interface MediaAsset {
  caption: string | null
  caption_attempt_count: number
  caption_cache_hit: boolean
  caption_error: Record<string, unknown> | null
  caption_generated_at: string | null
  caption_model: string | null
  caption_model_call_id: string | null
  caption_prompt_version: string | null
  caption_provider_name: string | null
  caption_status:
    | "not_configured"
    | "pending"
    | "generated"
    | "skipped"
    | "failed"
  created_at: string
  document_id: string
  height: number | null
  id: string
  locator: Record<string, unknown>
  mime_type: string
  object_key: string
  parsed_content_id: string | null
  sha256: string
  updated_at: string
  width: number | null
}

export interface SourceDocumentDetail {
  delete_preview_required: boolean
  document: SourceDocument
  latest_job: Job | null
  media_assets: readonly MediaAsset[]
  page_versions: readonly Record<string, unknown>[]
  parsed_content: ParsedContent | null
  update_preview_required: boolean
  wiki_pages: readonly Record<string, unknown>[]
}

export interface SourceDocumentListResult {
  data: SourceDocument[]
  pagination: Pagination
}

export interface DocumentUploadResult {
  document: SourceDocument
  job: Job
  links: Array<{
    href: string
    method: "GET" | "POST"
    rel: string
    resource_type: string
  }>
  resources: {
    job_id: string
    knowledge_base_id: string
    source_document_id: string
  }
}

export interface UploadSession {
  content_hash: string | null
  created_at: string
  display_name: string
  document_id: string
  expires_at: string
  file_name: string
  id: string
  knowledge_base_id: string
  metadata: Record<string, unknown>
  mime_type: string
  object_key: string
  size: number
  source_path?: string
  status: "created" | "finalized" | "expired" | "canceled"
  updated_at: string
}

export interface PresignedUpload {
  expires_at: string
  headers: Record<string, string>
  method: "PUT"
  url: string
}

export interface CreateUploadSessionResult {
  presigned_upload: PresignedUpload
  upload_session: UploadSession
}

export interface OcrRetryRequest {
  mode?: "retry_failed" | "reprocess"
  page_numbers?: number[]
}

export interface UploadSourceDocumentInput {
  file: File
  sourcePath?: string
  tags?: string
}

export interface CreateSourceUploadSessionInput {
  contentHash?: string
  displayName?: string
  fileName: string
  metadata?: Record<string, unknown>
  mimeType: string
  size: number
  sourcePath?: string
}

export interface FinalizeSourceUploadSessionInput {
  contentHash: string
}

export type SourceWatchRuleStatus = "enabled" | "disabled"
export type SourceWatchSourceKind =
  | "s3_prefix"
  | "url_list"
  | "git_repo"
  | "mounted_directory"

export interface SourceWatchRule {
  auto_ingest: boolean
  created_at: string
  exclude_dirs: readonly string[]
  exclude_globs: readonly string[]
  execution: {
    enabled: boolean
    reason?:
      | "source_watch_execution_not_configured"
      | "source_watch_adapter_disabled"
      | "source_watch_credentials_missing"
  }
  id: string
  include_extensions: readonly string[]
  knowledge_base_id: string
  latest_scan: {
    changed_source_count: number
    delete_candidate_count: number
    new_source_count: number
    scanned_at: string
    scheduled_import_job_id: string
    skipped_count: number
    status: "completed" | "disabled" | "failed"
  } | null
  schedule: {
    cron: string | null
    enabled: boolean
    interval_seconds: number | null
    last_error: Record<string, unknown> | null
    last_run_at: string | null
    last_status: "completed" | "disabled" | "failed" | null
    next_run_at: string | null
    scheduler_status: "disabled" | "paused" | "scheduled" | "running"
    timezone: string | null
  }
  location: string
  max_file_size_mb: number | null
  name: string
  credential_profile: string | null
  adapter_options: Record<string, unknown>
  source_kind: SourceWatchSourceKind
  status: SourceWatchRuleStatus
  updated_at: string
}

export interface CreateSourceWatchRuleInput {
  adapter_options?: Record<string, unknown>
  auto_ingest?: boolean
  credential_profile?: string
  exclude_dirs?: string[]
  exclude_globs?: string[]
  include_extensions?: string[]
  location?: string
  max_file_size_mb?: number
  name?: string
  schedule?: {
    cron?: string | null
    enabled?: boolean
    interval_seconds?: number
    timezone?: string | null
  }
  source_kind?: SourceWatchSourceKind
}

export interface UpdateSourceWatchRuleInput {
  auto_ingest?: boolean
  exclude_dirs?: string[]
  exclude_globs?: string[]
  include_extensions?: string[]
  max_file_size_mb?: number | null
  name?: string
  schedule?: CreateSourceWatchRuleInput["schedule"]
}

export interface SourceWatchRuleEnvelope {
  rule: SourceWatchRule
}

export interface SourceWatchRuleListResult {
  data: SourceWatchRule[]
  pagination: Pagination
}

export interface DeleteImpactPreview {
  affected_edge_ids: string[]
  affected_page_ids: string[]
  apply_action: {
    method: "DELETE"
    path: string
    requires_preview_confirmation: boolean
  }
  can_apply: boolean
  change_set_id: string
  document_id: string
  impact: {
    affected_resources: Record<string, unknown>[]
    retrieval_index_update: {
      reason: string
      required: boolean
    }
    unsafe_reasons: string[]
  }
  knowledge_base_id: string
  status: "ready"
  system_page_keys: string[]
}

export interface SourceWatchScanSource {
  content_hash?: string
  metadata?: Record<string, unknown>
  name: string
  size?: number
  source_path?: string
  source_url?: string
}

export interface SourceWatchDeleteCandidate {
  delete_preview?: DeleteImpactPreview
  document_id?: string
  metadata?: Record<string, unknown>
  reason: string
  source_path?: string
}

export interface SourceWatchSkippedSource {
  metadata?: Record<string, unknown>
  reason: string
  source_path?: string
}

export interface ScheduledImportJob {
  created_at: string
  duration_ms: number | null
  error: Record<string, unknown> | null
  finished_at: string | null
  id: string
  knowledge_base_id: string
  next_retry_at: string | null
  retry_count: number
  retryable: boolean
  scan_result: {
    changed_sources: readonly SourceWatchScanSource[]
    delete_candidates: readonly SourceWatchDeleteCandidate[]
    new_sources: readonly SourceWatchScanSource[]
    skipped: readonly SourceWatchSkippedSource[]
  }
  scheduled_for: string | null
  source_watch_rule_id: string
  started_at: string
  status: "completed" | "disabled" | "failed"
  trigger_type: "manual" | "scheduled" | "retry"
  updated_at: string
}

export interface ScheduledImportJobListResult {
  data: ScheduledImportJob[]
  pagination: Pagination
}

export interface SourceWatchScan {
  changed_sources: readonly SourceWatchScanSource[]
  created_at: string
  delete_candidates: readonly SourceWatchDeleteCandidate[]
  execution: SourceWatchRule["execution"]
  knowledge_base_id: string
  new_sources: readonly SourceWatchScanSource[]
  scheduled_import_job: ScheduledImportJob
  scheduled_import_job_id: string
  skipped: readonly SourceWatchSkippedSource[]
  source_watch_rule_id: string
  status: "completed" | "disabled" | "failed"
}

export interface SourceWatchScanEnvelope {
  scan: SourceWatchScan
}

export interface ScheduledImportJobEnvelope {
  scheduled_import_job: ScheduledImportJob
}

export interface MediaAssetPreviewEnvelope {
  media_asset_preview: {
    caption: string | null
    caption_status: MediaAsset["caption_status"]
    document_id: string
    expires_at: string | null
    height: number | null
    locator: Record<string, unknown>
    media_asset_id: string
    mime_type: string
    object_key: string
    preview_url: string | null
    width: number | null
  }
}

export interface SystemPage {
  created_at: string
  id: string
  knowledge_base_id: string
  markdown: string
  title: string
  type: "index" | "overview" | "log" | "purpose" | "schema"
  updated_at: string
}

export interface SystemPageListResult {
  data: SystemPage[]
  pagination: Pagination
}

export interface WikiPage {
  created_at: string
  current_version_id: string | null
  frontmatter: Record<string, unknown>
  id: string
  knowledge_base_id: string
  markdown: string
  media_refs?: Record<string, unknown>[]
  metadata: Record<string, unknown>
  slug: string
  source_document_ids: string[]
  source_refs?: Record<string, unknown>[]
  status: string
  title: string
  type: string
  updated_at: string
  wikilink_targets?: Record<string, unknown>[]
}

export interface WikiPageListResult {
  data: WikiPage[]
  pagination: Pagination
}

export interface RelatedPage {
  current_version_id: string | null
  edge_id: string
  explanation: string
  page_id: string
  relation_type: string
  source_document_ids: string[]
  title: string
  type: string
  weight: number
}

export interface RelatedPageListResult {
  data: RelatedPage[]
  pagination: Pagination
}

export interface WikiPageVersion {
  change_set_id: string | null
  created_at: string
  created_by: string | null
  frontmatter: Record<string, unknown>
  id: string
  is_current: boolean
  knowledge_version_id: string | null
  markdown: string
  page_id: string
  page_slug?: string
  page_title?: string
  page_version_id: string
  prompt_version: string | null
  source_snapshot: readonly Record<string, unknown>[]
  summary: string | null
  title: string
  trigger: string | null
  version_number: number
}

export interface WikiPageVersionListResult {
  data: WikiPageVersion[]
  pagination: Pagination
}

export interface KnowledgeVersion {
  change_set_id: string | null
  created_at: string
  created_by: string | null
  id: string
  is_current: boolean
  knowledge_base_id: string
  status: string
  summary: string | null
  trigger: string | null
  version_id: string
  version_number: number
}

export interface KnowledgeVersionListResult {
  data: KnowledgeVersion[]
  pagination: Pagination
}

export interface ChangeSet {
  applied_at: string | null
  base_version_id: string | null
  created_at: string
  description: string | null
  diff: Record<string, unknown>
  discarded_at: string | null
  id: string
  items: readonly Record<string, unknown>[]
  knowledge_base_id: string
  metadata: Record<string, unknown>
  status: string
  target_version_id: string | null
  title: string
  trigger_type: string
}

export interface ChangeSetSummary {
  applied_at: string | null
  base_version_id: string | null
  created_at: string
  description: string | null
  discarded_at: string | null
  id: string
  knowledge_base_id: string
  metadata: Record<string, unknown>
  status: string
  target_version_id: string | null
  title: string
  trigger_type: string
}

export interface ChangeSetListResult {
  data: ChangeSetSummary[]
  pagination: Pagination
}

export interface SourceRef {
  document_id: string
  locator?: string
  name?: string
  parsed_content_id?: string
  source_anchor_id?: string
}

export interface GraphNode {
  page_id: string
  page_version_id: string
  source_refs: readonly SourceRef[]
  title: string
  type: string
}

export interface GraphEdge {
  algorithm?: GraphAlgorithmMetadata
  edge_id: string
  explanation: string
  from_page_id: string
  relation_type:
    | "wikilink"
    | "shared_source"
    | "common_neighbor"
    | "type_affinity"
    | "generated_relationship"
    | "evidence_relationship"
    | "manual"
  signal_contributions?: readonly GraphSignalContribution[]
  source_document_ids: readonly string[]
  to_page_id: string
  weight: number
}

export interface GraphAlgorithmMetadata {
  community_algorithm?: {
    name: string
    resolution?: number
    version: string
    weighted: boolean
  }
  name: string
  version: string
  weights?: Record<string, number>
}

export interface GraphSignalContribution {
  evidence_refs?: readonly Record<string, unknown>[]
  reason_codes: readonly string[]
  score: number
  type: "wikilink" | "shared_source" | "common_neighbor" | "type_affinity"
  weight: number
}

export interface GraphResponse {
  edges: readonly GraphEdge[]
  graph_readiness?: GraphInsightStatus
  knowledge_base_id: string
  nodes: readonly GraphNode[]
  version_id: string | null
}

export interface GraphCommunityMetadata {
  algorithm?: GraphAlgorithmMetadata["community_algorithm"]
  cohesion: number
  confidence?: number
  id: string
  member_count: number
  representative_page_ids: readonly string[]
  representative_titles?: readonly string[]
}

export interface GraphInsightItem {
  community?: GraphCommunityMetadata
  evidence_refs?: readonly Record<string, unknown>[]
  id?: string
  insight_type:
    | "isolated_page"
    | "sparse_page"
    | "bridge_page"
    | "knowledge_gap"
    | "community"
    | "surprising_connection"
  page_id?: string
  page_ids?: readonly string[]
  reason?: string
  reason_codes?: readonly string[]
  reasons?: readonly {
    edge_id: string
    explanation: string
    relation_type: GraphEdge["relation_type"]
  }[]
  score?: number
  severity?: "low" | "medium" | "high"
  signal_contributions?: readonly GraphSignalContribution[]
  title?: string
}

export interface GraphInsightStatus {
  failure_reason: string | null
  source_job_id: string | null
  started_at: string | null
  state: "queued" | "updating" | "partial" | "stale" | "ready" | "failed"
  updated_at: string | null
}

export interface GraphInsightSnapshot {
  algorithm: GraphAlgorithmMetadata
  edge_count: number
  graph_hash: string
  node_count: number
}

export interface GraphInsightsResponse {
  bridge_pages: readonly GraphInsightItem[]
  communities: readonly GraphInsightItem[]
  empty_reasons: Record<string, string>
  isolated_pages: readonly GraphInsightItem[]
  knowledge_base_id: string
  knowledge_gaps: readonly GraphInsightItem[]
  snapshot?: GraphInsightSnapshot
  sparse_pages?: readonly GraphInsightItem[]
  status: GraphInsightStatus
  surprising_connections: readonly GraphInsightItem[]
}

export const knowledgeCheckTypes = [
  "orphan_pages",
  "broken_wikilinks",
  "missing_pages",
  "missing_sources",
  "duplicate_candidates",
  "contradiction_candidates",
  "sparse_communities",
  "bridge_pages",
  "weak_evidence",
  "missing_context",
  "semantic_consistency",
] as const

export type KnowledgeCheckType = (typeof knowledgeCheckTypes)[number]
export type KnowledgeCheckStatus = "queued" | "running" | "completed" | "failed"

export interface CreateKnowledgeCheckInput {
  checks?: string[]
  page_ids?: string[]
  source_document_ids?: string[]
}

export interface KnowledgeCheckResponse {
  check_id: string
  checks: KnowledgeCheckType[]
  created_at: string
  configuration_snapshot: Record<string, unknown>
  findings: Array<{
    affected_object_ids?: string[]
    confidence?: number
    evidence?: Record<string, unknown>[]
    finding_id?: string
    message: string
    page_id: string | null
    severity: "low" | "medium" | "high"
    source_refs?: Record<string, unknown>[]
    suggested_action?: Record<string, unknown>
    type: KnowledgeCheckType
  }>
  knowledge_base_id: string
  page_ids: string[]
  progress: number
  semantic_run?: {
    failure_reason?: string
    findings_count: number
    model?: string
    model_call_id?: string
    output_status?: "succeeded" | "failed"
    prompt_version_id?: string
    provider_name?: string
    repair_attempts: number
    status: "skipped" | "completed" | "partial" | "failed"
    structured_output_attempt_count?: number
    structured_output_final_status?: "succeeded" | "failed"
    structured_output_mode?: "strict_json_schema" | "json_object_fallback"
    structured_output_validation_issues?: string[]
    trace?: Record<string, unknown>
    usage?: Record<string, unknown>
  }
  status: KnowledgeCheckStatus
  updated_at: string
}

export interface RetrieveRequestInput {
  context_budget_tokens?: number
  context_pack?: {
    enabled: boolean
    token_budget?: number
  }
  graph_depth?: number
  graph_limit_per_result?: number
  graph?: {
    depth?: number
    enabled: boolean
  }
  include_context_pack?: boolean
  include_expand_hints?: boolean
  include_graph?: boolean
  include_resolved_evidence?: boolean
  include_trace?: boolean
  min_answer_confidence?: number
  mode?: "hybrid" | "keyword" | "semantic" | "graph"
  no_answer_behavior?: "diagnostic_results" | "empty_results"
  page_types?: readonly string[]
  query: string
  relation_types?: readonly string[]
  resolved_evidence?: RetrieveResolvedEvidenceOptions
  source_ids?: readonly string[]
  strict_evidence?: boolean
  top_k?: number
  version_id?: string
}

export interface RetrieveExpandRequestInput {
  context_budget_tokens?: number
  depth?: number
  exclude_page_ids?: readonly string[]
  include_context_pack?: boolean
  include_resolved_evidence?: boolean
  relation_types?: readonly string[]
  resolved_evidence?: RetrieveResolvedEvidenceOptions
  seed_edge_ids?: readonly string[]
  seed_page_ids: readonly string[]
  version_id?: string
}

export interface RetrieveResolvedEvidenceOptions {
  allow_fallback?: boolean
  context_chars?: number
  max_chars?: number
  max_items?: number
}

export type RetrievalDisplayMetadataValue =
  | string
  | number
  | boolean
  | readonly string[]

export type RetrievalDisplayMetadata = Record<
  string,
  RetrievalDisplayMetadataValue
>

export interface RetrieveResponse {
  answerability: RetrieveAnswerability
  citations: readonly Record<string, unknown>[]
  context_budget: Record<string, unknown> | null
  context_pack: {
    answerability?: RetrieveAnswerability
    budget_tokens: number
    citations: readonly Record<string, unknown>[]
    content: string
    format: "markdown"
    included_page_ids: readonly string[]
    included_page_version_ids: readonly string[]
    media_evidence?: readonly RetrieveMediaEvidence[]
    used_tokens: number
  } | null
  expandable_graph: Record<string, unknown> | null
  graph_readiness?: GraphInsightStatus
  graph_expansions: readonly Record<string, unknown>[]
  knowledge_base_id: string
  mode: string
  media_evidence?: readonly RetrieveMediaEvidence[]
  query: string
  resolved_evidence?: SourceEvidenceBatchResponse
  results: readonly RetrieveResult[]
  target_knowledge_base_type: KnowledgeBaseType
  trace: {
    answerability?: RetrieveAnswerability
    created_at: string
    id: string
    stages: ReadonlyArray<{
      input: Record<string, unknown>
      name: string
      output: Record<string, unknown>
    }>
  } | null
  visibility_summary: {
    canonical: number
    fork_owned: number
    upstream_inherited: number
  }
  warnings: readonly string[]
}

export interface RetrieveExpandResponse {
  answerability: RetrieveAnswerability
  context_pack_delta: RetrieveResponse["context_pack"]
  edges: readonly Record<string, unknown>[]
  expanded_results: readonly RetrieveResult[]
  knowledge_base_id: string
  next_expansion: Record<string, unknown>
  nodes: readonly RetrieveGraphNode[]
  resolved_evidence?: SourceEvidenceBatchResponse
}

export interface RetrieveAnswerability {
  confidence: number
  evidence_sufficiency: "sufficient" | "partial" | "insufficient"
  no_answer: boolean
  reason_codes: readonly string[]
  recommended_action:
    | "answer_with_citations"
    | "answer_with_caveat"
    | "ask_clarifying_question"
    | "refuse_or_escalate"
    | "relax_filters"
    | "retry_after_ingest"
  status: "answerable" | "partial" | "not_answerable"
  thresholds: {
    answerable: number
    min_citations: number
    no_answer_behavior: "diagnostic_results" | "empty_results"
    partial: number
    strict_evidence: boolean
  }
}

export interface RetrieveResult {
  citations: readonly Record<string, unknown>[]
  display_metadata?: RetrievalDisplayMetadata
  expand_depth: number
  expanded_from_page_id: string | null
  graph_signals: readonly Record<string, unknown>[]
  lexical_rank: number | null
  match_reasons: readonly Record<string, unknown>[]
  media_evidence?: readonly RetrieveMediaEvidence[]
  page_id: string
  page_version_id: string
  result_id: string
  retrieval_reason: string
  score: Record<string, unknown>
  score_contribution?: Record<string, unknown>
  section: string
  section_id?: string
  semantic_rank: number | null
  title: string
  type: string
}

export interface RetrieveGraphNode {
  display_metadata?: RetrievalDisplayMetadata
  page_id: string
  page_version_id?: string
  source_refs: readonly Record<string, unknown>[]
  title: string
  type: string
  visibility_origin?: VisibilityOrigin
}

export interface RetrieveMediaEvidence {
  caption?: string
  document_id: string
  evidence_kind: "image_caption"
  locator?: string
  media_asset_id: string
  parsed_content_id?: string
  preview: {
    available: boolean
    endpoint: string
  }
  source_anchor_id?: string
}

export type SourceEvidenceKind = "text" | "ocr" | "image_caption"

export type SourceEvidenceLocatorStatus =
  | "ambiguous"
  | "not_found"
  | "not_provided"
  | "resolved"
  | "unsupported"

export interface SourceEvidenceResponse {
  content_hash: string
  context_after: string
  context_before: string
  context_truncated: boolean
  document_id: string
  evidence_kind: SourceEvidenceKind
  knowledge_base_id?: string
  locator?: string
  locator_status: SourceEvidenceLocatorStatus
  media_evidence?: Record<string, unknown>
  owner_knowledge_base_id?: string | null
  parsed_content_id: string
  parser_name: string
  parser_version: string
  source_anchor_id?: string
  text: string
  text_truncated: boolean
  upstream_resource_id?: string | null
  visibility_origin?: VisibilityOrigin
  warnings: ReadonlyArray<{
    code: string
    details?: Record<string, unknown>
    message: string
  }>
}

export interface SourceEvidenceBatchItemResult {
  document_id: string
  error?: {
    code?: string
    details?: unknown
    message?: string
  }
  evidence?: SourceEvidenceResponse
  index: number
  status: "error" | "resolved"
}

export interface SourceEvidenceBatchResponse {
  items: readonly SourceEvidenceBatchItemResult[]
  limits: {
    max_items: number
    total_output_max_chars: number
  }
  total_text_chars: number
  truncated: boolean
}

export interface MarkdownContractValidationResult {
  issues: readonly Record<string, unknown>[]
  status: "passed" | "failed"
}

export interface MarkdownExportResult {
  content: string
  files: ReadonlyArray<{
    content: string
    path: string
  }>
  format: "single_file" | "zip"
  include_sources: boolean
  knowledge_base_id: string
}

export interface RollbackKnowledgeBaseInput {
  reason?: string
  target_version_id: string
}

export interface RollbackPageInput {
  reason?: string
  target_page_version_id: string
}

export interface RollbackResult {
  change_set_id: string
  knowledge_version_id: string
  rollback_id: string
  [key: string]: unknown
}

export interface SystemSettingsStatus {
  admin: {
    lastSignIn: string | null
    passwordConfigured: boolean
    username: string
  }
  apiAccess: {
    apiBaseUrl: string
    authMode: "env_api_key"
    management: {
      boundary: string
      supported: boolean
      supported_operations: string[]
    }
    maskedKey: string
    status: "configured" | "missing"
  }
  dependencies: Record<string, unknown>
  limits: {
    webhook?: {
      delivery?: Record<string, unknown>
      deliveryReadiness?: string
      maskedSecret?: string
      secretStatus?: string
    }
    [key: string]: unknown
  }
  models: Record<string, unknown>
  runtime: {
    adminBaseUrl: string
    adminPort: number
    apiContractVersion?: string
    apiBaseUrl: string
    apiPort: number
    defaultContext: Record<string, unknown>
    release?: {
      buildTime: string
      revision: string
      service: string
      source: string
      version: string
    }
    version: string
  }
  storage: Record<string, unknown>
}

export interface ObjectStorageOperationMetricsStatus {
  countsByCaller: Record<string, number>
  countsByClass: Record<"class_a" | "class_b" | "free" | "unknown", number>
  countsByOperation: Record<string, number>
  countsByStatus: Record<"success" | "error", number>
  enabled: boolean
  hotCallers: ReadonlyArray<{
    caller: string
    classA: number
    classB: number
    count: number
  }>
  hotOperations: ReadonlyArray<{
    count: number
    operation: string
    operationClass: "class_a" | "class_b" | "free" | "unknown"
  }>
  latency: Record<string, number> | null
  retryCount: number
  total: number
  windowSeconds: number
}

export interface ObjectStorageOperationPressureStatus {
  classA: {
    count: number
    warningThreshold: number
  }
  classB: {
    count: number
    warningThreshold: number
  }
  guidanceKeys: string[]
  hotCallers: ObjectStorageOperationMetricsStatus["hotCallers"]
  hotOperations: ObjectStorageOperationMetricsStatus["hotOperations"]
  metricsEnabled: boolean
  status: "normal" | "degraded" | "disabled"
  warningsEnabled: boolean
  windowSeconds: number
}

export interface SystemHealthStatus {
  dependencies?: Record<string, unknown>
  limits?: Record<string, unknown>
  runtime?: Record<string, unknown>
  status: string
}

export class ApiClientError extends Error {
  readonly isStaleResource: boolean
  readonly locale: string | undefined
  readonly messageKey: string | undefined
  readonly staleResource: StaleResourceErrorDetails | undefined

  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly details: unknown,
    metadata: ApiClientErrorMetadata = {}
  ) {
    super(message)
    this.name = "ApiClientError"
    this.locale = metadata.locale
    this.messageKey = metadata.messageKey
    this.isStaleResource = isStaleResourceErrorCode(code)
    this.staleResource = this.isStaleResource
      ? readStaleResourceErrorDetails(details)
      : undefined
  }
}

export interface ApiClientErrorMetadata {
  locale?: string | undefined
  messageKey?: string | undefined
}

export interface StaleResourceErrorDetails {
  cleanup_operation_id?: string | null
  guidance?: string
  target_id: string
  target_type: "knowledge_base" | "source_document"
}

export function normalizeApiBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/u, "")

  return normalized === undefined || normalized.length === 0
    ? "/v1"
    : normalized
}

export function normalizeAdminBaseUrl(
  value: string | undefined,
  apiBaseUrl: string
) {
  const normalized = value?.trim().replace(/\/+$/u, "")

  if (normalized !== undefined && normalized.length > 0) {
    return normalized
  }

  return apiBaseUrl.endsWith("/v1") ? apiBaseUrl.slice(0, -3) : ""
}

export function createFococontextApiClient(
  options: FococontextApiClientOptions = {}
): FococontextApiClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl)
  const adminBaseUrl = normalizeAdminBaseUrl(options.adminBaseUrl, baseUrl)
  const fetchFn = options.fetchFn ?? fetch

  return {
    cancelJob: (jobId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/jobs/${encodeURIComponent(jobId)}/cancel`,
        options,
        {
          method: "POST",
        }
      ),
    createKnowledgeBaseFork: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/forks`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    createKnowledgeBase: (input) =>
      requestJson(fetchFn, baseUrl, "/knowledge-bases", options, {
        body: JSON.stringify(input),
        method: "POST",
      }),
    submitForkKnowledge: (forkId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/forks/${encodeURIComponent(forkId)}/submissions`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    createKnowledgeCheck: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/knowledge-checks`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    createSourceWatchRule: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/source-watch-rules`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    deleteKnowledgeBaseFork: (forkId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/forks/${encodeURIComponent(forkId)}`,
        options,
        {
          method: "DELETE",
        }
      ),
    deleteSourceDocument: (documentId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/documents/${encodeURIComponent(documentId)}`,
        options,
        {
          method: "DELETE",
        }
      ),
    deleteKnowledgeBase: (id) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(id)}`,
        options,
        {
          method: "DELETE",
        }
      ),
    getCleanupOperation: (operationId, itemOptions = {}) =>
      requestJson(
        fetchFn,
        baseUrl,
        appendCleanupItemQuery(
          `/cleanup-operations/${encodeURIComponent(operationId)}`,
          itemOptions
        ),
        options
      ),
    listCleanupOperations: (listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery("/cleanup-operations", listOptions),
        options
      ),
    retryCleanupOperation: (operationId, itemOptions = {}) =>
      requestJson(
        fetchFn,
        baseUrl,
        appendCleanupItemQuery(
          `/cleanup-operations/${encodeURIComponent(operationId)}/retry`,
          itemOptions
        ),
        options,
        {
          method: "POST",
        }
      ),
    disableSourceWatchRule: (ruleId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/source-watch-rules/${encodeURIComponent(ruleId)}/disable`,
        options,
        {
          method: "POST",
        }
      ),
    enableSourceWatchRule: (ruleId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/source-watch-rules/${encodeURIComponent(ruleId)}/enable`,
        options,
        {
          method: "POST",
        }
      ),
    reingestSourceDocument: (documentId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/documents/${encodeURIComponent(documentId)}/reingest`,
        options,
        {
          method: "POST",
        }
      ),
    retryMediaAssetCaption: (mediaAssetId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/media-assets/${encodeURIComponent(mediaAssetId)}/caption/retry`,
        options,
        {
          method: "POST",
        }
      ),
    retrySourceDocumentOcr: (documentId, input = {}) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/documents/${encodeURIComponent(documentId)}/ocr/retry`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    getGraph: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/graph`,
        options
      ),
    getGraphInsights: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/graph/insights`,
        options
      ),
    refreshGraphInsights: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/graph/insights/refresh`,
        options,
        {
          method: "POST",
        }
      ),
    getJob: (jobId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/jobs/${encodeURIComponent(jobId)}`,
        options
      ),
    getIngestJobStatuses: (input) =>
      requestJson(fetchFn, baseUrl, "/jobs/batch", options, {
        body: JSON.stringify(input),
        method: "POST",
      }),
    getKnowledgeBase: (id) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(id)}`,
        options
      ),
    getKnowledgeBaseIngestProgress: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/ingest-progress`,
        options
      ),
    getKnowledgeBaseFork: (forkId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/forks/${encodeURIComponent(forkId)}`,
        options
      ),
    getDatasetConfiguration: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/dataset-configuration`,
        options
      ),
    getKnowledgeCheck: (checkId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-checks/${encodeURIComponent(checkId)}`,
        options
      ),
    getChangeSet: (changeSetId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/change-sets/${encodeURIComponent(changeSetId)}`,
        options
      ),
    getAdminSession: () =>
      requestJson(fetchFn, adminBaseUrl, "/admin/auth/session", options),
    getScheduledImportJob: (jobId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/scheduled-import-jobs/${encodeURIComponent(jobId)}`,
        options
      ),
    getMediaAssetPreview: (mediaAssetId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/media-assets/${encodeURIComponent(mediaAssetId)}/preview`,
        options
      ),
    getSourceDocument: (documentId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/documents/${encodeURIComponent(documentId)}`,
        options
      ),
    getSystemStatus: () =>
      requestJson(fetchFn, adminBaseUrl, "/health", options),
    getSystemSettings: () =>
      requestJson(fetchFn, adminBaseUrl, "/admin/system/settings", options),
    getWikiPage: (pageId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/pages/${encodeURIComponent(pageId)}`,
        options
      ),
    listKnowledgeBases: (listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery("/knowledge-bases", listOptions),
        options
      ),
    listKnowledgeBaseForks: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/forks`,
          listOptions
        ),
        options
      ),
    listJobs: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/jobs`,
          listOptions
        ),
        options
      ),
    listKnowledgeVersions: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/versions`,
          listOptions
        ),
        options
      ),
    listKnowledgeBaseChangeSets: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/change-sets`,
          listOptions
        ),
        options
      ),
    listKnowledgeBasePageVersions: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/page-versions`,
          listOptions
        ),
        options
      ),
    listDatasetConfigurationPresets: () =>
      requestJson(fetchFn, baseUrl, "/dataset-configuration-presets", options),
    listPageVersions: (pageId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/pages/${encodeURIComponent(pageId)}/versions`,
          listOptions
        ),
        options
      ),
    listRelatedPages: (pageId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/pages/${encodeURIComponent(pageId)}/related`,
          listOptions
        ),
        options
      ),
    listSourceDocuments: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
          listOptions
        ),
        options
      ),
    listSourceWatchRules: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/source-watch-rules`,
          listOptions
        ),
        options
      ),
    listSourceWatchScans: (ruleId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/source-watch-rules/${encodeURIComponent(ruleId)}/scans`,
          listOptions
        ),
        options
      ),
    listSystemPages: async (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/system-pages`,
          listOptions
        ),
        options
      ),
    listWikiPages: (knowledgeBaseId, listOptions = {}) =>
      requestListJson(
        fetchFn,
        baseUrl,
        appendListQuery(
          `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/pages`,
          listOptions
        ),
        options
      ),
    loginAdmin: (input) =>
      requestJson(fetchFn, adminBaseUrl, "/admin/auth/login", options, {
        body: JSON.stringify(input),
        method: "POST",
      }),
    logoutAdmin: () =>
      requestJson(fetchFn, adminBaseUrl, "/admin/auth/logout", options, {
        method: "POST",
      }),
    previewSourceDeleteImpact: (documentId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/documents/${encodeURIComponent(documentId)}/delete-preview`,
        options,
        {
          method: "POST",
        }
      ),
    request: (path, init) => requestJson(fetchFn, baseUrl, path, options, init),
    resolveKnowledgeBaseFork: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/forks/resolve`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    exportMarkdown: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(
          knowledgeBaseId
        )}/markdown-export?format=single_file&include_sources=true`,
        options
      ),
    rollbackKnowledgeBase: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/rollback`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    rollbackPage: (pageId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/pages/${encodeURIComponent(pageId)}/rollback`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    validateMarkdownContract: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/markdown-contract/validate`,
        options,
        {
          method: "POST",
        }
      ),
    retrieveKnowledgeContext: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/retrieve`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    expandRetrievedGraphContext: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/retrieve/expand`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    retryJob: (jobId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/jobs/${encodeURIComponent(jobId)}/retry`,
        options,
        {
          method: "POST",
        }
      ),
    rebuildKnowledgeBaseIndexes: (knowledgeBaseId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/reindex`,
        options,
        {
          method: "POST",
        }
      ),
    scanSourceWatchRule: (ruleId) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/source-watch-rules/${encodeURIComponent(ruleId)}/scan`,
        options,
        {
          method: "POST",
        }
      ),
    syncKnowledgeBaseFork: (forkId, input = {}) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/forks/${encodeURIComponent(forkId)}/sync`,
        options,
        {
          body: JSON.stringify(input),
          method: "POST",
        }
      ),
    uploadSourceDocument: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
        options,
        {
          body: createSourceDocumentFormData(input),
          method: "POST",
        }
      ),
    createSourceUploadSession: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/upload-sessions`,
        options,
        {
          body: JSON.stringify({
            file_name: input.fileName,
            mime_type: input.mimeType,
            size: input.size,
            ...(input.contentHash === undefined
              ? {}
              : { content_hash: input.contentHash }),
            ...(input.displayName === undefined
              ? {}
              : { display_name: input.displayName }),
            ...(input.sourcePath === undefined ||
            input.sourcePath.trim().length === 0
              ? {}
              : { source_path: input.sourcePath.trim() }),
            ...(input.metadata === undefined
              ? {}
              : { metadata: input.metadata }),
          }),
          method: "POST",
        }
      ),
    finalizeSourceUploadSession: (knowledgeBaseId, uploadSessionId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/upload-sessions/${encodeURIComponent(uploadSessionId)}/finalize`,
        options,
        {
          body: JSON.stringify({
            content_hash: input.contentHash,
          }),
          method: "POST",
        }
      ),
    updateKnowledgeBase: (id, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(id)}`,
        options,
        {
          body: JSON.stringify(input),
          method: "PATCH",
        }
      ),
    updateSourceWatchRule: (ruleId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/source-watch-rules/${encodeURIComponent(ruleId)}`,
        options,
        {
          body: JSON.stringify(input),
          method: "PATCH",
        }
      ),
    updateDatasetConfiguration: (knowledgeBaseId, input) =>
      requestJson(
        fetchFn,
        baseUrl,
        `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/dataset-configuration`,
        options,
        {
          body: JSON.stringify(input),
          method: "PATCH",
        }
      ),
  }
}

async function requestJson<TData>(
  fetchFn: typeof fetch,
  baseUrl: string,
  path: string,
  options: FococontextApiClientOptions,
  init: RequestInit = {}
): Promise<TData> {
  const response = await fetchFn(buildApiUrl(baseUrl, path), {
    ...init,
    credentials: init.credentials ?? "include",
    headers: createHeaders(options, init),
    method: init.method ?? "GET",
  })
  const payload = (await readJson(response)) as ApiEnvelope<TData>

  if (!response.ok || payload.error !== undefined) {
    throw new ApiClientError(
      payload.error?.message ?? response.statusText,
      response.status,
      payload.error?.code ?? null,
      payload.error?.details,
      {
        locale: payload.error?.locale,
        messageKey: payload.error?.message_key,
      }
    )
  }

  return "data" in payload ? (payload.data as TData) : (payload as TData)
}

async function requestListJson<TData>(
  fetchFn: typeof fetch,
  baseUrl: string,
  path: string,
  options: FococontextApiClientOptions,
  init: RequestInit = {}
): Promise<{ data: TData[]; pagination: Pagination }> {
  const response = await fetchFn(buildApiUrl(baseUrl, path), {
    ...init,
    credentials: init.credentials ?? "include",
    headers: createHeaders(options, init),
    method: init.method ?? "GET",
  })
  const payload = (await readJson(response)) as ApiListEnvelope<TData> &
    ApiEnvelope<TData[]>

  if (!response.ok || payload.error !== undefined) {
    throw new ApiClientError(
      payload.error?.message ?? response.statusText,
      response.status,
      payload.error?.code ?? null,
      payload.error?.details,
      {
        locale: payload.error?.locale,
        messageKey: payload.error?.message_key,
      }
    )
  }

  return {
    data: payload.data,
    pagination: payload.pagination,
  }
}

function buildApiUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

function appendListQuery(path: string, options: ListOptions): string {
  const params = new URLSearchParams()

  if (options.page !== undefined) {
    params.set("page", String(options.page))
  }
  if (options.pageSize !== undefined) {
    params.set("page_size", String(options.pageSize))
  }
  if (options.cursor !== undefined) {
    params.set("cursor", options.cursor)
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit))
  }

  const query = params.toString()

  if (query.length === 0) {
    return path
  }

  return `${path}${path.includes("?") ? "&" : "?"}${query}`
}

function appendCleanupItemQuery(
  path: string,
  options: CleanupOperationItemListOptions
): string {
  const params = new URLSearchParams()

  if (options.itemsPage !== undefined) {
    params.set("items_page", String(options.itemsPage))
  }
  if (options.itemsPageSize !== undefined) {
    params.set("items_page_size", String(options.itemsPageSize))
  }

  const query = params.toString()

  if (query.length === 0) {
    return path
  }

  return `${path}${path.includes("?") ? "&" : "?"}${query}`
}

function isStaleResourceErrorCode(code: string | null): boolean {
  return code === "resource_deleted" || code === "resource_cleanup_pending"
}

function readStaleResourceErrorDetails(
  details: unknown
): StaleResourceErrorDetails | undefined {
  if (
    typeof details !== "object" ||
    details === null ||
    Array.isArray(details)
  ) {
    return undefined
  }

  const record = details as Record<string, unknown>

  if (
    (record.target_type !== "knowledge_base" &&
      record.target_type !== "source_document") ||
    typeof record.target_id !== "string"
  ) {
    return undefined
  }

  return {
    target_type: record.target_type,
    target_id: record.target_id,
    ...(typeof record.cleanup_operation_id === "string" ||
    record.cleanup_operation_id === null
      ? { cleanup_operation_id: record.cleanup_operation_id }
      : {}),
    ...(typeof record.guidance === "string"
      ? { guidance: record.guidance }
      : {}),
  }
}

function createHeaders(
  options: FococontextApiClientOptions,
  init: RequestInit
) {
  const headers = new Headers(init.headers)

  headers.set("accept", "application/json")

  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json")
  }

  if (options.apiKey !== undefined && options.apiKey.length > 0) {
    headers.set("authorization", `Bearer ${options.apiKey}`)
  }

  const locale = resolveClientLocale(options)

  if (locale !== undefined) {
    headers.set("x-fococontext-locale", locale)
    headers.set("accept-language", locale)
  }

  return headers
}

function resolveClientLocale(options: FococontextApiClientOptions) {
  const locale =
    typeof options.locale === "function" ? options.locale() : options.locale
  const normalizedLocale = locale?.trim()

  return normalizedLocale === undefined || normalizedLocale.length === 0
    ? undefined
    : normalizedLocale
}

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""

  if (!contentType.includes("application/json")) {
    return {}
  }

  return response.json()
}

function createSourceDocumentFormData(input: UploadSourceDocumentInput) {
  const formData = new FormData()
  const metadata =
    input.tags === undefined || input.tags.trim().length === 0
      ? {}
      : {
          tags: input.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        }
  const data = {
    display_name: input.file.name,
    ...(input.sourcePath === undefined || input.sourcePath.trim().length === 0
      ? {}
      : { source_path: input.sourcePath.trim() }),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
  }

  formData.set("data", JSON.stringify(data))
  formData.set("file", input.file)

  return formData
}
