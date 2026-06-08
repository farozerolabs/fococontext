export const sourceWatchSourceKinds = [
  "s3_prefix",
  "url_list",
  "git_repo",
  "mounted_directory",
] as const;

export type SourceWatchSourceKind = (typeof sourceWatchSourceKinds)[number];
export type SourceWatchRuleStatus = "enabled" | "disabled";
export type SourceWatchExecutionReason =
  | "source_watch_execution_not_configured"
  | "source_watch_adapter_disabled"
  | "source_watch_credentials_missing";

export interface CreateSourceWatchRuleInput {
  name?: string;
  source_kind?: SourceWatchSourceKind;
  location?: string;
  credential_profile?: string;
  adapter_options?: Record<string, unknown>;
  include_extensions?: string[];
  exclude_dirs?: string[];
  exclude_globs?: string[];
  max_file_size_mb?: number;
  auto_ingest?: boolean;
  schedule?: SourceWatchScheduleInput;
}

export interface UpdateSourceWatchRuleInput {
  name?: string;
  include_extensions?: string[];
  exclude_dirs?: string[];
  exclude_globs?: string[];
  max_file_size_mb?: number | null;
  auto_ingest?: boolean;
  schedule?: SourceWatchScheduleInput;
}

export interface SourceWatchScheduleInput {
  enabled?: boolean;
  interval_seconds?: number;
  cron?: string | null;
  timezone?: string | null;
}

export type SourceWatchSchedulerStatus = "disabled" | "paused" | "scheduled" | "running";

export interface SourceWatchRuleSchedule {
  enabled: boolean;
  intervalSeconds: number | null;
  cron: string | null;
  timezone: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: SourceWatchScanStatus | null;
  lastError: Record<string, unknown> | null;
  schedulerStatus: SourceWatchSchedulerStatus;
}

export interface SourceWatchRuleScheduleResponse {
  enabled: boolean;
  interval_seconds: number | null;
  cron: string | null;
  timezone: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: SourceWatchScanStatus | null;
  last_error: Record<string, unknown> | null;
  scheduler_status: SourceWatchSchedulerStatus;
}

export interface SourceWatchRuleRecord {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sourceKind: SourceWatchSourceKind;
  location: string;
  credentialProfile: string | null;
  adapterOptions: Record<string, unknown>;
  includeExtensions: readonly string[];
  excludeDirs: readonly string[];
  excludeGlobs: readonly string[];
  maxFileSizeMb: number | null;
  autoIngest: boolean;
  status: SourceWatchRuleStatus;
  schedule: SourceWatchRuleSchedule;
  latestScan: SourceWatchLatestScanResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceWatchExecutionStatus {
  enabled: boolean;
  reason?: SourceWatchExecutionReason;
}

export interface SourceWatchRuleResponse {
  id: string;
  knowledge_base_id: string;
  name: string;
  source_kind: SourceWatchSourceKind;
  location: string;
  credential_profile: string | null;
  adapter_options: Record<string, unknown>;
  include_extensions: readonly string[];
  exclude_dirs: readonly string[];
  exclude_globs: readonly string[];
  max_file_size_mb: number | null;
  auto_ingest: boolean;
  status: SourceWatchRuleStatus;
  schedule: SourceWatchRuleScheduleResponse;
  latest_scan: SourceWatchLatestScanResponse | null;
  execution: SourceWatchExecutionStatus;
  created_at: string;
  updated_at: string;
}

export interface SourceWatchRuleEnvelope {
  rule: SourceWatchRuleResponse;
}

export interface ListSourceWatchRulesInput {
  page: number;
  pageSize: number;
}

export interface ListSourceWatchRulesResult {
  items: readonly SourceWatchRuleResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export type SourceWatchScanStatus = "completed" | "disabled" | "failed";
export type SourceWatchScanTriggerType = "manual" | "scheduled" | "retry";

export interface SourceWatchScanSource {
  name: string;
  source_path?: string;
  source_url?: string;
  content_hash?: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export interface SourceWatchIngestFile {
  cleanup_path?: string;
  file_path: string;
  kind: "file";
  mime_type: string;
}

export interface SourceWatchIngestUrl {
  kind: "url";
  url: string;
}

export type SourceWatchDiscoveredIngest = SourceWatchIngestFile | SourceWatchIngestUrl;

export interface SourceWatchDiscoveredSource extends SourceWatchScanSource {
  ingest?: SourceWatchDiscoveredIngest;
}

export interface SourceWatchDeleteCandidate {
  document_id?: string;
  source_path?: string;
  reason: string;
  metadata?: Record<string, unknown>;
  delete_preview?: DeleteImpactPreviewResponse;
}

export interface SourceWatchSkippedSource {
  source_path?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface SourceWatchScanDiscovery {
  status: SourceWatchScanStatus;
  newSources: readonly SourceWatchDiscoveredSource[];
  changedSources: readonly SourceWatchDiscoveredSource[];
  deleteCandidates: readonly SourceWatchDeleteCandidate[];
  skipped: readonly SourceWatchSkippedSource[];
  execution: SourceWatchExecutionStatus;
}

export interface ScheduledImportJobRecord {
  id: string;
  sourceWatchRuleId: string;
  knowledgeBaseId: string;
  status: SourceWatchScanStatus;
  triggerType: SourceWatchScanTriggerType;
  scanResult: SourceWatchScanResultResponse;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  retryable: boolean;
  nextRetryAt: string | null;
  error: Record<string, unknown> | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceWatchScanResultResponse {
  new_sources: readonly SourceWatchScanSource[];
  changed_sources: readonly SourceWatchScanSource[];
  delete_candidates: readonly SourceWatchDeleteCandidate[];
  skipped: readonly SourceWatchSkippedSource[];
}

export interface ScheduledImportJobResponse {
  id: string;
  source_watch_rule_id: string;
  knowledge_base_id: string;
  status: SourceWatchScanStatus;
  trigger_type: SourceWatchScanTriggerType;
  scan_result: SourceWatchScanResultResponse;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  retry_count: number;
  retryable: boolean;
  next_retry_at: string | null;
  error: Record<string, unknown> | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledImportJobEnvelope {
  scheduled_import_job: ScheduledImportJobResponse;
}

export interface ListScheduledImportJobsInput {
  page: number;
  pageSize: number;
}

export interface ListScheduledImportJobsResult {
  items: readonly ScheduledImportJobResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface SourceWatchLatestScanResponse {
  scheduled_import_job_id: string;
  status: SourceWatchScanStatus;
  scanned_at: string;
  new_source_count: number;
  changed_source_count: number;
  delete_candidate_count: number;
  skipped_count: number;
}

export interface SourceWatchScanResponse {
  source_watch_rule_id: string;
  knowledge_base_id: string;
  scheduled_import_job_id: string;
  status: SourceWatchScanStatus;
  new_sources: readonly SourceWatchScanSource[];
  changed_sources: readonly SourceWatchScanSource[];
  delete_candidates: readonly SourceWatchDeleteCandidate[];
  skipped: readonly SourceWatchSkippedSource[];
  execution: SourceWatchExecutionStatus;
  scheduled_import_job: ScheduledImportJobResponse;
  created_at: string;
}

export interface SourceWatchScanEnvelope {
  scan: SourceWatchScanResponse;
}
import type { DeleteImpactPreviewResponse } from "../documents/document.types.js";
