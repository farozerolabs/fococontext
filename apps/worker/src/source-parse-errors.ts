import type { ParserFatalError } from "@fococontext/parsers";
import type { WorkerJobGuardReason } from "./job-progress.postgres-writer.js";

export function createSkippedParseError(
  reason: WorkerJobGuardReason | undefined,
): ParserFatalError {
  return {
    kind: "parser_failed",
    message: `Source parse skipped because the ingest job is not runnable: ${reason ?? "unknown"}.`,
    retryable: false,
  };
}

export function createOcrRequiredError(
  reason: "disabled" | "no_candidate_pages",
): ParserFatalError {
  return {
    kind: "parser_output_empty",
    message: `OCR is required to produce usable PDF text, but OCR was skipped: ${reason}.`,
    retryable: reason !== "disabled",
    parserName: "ts-pdf-parse",
    parserVersion: "0.1.0",
    mimeType: "application/pdf",
    fileExtension: ".pdf",
  };
}
