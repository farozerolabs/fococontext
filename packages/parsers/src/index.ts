import { createHash } from "node:crypto";
import { extname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import mammoth from "mammoth";
import { read, utils } from "@e965/xlsx";

export const parserRuntimeVersion = "0.1.0";

const pdfEmbeddedImageObjectTimeoutMs = 250;

export interface ParserRouteRequest {
  fileName: string;
  mimeType: string;
}

export interface ParserInput extends ParserRouteRequest {
  sourceDocumentId: string;
  objectKey: string;
  contentHash: string;
  content: Buffer | string;
  limits?: ParserLimitConfig;
  visualExtraction?: ParserVisualExtractionOptions;
}

export interface ParserLocator {
  kind: "heading" | "page" | "slide" | "sheet" | "row" | "line";
  value: string;
  line?: number;
}

export type ParserSourceFormat =
  | "csv"
  | "docx"
  | "html"
  | "markdown"
  | "odp"
  | "odt"
  | "pdf"
  | "pptx"
  | "spreadsheet"
  | "text";

export type ParserMediaAssetKind =
  | "attachment_image"
  | "chart"
  | "diagram"
  | "embedded_image"
  | "inline_image"
  | "page_snapshot"
  | "screenshot"
  | "sheet_snapshot"
  | "slide_snapshot";

export type ParserMediaExtractionMethod =
  | "data_uri"
  | "html_img"
  | "markdown_image"
  | "office_zip_media"
  | "opendocument_zip_media"
  | "pdf_embedded_image"
  | "pdf_page_snapshot"
  | "spreadsheet_zip_media";

export interface ParserMediaAssetLocator extends Record<string, unknown> {
  kind: ParserLocator["kind"] | "document" | "image";
  value: string;
  line?: number;
  source_format?: ParserSourceFormat;
  asset_kind?: ParserMediaAssetKind;
  extraction_method?: ParserMediaExtractionMethod;
}

export interface ParserWarning {
  kind: string;
  message: string;
  locator?: ParserLocator;
}

export interface MediaAssetCandidate {
  sourceFormat: ParserSourceFormat;
  assetKind: ParserMediaAssetKind;
  extractionMethod: ParserMediaExtractionMethod;
  mimeType: string;
  objectKey: string;
  hash: string;
  locator?: ParserMediaAssetLocator;
  width?: number;
  height?: number;
  content?: Buffer;
  sourceMetadata?: Record<string, unknown>;
  warnings?: ParserWarning[];
}

export type ParserMediaAsset = MediaAssetCandidate;

export interface ParserTable {
  kind: "table";
  row_count: number;
  column_count: number;
  locator?: ParserLocator;
}

export type ParserFatalErrorKind =
  | "unsupported_file_type"
  | "parser_output_empty"
  | "parser_binding_unavailable"
  | "parser_failed"
  | "parser_timeout"
  | "password_protected_pdf"
  | "parser_limit_exceeded";

export interface ParserFatalError {
  kind: ParserFatalErrorKind;
  message: string;
  retryable: boolean;
  parserName?: string;
  parserVersion?: string;
  fileExtension?: string;
  mimeType?: string;
  unsupportedReason?: string;
  limitName?: ParserLimitName;
  actual?: number;
  limit?: number;
}

export interface ParsedContent {
  sourceDocumentId: string;
  objectKey: string;
  contentHash: string;
  parserName: string;
  parserVersion: string;
  normalizedMarkdown: string;
  locators: ParserLocator[];
  tables: ParserTable[];
  warnings: ParserWarning[];
  mediaAssets: ParserMediaAsset[];
}

export type ParserResult =
  | {
      kind: "success";
      parsedContent: ParsedContent;
    }
  | {
      kind: "fatal";
      error: ParserFatalError;
    };

export interface DocumentParser {
  name: string;
  version: string;
  mimeTypes: readonly string[];
  extensions: readonly string[];
  parse(input: ParserInput): Promise<ParserResult>;
}

export interface ParserCacheKey {
  contentHash: string;
  parserName: string;
  parserVersion: string;
}

export interface ParserCache {
  get(key: ParserCacheKey): Promise<ParsedContent | undefined>;
  set(key: ParserCacheKey, value: ParsedContent): Promise<void>;
}

export interface ParserCacheOptions {
  reuseCachedParsedContent: boolean;
}

export interface ParserCacheMetadata {
  status: "hit" | "miss" | "disabled";
  content_hash: string;
  parser_name: string;
  parser_version: string;
}

export type ParserResultWithCache = ParserResult & {
  cache: ParserCacheMetadata;
};

export type OcrBoundingBox = number[] | number[][];

export interface OcrProviderWarning {
  kind: string;
  message: string;
  locator?: ParserLocator;
}

export interface OcrProviderBlock {
  pageNumber: number;
  blockIndex: number;
  text: string;
  confidence?: number;
  bbox?: OcrBoundingBox;
  language?: string;
  provider: string;
  engine: string;
  modelVersion: string;
}

export interface OcrProviderPageInput {
  pageNumber: number;
  image: Buffer;
  mimeType: string;
  languages: string[];
}

export interface OcrProviderPageResult {
  pageNumber: number;
  blocks: OcrProviderBlock[];
  warnings: OcrProviderWarning[];
  provider: string;
  engine: string;
  modelVersion: string;
}

export interface OcrProvider {
  recognizePage(input: OcrProviderPageInput): Promise<OcrProviderPageResult>;
}

export type PdfOcrPolicyMode = "auto" | "disabled" | "force_for_pdf";

export interface PdfNativeTextPage {
  pageNumber: number;
  text: string;
}

export interface PdfOcrPolicy {
  enabled: boolean;
  mode: PdfOcrPolicyMode;
  minTextCharsPerPage: number;
  maxPagesPerDocument: number;
}

export interface PdfOcrCandidatePage {
  pageNumber: number;
  reason: "empty_native_text" | "low_native_text" | "forced";
  nativeTextChars: number;
}

export interface PdfOcrPageRenderInput {
  content: Buffer;
  candidatePages: readonly number[];
  dpi: number;
  maxPages: number;
  maxPagePixels: number;
  timeoutMs: number;
  concurrency: number;
  shouldCancel?: () => Promise<boolean> | boolean;
}

export interface PdfOcrRenderedPage {
  pageNumber: number;
  image: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
  pixelCount: number;
  dpi: number;
}

export interface PdfOcrRenderSkippedPage {
  pageNumber: number;
  reason:
    | "page_limit_exceeded"
    | "page_not_found"
    | "page_pixel_limit_exceeded"
    | "render_canceled"
    | "render_timeout";
  actual?: number;
  limit?: number;
}

export interface PdfOcrPageRenderResult {
  pages: PdfOcrRenderedPage[];
  skippedPages: PdfOcrRenderSkippedPage[];
  warnings: ParserWarning[];
}

export interface PdfOcrSkippedPage {
  pageNumber: number;
  reason: "native_text_sufficient" | "ocr_disabled" | "page_limit_exceeded";
  nativeTextChars: number;
}

export interface PdfOcrEligibilityResult {
  eligiblePages: PdfOcrCandidatePage[];
  skippedPages: PdfOcrSkippedPage[];
  warnings: ParserWarning[];
  requiredForDocument: boolean;
}

export interface PdfOcrBlock {
  pageNumber: number;
  blockIndex: number;
  text: string;
  confidence?: number;
  bbox?: OcrBoundingBox;
  language?: string;
  provider: string;
  engine: string;
  modelVersion?: string;
}

export type PdfOcrApplyResult =
  | {
      kind: "success";
      normalizedMarkdown: string;
      locators: ParserLocator[];
      warnings: ParserWarning[];
      ocr: {
        status: "succeeded" | "not_required";
        pageCount: number;
        blockCount: number;
        provider?: string;
        engine?: string;
        modelVersion?: string;
      };
    }
  | {
      kind: "fatal";
      error: ParserFatalError;
    };

export interface RapidOcrProviderOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutSeconds: number;
  confidenceThreshold: number;
}

export class OcrProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "OcrProviderError";
    this.code = options.code;
    this.retryable = options.retryable;

    if (options.status !== undefined) {
      this.status = options.status;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export type ParserLimitName =
  | "file_size"
  | "zip_entry_count"
  | "zip_total_expanded_bytes"
  | "zip_entry_bytes";

export interface ParserLimitConfig {
  maxFileSizeBytes: number;
  timeoutMs: number;
  zip: {
    maxEntries: number;
    maxExpandedBytes: number;
    maxEntryBytes: number;
  };
  images: {
    maxImagesPerDocument: number;
    maxRenderedSnapshotsPerDocument: number;
    maxPixelsPerAsset: number;
    maxAssetBytes: number;
    minWidth: number;
    minHeight: number;
    visualExtractionConcurrency: number;
    remoteFetchingEnabled: boolean;
    pdfSnapshotMinTextChars: number;
  };
}

export interface ParserVisualExtractionOptions {
  maxImagesPerDocument: number;
  maxRenderedSnapshotsPerDocument: number;
  maxPixelsPerAsset: number;
  maxAssetBytes: number;
  minImageWidth: number;
  minImageHeight: number;
  remoteFetchingEnabled: boolean;
  pdfSnapshotMinTextChars: number;
  pdfSnapshotDpi: number;
  concurrency: number;
  timeoutMs: number;
}

export interface ParserLimitContext {
  parserName: string;
  parserVersion: string;
  fileName: string;
  mimeType: string;
}

export function createParserLimitError(
  limitName: ParserLimitName,
  actual: number,
  limit: number,
  context: ParserLimitContext,
): ParserFatalError {
  return {
    kind: "parser_limit_exceeded",
    parserName: context.parserName,
    parserVersion: context.parserVersion,
    fileExtension: normalizeExtension(context.fileName),
    mimeType: normalizeMimeType(context.mimeType),
    message: `Parser limit exceeded: ${limitName}.`,
    retryable: false,
    limitName,
    actual,
    limit,
  };
}

export interface ZipExpansionSummary {
  entryCount: number;
  totalExpandedBytes: number;
  largestEntryBytes: number;
}

export interface MediaAssetLimitResult {
  mediaAssets: ParserMediaAsset[];
  warnings: ParserWarning[];
}

export type ParserMatchedBy = "mimeType" | "extension";

export type ParserResolution =
  | {
      kind: "matched";
      matchedBy: ParserMatchedBy;
      parser: DocumentParser;
    }
  | {
      kind: "unsupported";
      error: ParserFatalError;
    };

export class ParserRegistry {
  private readonly parsers: DocumentParser[] = [];

  register(parser: DocumentParser): void {
    this.parsers.push(parser);
  }

  resolve(request: ParserRouteRequest): ParserResolution {
    const mimeType = normalizeMimeType(request.mimeType);
    const fileExtension = normalizeExtension(request.fileName);
    const mimeParser = isGenericMimeType(mimeType)
      ? undefined
      : this.parsers.find((parser) => parser.mimeTypes.includes(mimeType));

    if (mimeParser !== undefined) {
      return {
        kind: "matched",
        matchedBy: "mimeType",
        parser: mimeParser,
      };
    }

    const extensionParser = this.parsers.find((parser) =>
      parser.extensions.includes(fileExtension),
    );

    if (extensionParser !== undefined) {
      return {
        kind: "matched",
        matchedBy: "extension",
        parser: extensionParser,
      };
    }

    return {
      kind: "unsupported",
      error: createUnsupportedParserError(fileExtension, mimeType),
    };
  }
}

export function createDefaultParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();

  defaultParsers.forEach((parser) => registry.register(parser));

  return registry;
}

