import type { ParserWarning } from "@fococontext/parsers";

import {
  createDocumentProcessingDedupeKey,
  createShortConfigHash,
  type DocumentProcessingUnitInput,
} from "./document-processing-state.js";
import type {
  SourceOcrArtifactWrite,
  SourceOcrPageWrite,
  SourceOcrProcessorConfig,
} from "./source-ocr.worker.js";
import type { SourceOcrPayload } from "./source-parse.worker.js";

export interface SourceOcrCandidatePage {
  nativeTextChars: number;
  pageNumber: number;
  reason: string;
}

export function createOcrPolicyHash(config: SourceOcrProcessorConfig): string {
  return createShortConfigHash({
    confidenceThreshold: config.confidenceThreshold,
    languages: config.languages,
    maxPagePixels: config.maxPagePixels,
    pageDpi: config.pageDpi,
    storePageImages: config.storePageImages,
    windowSize: config.windowSize,
  });
}

export function createOcrPageDedupeKey(
  payload: SourceOcrPayload,
  pageNumber: number,
  policyHash: string,
): string {
  return createDocumentProcessingDedupeKey({
    configHash: policyHash,
    contentHash: payload.content_hash,
    stage: "ocr",
    unitKey: `page-${pageNumber}`,
    unitType: "page",
  });
}

export function toOcrCandidateProcessingUnit(
  payload: SourceOcrPayload,
  page: SourceOcrCandidatePage,
  options: {
    policyHash: string;
    status: "pending" | "running";
    unitIndex: number;
  },
): DocumentProcessingUnitInput {
  return {
    contentHash: payload.content_hash,
    dedupeKey: createOcrPageDedupeKey(payload, page.pageNumber, options.policyHash),
    jobId: payload.job_id,
    locator: {
      page_number: page.pageNumber,
    },
    metadata: {
      native_text_chars: page.nativeTextChars,
      reason: page.reason,
    },
    parsedContentId: payload.parsed_content_id,
    policyHash: options.policyHash,
    sourceDocumentId: payload.document_id,
    stage: "ocr",
    status: options.status,
    unitIndex: options.unitIndex,
    unitKey: `page-${page.pageNumber}`,
    unitType: "page",
  };
}

export function toOcrProcessingUnit(
  payload: SourceOcrPayload,
  page: SourceOcrPageWrite,
  options: {
    artifact?: SourceOcrArtifactWrite;
    policyHash: string;
    status: SourceOcrPageWrite["status"];
  },
): DocumentProcessingUnitInput {
  return {
    contentHash: payload.content_hash,
    counters: {
      attempt_count: page.attemptCount,
      block_count: page.blocks.length,
      confidence_avg: page.confidenceAvg,
    },
    dedupeKey: createOcrPageDedupeKey(payload, page.pageNumber, options.policyHash),
    jobId: payload.job_id,
    locator: {
      page_number: page.pageNumber,
    },
    metadata: {
      engine: page.engine,
      reason: page.reason,
    },
    model: page.modelVersion,
    objectKey: options.artifact?.objectKey ?? null,
    objectRefs:
      options.artifact === undefined
        ? []
        : [
            {
              kind: "rendered_page",
              object_key: options.artifact.objectKey,
              sha256: options.artifact.sha256,
              size_bytes: options.artifact.sizeBytes,
            },
          ],
    parsedContentId: payload.parsed_content_id,
    policyHash: options.policyHash,
    providerName: page.providerName,
    retryEligible: page.retryable,
    safeError: page.error,
    sourceDocumentId: payload.document_id,
    stage: "ocr",
    status: options.status,
    unitKey: `page-${page.pageNumber}`,
    unitType: "page",
    warnings: cloneWarnings(page.warnings),
  };
}

function cloneWarnings(warnings: readonly ParserWarning[]): Record<string, unknown>[] {
  return warnings.map((warning) => ({ ...warning }));
}
