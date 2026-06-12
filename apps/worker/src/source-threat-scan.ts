import type { ParserFatalError } from "@fococontext/parsers";

import type { DocumentProcessingStateStore } from "./document-processing-state.js";
import type { SourceParsePayload } from "./source-parse.worker.js";

export type SourceThreatScanStatus = "clean" | "skipped" | "review_required" | "blocked";

export interface SourceThreatScanInput {
  tenantId: string;
  projectId: string;
  knowledgeBaseId: string;
  documentId: string;
  jobId: string;
  inputSnapshotId: string;
  objectKey: string;
  mimeType: string;
  contentHash: string;
  sourceType: SourceParsePayload["source_type"];
}

export interface SourceThreatScanResult {
  status: SourceThreatScanStatus;
  reason?: string;
  providerName?: string;
  scannerVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceThreatScanner {
  scan(input: SourceThreatScanInput): Promise<SourceThreatScanResult>;
}

export async function runSourceThreatScan(input: {
  fileName: string;
  payload: SourceParsePayload;
  processingState: DocumentProcessingStateStore | undefined;
  threatScanner: SourceThreatScanner | undefined;
}): Promise<{ kind: "continue" } | { kind: "fatal"; error: ParserFatalError }> {
  if (input.threatScanner === undefined) {
    return { kind: "continue" };
  }

  let result: SourceThreatScanResult;

  try {
    result = await input.threatScanner.scan({
      tenantId: input.payload.tenant_id,
      projectId: input.payload.project_id,
      knowledgeBaseId: input.payload.knowledge_base_id,
      documentId: input.payload.document_id,
      jobId: input.payload.job_id,
      inputSnapshotId: input.payload.input_snapshot_id,
      objectKey: input.payload.object_key,
      mimeType: input.payload.mime_type,
      contentHash: input.payload.content_hash,
      sourceType: input.payload.source_type,
    });
  } catch (error) {
    const parserError = createThreatScanError({
      fileName: input.fileName,
      mimeType: input.payload.mime_type,
      reason: error instanceof Error ? error.message : "unknown scanner failure",
      status: "blocked",
      unsupportedReason: "source_threat_scan_failed",
    });

    await recordThreatScanUnit(input.processingState, input.payload, {
      error: parserError,
      result: {
        status: "blocked",
        reason: "scanner_failed",
      },
      status: "failed",
    });

    return {
      kind: "fatal",
      error: parserError,
    };
  }

  const unitStatus = toThreatScanUnitStatus(result.status);

  if (result.status === "blocked" || result.status === "review_required") {
    const parserError = createThreatScanError({
      fileName: input.fileName,
      mimeType: input.payload.mime_type,
      reason: result.reason ?? result.status,
      status: result.status,
      unsupportedReason:
        result.status === "blocked"
          ? "source_threat_scan_blocked"
          : "source_threat_scan_review_required",
    });

    await recordThreatScanUnit(input.processingState, input.payload, {
      error: parserError,
      result,
      status: unitStatus,
    });

    return {
      kind: "fatal",
      error: parserError,
    };
  }

  await recordThreatScanUnit(input.processingState, input.payload, {
    result,
    status: unitStatus,
  });

  return { kind: "continue" };
}

async function recordThreatScanUnit(
  processingState: DocumentProcessingStateStore | undefined,
  payload: SourceParsePayload,
  input: {
    error?: ParserFatalError;
    result: SourceThreatScanResult;
    status: "succeeded" | "skipped" | "failed";
  },
): Promise<void> {
  await processingState?.upsertUnit({
    contentHash: payload.content_hash,
    dedupeKey: createThreatScanDedupeKey(payload),
    jobId: payload.job_id,
    metadata: {
      scanner_status: input.result.status,
      ...(input.result.reason === undefined ? {} : { scanner_reason: input.result.reason }),
      ...(input.result.providerName === undefined
        ? {}
        : { scanner_provider: input.result.providerName }),
      ...(input.result.scannerVersion === undefined
        ? {}
        : { scanner_version: input.result.scannerVersion }),
      ...(input.result.metadata === undefined
        ? {}
        : { scanner_metadata: toJsonObject(input.result.metadata) }),
    },
    objectKey: payload.object_key,
    retryEligible: input.error?.retryable ?? false,
    safeError: input.error === undefined ? null : toJsonObject(input.error),
    sourceDocumentId: payload.document_id,
    stage: "parsing",
    status: input.status,
    unitKey: payload.object_key,
    unitType: "threat_scan",
  });
}

function createThreatScanError(input: {
  fileName: string;
  mimeType: string;
  reason: string;
  status: "blocked" | "review_required";
  unsupportedReason: string;
}): ParserFatalError {
  const fileExtension = readFileExtension(input.fileName);

  return {
    kind: "parser_failed",
    message: `Source threat scan ${input.status} the source object: ${input.reason}.`,
    retryable: input.unsupportedReason === "source_threat_scan_failed",
    mimeType: input.mimeType,
    unsupportedReason: input.unsupportedReason,
    ...(fileExtension === undefined ? {} : { fileExtension }),
  };
}

function toThreatScanUnitStatus(
  status: SourceThreatScanStatus,
): "succeeded" | "skipped" | "failed" {
  if (status === "clean") {
    return "succeeded";
  }

  if (status === "skipped") {
    return "skipped";
  }

  return "failed";
}

function createThreatScanDedupeKey(payload: SourceParsePayload): string {
  return ["threat_scan", payload.document_id, payload.content_hash, payload.object_key]
    .map(sanitizeObjectKeySegment)
    .join(":");
}

function readFileExtension(fileName: string): string | undefined {
  const extension = fileName.includes(".") ? `.${fileName.split(".").at(-1) ?? ""}` : "";

  return extension.length > 1 ? extension.toLowerCase() : undefined;
}

function sanitizeObjectKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function toJsonObject(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