export function createNoopParserCache(): ParserCache {
  return {
    async get() {
      return undefined;
    },
    async set() {},
  };
}

export async function parseWithCache(
  parser: DocumentParser,
  input: ParserInput,
  cache: ParserCache,
  options: ParserCacheOptions,
): Promise<ParserResultWithCache> {
  const cacheKey = {
    contentHash: input.contentHash,
    parserName: parser.name,
    parserVersion: parser.version,
  };
  const disabledMetadata = createParserCacheMetadata("disabled", cacheKey);

  if (!options.reuseCachedParsedContent) {
    return {
      ...(await parser.parse(input)),
      cache: disabledMetadata,
    };
  }

  const cached = await cache.get(cacheKey);

  if (cached !== undefined) {
    const parsedContent = cloneParsedContentForInput(cached, input);

    return {
      kind: "success",
      parsedContent,
      cache: createParserCacheMetadata("hit", cacheKey),
    };
  }

  const result = await parser.parse(input);

  if (result.kind === "success") {
    await cache.set(cacheKey, result.parsedContent);
  }

  return {
    ...result,
    cache: createParserCacheMetadata("miss", cacheKey),
  };
}

export function shouldContinueIngestAfterParserResult(result: ParserResult): boolean {
  return result.kind === "success";
}

export function createRapidOcrProvider(options: RapidOcrProviderOptions): OcrProvider {
  const baseUrl = options.baseUrl.replace(/\/+$/u, "");
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async recognizePage(input) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), options.timeoutSeconds * 1000);
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      if (options.apiKey !== undefined && options.apiKey.length > 0) {
        headers.authorization = `Bearer ${options.apiKey}`;
      }

      try {
        const response = await fetchFn(`${baseUrl}/v1/ocr/pages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            pages: [
              {
                page_number: input.pageNumber,
                image_base64: input.image.toString("base64"),
                mime_type: input.mimeType,
              },
            ],
            languages: input.languages,
            confidence_threshold: options.confidenceThreshold,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw createOcrProviderStatusError(response.status);
        }

        const raw = await response.json().catch((error: unknown) => {
          throw new OcrProviderError({
            code: "ocr_provider_malformed_response",
            message: "OCR provider returned an invalid response.",
            retryable: false,
            cause: error,
          });
        });

        return normalizeRapidOcrResponse(raw, input.pageNumber, options.confidenceThreshold);
      } catch (error) {
        if (error instanceof OcrProviderError) {
          throw error;
        }

        throw new OcrProviderError({
          code: isRetryableOcrProviderError(error)
            ? "ocr_provider_retryable_error"
            : "ocr_provider_request_failed",
          message: isRetryableOcrProviderError(error)
            ? "OCR provider request failed and can be retried."
            : "OCR provider request failed.",
          retryable: isRetryableOcrProviderError(error),
          cause: error,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

export function isRetryableOcrProviderError(error: unknown): boolean {
  if (error instanceof OcrProviderError) {
    return error.retryable;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;

    return typeof status === "number" && (status === 408 || status === 429 || status >= 500);
  }

  return false;
}

export async function renderPdfPagesForOcr(
  input: PdfOcrPageRenderInput,
): Promise<PdfOcrPageRenderResult> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const loadingTask = getDocument({
    data: createPdfJsData(input.content),
  });
  const pdf = await loadingTask.promise;
  const selectedPages = input.candidatePages.slice(0, input.maxPages);
  const skippedPages: PdfOcrRenderSkippedPage[] = input.candidatePages
    .slice(input.maxPages)
    .map((pageNumber) => ({
      pageNumber,
      reason: "page_limit_exceeded",
      actual: input.candidatePages.length,
      limit: input.maxPages,
    }));
  const warnings: ParserWarning[] = skippedPages.map((page) => ({
    kind: "ocr_render_page_limit_exceeded",
    message: "OCR render page limit reached; remaining candidate pages were skipped.",
    locator: {
      kind: "page",
      value: String(page.pageNumber),
    },
  }));

  try {
    const renderedPages = await mapWithConcurrency(
      selectedPages,
      Math.max(1, input.concurrency),
      async (pageNumber): Promise<PdfOcrRenderedPage | PdfOcrRenderSkippedPage> => {
        if (await shouldCancelRender(input.shouldCancel)) {
          return {
            pageNumber,
            reason: "render_canceled",
          };
        }
        if (pageNumber < 1 || pageNumber > pdf.numPages) {
          return {
            pageNumber,
            reason: "page_not_found",
          };
        }

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({
          scale: input.dpi / 72,
        });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        const pixelCount = width * height;

        if (pixelCount > input.maxPagePixels) {
          return {
            pageNumber,
            reason: "page_pixel_limit_exceeded",
            actual: pixelCount,
            limit: input.maxPagePixels,
          };
        }

        const canvas = createCanvas(width, height);
        const canvasContext = canvas.getContext("2d");

        try {
          const renderTask = page.render({
            canvas,
            canvasContext,
            viewport,
          });

          await withTimeout(renderTask.promise, input.timeoutMs, () => renderTask.cancel());

          return {
            pageNumber,
            image: await canvas.encode("png"),
            mimeType: "image/png",
            width,
            height,
            pixelCount,
            dpi: input.dpi,
          };
        } catch (error) {
          if (error instanceof PdfOcrRenderTimeoutError) {
            return {
              pageNumber,
              reason: "render_timeout",
              limit: input.timeoutMs,
            };
          }

          throw error;
        }
      },
    );

    for (const skipped of renderedPages.filter(isPdfOcrRenderSkippedPage)) {
      skippedPages.push(skipped);
      warnings.push(createPdfOcrRenderWarning(skipped));
    }

    return {
      pages: renderedPages.filter(isPdfOcrRenderedPage),
      skippedPages,
      warnings,
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export function evaluatePdfOcrEligibility(input: {
  pages: readonly PdfNativeTextPage[];
  policy: PdfOcrPolicy;
}): PdfOcrEligibilityResult {
  const skippedPages: PdfOcrSkippedPage[] = [];
  const candidatePages: PdfOcrCandidatePage[] = [];
  const warnings: ParserWarning[] = [];

  if (!input.policy.enabled || input.policy.mode === "disabled") {
    return {
      eligiblePages: [],
      skippedPages: input.pages.map((page) => ({
        pageNumber: page.pageNumber,
        reason: "ocr_disabled",
        nativeTextChars: countUsablePdfTextChars(page.text),
      })),
      warnings,
      requiredForDocument: false,
    };
  }

  for (const page of input.pages) {
    const nativeTextChars = countUsablePdfTextChars(page.text);

    if (input.policy.mode === "force_for_pdf") {
      candidatePages.push({
        pageNumber: page.pageNumber,
        reason: "forced",
        nativeTextChars,
      });
      continue;
    }

    if (nativeTextChars === 0) {
      candidatePages.push({
        pageNumber: page.pageNumber,
        reason: "empty_native_text",
        nativeTextChars,
      });
      continue;
    }

    if (nativeTextChars < input.policy.minTextCharsPerPage || hasLowPrintableRatio(page.text)) {
      candidatePages.push({
        pageNumber: page.pageNumber,
        reason: "low_native_text",
        nativeTextChars,
      });
      continue;
    }

    skippedPages.push({
      pageNumber: page.pageNumber,
      reason: "native_text_sufficient",
      nativeTextChars,
    });
  }

  const eligiblePages = candidatePages.slice(0, input.policy.maxPagesPerDocument);
  const pageLimitSkipped = candidatePages.slice(input.policy.maxPagesPerDocument);

  for (const page of pageLimitSkipped) {
    skippedPages.push({
      pageNumber: page.pageNumber,
      reason: "page_limit_exceeded",
      nativeTextChars: page.nativeTextChars,
    });
    warnings.push({
      kind: "ocr_page_limit_exceeded",
      message: "OCR page limit reached; remaining candidate pages were skipped.",
      locator: {
        kind: "page",
        value: String(page.pageNumber),
      },
    });
  }

  return {
    eligiblePages,
    skippedPages,
    warnings,
    requiredForDocument:
      eligiblePages.length > 0 &&
      input.pages.length > 0 &&
      skippedPages.every((page) => page.reason !== "native_text_sufficient"),
  };
}

export function applyPdfOcrResults(input: {
  nativePages: readonly PdfNativeTextPage[];
  ocrBlocks: readonly PdfOcrBlock[];
  parserName: string;
  parserVersion: string;
  fileExtension: string;
  mimeType: string;
  ocrWasRequired: boolean;
}): PdfOcrApplyResult {
  const blocksByPage = groupPdfOcrBlocksByPage(input.ocrBlocks);
  const sections: string[] = [];
  const locators: ParserLocator[] = [];

  for (const page of input.nativePages) {
    const nativeText = page.text.trim();
    const pageOcrBlocks = blocksByPage.get(page.pageNumber) ?? [];
    const ocrEvidence = formatPdfOcrEvidence(pageOcrBlocks);
    const pageText =
      nativeText.length > 0 && ocrEvidence.length > 0
        ? `${nativeText}\n\n${ocrEvidence}`
        : nativeText.length > 0
          ? nativeText
          : ocrEvidence;

    if (pageText.length === 0) {
      continue;
    }

    sections.push(`## Page ${page.pageNumber}\n\n${pageText}`);
    locators.push({
      kind: "page",
      value: String(page.pageNumber),
    });
  }

  const normalizedMarkdown = sections.join("\n\n").trim();

  if (normalizedMarkdown.length === 0) {
    return {
      kind: "fatal",
      error: {
        kind: "parser_output_empty",
        parserName: input.parserName,
        parserVersion: input.parserVersion,
        fileExtension: input.fileExtension,
        mimeType: input.mimeType,
        message: input.ocrWasRequired
          ? "OCR completed but produced no usable text."
          : "Parser output is empty.",
        retryable: false,
      },
    };
  }

  const firstBlock = input.ocrBlocks[0];

  return {
    kind: "success",
    normalizedMarkdown,
    locators,
    warnings: [],
    ocr: {
      status: input.ocrBlocks.length > 0 ? "succeeded" : "not_required",
      pageCount: blocksByPage.size,
      blockCount: input.ocrBlocks.length,
      ...(firstBlock === undefined ? {} : { provider: firstBlock.provider }),
      ...(firstBlock?.engine === undefined ? {} : { engine: firstBlock.engine }),
      ...(firstBlock?.modelVersion === undefined ? {} : { modelVersion: firstBlock.modelVersion }),
    },
  };
}

function formatPdfOcrEvidence(blocks: readonly PdfOcrBlock[]): string {
  const sections = blocks
    .map((block) => {
      const text = block.text.trim();

      if (text.length === 0) {
        return "";
      }

      return [
        `> OCR evidence: page=${block.pageNumber}; block_index=${block.blockIndex}; provider=${block.provider}; engine=${block.engine}${block.confidence === undefined ? "" : `; confidence=${block.confidence}`}`,
        "",
        text,
      ].join("\n");
    })
    .filter((text) => text.length > 0);

  return sections.length === 0 ? "" : ["### OCR Evidence", ...sections].join("\n\n");
}

function countUsablePdfTextChars(text: string): number {
  return text.replace(/\s+/gu, "").length;
}

function hasLowPrintableRatio(text: string): boolean {
  const compact = text.replace(/\s+/gu, "");

  if (compact.length === 0) {
    return false;
  }

  const printableChars = Array.from(compact).filter((char) => {
    const codePoint = char.codePointAt(0) ?? 0;

    return codePoint >= 0x20 && codePoint !== 0xfffd;
  }).length;

  return printableChars / compact.length < 0.8;
}

