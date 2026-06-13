import type { SourceType } from "../documents/document.types.js";

export interface BatchImportItemInput {
  external_id?: string;
  name?: string;
  url?: string;
  text?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateBatchImportInput {
  source_type?: SourceType;
  items?: BatchImportItemInput[];
  options?: {
    auto_ingest?: boolean;
  };
}

export interface BatchImportValidationError {
  index: number;
  field: string;
  code: "required" | "invalid";
  message: string;
}

export interface BatchImportSkippedItem {
  index: number;
  reason: string;
  external_id?: string;
}

export type BatchImportStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export type BatchImportItemStatus =
  | "accepted"
  | "validation_failed"
  | "skipped"
  | "created"
  | "failed";

export interface BatchImportRecord {
  id: string;
  tenantId: string;
  projectId: string;
  knowledgeBaseId: string;
  sourceType: SourceType;
  status: BatchImportStatus;
  totalItems: number;
  acceptedItems: number;
  skippedItems: number;
  validationErrorCount: number;
  completedItems: number;
  failedItems: number;
  enqueueCursor: number;
  retryCursor: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BatchImportItemRecord {
  id: string;
  tenantId: string;
  projectId: string;
  knowledgeBaseId: string;
  batchId: string;
  itemIndex: number;
  sourceType: SourceType;
  externalId: string | null;
  idempotencyKey: string | null;
  status: BatchImportItemStatus;
  sourceDocumentId: string | null;
  ingestJobId: string | null;
  safeError: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BatchImportJobResponse {
  id: string;
  knowledge_base_id: string;
  status: BatchImportStatus;
  source_type: SourceType;
  total_items: number;
  accepted_items: number;
  skipped_items: number;
  validation_error_count: number;
  completed_items: number;
  failed_items: number;
  source_document_ids: readonly string[];
  ingest_job_ids: readonly string[];
  skipped: readonly BatchImportSkippedItem[];
  validation_errors: readonly BatchImportValidationError[];
  metadata: {
    auto_ingest: boolean;
    request_source: "api";
  };
  created_at: string;
}

export interface CreateBatchImportResponse {
  import_job: BatchImportJobResponse;
}

export interface BatchImportItemResponse {
  id: string;
  index: number;
  status: BatchImportItemStatus;
  external_id?: string;
  source_document_id?: string;
  ingest_job_id?: string;
  error?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BatchImportStatusResponse {
  import_job: BatchImportJobResponse;
  items: readonly BatchImportItemResponse[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    has_more: boolean;
  };
}
