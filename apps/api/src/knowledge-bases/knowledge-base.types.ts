import type { DatasetPromptTemplateValues } from "@fococontext/llm";

import type { DeletionCleanupOperationSummaryResponse } from "../deletion-cleanup/deletion-cleanup.response.js";

export type KnowledgeBaseStatus = "ready" | "indexing" | "outdated" | "failed" | "deleted";
export type KnowledgeBaseType = "canonical" | "fork";
export type KnowledgeBaseTemplate = "general" | "research" | "team_knowledge";
export type KnowledgeBaseOutputLanguage = "auto" | "zh-CN" | "en-US";
export type DatasetConfigurationStatus = "active";
export type DatasetOcrMode = "auto" | "disabled" | "force_for_pdf";
export type ForkOwnerType = "user" | "workspace" | "customer" | "session" | "custom";
export type KnowledgeBaseSyncStatus =
  | "not_applicable"
  | "synced"
  | "outdated"
  | "syncing"
  | "failed";

export type JsonObject = Record<string, unknown>;

export interface DatasetConfigurationValues extends JsonObject {
  purpose: string;
  schema: JsonObject;
  markdown_contract: JsonObject;
  output_language: KnowledgeBaseOutputLanguage;
  retrieval: JsonObject;
  source_lifecycle: JsonObject;
  knowledge_check: JsonObject;
  source_watch: JsonObject;
  ocr_policy: DatasetOcrPolicy;
  prompt_templates: DatasetPromptTemplateValues;
}

export interface DatasetOcrPolicy extends JsonObject {
  mode: DatasetOcrMode;
  max_pages_per_document: number | null;
  min_text_chars_per_page: number | null;
}

export interface DatasetConfigurationRecord {
  id: string;
  knowledgeBaseId: string;
  presetId: KnowledgeBaseTemplate;
  status: DatasetConfigurationStatus;
  version: number;
  values: DatasetConfigurationValues;
  latestSnapshotId: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  metadata: JsonObject;
}

export interface DatasetConfigurationResponse {
  id: string;
  knowledge_base_id: string;
  preset_id: KnowledgeBaseTemplate;
  status: DatasetConfigurationStatus;
  version: number;
  values: DatasetConfigurationValues;
  latest_snapshot_id: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  metadata: JsonObject;
}

export interface DatasetConfigurationPresetResponse {
  id: KnowledgeBaseTemplate;
  name: string;
  description: string;
  version: string;
  default_values: DatasetConfigurationValues;
  validation: JsonObject;
}

export interface UpdateDatasetConfigurationInput {
  preset_id?: KnowledgeBaseTemplate;
  values?: Partial<DatasetConfigurationValues>;
  metadata?: JsonObject;
}

export interface KnowledgeBaseRecord {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  slug: string;
  description?: string;
  knowledgeBaseType: KnowledgeBaseType;
  upstreamKnowledgeBaseId: string | null;
  upstreamBaseVersionId: string | null;
  upstreamSyncedVersionId: string | null;
  forkOwner: ForkOwnerRecord | null;
  syncStatus: KnowledgeBaseSyncStatus;
  template: KnowledgeBaseTemplate;
  outputLanguage: KnowledgeBaseOutputLanguage;
  status: KnowledgeBaseStatus;
  currentVersionId: string;
  purpose: string;
  schema: JsonObject;
  retrieval: JsonObject;
  datasetConfiguration: DatasetConfigurationRecord;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  systemPages: SystemPageRecord[];
}

export interface KnowledgeBaseResponse {
  id: string;
  name: string;
  slug: string;
  description?: string;
  knowledge_base_type: KnowledgeBaseType;
  upstream_knowledge_base_id: string | null;
  upstream_base_version_id: string | null;
  upstream_synced_version_id: string | null;
  fork_owner: ForkOwnerResponse | null;
  sync_status: KnowledgeBaseSyncStatus;
  template: KnowledgeBaseTemplate;
  output_language: KnowledgeBaseOutputLanguage;
  status: Exclude<KnowledgeBaseStatus, "deleted">;
  current_version_id: string;
  purpose: string;
  schema: JsonObject;
  retrieval: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface DeletedKnowledgeBaseResponse {
  id: string;
  status: "deleted";
  cleanup_operation: DeletionCleanupOperationSummaryResponse;
}

export interface DeletedForkResponse {
  id: string;
  status: "deleted";
  cleanup: DeletionCleanupOperationSummaryResponse;
}

export interface ForkOwnerRecord {
  ownerType: ForkOwnerType;
  externalOwnerId: string;
  displayName: string | null;
}

export interface ForkOwnerResponse {
  owner_type: ForkOwnerType;
  external_owner_id: string;
  display_name: string | null;
}

export interface ResolveKnowledgeBaseForkInput {
  owner_type?: ForkOwnerType;
  external_owner_id?: string;
  display_name?: string | null;
}

export interface ResolveKnowledgeBaseForkResponse {
  created: boolean;
  fork: KnowledgeBaseResponse;
}

export interface SyncKnowledgeBaseForkInput {
  target_upstream_version_id?: string | null;
}

export interface ForkSyncConflictResponse extends JsonObject {
  type: "fork_page_conflict";
  upstream_page_id: string;
  fork_page_id: string;
  slug: string;
  title: string;
}

export interface ForkSyncResponse extends JsonObject {
  fork_id: string;
  sync_status: Exclude<KnowledgeBaseSyncStatus, "not_applicable">;
  operation_id: string | null;
  change_set_id: string | null;
  source_upstream_version_id: string | null;
  target_upstream_version_id: string | null;
  current_fork_version_id: string;
  conflicts: ForkSyncConflictResponse[];
}

export interface ListKnowledgeBaseForksResult {
  items: KnowledgeBaseResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CreateKnowledgeBaseInput {
  name?: string;
  slug?: string;
  description?: string;
  template?: KnowledgeBaseTemplate;
  output_language?: KnowledgeBaseOutputLanguage;
  purpose?: string;
  schema?: JsonObject;
  retrieval?: JsonObject;
}

export interface UpdateKnowledgeBaseInput {
  name?: string;
  description?: string;
  output_language?: KnowledgeBaseOutputLanguage;
  purpose?: string;
  schema?: JsonObject;
  retrieval?: JsonObject;
  reset_to_template?: Array<"purpose" | "schema">;
}

export interface ListKnowledgeBaseInput {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

export interface ListKnowledgeBaseResult {
  items: KnowledgeBaseResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export type SystemPageType = "index" | "overview" | "log" | "purpose" | "schema";

export interface SystemPageRecord {
  id: string;
  knowledgeBaseId: string;
  type: SystemPageType;
  title: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemPageResponse {
  id: string;
  knowledge_base_id: string;
  type: SystemPageType;
  title: string;
  markdown: string;
  created_at: string;
  updated_at: string;
}

export interface MarkdownContractValidationResponse {
  valid: boolean;
  issues: Array<{
    field: string;
    message: string;
  }>;
  checks: {
    frontmatter: "passed" | "failed";
    wikilinks: "passed" | "failed";
    system_pages: "passed" | "failed";
    export: "passed" | "failed";
  };
}

export interface MarkdownExportFile {
  path: string;
  content: string;
}

export interface MarkdownExportResponse {
  knowledge_base_id: string;
  format: "single_file" | "zip";
  include_sources: boolean;
  files: MarkdownExportFile[];
  content: string;
}