function groupPdfOcrBlocksByPage(blocks: readonly PdfOcrBlock[]): Map<number, PdfOcrBlock[]> {
  const grouped = new Map<number, PdfOcrBlock[]>();

  for (const block of blocks) {
    const pageBlocks = grouped.get(block.pageNumber) ?? [];
    pageBlocks.push(block);
    grouped.set(block.pageNumber, pageBlocks);
  }

  for (const pageBlocks of grouped.values()) {
    pageBlocks.sort((left, right) => left.blockIndex - right.blockIndex);
  }

  return grouped;
}

function createOcrProviderStatusError(status: number): OcrProviderError {
  return new OcrProviderError({
    code: isRetryableOcrProviderStatus(status)
      ? "ocr_provider_retryable_error"
      : "ocr_provider_request_failed",
    message: isRetryableOcrProviderStatus(status)
      ? "OCR provider request failed and can be retried."
      : "OCR provider request failed.",
    retryable: isRetryableOcrProviderStatus(status),
    status,
  });
}

function isRetryableOcrProviderStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

class PdfOcrRenderTimeoutError extends Error {
  constructor() {
    super("PDF page rendering timed out.");
    this.name = "PdfOcrRenderTimeoutError";
  }
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];

        if (item !== undefined) {
          results[index] = await mapper(item);
        }
      }
    }),
  );

  return results;
}

async function shouldCancelRender(
  shouldCancel: PdfOcrPageRenderInput["shouldCancel"],
): Promise<boolean> {
  return shouldCancel === undefined ? false : Boolean(await shouldCancel());
}

async function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<TValue> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(new PdfOcrRenderTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function isPdfOcrRenderedPage(
  value: PdfOcrRenderedPage | PdfOcrRenderSkippedPage,
): value is PdfOcrRenderedPage {
  return "image" in value;
}

function isPdfOcrRenderSkippedPage(
  value: PdfOcrRenderedPage | PdfOcrRenderSkippedPage,
): value is PdfOcrRenderSkippedPage {
  return "reason" in value;
}

function createPdfOcrRenderWarning(page: PdfOcrRenderSkippedPage): ParserWarning {
  return {
    kind: `ocr_${page.reason}`,
    message: "OCR page rendering skipped a candidate page.",
    locator: {
      kind: "page",
      value: String(page.pageNumber),
    },
  };
}

function normalizeRapidOcrResponse(
  raw: unknown,
  pageNumber: number,
  confidenceThreshold: number,
): OcrProviderPageResult {
  if (typeof raw !== "object" || raw === null) {
    throw createMalformedOcrProviderResponseError();
  }

  const record = raw as Record<string, unknown>;
  const pages = record.pages;

  if (!Array.isArray(pages)) {
    throw createMalformedOcrProviderResponseError();
  }

  const page = pages.find((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    return readProviderPageNumber(item as Record<string, unknown>) === pageNumber;
  });

  if (typeof page !== "object" || page === null) {
    throw createMalformedOcrProviderResponseError();
  }

  const pageRecord = page as Record<string, unknown>;
  const blocks = pageRecord.blocks;

  if (!Array.isArray(blocks)) {
    throw createMalformedOcrProviderResponseError();
  }

  const provider = readString(record.provider, "rapidocr");
  const engine = readString(record.engine, "onnxruntime");
  const modelVersion = readString(record.model_version, "unknown");
  const normalizedBlocks = blocks.map((block, blockIndex) =>
    normalizeRapidOcrBlock(block, pageNumber, blockIndex, provider, engine, modelVersion),
  );
  const warnings = normalizedBlocks
    .filter((block) => block.confidence !== undefined && block.confidence < confidenceThreshold)
    .map((block): OcrProviderWarning => {
      return {
        kind: "ocr_low_confidence",
        message: "OCR block confidence is below the configured threshold.",
        locator: {
          kind: "page",
          value: String(block.pageNumber),
        },
      };
    });

  return {
    pageNumber,
    blocks: normalizedBlocks,
    warnings,
    provider,
    engine,
    modelVersion,
  };
}

function normalizeRapidOcrBlock(
  raw: unknown,
  pageNumber: number,
  blockIndex: number,
  provider: string,
  engine: string,
  modelVersion: string,
): OcrProviderBlock {
  if (typeof raw !== "object" || raw === null) {
    throw createMalformedOcrProviderResponseError();
  }

  const record = raw as Record<string, unknown>;
  const text = record.text;

  if (typeof text !== "string") {
    throw createMalformedOcrProviderResponseError();
  }

  const confidence = readOptionalNumber(record.confidence);
  const bbox = readOptionalBoundingBox(record.bbox);
  const language = typeof record.language === "string" ? record.language : undefined;

  return {
    pageNumber,
    blockIndex,
    text,
    ...(confidence === undefined ? {} : { confidence }),
    ...(bbox === undefined ? {} : { bbox }),
    ...(language === undefined ? {} : { language }),
    provider,
    engine,
    modelVersion,
  };
}

function readProviderPageNumber(record: Record<string, unknown>): number | undefined {
  const snakeCase = record.page_number;
  const camelCase = record.pageNumber;

  if (typeof snakeCase === "number") {
    return snakeCase;
  }

  return typeof camelCase === "number" ? camelCase : undefined;
}

function readOptionalBoundingBox(value: unknown): OcrBoundingBox | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.every((item) => typeof item === "number")) {
    return value as number[];
  }

  if (
    value.every(
      (item) => Array.isArray(item) && item.every((coordinate) => typeof coordinate === "number"),
    )
  ) {
    return value as number[][];
  }

  throw createMalformedOcrProviderResponseError();
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createMalformedOcrProviderResponseError();
  }

  return value;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function createMalformedOcrProviderResponseError(): OcrProviderError {
  return new OcrProviderError({
    code: "ocr_provider_malformed_response",
    message: "OCR provider returned an invalid response.",
    retryable: false,
  });
}

export async function parseWithLimits(
  parser: DocumentParser,
  input: ParserInput,
  limits: ParserLimitConfig,
): Promise<ParserResult> {
  const context = createParserLimitContext(parser, input);
  const contentSize = getContentSizeBytes(input.content);

  if (contentSize > limits.maxFileSizeBytes) {
    return {
      kind: "fatal",
      error: createParserLimitError("file_size", contentSize, limits.maxFileSizeBytes, context),
    };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const parserInput = {
    ...input,
    limits,
    visualExtraction: createVisualExtractionOptions(limits),
  };
  const parserResult = parser.parse(parserInput).catch((error): ParserResult => {
    return {
      kind: "fatal",
      error: {
        kind: "parser_failed",
        parserName: parser.name,
        parserVersion: parser.version,
        fileExtension: normalizeExtension(input.fileName),
        mimeType: normalizeMimeType(input.mimeType),
        message: error instanceof Error ? error.message : "Parser failed.",
        retryable: false,
      },
    };
  });
  const timeoutResult = new Promise<ParserResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        kind: "fatal",
        error: {
          kind: "parser_timeout",
          parserName: parser.name,
          parserVersion: parser.version,
          fileExtension: normalizeExtension(input.fileName),
          mimeType: normalizeMimeType(input.mimeType),
          message: "Parser timed out.",
          retryable: true,
        },
      });
    }, limits.timeoutMs);
  });

  const result = await Promise.race([parserResult, timeoutResult]);

  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  if (result.kind === "success") {
    const mediaResult = enforceMediaAssetLimits(result.parsedContent.mediaAssets, limits);

    return {
      kind: "success",
      parsedContent: {
        ...result.parsedContent,
        mediaAssets: mediaResult.mediaAssets,
        warnings: [...result.parsedContent.warnings, ...mediaResult.warnings],
      },
    };
  }

  return result;
}

export async function parseWithErrorBoundary(
  parser: DocumentParser,
  input: ParserInput,
): Promise<ParserResult> {
  try {
    return await parser.parse(input);
  } catch (error) {
    return {
      kind: "fatal",
      error: createParserFailedError(parser, input, error),
    };
  }
}

export function enforceZipExpansionLimits(
  summary: ZipExpansionSummary,
  limits: ParserLimitConfig,
  context: ParserLimitContext,
): ParserFatalError | undefined {
  if (summary.entryCount > limits.zip.maxEntries) {
    return createLimitError("zip_entry_count", summary.entryCount, limits.zip.maxEntries, context);
  }

  if (summary.totalExpandedBytes > limits.zip.maxExpandedBytes) {
    return createLimitError(
      "zip_total_expanded_bytes",
      summary.totalExpandedBytes,
      limits.zip.maxExpandedBytes,
      context,
    );
  }

  if (summary.largestEntryBytes > limits.zip.maxEntryBytes) {
    return createLimitError(
      "zip_entry_bytes",
      summary.largestEntryBytes,
      limits.zip.maxEntryBytes,
      context,
    );
  }

  return undefined;
}

async function loadZipWithRuntimeLimits(
  content: Buffer,
  input: ParserInput,
  parserName: string,
): Promise<{ kind: "success"; zip: JSZip } | { kind: "fatal"; error: ParserFatalError }> {
  const zip = await JSZip.loadAsync(content);

  if (input.limits === undefined) {
    return {
      kind: "success",
      zip,
    };
  }

  const error = enforceZipExpansionLimits(
    createZipExpansionSummary(zip),
    input.limits,
    createParserLimitContextForName(parserName, input),
  );

  if (error !== undefined) {
    return {
      kind: "fatal",
      error,
    };
  }

  return {
    kind: "success",
    zip,
  };
}

function createZipExpansionSummary(zip: JSZip): ZipExpansionSummary {
  let entryCount = 0;
  let totalExpandedBytes = 0;
  let largestEntryBytes = 0;

  for (const file of Object.values(zip.files)) {
    entryCount += 1;

    if (file.dir) {
      continue;
    }

    const uncompressedSize = readZipEntryUncompressedSize(file);

    totalExpandedBytes += uncompressedSize;
    largestEntryBytes = Math.max(largestEntryBytes, uncompressedSize);
  }

  return {
    entryCount,
    totalExpandedBytes,
    largestEntryBytes,
  };
}

interface JsZipObjectWithPrivateData {
  _data?: {
    uncompressedSize?: unknown;
  };
}

