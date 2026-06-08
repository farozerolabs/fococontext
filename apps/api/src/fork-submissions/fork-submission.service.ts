import { Injectable } from "@nestjs/common";
import { ApiError, type ApiMessageKey } from "@fococontext/contracts";

import { DeletionCleanupRepository } from "../deletion-cleanup/deletion-cleanup.repository.js";
import { DocumentService } from "../documents/document.service.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import type {
  CreateForkSubmissionInput,
  ForkSubmissionCitationInput,
  ForkSubmissionCitationResponse,
  ForkSubmissionEvidenceInput,
  ForkSubmissionEvidenceResponse,
  ForkSubmissionResponse,
} from "./fork-submission.types.js";

@Injectable()
export class ForkSubmissionService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly documentService: DocumentService,
    private readonly deletionCleanupRepository: DeletionCleanupRepository,
  ) {}

  async create(
    forkId: string,
    input: CreateForkSubmissionInput,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<ForkSubmissionResponse> {
    const fork = this.knowledgeBaseService.get(forkId, scope);

    if (fork.knowledge_base_type !== "fork") {
      throw new ApiError("fork_submission_requires_fork", {
        messageKey: "api.error.fork_submission_requires_fork",
        details: {
          knowledge_base_id: forkId,
        },
      });
    }

    this.rejectCleanupPendingFork(forkId);

    const title = readRequiredText(
      input.title,
      "title",
      "api.validation.fork_submission_title_required",
    );
    const content = readRequiredText(
      input.content,
      "content",
      "api.validation.fork_submission_content_required",
    );
    const evidence = normalizeEvidence(input.evidence);
    const citations = normalizeCitations(input.citations);
    const sourceUrl = normalizeOptionalUrl(input.source_url, "source_url");
    const metadata = normalizeMetadata(input.metadata);
    const submissionMetadata = {
      ...metadata,
      fork_submission: {
        citations,
        content_type: input.content_type === "text" ? "text" : "markdown",
        evidence,
        ...(sourceUrl === null ? {} : { source_url: sourceUrl }),
        external_run_id:
          typeof metadata.external_run_id === "string" ? metadata.external_run_id : null,
      },
    };
    const sourcePath = normalizeOptionalText(input.source_path);
    const created = await this.documentService.createTextSource(
      forkId,
      {
        metadata: submissionMetadata,
        name: title,
        ...(sourcePath === null ? {} : { source_path: sourcePath }),
        text: content,
      },
      idempotencyKey,
      scope,
    );

    return {
      citations,
      document: created.document,
      evidence,
      fork_id: fork.id,
      job: created.job,
      upstream_knowledge_base_id: fork.upstream_knowledge_base_id,
    };
  }

  private rejectCleanupPendingFork(forkId: string): void {
    const cleanupOperation = this.deletionCleanupRepository.findLatestOperationForTarget({
      targetId: forkId,
      targetType: "knowledge_base",
    });

    if (
      cleanupOperation !== undefined &&
      (cleanupOperation.status === "queued" || cleanupOperation.status === "running")
    ) {
      throw new ApiError("resource_cleanup_pending", {
        details: {
          cleanup_operation_id: cleanupOperation.id,
          target_id: forkId,
          target_type: "knowledge_base",
        },
      });
    }
  }
}

function readRequiredText(value: unknown, field: string, messageKey: ApiMessageKey): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("invalid_request", {
      details: {
        fields: [field],
      },
      messageKey,
    });
  }

  return value.trim();
}

function normalizeEvidence(value: unknown): ForkSubmissionEvidenceResponse[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError("invalid_request", {
      details: {
        fields: ["evidence"],
      },
    });
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new ApiError("invalid_request", {
        details: {
          fields: ["evidence"],
        },
      });
    }
    const evidence = item as ForkSubmissionEvidenceInput;

    return {
      metadata: normalizeMetadata(evidence.metadata),
      snippet: normalizeOptionalText(evidence.snippet),
      source_type: normalizeOptionalText(evidence.source_type) ?? "external",
      title: normalizeOptionalText(evidence.title),
      url: normalizeOptionalUrl(evidence.url, "evidence.url"),
    };
  });
}

function normalizeCitations(value: unknown): ForkSubmissionCitationResponse[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError("invalid_request", {
      details: {
        fields: ["citations"],
      },
    });
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new ApiError("invalid_request", {
        details: {
          fields: ["citations"],
        },
      });
    }
    const citation = item as ForkSubmissionCitationInput;

    return {
      label: normalizeOptionalText(citation.label),
      locator: normalizeOptionalText(citation.locator),
      metadata: normalizeMetadata(citation.metadata),
      title: normalizeOptionalText(citation.title),
      url: normalizeOptionalUrl(citation.url, "citations.url"),
    };
  });
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new ApiError("invalid_request", {
      details: {
        fields: ["metadata"],
      },
    });
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalUrl(value: unknown, field: string): string | null {
  const normalized = normalizeOptionalText(value);

  if (normalized === null) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported URL protocol.");
    }

    return url.toString();
  } catch {
    throw new ApiError("invalid_request", {
      details: {
        fields: [field],
      },
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
