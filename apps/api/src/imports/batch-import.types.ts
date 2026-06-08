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

export interface BatchImportJobResponse {
  id: string;
  knowledge_base_id: string;
  status: "queued" | "failed";
  source_type: SourceType;
  total_items: number;
  accepted_items: number;
  skipped_items: number;
  validation_error_count: number;
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