function readZipEntryUncompressedSize(file: JSZip.JSZipObject): number {
  const value = (file as JsZipObjectWithPrivateData)._data?.uncompressedSize;

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createParserLimitContextForName(
  parserName: string,
  input: ParserInput,
): ParserLimitContext {
  return {
    parserName,
    parserVersion: parserRuntimeVersion,
    fileName: input.fileName,
    mimeType: input.mimeType,
  };
}

function createParserFailedError(
  parser: DocumentParser,
  input: ParserInput,
  error: unknown,
): ParserFatalError {
  return {
    kind: "parser_failed",
    parserName: parser.name,
    parserVersion: parser.version,
    fileExtension: normalizeExtension(input.fileName),
    mimeType: normalizeMimeType(input.mimeType),
    message: error instanceof Error ? error.message : "Parser failed.",
    retryable: false,
  };
}

function isZipContent(content: Buffer): boolean {
  return (
    content.length >= 4 &&
    content[0] === 0x50 &&
    content[1] === 0x4b &&
    (content[2] === 0x03 || content[2] === 0x05 || content[2] === 0x07) &&
    (content[3] === 0x04 || content[3] === 0x06 || content[3] === 0x08)
  );
}

export function enforceMediaAssetLimits(
  mediaAssets: readonly ParserMediaAsset[],
  limits: ParserLimitConfig,
): MediaAssetLimitResult {
  const acceptedAssets: ParserMediaAsset[] = [];
  const warnings: ParserWarning[] = [];
  const acceptedHashes = new Set<string>();

  for (const asset of mediaAssets) {
    if (isImageTooLarge(asset, limits)) {
      warnings.push({
        kind: "image_too_large",
        message: "Image skipped because dimensions exceed parser limits.",
      });
      continue;
    }

    if (isImageBytesTooLarge(asset, limits)) {
      warnings.push({
        kind: "image_bytes_too_large",
        message: "Image skipped because byte size exceeds parser limits.",
      });
      continue;
    }

    if (isImageTooSmall(asset, limits)) {
      warnings.push({
        kind: "image_too_small",
        message: "Image skipped because dimensions are below parser limits.",
      });
      continue;
    }

    if (acceptedHashes.has(asset.hash)) {
      warnings.push({
        kind: "image_duplicate_skipped",
        message: "Image skipped because another asset with the same hash was already accepted.",
      });
      continue;
    }

    if (acceptedAssets.length >= limits.images.maxImagesPerDocument) {
      warnings.push({
        kind: "image_count_exceeded",
        message: "Image skipped because parser image count limit was reached.",
      });
      continue;
    }

    acceptedAssets.push(asset);
    acceptedHashes.add(asset.hash);
  }

  return {
    mediaAssets: acceptedAssets,
    warnings,
  };
}

function createVisualExtractionOptions(limits: ParserLimitConfig): ParserVisualExtractionOptions {
  return {
    maxImagesPerDocument: limits.images.maxImagesPerDocument,
    maxRenderedSnapshotsPerDocument: limits.images.maxRenderedSnapshotsPerDocument,
    maxPixelsPerAsset: limits.images.maxPixelsPerAsset,
    maxAssetBytes: limits.images.maxAssetBytes,
    minImageWidth: limits.images.minWidth,
    minImageHeight: limits.images.minHeight,
    remoteFetchingEnabled: limits.images.remoteFetchingEnabled,
    pdfSnapshotMinTextChars: limits.images.pdfSnapshotMinTextChars,
    pdfSnapshotDpi: 144,
    concurrency: limits.images.visualExtractionConcurrency,
    timeoutMs: limits.timeoutMs,
  };
}

const defaultParsers: readonly DocumentParser[] = [
  createMarkdownParser(),
  createTextParser({
    name: "ts-plain-text",
    mimeTypes: ["text/plain"],
    extensions: [".txt"],
  }),
  createPdfParser(),
  createDocxParser(),
  createPptxParser(),
  createSpreadsheetParser(),
  createRtfParser(),
  createOpenDocumentTextParser(),
  createOpenDocumentPresentationParser(),
  createHtmlParser(),
  createCsvParser(),
  createTextParser({
    name: "ts-json",
    mimeTypes: ["application/json"],
    extensions: [".json"],
  }),
  createTextParser({
    name: "ts-jsonl",
    mimeTypes: ["application/jsonl", "application/ndjson", "application/x-ndjson"],
    extensions: [".jsonl", ".ndjson"],
  }),
  createTextParser({
    name: "ts-yaml",
    mimeTypes: ["application/yaml", "text/yaml", "text/x-yaml"],
    extensions: [".yaml", ".yml"],
  }),
  createTextParser({
    name: "ts-xml",
    mimeTypes: ["application/xml", "text/xml"],
    extensions: [".xml"],
  }),
];

function createMarkdownParser(): DocumentParser {
  const parserName = "ts-markdown";

  return {
    name: parserName,
    version: parserRuntimeVersion,
    mimeTypes: ["text/markdown", "text/x-markdown"],
    extensions: [".md", ".markdown"],
    async parse(input) {
      const sourceMarkdown = readTextContent(input.content).trim();
      const imageResult = extractTextImageMediaAssets({
        input,
        text: sourceMarkdown,
        sourceFormat: "markdown",
        extractionMethod: "markdown_image",
        pattern: /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/giu,
      });
      const normalizedMarkdown = normalizeMarkdownImageReferences(sourceMarkdown);

      if (normalizedMarkdown.length === 0) {
        return {
          kind: "fatal",
          error: {
            kind: "parser_output_empty",
            parserName,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: "Parser output is empty.",
            retryable: false,
          },
        };
      }

      return {
        kind: "success",
        parsedContent: {
          sourceDocumentId: input.sourceDocumentId,
          objectKey: input.objectKey,
          contentHash: input.contentHash,
          parserName,
          parserVersion: parserRuntimeVersion,
          normalizedMarkdown,
          locators: extractHeadingLocators(normalizedMarkdown),
          tables: [],
          warnings: imageResult.warnings,
          mediaAssets: imageResult.mediaAssets,
        },
      };
    },
  };
}

function normalizeMarkdownImageReferences(markdown: string): string {
  return markdown
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/giu,
      (match: string, altText: string, _source: string, offset: number) => {
        const line = countLineNumber(markdown, offset);
        const label = altText.trim().length > 0 ? altText.trim() : "Image";

        return `![${label}](image:line:${line})`;
      },
    )
    .trim();
}

function createTextParser(options: {
  name: string;
  mimeTypes: readonly string[];
  extensions: readonly string[];
}): DocumentParser {
  return {
    name: options.name,
    version: parserRuntimeVersion,
    mimeTypes: options.mimeTypes,
    extensions: options.extensions,
    async parse(input) {
      const normalizedMarkdown = readTextContent(input.content).trim();

      if (normalizedMarkdown.length === 0) {
        return {
          kind: "fatal",
          error: {
            kind: "parser_output_empty",
            parserName: options.name,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: "Parser output is empty.",
            retryable: false,
          },
        };
      }

      return {
        kind: "success",
        parsedContent: {
          sourceDocumentId: input.sourceDocumentId,
          objectKey: input.objectKey,
          contentHash: input.contentHash,
          parserName: options.name,
          parserVersion: parserRuntimeVersion,
          normalizedMarkdown,
          locators: extractHeadingLocators(normalizedMarkdown),
          tables: [],
          warnings: [],
          mediaAssets: [],
        },
      };
    },
  };
}

function createHtmlParser(): DocumentParser {
  const parserName = "ts-html";

  return {
    name: "ts-html",
    mimeTypes: ["text/html"],
    extensions: [".html", ".htm"],
    version: parserRuntimeVersion,
    async parse(input) {
      const html = readTextContent(input.content);
      const normalizedMarkdown = convertSimpleHtmlToMarkdown(html);

      if (normalizedMarkdown.length === 0) {
        return createParserOutputEmptyResult(parserName, input);
      }

      const imageResult = extractTextImageMediaAssets({
        input,
        text: html,
        sourceFormat: "html",
        extractionMethod: "html_img",
        pattern: /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu,
      });

      return {
        kind: "success",
        parsedContent: {
          sourceDocumentId: input.sourceDocumentId,
          objectKey: input.objectKey,
          contentHash: input.contentHash,
          parserName,
          parserVersion: parserRuntimeVersion,
          normalizedMarkdown,
          locators: extractHeadingLocators(normalizedMarkdown),
          tables: [],
          warnings: [
            {
              kind: "html_converted_to_markdown",
              message: "HTML content was converted to normalized Markdown.",
            },
            ...imageResult.warnings,
          ],
          mediaAssets: imageResult.mediaAssets,
        },
      };
    },
  };
}

function createCsvParser(): DocumentParser {
  const parserName = "ts-csv";

  return {
    name: "ts-csv",
    mimeTypes: ["text/csv"],
    extensions: [".csv"],
    version: parserRuntimeVersion,
    async parse(input) {
      const rows = parseSimpleCsv(readTextContent(input.content));
      const normalizedMarkdown = renderMarkdownTable(rows);

      if (normalizedMarkdown.length === 0) {
        return createParserOutputEmptyResult(parserName, input);
      }

      return {
        kind: "success",
        parsedContent: {
          sourceDocumentId: input.sourceDocumentId,
          objectKey: input.objectKey,
          contentHash: input.contentHash,
          parserName,
          parserVersion: parserRuntimeVersion,
          normalizedMarkdown,
          locators: rows.slice(1).map((_row, index) => ({
            kind: "row",
            value: String(index + 2),
            line: index + 2,
          })),
          tables: [
            {
              kind: "table",
              row_count: rows.length,
              column_count: Math.max(...rows.map((row) => row.length), 0),
              locator: {
                kind: "sheet",
                value: input.fileName,
              },
            },
          ],
          warnings: [],
          mediaAssets: [],
        },
      };
    },
  };
}

function createPdfParser(): DocumentParser {
  const parserName = "ts-pdf-parse";

  return {
    name: parserName,
    version: parserRuntimeVersion,
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    async parse(input) {
      try {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const content = readBinaryContent(input.content);
        const loadingTask = getDocument({
          data: createPdfJsData(content),
        });
        const pdf = await loadingTask.promise;
        const pages: string[] = [];
        const nativePages: PdfNativeTextPage[] = [];
        const locators: ParserLocator[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
            .filter((value) => value.length > 0)
            .join(" ")
            .trim();

          nativePages.push({
            pageNumber,
            text: pageText,
          });
          pages.push(`## Page ${pageNumber}\n\n${pageText}`);
          locators.push({
            kind: "page",
            value: String(pageNumber),
          });
        }

        await pdf.loadingTask.destroy();

        const normalizedMarkdown = pages.join("\n\n").trim();
        const mediaResult = await extractPdfVisualMediaAssets(content, input, nativePages);

        if (normalizedMarkdown.length === 0) {
          return createParserOutputEmptyResult(parserName, input);
        }

        return {
          kind: "success",
          parsedContent: {
            sourceDocumentId: input.sourceDocumentId,
            objectKey: input.objectKey,
            contentHash: input.contentHash,
            parserName,
            parserVersion: parserRuntimeVersion,
            normalizedMarkdown,
            locators,
            tables: [],
            warnings: mediaResult.warnings,
            mediaAssets: mediaResult.mediaAssets,
          },
        };
      } catch (error) {
        if (isPdfPasswordError(error)) {
          return {
            kind: "fatal",
            error: {
              kind: "password_protected_pdf",
              parserName,
              parserVersion: parserRuntimeVersion,
              fileExtension: normalizeExtension(input.fileName),
              mimeType: normalizeMimeType(input.mimeType),
              message: "Password-protected PDFs are not supported.",
              retryable: false,
            },
          };
        }

        return {
          kind: "fatal",
          error: {
            kind: "parser_failed",
            parserName,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: error instanceof Error ? error.message : "PDF parser failed.",
            retryable: false,
          },
        };
      }
    },
  };
}

function isPdfPasswordError(error: unknown): boolean {
  if (error instanceof Error && error.name === "PasswordException") {
    return true;
  }

  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name?: unknown }).name === "PasswordException";
  }

  return false;
}

async function extractPdfVisualMediaAssets(
  content: Buffer,
  input: ParserInput,
  nativePages: readonly PdfNativeTextPage[],
): Promise<MediaAssetLimitResult> {
  const options = input.visualExtraction;

  if (options === undefined) {
    return {
      mediaAssets: [],
      warnings: [],
    };
  }

  const embeddedResult = await extractPdfEmbeddedImageMediaAssets(content, input, options);
  const snapshotResult = await extractPdfPageSnapshotMediaAssets(
    content,
    input,
    nativePages,
    options,
  );

  return {
    mediaAssets: [...embeddedResult.mediaAssets, ...snapshotResult.mediaAssets],
    warnings: [...embeddedResult.warnings, ...snapshotResult.warnings],
  };
}

