export type WikiDraftApplyMode = "auto_ingest";
export type WikiDraftStatus = "queued_for_ingest";

export interface WikiDraftSourceRef {
  document_id: string;
  locator: string;
}

export interface SubmitWikiDraftInput {
  title?: string;
  markdown?: string;
  sources?: WikiDraftSourceRef[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  apply_mode?: WikiDraftApplyMode;
}

export interface WikiDraftRecord {
  id: string;
  knowledgeBaseId: string;
  title: string;
  markdown: string;
  sources: WikiDraftSourceRef[];
  tags: string[];
  metadata: Record<string, unknown>;
  applyMode: WikiDraftApplyMode;
  documentId: string;
  jobId: string;
  changeSetId: string;
  baseKnowledgeVersionId: string;
  targetKnowledgeVersionId: string | null;
  status: WikiDraftStatus;
  createdAt: string;
}

export interface WikiDraftChangeSetRecord {
  id: string;
  knowledgeBaseId: string;
  draftId: string;
  status: "pending";
  trigger: "wiki_draft";
  baseKnowledgeVersionId: string;
  targetKnowledgeVersionId: string | null;
  createdAt: string;
}

export interface WikiDraftSubmissionResponse {
  draft_id: string;
  document_id: string;
  job_id: string;
  change_set_id: string;
  status: WikiDraftStatus;
  base_knowledge_version_id: string;
  target_knowledge_version_id: string | null;
}
