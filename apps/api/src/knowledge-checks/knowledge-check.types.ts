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
] as const;

export type KnowledgeCheckType = (typeof knowledgeCheckTypes)[number];
export type KnowledgeCheckStatus = "queued" | "running" | "completed" | "failed";
export type KnowledgeCheckSeverity = "low" | "medium" | "high";
export type KnowledgeCheckSemanticRunStatus = "skipped" | "completed" | "partial" | "failed";

export interface CreateKnowledgeCheckInput {
  checks?: string[];
  page_ids?: string[];
  source_document_ids?: string[];
}

export interface KnowledgeCheckFinding {
  affected_object_ids?: string[];
  confidence?: number;
  evidence?: Record<string, unknown>[];
  finding_id?: string;
  type: KnowledgeCheckType;
  severity: KnowledgeCheckSeverity;
  page_id: string | null;
  message: string;
  source_refs?: Record<string, unknown>[];
  suggested_action?: Record<string, unknown>;
}

export interface KnowledgeCheckSemanticRun {
  failure_reason?: string;
  findings_count: number;
  model?: string;
  model_call_id?: string;
  output_status?: "succeeded" | "failed";
  prompt_version_id?: string;
  provider_name?: string;
  repair_attempts: number;
  status: KnowledgeCheckSemanticRunStatus;
  structured_output_attempt_count?: number;
  structured_output_final_status?: "succeeded" | "failed";
  structured_output_mode?: "strict_json_schema" | "json_object_fallback";
  structured_output_validation_issues?: string[];
  trace?: Record<string, unknown>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface KnowledgeCheckRecord {
  id: string;
  knowledgeBaseId: string;
  status: KnowledgeCheckStatus;
  progress: number;
  checks: KnowledgeCheckType[];
  pageIds: string[];
  findings: KnowledgeCheckFinding[];
  semanticRun: KnowledgeCheckSemanticRun;
  configurationSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCheckResponse {
  check_id: string;
  knowledge_base_id: string;
  status: KnowledgeCheckStatus;
  progress: number;
  checks: KnowledgeCheckType[];
  page_ids: string[];
  findings: Array<{
    type: KnowledgeCheckType;
    severity: KnowledgeCheckSeverity;
    page_id: string | null;
    message: string;
    affected_object_ids?: string[];
    confidence?: number;
    evidence?: Record<string, unknown>[];
    finding_id?: string;
    source_refs?: Record<string, unknown>[];
    suggested_action?: Record<string, unknown>;
  }>;
  semantic_run: KnowledgeCheckSemanticRun;
  configuration_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