async function extractPdfPageSnapshotMediaAssets(
  content: Buffer,
  input: ParserInput,
  nativePages: readonly PdfNativeTextPage[],
  options: ParserVisualExtractionOptions,
): Promise<MediaAssetLimitResult> {
  if (options.maxRenderedSnapshotsPerDocument <= 0) {
    return {
      mediaAssets: [],
      warnings: [],
    };
  }

  const candidatePages = nativePages
    .filter((page) => countUsablePdfTextChars(page.text) < options.pdfSnapshotMinTextChars)
    .map((page) => page.pageNumber)
    .slice(0, options.maxRenderedSnapshotsPerDocument);
  const skippedByLimit = nativePages
    .filter((page) => countUsablePdfTextChars(page.text) < options.pdfSnapshotMinTextChars)
    .slice(options.maxRenderedSnapshotsPerDocument);

  if (candidatePages.length === 0) {
    return {
      mediaAssets: [],
      warnings: [],
    };
  }

  const renderResult = await renderPdfPagesForOcr({
    content,
    candidatePages,
    dpi: options.pdfSnapshotDpi,
    maxPages: options.maxRenderedSnapshotsPerDocument,
    maxPagePixels: options.maxPixelsPerAsset,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
  });
  const mediaAssets = renderResult.pages.map((page) =>
    createParserMediaAssetFromRaw({
      parserInput: input,
      content: page.image,
      mimeType: page.mimeType,
      objectKeyName: `pdf-page-${page.pageNumber}-snapshot.png`,
      sourceFormat: "pdf",
      assetKind: "page_snapshot",
      extractionMethod: "pdf_page_snapshot",
      locator: createMediaAssetLocator({
        kind: "page",
        value: String(page.pageNumber),
        sourceFormat: "pdf",
        assetKind: "page_snapshot",
        extractionMethod: "pdf_page_snapshot",
        pageNumber: page.pageNumber,
      }),
      sourceMetadata: {
        page_number: page.pageNumber,
        dpi: page.dpi,
        pixel_count: page.pixelCount,
      },
    }),
  );
  const warnings: ParserWarning[] = [
    ...renderResult.warnings.map((warning) => ({
      ...warning,
      kind: warning.kind.replace(/^ocr_/u, "pdf_visual_"),
      message: "PDF visual page snapshot skipped a candidate page.",
    })),
    ...skippedByLimit.map(
      (page): ParserWarning => ({
        kind: "pdf_visual_snapshot_count_exceeded",
        message: "PDF visual page snapshot limit reached; remaining candidate pages were skipped.",
        locator: {
          kind: "page",
          value: String(page.pageNumber),
        },
      }),
    ),
  ];

  return {
    mediaAssets,
    warnings,
  };
}

interface PdfJsOperatorList {
  fnArray: readonly number[];
  argsArray: readonly unknown[];
}

interface PdfJsObjectStore {
  has?(id: string): boolean;
  get(id: string, callback?: (value: unknown) => void): unknown;
}

interface PdfJsPageProxy {
  getOperatorList(): Promise<PdfJsOperatorList>;
  objs?: PdfJsObjectStore;
}

interface PdfJsImageObject {
  data?: unknown;
  height?: unknown;
  width?: unknown;
}

interface NormalizedPdfImage {
  content: Buffer;
  height: number;
  pixelCount: number;
  rawByteLength: number;
  width: number;
}

async function extractPdfEmbeddedImageMediaAssets(
  content: Buffer,
  input: ParserInput,
  options: ParserVisualExtractionOptions,
): Promise<MediaAssetLimitResult> {
  if (options.maxImagesPerDocument <= 0) {
    return {
      mediaAssets: [],
      warnings: [],
    };
  }

  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const loadingTask = getDocument({
    data: createPdfJsData(content),
  });
  const pdf = await loadingTask.promise;
  const mediaAssets: ParserMediaAsset[] = [];
  const warnings: ParserWarning[] = [];
  const imageOperatorCodes = new Set(
    [
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageXObjectRepeat,
      OPS.paintInlineImageXObjectGroup,
    ].filter((value): value is number => typeof value === "number"),
  );

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = (await pdf.getPage(pageNumber)) as PdfJsPageProxy;
      const operatorList = await page.getOperatorList();
      let pageImageIndex = 0;

      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const operatorCode = operatorList.fnArray[index];

        if (operatorCode === undefined || !imageOperatorCodes.has(operatorCode)) {
          continue;
        }

        if (mediaAssets.length >= options.maxImagesPerDocument) {
          warnings.push({
            kind: "pdf_embedded_image_count_exceeded",
            message: "PDF embedded image limit reached; remaining images were skipped.",
            locator: {
              kind: "page",
              value: String(pageNumber),
            },
          });

          return {
            mediaAssets,
            warnings,
          };
        }

        pageImageIndex += 1;
        const imageObject = await resolvePdfImageObject({
          args: operatorList.argsArray[index],
          page,
          timeoutMs: Math.min(options.timeoutMs, pdfEmbeddedImageObjectTimeoutMs),
        });
        const locator = createMediaAssetLocator({
          kind: "image",
          value: `${pageNumber}:${pageImageIndex}`,
          sourceFormat: "pdf",
          assetKind: "embedded_image",
          extractionMethod: "pdf_embedded_image",
          pageNumber,
          imageIndex: pageImageIndex,
        });

        if (imageObject === null) {
          warnings.push({
            kind: "pdf_embedded_image_unavailable",
            message: "PDF embedded image object was not available for extraction.",
            locator: {
              kind: "page",
              value: String(pageNumber),
            },
          });
          continue;
        }

        const normalized = await normalizePdfImageObject(imageObject, {
          createCanvas,
          maxAssetBytes: options.maxAssetBytes,
          maxPixelsPerAsset: options.maxPixelsPerAsset,
        });

        if (normalized.kind === "skipped") {
          warnings.push({
            kind: normalized.warningKind,
            message: normalized.message,
            locator: {
              kind: "page",
              value: String(pageNumber),
            },
          });
          continue;
        }

        mediaAssets.push(
          createParserMediaAssetFromRaw({
            parserInput: input,
            content: normalized.image.content,
            mimeType: "image/png",
            objectKeyName: `pdf-page-${pageNumber}-image-${pageImageIndex}.png`,
            sourceFormat: "pdf",
            assetKind: "embedded_image",
            extractionMethod: "pdf_embedded_image",
            locator,
            sourceMetadata: {
              page_number: pageNumber,
              image_index: pageImageIndex,
              pixel_count: normalized.image.pixelCount,
              raw_byte_length: normalized.image.rawByteLength,
            },
          }),
        );
      }
    }
  } finally {
    await pdf.loadingTask.destroy();
  }

  return {
    mediaAssets,
    warnings,
  };
}

async function resolvePdfImageObject(input: {
  args: unknown;
  page: PdfJsPageProxy;
  timeoutMs: number;
}): Promise<PdfJsImageObject | null> {
  const args = Array.isArray(input.args) ? input.args : [input.args];
  const directImage = args.find(isPdfJsImageObject);

  if (directImage !== undefined) {
    return directImage;
  }

  const objectId = args.find((value): value is string => typeof value === "string");

  if (objectId === undefined || input.page.objs === undefined) {
    return null;
  }

  if (input.page.objs.has?.(objectId) === true) {
    const value = input.page.objs.get(objectId);

    return isPdfJsImageObject(value) ? value : null;
  }

  const value = await withTimeout(
    new Promise<unknown>((resolve) => {
      input.page.objs?.get(objectId, resolve);
    }),
    input.timeoutMs,
    () => undefined,
  ).catch(() => null);

  return isPdfJsImageObject(value) ? value : null;
}

function isPdfJsImageObject(value: unknown): value is PdfJsImageObject {
  return (
    typeof value === "object" &&
    value !== null &&
    "width" in value &&
    "height" in value &&
    "data" in value
  );
}

async function normalizePdfImageObject(
  imageObject: PdfJsImageObject,
  input: {
    createCanvas: typeof import("@napi-rs/canvas").createCanvas;
    maxAssetBytes: number;
    maxPixelsPerAsset: number;
  },
): Promise<
  | {
      kind: "ready";
      image: NormalizedPdfImage;
    }
  | {
      kind: "skipped";
      message: string;
      warningKind: string;
    }
