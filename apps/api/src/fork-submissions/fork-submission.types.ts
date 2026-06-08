import type { JobResponse, SourceDocumentResponse } from "../documents/document.types.js";

export interface ForkSubmissionEvidenceInput {
  source_type?: string;
  title?: string;
  url?: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface ForkSubmissionCitationInput {
  label?: string;
  title?: string;
  url?: string;
  locator?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateForkSubmissionInput {
  title?: string;
  content?: string;
  content_type?: "markdown" | "text";
  source_path?: string;
  source_url?: string;
  evidence?: ForkSubmissionEvidenceInput[];
  citations?: ForkSubmissionCitationInput[];
  metadata?: Record<string, unknown>;
}

export interface ForkSubmissionEvidenceResponse {
  source_type: string;
  title: string | null;
  url: string | null;
  snippet: string | null;
  metadata: Record<string, unknown>;
}

export interface ForkSubmissionCitationResponse {
  label: string | null;
  title: string | null;
  url: string | null;
  locator: string | null;
  metadata: Record<string, unknown>;
}

export interface ForkSubmissionResponse {
  fork_id: string;
  upstream_knowledge_base_id: string | null;
  document: SourceDocumentResponse;
  job: JobResponse;
  evidence: ForkSubmissionEvidenceResponse[];
  citations: ForkSubmissionCitationResponse[];
}
