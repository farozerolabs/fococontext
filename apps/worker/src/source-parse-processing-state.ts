import { createHash } from "node:crypto";
import type {
  DocumentParser,
  ParsedContent,
  ParserLocator,
  ParserTable,
} from "@fococontext/parsers";

import {
  createDocumentProcessingArtifactKey,
  createDocumentProcessingDedupeKey,
  createShortConfigHash,
  type DocumentProcessingUnitInput,
} from "./document-processing-state.js";
import type { SourceParseMediaAssetWrite, SourceParsePayload } from "./source-parse.worker.js";

export interface ParserMarkdownWindow {
  byteCount: number;
  charCount: number;
  content: string;
  objectKey: string;
  sha256: string;
  unitIndex: number;
  unitKey: string;
}

export function createParserConfigHash(
  payload: SourceParsePayload,
  parser: DocumentParser,
): string {
  return createShortConfigHash({
    mimeType: payload.mime_type,
    parserName: parser.name,
    parserVersion: parser.version,
    sourceType: payload.source_type,
  });
}

export function createParserUnitDedupeKey(payload: SourceParsePayload, configHash: string): string {
  return createDocumentProcessingDedupeKey({
    configHash,
    contentHash: payload.content_hash,
    stage: "parsing",
    unitKey: payload.object_key,
    unitType: "source_object",
  });
}

export function createMarkdownWindows(input: {
  markdown: string;
  maxChars: number;
  payload: SourceParsePayload;
}): ParserMarkdownWindow[] {
  const maxChars = Math.max(1, Math.floor(input.maxChars));
  const windows: ParserMarkdownWindow[] = [];

  for (let offset = 0; offset < input.markdown.length; offset += maxChars) {
    const content = input.markdown.slice(offset, offset + maxChars);
    const unitIndex = windows.length;
    const unitKey = `markdown-window-${unitIndex + 1}`;
    const sha256 = createHash("sha256").update(content).digest("hex");
    const byteCount = Buffer.byteLength(content);

    windows.push({
      byteCount,
      charCount: content.length,
      content,
      objectKey: createDocumentProcessingArtifactKey({
        artifactKind: "markdown-window",
        contentHash: sha256,
        documentId: input.payload.document_id,
        extension: ".md",
        jobId: input.payload.job_id,
        stage: "parsed_artifact",
        unitKey,
      }),
      sha256,
      unitIndex,
      unitKey,
    });
  }

  return windows;
}

export function createParserProcessingUnits(input: {
  configHash: string;
  markdownWindows: readonly ParserMarkdownWindow[];
  parsedContent: ParsedContent;
  parsedContentId: string;
  payload: SourceParsePayload;
}): DocumentProcessingUnitInput[] {
  return [
    ...input.parsedContent.locators.map((locator, index) =>
      toLocatorProcessingUnit(input, locator, index),
    ),
    ...input.parsedContent.tables.map((table, index) => toTableProcessingUnit(input, table, index)),
    ...input.markdownWindows.map((window) => toMarkdownWindowProcessingUnit(input, window)),
  ];
}

export function createMediaExtractionProcessingUnits(input: {
  mediaAssets: readonly SourceParseMediaAssetWrite[];
  parsedContentId: string;
  payload: SourceParsePayload;
}): DocumentProcessingUnitInput[] {
  return input.mediaAssets.map((asset, index) => ({
    contentHash: asset.sha256,
    counters: {
      height: asset.height,
      width: asset.width,
    },
    jobId: input.payload.job_id,
    locator: asset.locator,
    metadata: {
      mime_type: asset.mime_type,
    },
    objectKey: asset.object_key,
    parsedContentId: input.parsedContentId,
    sourceDocumentId: input.payload.document_id,
    stage: "media_extraction",
    status: "succeeded",
    unitIndex: index,
    unitKey: asset.id,
    unitType: "media_asset",
  }));
}

function toLocatorProcessingUnit(
  input: {
    configHash: string;
    parsedContent: ParsedContent;
    parsedContentId: string;
    payload: SourceParsePayload;
  },
  locator: ParserLocator,
  index: number,
): DocumentProcessingUnitInput {
  const unitType = toParserUnitType(locator);
  const unitKey = `${unitType}-${locator.value || index + 1}`;

  return {
    configHash: input.configHash,
    contentHash: input.payload.content_hash,
    dedupeKey: createDocumentProcessingDedupeKey({
      configHash: input.configHash,
      contentHash: input.payload.content_hash,
      stage: "parsing",
      unitKey,
      unitType,
    }),
    jobId: input.payload.job_id,
    locator: { ...locator },
    parsedContentId: input.parsedContentId,
    parserName: input.parsedContent.parserName,
    parserVersion: input.parsedContent.parserVersion,
    sourceDocumentId: input.payload.document_id,
    stage: "parsing",
    status: "succeeded",
    unitIndex: index,
    unitKey,
    unitType,
  };
}

function toTableProcessingUnit(
  input: {
    configHash: string;
    parsedContent: ParsedContent;
    parsedContentId: string;
    payload: SourceParsePayload;
  },
  table: ParserTable,
  index: number,
): DocumentProcessingUnitInput {
  const unitKey = `table-${index + 1}`;

  return {
    configHash: input.configHash,
    contentHash: input.payload.content_hash,
    counters: {
      column_count: table.column_count,
      row_count: table.row_count,
    },
    dedupeKey: createDocumentProcessingDedupeKey({
      configHash: input.configHash,
      contentHash: input.payload.content_hash,
      stage: "parsing",
      unitKey,
      unitType: "table",
    }),
    jobId: input.payload.job_id,
    locator: table.locator === undefined ? {} : { ...table.locator },
    parsedContentId: input.parsedContentId,
    parserName: input.parsedContent.parserName,
    parserVersion: input.parsedContent.parserVersion,
    sourceDocumentId: input.payload.document_id,
    stage: "parsing",
    status: "succeeded",
    unitIndex: index,
    unitKey,
    unitType: "table",
  };
}

function toMarkdownWindowProcessingUnit(
  input: {
    configHash: string;
    parsedContent: ParsedContent;
    parsedContentId: string;
    payload: SourceParsePayload;
  },
  window: ParserMarkdownWindow,
): DocumentProcessingUnitInput {
  return {
    configHash: input.configHash,
    contentHash: window.sha256,
    counters: {
      byte_count: window.byteCount,
      char_count: window.charCount,
    },
    dedupeKey: createDocumentProcessingDedupeKey({
      configHash: input.configHash,
      contentHash: window.sha256,
      stage: "parsed_artifact",
      unitKey: window.unitKey,
      unitType: "markdown_window",
    }),
    jobId: input.payload.job_id,
    objectKey: window.objectKey,
    objectRefs: [
      {
        kind: "markdown_window",
        object_key: window.objectKey,
        sha256: window.sha256,
        size_bytes: window.byteCount,
      },
    ],
    parsedContentId: input.parsedContentId,
    parserName: input.parsedContent.parserName,
    parserVersion: input.parsedContent.parserVersion,
    sourceDocumentId: input.payload.document_id,
    stage: "parsed_artifact",
    status: "succeeded",
    unitIndex: window.unitIndex,
    unitKey: window.unitKey,
    unitType: "markdown_window",
  };
}

function toParserUnitType(locator: ParserLocator): string {
  switch (locator.kind) {
    case "heading":
      return "heading_window";
    case "page":
      return "page";
    case "row":
      return "row";
    case "sheet":
      return "sheet";
    case "slide":
      return "slide";
    case "line":
      return "line";
  }
}