> {
  const width = readPositiveInteger(imageObject.width);
  const height = readPositiveInteger(imageObject.height);
  const data = readImageByteArray(imageObject.data);

  if (width === null || height === null || data === null) {
    return {
      kind: "skipped",
      warningKind: "pdf_embedded_image_unsupported",
      message: "PDF embedded image data could not be normalized.",
    };
  }

  const pixelCount = width * height;

  if (pixelCount > input.maxPixelsPerAsset) {
    return {
      kind: "skipped",
      warningKind: "pdf_embedded_image_too_large",
      message: "PDF embedded image skipped because dimensions exceed parser limits.",
    };
  }

  if (data.byteLength > input.maxAssetBytes) {
    return {
      kind: "skipped",
      warningKind: "pdf_embedded_image_bytes_too_large",
      message: "PDF embedded image skipped because byte size exceeds parser limits.",
    };
  }

  const rgba = convertImageDataToRgba(data, pixelCount);

  if (rgba === null) {
    return {
      kind: "skipped",
      warningKind: "pdf_embedded_image_unsupported",
      message: "PDF embedded image color data could not be converted.",
    };
  }

  const canvas = input.createCanvas(width, height);
  const canvasContext = canvas.getContext("2d");
  const imageData = canvasContext.createImageData(width, height);

  imageData.data.set(rgba);
  canvasContext.putImageData(imageData, 0, 0);

  return {
    kind: "ready",
    image: {
      content: await canvas.encode("png"),
      height,
      pixelCount,
      rawByteLength: data.byteLength,
      width,
    },
  };
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readImageByteArray(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

function convertImageDataToRgba(data: Uint8Array, pixelCount: number): Uint8ClampedArray | null {
  if (data.byteLength === pixelCount * 4) {
    return new Uint8ClampedArray(data);
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4);

  if (data.byteLength === pixelCount * 3) {
    for (let index = 0; index < pixelCount; index += 1) {
      rgba[index * 4] = data[index * 3] ?? 0;
      rgba[index * 4 + 1] = data[index * 3 + 1] ?? 0;
      rgba[index * 4 + 2] = data[index * 3 + 2] ?? 0;
      rgba[index * 4 + 3] = 255;
    }

    return rgba;
  }

  if (data.byteLength === pixelCount) {
    for (let index = 0; index < pixelCount; index += 1) {
      const value = data[index] ?? 0;

      rgba[index * 4] = value;
      rgba[index * 4 + 1] = value;
      rgba[index * 4 + 2] = value;
      rgba[index * 4 + 3] = 255;
    }

    return rgba;
  }

  return null;
}

function createDocxParser(): DocumentParser {
  const parserName = "ts-mammoth";

  return {
    name: parserName,
    version: parserRuntimeVersion,
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: [".docx"],
    async parse(input) {
      try {
        const content = readBinaryContent(input.content);
        const zipResult = await loadZipWithRuntimeLimits(content, input, parserName);

        if (zipResult.kind === "fatal") {
          return zipResult;
        }

        const result = await mammoth.convertToHtml({
          buffer: content,
        });
        const normalizedMarkdown = convertSimpleHtmlToMarkdown(result.value);

        if (normalizedMarkdown.length === 0) {
          return createParserOutputEmptyResult(parserName, input);
        }

        const mediaAssets = await extractZipMediaAssets(zipResult.zip, input, {
          prefix: "word/media/",
          sourceFormat: "docx",
          assetKind: "embedded_image",
          extractionMethod: "office_zip_media",
          locatorForPath: (path, index) =>
            createMediaAssetLocator({
              kind: "document",
              value: input.fileName,
              sourceFormat: "docx",
              assetKind: "embedded_image",
              extractionMethod: "office_zip_media",
              imageIndex: index,
              sourcePath: path,
            }),
        });

        return {
          kind: "success",
          parsedContent: {
            sourceDocumentId: input.sourceDocumentId,
            objectKey: input.objectKey,
            contentHash: input.contentHash,
            parserName,
            parserVersion: parserRuntimeVersion,
            normalizedMarkdown,
            locators: extractLineLocators(normalizedMarkdown),
            tables: [],
            warnings: result.messages.map((message) => ({
              kind: `mammoth_${message.type}`,
              message: message.message,
            })),
            mediaAssets,
          },
        };
      } catch (error) {
        return {
          kind: "fatal",
          error: {
            kind: "parser_failed",
            parserName,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: error instanceof Error ? error.message : "DOCX parser failed.",
            retryable: false,
          },
        };
      }
    },
  };
}

function createPptxParser(): DocumentParser {
  const parserName = "ts-pptx-zip";

  return {
    name: parserName,
    version: parserRuntimeVersion,
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    extensions: [".pptx"],
    async parse(input) {
      try {
        const zipResult = await loadZipWithRuntimeLimits(
          readBinaryContent(input.content),
          input,
          parserName,
        );

        if (zipResult.kind === "fatal") {
          return zipResult;
        }

        const zip = zipResult.zip;
        const xmlParser = new XMLParser({
          ignoreAttributes: false,
        });
        const slideFiles = Object.keys(zip.files)
          .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
          .sort(compareOfficePartPaths);
        const slides: string[] = [];
        const locators: ParserLocator[] = [];

        for (const [index, path] of slideFiles.entries()) {
          const slideXml = await zip.file(path)?.async("string");

          if (slideXml === undefined) {
            continue;
          }

          const parsed = xmlParser.parse(slideXml) as unknown;
          const slideText = collectXmlTextNodes(parsed).join(" ").trim();
          const slideNumber = index + 1;

          if (slideText.length > 0) {
            slides.push(`## Slide ${slideNumber}\n\n${slideText}`);
            locators.push({
              kind: "slide",
              value: String(slideNumber),
            });
          }
        }

        const normalizedMarkdown = slides.join("\n\n").trim();
        const mediaLocatorByPath = await createPptxMediaLocatorByPath(zip);
        const mediaAssets = await extractZipMediaAssets(zip, input, {
          prefix: "ppt/media/",
          sourceFormat: "pptx",
          assetKind: "embedded_image",
          extractionMethod: "office_zip_media",
          locatorForPath: (path, index) =>
            mediaLocatorByPath.get(path) ??
            createMediaAssetLocator({
              kind: "slide",
              value: locators[0]?.value ?? "1",
              sourceFormat: "pptx",
              assetKind: "embedded_image",
              extractionMethod: "office_zip_media",
              imageIndex: index,
              sourcePath: path,
            }),
        });

        if (normalizedMarkdown.length === 0) {
          return createParserOutputEmptyResult(parserName, input);
        }

        return {
          kind: "success",
          parsedContent: {
            sourceDocumentId: input.sourceDocumentId,
            objectKey: input.objectKey,
            contentHash: input.contentHash,
            parserName,
            parserVersion: parserRuntimeVersion,
            normalizedMarkdown,
            locators,
            tables: [],
            warnings: [],
            mediaAssets,
          },
        };
      } catch (error) {
        return {
          kind: "fatal",
          error: {
            kind: "parser_failed",
            parserName,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: error instanceof Error ? error.message : "PPTX parser failed.",
            retryable: false,
          },
        };
      }
    },
  };
}

function createSpreadsheetParser(): DocumentParser {
  const parserName = "ts-xlsx";

  return {
    name: parserName,
    version: parserRuntimeVersion,
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    extensions: [".xlsx", ".xls", ".ods"],
    async parse(input) {
      try {
        const content = readBinaryContent(input.content);
        const zipResult = isZipContent(content)
          ? await loadZipWithRuntimeLimits(content, input, parserName)
          : undefined;

        if (zipResult?.kind === "fatal") {
          return zipResult;
        }

        const workbook = read(content, {
          type: "buffer",
        });
        const sections: string[] = [];
        const locators: ParserLocator[] = [];
        const tables: ParserTable[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];

          if (sheet === undefined) {
            continue;
          }

          const rows = utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: "",
            blankrows: false,
          }) as unknown[][];
          const tableMarkdown = renderMarkdownTable(rows);

          if (tableMarkdown.length === 0) {
            continue;
          }

          const locator: ParserLocator = {
            kind: "sheet",
            value: sheetName,
          };

          sections.push(`## Sheet: ${sheetName}\n\n${tableMarkdown}`);
          locators.push(locator);
          tables.push({
            kind: "table",
            row_count: rows.length,
            column_count: Math.max(...rows.map((row) => row.length), 0),
            locator,
          });
        }

        const normalizedMarkdown = sections.join("\n\n").trim();
        const mediaAssets = await extractSpreadsheetMediaAssets(
          content,
          input,
          locators[0],
          zipResult?.zip,
        );

        if (normalizedMarkdown.length === 0) {
          return createParserOutputEmptyResult(parserName, input);
        }

        return {
          kind: "success",
          parsedContent: {
            sourceDocumentId: input.sourceDocumentId,
            objectKey: input.objectKey,
            contentHash: input.contentHash,
            parserName,
            parserVersion: parserRuntimeVersion,
            normalizedMarkdown,
            locators,
            tables,
            warnings: [],
            mediaAssets,
          },
        };
      } catch (error) {
        return {
          kind: "fatal",
          error: {
            kind: "parser_failed",
            parserName,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: error instanceof Error ? error.message : "Spreadsheet parser failed.",
            retryable: false,
          },
        };
      }
    },
  };
}

function createRtfParser(): DocumentParser {
  const parserName = "ts-rtf";

  return {
    name: parserName,
    version: parserRuntimeVersion,
    mimeTypes: ["application/rtf", "text/rtf", "application/x-rtf"],
    extensions: [".rtf"],
    async parse(input) {
      const normalizedMarkdown = convertRtfToMarkdown(readTextContent(input.content));

      if (normalizedMarkdown.length === 0) {
        return createParserOutputEmptyResult(parserName, input);
      }

      return {
        kind: "success",
        parsedContent: {
          sourceDocumentId: input.sourceDocumentId,
          objectKey: input.objectKey,
          contentHash: input.contentHash,
          parserName,
          parserVersion: parserRuntimeVersion,
          normalizedMarkdown,
          locators: extractLineLocators(normalizedMarkdown),
          tables: [],
          warnings: [
            {
              kind: "rtf_converted_to_markdown",
              message: "RTF content was converted to normalized Markdown.",
            },
          ],
          mediaAssets: [],
        },
      };
    },
  };
}

function createOpenDocumentTextParser(): DocumentParser {
  return createOpenDocumentParser({
    name: "ts-odt-zip",
    mimeTypes: ["application/vnd.oasis.opendocument.text"],
    extensions: [".odt"],
    warningKind: "odt_converted_to_markdown",
    warningMessage: "OpenDocument Text content was converted to normalized Markdown.",
  });
}

function createOpenDocumentPresentationParser(): DocumentParser {
  return createOpenDocumentParser({
    name: "ts-odp-zip",
    mimeTypes: ["application/vnd.oasis.opendocument.presentation"],
    extensions: [".odp"],
    warningKind: "odp_converted_to_markdown",
    warningMessage: "OpenDocument Presentation content was converted to normalized Markdown.",
  });
}

function createOpenDocumentParser(options: {
  name: string;
  mimeTypes: readonly string[];
  extensions: readonly string[];
  warningKind: string;
  warningMessage: string;
}): DocumentParser {
  return {
    name: options.name,
    version: parserRuntimeVersion,
    mimeTypes: options.mimeTypes,
    extensions: options.extensions,
    async parse(input) {
      try {
        const zipResult = await loadZipWithRuntimeLimits(
          readBinaryContent(input.content),
          input,
          options.name,
        );

        if (zipResult.kind === "fatal") {
          return zipResult;
        }

        const zip = zipResult.zip;
        const contentXml = await zip.file("content.xml")?.async("string");

        if (contentXml === undefined) {
          return createParserOutputEmptyResult(options.name, input);
        }

        const xmlParser = new XMLParser({
          ignoreAttributes: false,
        });
        const parsed = xmlParser.parse(contentXml) as unknown;
        const normalizedMarkdown = renderOpenDocumentBlocks(collectOpenDocumentTextBlocks(parsed));

        if (normalizedMarkdown.length === 0) {
          return createParserOutputEmptyResult(options.name, input);
        }

        return {
          kind: "success",
          parsedContent: {
            sourceDocumentId: input.sourceDocumentId,
            objectKey: input.objectKey,
            contentHash: input.contentHash,
            parserName: options.name,
            parserVersion: parserRuntimeVersion,
            normalizedMarkdown,
            locators: extractLineLocators(normalizedMarkdown),
            tables: [],
            warnings: [
              {
                kind: options.warningKind,
                message: options.warningMessage,
              },
            ],
            mediaAssets: [],
          },
        };
      } catch (error) {
        return {
          kind: "fatal",
          error: {
            kind: "parser_failed",
            parserName: options.name,
            parserVersion: parserRuntimeVersion,
            fileExtension: normalizeExtension(input.fileName),
            mimeType: normalizeMimeType(input.mimeType),
            message: error instanceof Error ? error.message : "OpenDocument parser failed.",
            retryable: false,
          },
        };
      }
    },
  };
}

function createParserOutputEmptyResult(parserName: string, input: ParserInput): ParserResult {
  return {
    kind: "fatal",
    error: {
      kind: "parser_output_empty",
      parserName,
      parserVersion: parserRuntimeVersion,
      fileExtension: normalizeExtension(input.fileName),
      mimeType: normalizeMimeType(input.mimeType),
      message: "Parser output is empty.",
      retryable: false,
    },
  };
}

function createUnsupportedParserError(fileExtension: string, mimeType: string): ParserFatalError {
  if ([".doc", ".ppt"].includes(fileExtension)) {
    return {
      kind: "unsupported_file_type",
      fileExtension,
      mimeType,
      message: "Legacy binary Office files are not supported in V0.1.",
      retryable: false,
      unsupportedReason: "legacy_office_binary",
    };
  }

  if ([".pages", ".numbers", ".key", ".keynote"].includes(fileExtension)) {
    return {
      kind: "unsupported_file_type",
      fileExtension,
      mimeType,
      message: "Apple iWork documents are not supported in V0.1.",
      retryable: false,
      unsupportedReason: "apple_iwork_package",
    };
  }

  if (fileExtension === ".epub") {
    return {
      kind: "unsupported_file_type",
      fileExtension,
      mimeType,
      message: "EPUB files are not supported in V0.1.",
      retryable: false,
      unsupportedReason: "ebook_unsupported",
    };
  }

  return {
    kind: "unsupported_file_type",
    fileExtension,
    mimeType,
    message: "No parser registered for MIME type or extension.",
    retryable: false,
    unsupportedReason: "unsupported_file_type",
  };
}

function createParserCacheMetadata(
  status: ParserCacheMetadata["status"],
  key: ParserCacheKey,
): ParserCacheMetadata {
  return {
    status,
    content_hash: key.contentHash,
    parser_name: key.parserName,
    parser_version: key.parserVersion,
  };
}

function cloneParsedContent(value: ParsedContent): ParsedContent {
  return {
    ...value,
    locators: value.locators.map((locator) => ({ ...locator })),
    tables: value.tables.map((table) => ({
      ...table,
      ...(table.locator === undefined ? {} : { locator: { ...table.locator } }),
    })),
    warnings: value.warnings.map((warning) => ({
      ...warning,
      ...(warning.locator === undefined ? {} : { locator: { ...warning.locator } }),
    })),
    mediaAssets: value.mediaAssets.map((asset) => ({
      ...asset,
      ...(asset.content === undefined ? {} : { content: Buffer.from(asset.content) }),
      ...(asset.locator === undefined ? {} : { locator: { ...asset.locator } }),
      ...(asset.sourceMetadata === undefined
        ? {}
        : {
            sourceMetadata: JSON.parse(JSON.stringify(asset.sourceMetadata)) as Record<
              string,
              unknown
            >,
          }),
    })),
  };
}

function cloneParsedContentForInput(value: ParsedContent, input: ParserInput): ParsedContent {
  const cloned = cloneParsedContent(value);

  return {
    ...cloned,
    sourceDocumentId: input.sourceDocumentId,
    objectKey: input.objectKey,
    mediaAssets: cloned.mediaAssets.map((asset) => ({
      ...asset,
      objectKey: remapMediaAssetObjectKey(asset.objectKey, input.sourceDocumentId),
    })),
  };
}

function remapMediaAssetObjectKey(objectKey: string, sourceDocumentId: string): string {
  return `media/${sourceDocumentId}/${basename(objectKey)}`;
}

function extractHeadingLocators(markdown: string): ParserLocator[] {
  return markdown
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line);

      if (match === null) {
        return [];
      }

      return [
        {
          kind: "heading" as const,
          value: match[2]?.trim() ?? "",
          line: index + 1,
        },
      ];
    })
    .filter((locator) => locator.value.length > 0);
}

function extractLineLocators(markdown: string): ParserLocator[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    if (line.trim().length === 0) {
      return [];
    }

    return [
      {
        kind: "line" as const,
        value: String(index + 1),
        line: index + 1,
      },
    ];
  });
}

function convertSimpleHtmlToMarkdown(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<h1[^>]*>(.*?)<\/h1>/gis, "# $1\n\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gis, "## $1\n\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gis, "### $1\n\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gis, "$1\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function convertRtfToMarkdown(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-fA-F]{2})/g, (_match, hex: string) =>
      Buffer.from([Number.parseInt(hex, 16)]).toString("latin1"),
    )
    .replace(/\\(?:pard|par|line)(?:-?\d+)?\s?/g, "\n")
    .replace(/\\tab\b\s*/g, "\t")
    .replace(/\\([{}\\])/g, "$1")
    .replace(/\\[a-zA-Z]+-?\d*[ \t]?/g, "")
    .replace(/\\[^a-zA-Z\s]/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface OpenDocumentTextBlock {
  kind: "heading" | "paragraph";
  text: string;
}

function collectOpenDocumentTextBlocks(value: unknown, key = ""): OpenDocumentTextBlock[] {
  if (isOpenDocumentHeadingKey(key) || isOpenDocumentParagraphKey(key)) {
    if (Array.isArray(value)) {
      return value.flatMap((item) => collectOpenDocumentTextBlocks(item, key));
    }

    const text = collectXmlPrimitiveText(value).join(" ").replace(/\s+/g, " ").trim();

    return text.length === 0
      ? []
      : [
          {
            kind: isOpenDocumentHeadingKey(key) ? "heading" : "paragraph",
            text,
          },
        ];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectOpenDocumentTextBlocks(item, key));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([childKey, childValue]) =>
      collectOpenDocumentTextBlocks(childValue, childKey),
    );
  }

  return [];
}

function collectXmlPrimitiveText(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectXmlPrimitiveText(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("@_"))
      .flatMap(([, childValue]) => collectXmlPrimitiveText(childValue));
  }

  return [];
}

function renderOpenDocumentBlocks(blocks: readonly OpenDocumentTextBlock[]): string {
  return blocks
    .map((block) => (block.kind === "heading" ? `# ${block.text}` : block.text))
    .join("\n\n")
    .trim();
}

function isOpenDocumentHeadingKey(key: string): boolean {
  return key === "text:h" || key.endsWith(":h");
}

function isOpenDocumentParagraphKey(key: string): boolean {
  return key === "text:p" || key.endsWith(":p");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTextImageMediaAssets(input: {
  input: ParserInput;
  text: string;
  sourceFormat: "html" | "markdown";
  extractionMethod: "html_img" | "markdown_image";
  pattern: RegExp;
}): { mediaAssets: ParserMediaAsset[]; warnings: ParserWarning[] } {
  const mediaAssets: ParserMediaAsset[] = [];
  const warnings: ParserWarning[] = [];
  let match: RegExpExecArray | null;

  while ((match = input.pattern.exec(input.text)) !== null) {
    const source = decodeHtmlEntities(match[1] ?? "").trim();
    const line = countLineNumber(input.text, match.index);
    const locator = createMediaAssetLocator({
      kind: "line",
      value: String(line),
      line,
      sourceFormat: input.sourceFormat,
      assetKind: "inline_image",
      extractionMethod: input.extractionMethod,
      sourceUrl: source,
    });

    if (source.length === 0) {
      continue;
    }

    if (
      isRemoteImageReference(source) &&
      input.input.visualExtraction?.remoteFetchingEnabled !== true
    ) {
      warnings.push({
        kind: "remote_image_reference_skipped",
        message: "Remote image reference skipped because remote image fetching is disabled.",
        locator: {
          kind: "line",
          value: String(line),
          line,
        },
      });
      continue;
    }

    const dataUri = parseImageDataUri(source);

    if (dataUri === null) {
      warnings.push({
        kind: isRemoteImageReference(source)
          ? "remote_image_fetch_not_implemented"
          : "local_image_reference_skipped",
        message: isRemoteImageReference(source)
          ? "Remote image reference skipped because parser-side fetching is not implemented."
          : "Local image reference skipped because it is not packaged with the source artifact.",
        locator: {
          kind: "line",
          value: String(line),
          line,
        },
      });
      continue;
    }

    mediaAssets.push(
      createParserMediaAssetFromRaw({
        parserInput: input.input,
        content: dataUri.content,
        mimeType: dataUri.mimeType,
        objectKeyName: `${input.sourceFormat}-inline-${mediaAssets.length + 1}${extensionFromMimeType(
          dataUri.mimeType,
        )}`,
        sourceFormat: input.sourceFormat,
        assetKind: "inline_image",
        extractionMethod: input.extractionMethod,
        locator,
        sourceMetadata: {
          line,
          source_reference: source.slice(0, 256),
        },
      }),
    );
  }

  return { mediaAssets, warnings };
}

function parseImageDataUri(source: string): { mimeType: string; content: Buffer } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(source);

  if (match === null) {
    return null;
  }

  const mimeType = match[1]?.toLowerCase() ?? "";
  const encoded = match[2]?.replace(/\s+/gu, "") ?? "";

  if (mimeType.length === 0 || encoded.length === 0) {
    return null;
  }

  return {
    mimeType,
    content: Buffer.from(encoded, "base64"),
  };
}

function isRemoteImageReference(source: string): boolean {
  return /^https?:\/\//iu.test(source);
}

function countLineNumber(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }
  if (mimeType === "image/svg+xml") {
    return ".svg";
  }

  return ".bin";
}

function collectXmlTextNodes(value: unknown, key = ""): string[] {
  if (typeof value === "string" || typeof value === "number") {
    return isTextNodeKey(key) ? [String(value)] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectXmlTextNodes(item, key));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([childKey, childValue]) =>
      collectXmlTextNodes(childValue, childKey),
    );
  }

  return [];
}

function isTextNodeKey(key: string): boolean {
  return key === "t" || key.endsWith(":t") || key === "#text";
}

function compareOfficePartPaths(left: string, right: string): number {
  return readOfficePartNumber(left) - readOfficePartNumber(right);
}

function readOfficePartNumber(path: string): number {
  const match = /(\d+)\.xml$/.exec(path);

  return match?.[1] === undefined ? 0 : Number(match[1]);
}

function readOfficeRelationshipPartNumber(path: string): number {
  const match = /(\d+)\.xml\.rels$/.exec(path);

  return match?.[1] === undefined ? 0 : Number(match[1]);
}

async function createPptxMediaLocatorByPath(
  zip: JSZip,
): Promise<Map<string, ParserMediaAssetLocator>> {
  const locators = new Map<string, ParserMediaAssetLocator>();
  const relPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/u.test(path))
    .sort(compareOfficePartPaths);

  for (const relPath of relPaths) {
    const relXml = await zip.file(relPath)?.async("string");

    if (relXml === undefined) {
      continue;
    }

    const slideNumber = readOfficeRelationshipPartNumber(relPath);

    for (const relationship of extractPackageRelationships(relXml)) {
      if (!relationship.target.includes("media/")) {
        continue;
      }

      const mediaPath = normalizeOfficeRelationshipTarget("ppt/slides/", relationship.target);

      locators.set(
        mediaPath,
        createMediaAssetLocator({
          kind: "slide",
          value: String(slideNumber),
          sourceFormat: "pptx",
          assetKind: "embedded_image",
          extractionMethod: "office_zip_media",
          slideNumber,
          relationshipId: relationship.id,
          sourcePath: mediaPath,
        }),
      );
    }
  }

  return locators;
}

async function extractSpreadsheetMediaAssets(
  content: Buffer,
  input: ParserInput,
  firstSheetLocator: ParserLocator | undefined,
  preloadedZip?: JSZip,
): Promise<ParserMediaAsset[]> {
  if (normalizeExtension(input.fileName) !== ".xlsx") {
    return [];
  }

  try {
    const zip = preloadedZip ?? (await JSZip.loadAsync(content));

    return await extractZipMediaAssets(zip, input, {
      prefix: "xl/media/",
      sourceFormat: "spreadsheet",
      assetKind: "embedded_image",
      extractionMethod: "spreadsheet_zip_media",
      locatorForPath: (path, index) =>
        createMediaAssetLocator({
          kind: "sheet",
          value: firstSheetLocator?.value ?? input.fileName,
          sourceFormat: "spreadsheet",
          assetKind: "embedded_image",
          extractionMethod: "spreadsheet_zip_media",
          imageIndex: index,
          sourcePath: path,
          ...(firstSheetLocator?.value === undefined ? {} : { sheetName: firstSheetLocator.value }),
        }),
    });
  } catch {
    return [];
  }
}

function extractPackageRelationships(xml: string): { id: string; target: string }[] {
  const relationships: { id: string; target: string }[] = [];
  const relationshipPattern = /<Relationship\b([^>]*)\/?>/giu;
  let match: RegExpExecArray | null;

  while ((match = relationshipPattern.exec(xml)) !== null) {
    const attributes = match[1] ?? "";
    const id = readXmlAttribute(attributes, "Id");
    const target = readXmlAttribute(attributes, "Target");

    if (id !== null && target !== null) {
      relationships.push({ id, target });
    }
  }

  return relationships;
}

function readXmlAttribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "iu").exec(attributes);

  return match?.[1] ?? null;
}

function normalizeOfficeRelationshipTarget(basePath: string, target: string): string {
  const parts = `${basePath}${target}`.split("/");
  const normalized: string[] = [];

  for (const part of parts) {
    if (part.length === 0 || part === ".") {
      continue;
    }
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  return normalized.join("/");
}

async function extractZipMediaAssets(
  zip: JSZip,
  input: ParserInput,
  options: {
    prefix: string;
    sourceFormat: ParserSourceFormat;
    assetKind: ParserMediaAssetKind;
    extractionMethod: ParserMediaExtractionMethod;
    locatorForPath?: (path: string, index: number) => ParserMediaAssetLocator | undefined;
  },
): Promise<ParserMediaAsset[]> {
  const mediaPaths = Object.keys(zip.files)
    .filter((path) => path.startsWith(options.prefix) && !zip.files[path]?.dir)
    .sort();
  const mediaAssets: ParserMediaAsset[] = [];

  for (const [index, path] of mediaPaths.entries()) {
    const file = zip.file(path);

    if (file === null) {
      continue;
    }

    const content = await file.async("nodebuffer");
    const mimeType = mimeTypeFromPath(path);
    const locator = options.locatorForPath?.(path, index);

    mediaAssets.push(
      createMediaAssetCandidate({
        input,
        sourceFormat: options.sourceFormat,
        assetKind: options.assetKind,
        extractionMethod: options.extractionMethod,
        content: Buffer.from(content),
        mimeType,
        objectKeyName: basename(path),
        locator:
          locator ??
          createMediaAssetLocator({
            kind: "document",
            value: input.fileName,
            sourceFormat: options.sourceFormat,
            assetKind: options.assetKind,
            extractionMethod: options.extractionMethod,
            sourcePath: path,
          }),
        sourceMetadata: {
          source_path: path,
        },
      }),
    );
  }

  return mediaAssets;
}

function createMediaAssetCandidate(input: {
  input: ParserInput;
  sourceFormat: ParserSourceFormat;
  assetKind: ParserMediaAssetKind;
  extractionMethod: ParserMediaExtractionMethod;
  content: Buffer;
  mimeType: string;
  objectKeyName: string;
  locator?: ParserMediaAssetLocator;
  sourceMetadata?: Record<string, unknown>;
}): ParserMediaAsset {
  const dimensions = readImageDimensions(input.content, input.mimeType);
  const asset: ParserMediaAsset = {
    sourceFormat: input.sourceFormat,
    assetKind: input.assetKind,
    extractionMethod: input.extractionMethod,
    mimeType: input.mimeType,
    objectKey: `media/${input.input.sourceDocumentId}/${sanitizeObjectKeySegment(input.objectKeyName)}`,
    hash: `sha256:${createHash("sha256").update(input.content).digest("hex")}`,
    content: Buffer.from(input.content),
    ...(input.locator === undefined ? {} : { locator: input.locator }),
    ...(input.sourceMetadata === undefined ? {} : { sourceMetadata: input.sourceMetadata }),
  };

  if (dimensions !== null) {
    asset.width = dimensions.width;
    asset.height = dimensions.height;
  }

  return asset;
}

function createMediaAssetLocator(input: {
  kind: ParserMediaAssetLocator["kind"];
  value: string;
  sourceFormat: ParserSourceFormat;
  assetKind: ParserMediaAssetKind;
  extractionMethod: ParserMediaExtractionMethod;
  line?: number;
  sourcePath?: string;
  sourceUrl?: string;
  pageNumber?: number;
  slideNumber?: number;
  sheetName?: string;
  imageIndex?: number;
  relationshipId?: string;
}): ParserMediaAssetLocator {
  return {
    kind: input.kind,
    value: input.value,
    source_format: input.sourceFormat,
    asset_kind: input.assetKind,
    extraction_method: input.extractionMethod,
    ...(input.line === undefined ? {} : { line: input.line }),
    ...(input.sourcePath === undefined ? {} : { source_path: input.sourcePath }),
    ...(input.sourceUrl === undefined ? {} : { source_url: input.sourceUrl }),
    ...(input.pageNumber === undefined ? {} : { page_number: input.pageNumber }),
    ...(input.slideNumber === undefined ? {} : { slide_number: input.slideNumber }),
    ...(input.sheetName === undefined ? {} : { sheet_name: input.sheetName }),
    ...(input.imageIndex === undefined ? {} : { image_index: input.imageIndex }),
    ...(input.relationshipId === undefined ? {} : { relationship_id: input.relationshipId }),
  };
}

function createParserMediaAssetFromRaw(input: {
  parserInput: ParserInput;
  content: Buffer;
  mimeType: string;
  objectKeyName: string;
  sourceFormat: ParserSourceFormat;
  assetKind: ParserMediaAssetKind;
  extractionMethod: ParserMediaExtractionMethod;
  locator: ParserMediaAssetLocator;
  sourceMetadata?: Record<string, unknown>;
}): ParserMediaAsset {
  return createMediaAssetCandidate({
    input: input.parserInput,
    content: input.content,
    mimeType: input.mimeType,
    objectKeyName: input.objectKeyName,
    sourceFormat: input.sourceFormat,
    assetKind: input.assetKind,
    extractionMethod: input.extractionMethod,
    locator: input.locator,
    ...(input.sourceMetadata === undefined ? {} : { sourceMetadata: input.sourceMetadata }),
  });
}

function mimeTypeFromPath(path: string): string {
  const extension = normalizeExtension(path);

  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }

  return "application/octet-stream";
}

interface ImageDimensions {
  width: number;
  height: number;
}

function readImageDimensions(content: Buffer, mimeType: string): ImageDimensions | null {
  if (mimeType === "image/png") {
    return readPngDimensions(content);
  }
  if (mimeType === "image/jpeg") {
    return readJpegDimensions(content);
  }
  if (mimeType === "image/gif") {
    return readGifDimensions(content);
  }
  if (mimeType === "image/svg+xml") {
    return readSvgDimensions(content);
  }

  return null;
}

function readPngDimensions(content: Buffer): ImageDimensions | null {
  if (
    content.length < 24 ||
    content[0] !== 0x89 ||
    content[1] !== 0x50 ||
    content[2] !== 0x4e ||
    content[3] !== 0x47
  ) {
    return null;
  }

  return normalizeImageDimensions(content.readUInt32BE(16), content.readUInt32BE(20));
}

function readGifDimensions(content: Buffer): ImageDimensions | null {
  if (content.length < 10) {
    return null;
  }

  const signature = content.subarray(0, 6).toString("ascii");

  if (signature !== "GIF87a" && signature !== "GIF89a") {
    return null;
  }

  return normalizeImageDimensions(content.readUInt16LE(6), content.readUInt16LE(8));
}

function readJpegDimensions(content: Buffer): ImageDimensions | null {
  if (content.length < 4 || content[0] !== 0xff || content[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 3 < content.length) {
    if (content[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (content[offset] === 0xff) {
      offset += 1;
    }

    const marker = content[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 1 >= content.length) {
      break;
    }

    const segmentLength = content.readUInt16BE(offset);

    if (segmentLength < 2 || offset + segmentLength > content.length) {
      break;
    }

    if (isJpegStartOfFrameMarker(marker) && offset + 7 <= content.length) {
      return normalizeImageDimensions(
        content.readUInt16BE(offset + 5),
        content.readUInt16BE(offset + 3),
      );
    }

    offset += segmentLength;
  }

  return null;
}

function isJpegStartOfFrameMarker(marker: number | undefined): boolean {
  return (
    marker !== undefined &&
    [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)
  );
}

function readSvgDimensions(content: Buffer): ImageDimensions | null {
  const text = content.subarray(0, 8192).toString("utf8");
  const svgMatch = /<svg\b([^>]*)>/iu.exec(text);

  if (svgMatch === null) {
    return null;
  }

  const attributes = svgMatch[1] ?? "";
  const width = readSvgNumberAttribute(attributes, "width");
  const height = readSvgNumberAttribute(attributes, "height");

  if (width !== null && height !== null) {
    return normalizeImageDimensions(width, height);
  }

  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/iu.exec(attributes)?.[1];
  const parts = viewBox
    ?.trim()
    .split(/[\s,]+/u)
    .map((part) => Number.parseFloat(part));

  if (parts !== undefined && parts.length >= 4) {
    return normalizeImageDimensions(parts[2] ?? 0, parts[3] ?? 0);
  }

  return null;
}

function readSvgNumberAttribute(attributes: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "iu").exec(attributes);

  if (match === null) {
    return null;
  }

  const value = Number.parseFloat(match[1] ?? "");

  return Number.isFinite(value) ? value : null;
}

function normalizeImageDimensions(width: number, height: number): ImageDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "media.bin";
}

function sanitizeObjectKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function parseSimpleCsv(value: string): string[][] {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function renderMarkdownTable(rows: unknown[][]): string {
  const normalizedRows = rows
    .map((row) => row.map((cell) => renderMarkdownTableCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (normalizedRows.length === 0) {
    return "";
  }

  const columnCount = Math.max(...normalizedRows.map((row) => row.length), 0);
  const paddedRows = normalizedRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
  const [header = [], ...body] = paddedRows;
  const separator = Array.from({ length: columnCount }, () => "---");

  return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function renderMarkdownTableCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replaceAll("|", "\\|").trim();
}

function readTextContent(content: Buffer | string): string {
  return Buffer.isBuffer(content) ? content.toString("utf8") : content;
}

function readBinaryContent(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

function createPdfJsData(content: Buffer): Uint8Array {
  return new Uint8Array(content);
}

function getContentSizeBytes(content: Buffer | string): number {
  return Buffer.isBuffer(content) ? content.byteLength : Buffer.byteLength(content);
}

function createParserLimitContext(parser: DocumentParser, input: ParserInput): ParserLimitContext {
  return {
    parserName: parser.name,
    parserVersion: parser.version,
    fileName: input.fileName,
    mimeType: input.mimeType,
  };
}

function createLimitError(
  limitName: ParserLimitName,
  actual: number,
  limit: number,
  context: ParserLimitContext,
): ParserFatalError {
  return {
    kind: "parser_limit_exceeded",
    parserName: context.parserName,
    parserVersion: context.parserVersion,
    fileExtension: normalizeExtension(context.fileName),
    mimeType: normalizeMimeType(context.mimeType),
    message: `Parser limit exceeded: ${limitName}.`,
    retryable: false,
    limitName,
    actual,
    limit,
  };
}

function isImageTooSmall(asset: ParserMediaAsset, limits: ParserLimitConfig): boolean {
  return (
    (asset.width !== undefined && asset.width < limits.images.minWidth) ||
    (asset.height !== undefined && asset.height < limits.images.minHeight)
  );
}

function isImageTooLarge(asset: ParserMediaAsset, limits: ParserLimitConfig): boolean {
  return (
    asset.width !== undefined &&
    asset.height !== undefined &&
    asset.width * asset.height > limits.images.maxPixelsPerAsset
  );
}

function isImageBytesTooLarge(asset: ParserMediaAsset, limits: ParserLimitConfig): boolean {
  return asset.content !== undefined && asset.content.byteLength > limits.images.maxAssetBytes;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

function normalizeExtension(fileName: string): string {
  return extname(fileName).trim().toLowerCase();
}

function isGenericMimeType(mimeType: string): boolean {
  return mimeType === "application/octet-stream" || mimeType === "binary/octet-stream";
}
