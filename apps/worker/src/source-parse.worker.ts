import { Worker } from "bullmq";
import { createResourceId } from "@fococontext/contracts";
import { createParsedContentObjectKey, type RuntimeConfig } from "@fococontext/core";
import {
  createDefaultParserRegistry,
  createNoopParserCache,
  createParserLimitError,
  type DocumentParser,
  type ParserFatalError,
  type ParserCache,
  type ParserCacheMetadata,
  type ParserLimitConfig,
  type ParserMediaAsset,
  type ParserRegistry,
  evaluatePdfOcrEligibility,
  parseWithCache,
  parseWithErrorBoundary,
  parseWithLimits,
} from "@fococontext/parsers";
import type { ObjectStorageAdapter } from "@fococontext/storage";
import type {
  WorkerJobProgressWriter,
  WorkerJobStateGuard,
} from "./job-progress.postgres-writer.js";
import type { DocumentProcessingStateStore } from "./document-processing-state.js";
import type { MediaCaptionQueue } from "./media-caption.worker.js";
import { createMarkdownPreview, defaultParsedMarkdownPreviewMaxChars } from "./parsed-preview.js";
import {
  createMarkdownWindows,
  createMediaExtractionProcessingUnits,
  createParserConfigHash,
  createParserProcessingUnits,
  createParserUnitDedupeKey,
  remapParsedContentObjectKeys,
  type ParserMarkdownWindow,
} from "./source-parse-processing-state.js";
import type {
  DatasetConfigurationSnapshotPayload,
  WikiAnalyzeQueue,
} from "./wiki-compile.worker.js";
import { runSourceThreatScan, type SourceThreatScanner } from "./source-threat-scan.js";
import { resumeSourceParseCheckpoint } from "./source-parse-checkpoint-resume.js";
import { createOcrRequiredError, createSkippedParseError } from "./source-parse-errors.js";

export const sourceParseQueueName = "source.parse";
export const sourceParseJobName = "source.parse.document";

export interface SourceParsePayload {
  job_id: string;
  tenant_id: string;
  project_id: string;
  knowledge_base_id: string;
  document_id: string;
  content_hash: string;
  object_key: string;
  mime_type: string;
  source_type: "file" | "text" | "url" | "wiki_draft";
  input_snapshot_id: string;
  ocr_policy?: SourceParseOcrPolicy;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
}

export interface SourceParseOcrPolicy {
  mode: "auto" | "disabled" | "force_for_pdf";
  max_pages_per_document: number | null;
  min_text_chars_per_page: number | null;
}

export interface ParsedContentWrite {
  id: string;
  document_id: string;
  markdown_preview: string;
  markdown_preview_object_key: string;
  markdown_preview_truncated: boolean;
  parser_name: string;
  parser_version: string;
  normalized_markdown: string;
  normalized_markdown_object_key: string;
  locators: readonly Record<string, unknown>[];
  tables: readonly Record<string, unknown>[];
  warnings: readonly Record<string, unknown>[];
  error: ParserFatalError | null;
}

export interface SourceParseMediaAssetWrite {
  id: string;
  document_id: string;
  parsed_content_id: string;
  mime_type: string;
  object_key: string;
  sha256: string;
  locator: Record<string, unknown>;
  width: number | null;
  height: number | null;
  caption_status: "pending";
}

export interface SourceOcrQueue {
  enabled: boolean;
  maxPagesPerDocument?: number;
  minTextCharsPerPage?: number;
  enqueueSourceOcrJob(payload: SourceOcrPayload): Promise<unknown>;
  close?(): Promise<void>;
}

export interface SourceOcrPayload {
  job_id: string;
  tenant_id: string;
  project_id: string;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string;
  normalized_markdown_object_key: string;
  content_hash: string;
  input_snapshot_id: string;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
  source_object_key: string;
  candidate_pages: {
    pageNumber: number;
    reason: "empty_native_text" | "low_native_text" | "forced";
    nativeTextChars: number;
  }[];
}

export interface SourceParseWriter {
  saveParsedContent(record: ParsedContentWrite): Promise<void>;
  saveMediaAssets(records: SourceParseMediaAssetWrite[]): Promise<void>;
}

export interface SourceParseProcessorOptions {
  objectStorage: ObjectStorageAdapter;
  writer: SourceParseWriter;
  ocrQueue?: SourceOcrQueue;
  captionQueue?: MediaCaptionQueue;
  compileQueue?: WikiAnalyzeQueue;
  jobProgress?: WorkerJobProgressWriter;
  jobGuard?: WorkerJobStateGuard;
  parserRegistry?: ParserRegistry;
  parserCache?: ParserCache;
  parserLimits?: ParserLimitConfig;
  threatScanner?: SourceThreatScanner;
  mediaAssetUploadConcurrency?: number;
  previewMaxChars?: number;
  processingStateMarkdownWindowChars?: number;
  processingState?: DocumentProcessingStateStore;
}

export interface SourceParseProcessorResult {
  status: "completed" | "failed";
  should_continue: boolean;
  document_id: string;
  parsed_content_id: string | null;
  error: ParserFatalError | null;
  cache?: ParserCacheMetadata;
}

export interface SourceParseQueueJob {
  name: string;
  data: SourceParsePayload;
}

export class SourceParseProcessor {
  private readonly objectStorage: ObjectStorageAdapter;
  private readonly writer: SourceParseWriter;
  private readonly ocrQueue: SourceOcrQueue | undefined;
  private readonly captionQueue: MediaCaptionQueue | undefined;
  private readonly compileQueue: WikiAnalyzeQueue | undefined;
  private readonly jobProgress: WorkerJobProgressWriter | undefined;
  private readonly jobGuard: WorkerJobStateGuard | undefined;
  private readonly parserRegistry: ParserRegistry;
  private readonly parserCache: ParserCache;
  private readonly parserLimits: ParserLimitConfig | undefined;
  private readonly threatScanner: SourceThreatScanner | undefined;
  private readonly mediaAssetUploadConcurrency: number;
  private readonly previewMaxChars: number;
  private readonly processingStateMarkdownWindowChars: number;
  private readonly processingState: DocumentProcessingStateStore | undefined;

  constructor(options: SourceParseProcessorOptions) {
    this.objectStorage = options.objectStorage;
    this.writer = options.writer;
    this.ocrQueue = options.ocrQueue;
    this.captionQueue = options.captionQueue;
    this.compileQueue = options.compileQueue;
    this.jobProgress = options.jobProgress;
    this.jobGuard = options.jobGuard;
    this.parserRegistry = options.parserRegistry ?? createDefaultParserRegistry();
    this.parserCache = options.parserCache ?? createNoopParserCache();
    this.parserLimits = options.parserLimits;
    this.threatScanner = options.threatScanner;
    this.mediaAssetUploadConcurrency = normalizePositiveInteger(
      options.mediaAssetUploadConcurrency,
      4,
    );
    this.previewMaxChars = options.previewMaxChars ?? defaultParsedMarkdownPreviewMaxChars;
    this.processingStateMarkdownWindowChars = normalizePositiveInteger(
      options.processingStateMarkdownWindowChars,
      64_000,
    );
    this.processingState = options.processingState;
  }

  async process(payload: SourceParsePayload): Promise<SourceParseProcessorResult> {
    const initialGuardError = await this.createStaleJobError(payload);

    if (initialGuardError !== undefined) {
      return this.createFailedResult(payload, initialGuardError);
    }

    const fileName = basename(payload.object_key);
    const threatScanResult = await runSourceThreatScan({
      fileName,
      payload,
      processingState: this.processingState,
      threatScanner: this.threatScanner,
    });

    if (threatScanResult.kind === "fatal") {
      await this.markParsingFailed(payload, threatScanResult.error);

      return this.createFailedResult(payload, threatScanResult.error);
    }

    const resolution = this.parserRegistry.resolve({
      fileName,
      mimeType: payload.mime_type,
    });

    if (resolution.kind === "unsupported") {
      await this.markParsingFailed(payload, resolution.error);

      return this.createFailedResult(payload, resolution.error);
    }

    const parserConfigHash = createParserConfigHash(payload, resolution.parser);
    const parserDedupeKey = createParserUnitDedupeKey(payload, parserConfigHash);
    const completedCheckpoint = await this.processingState?.findCheckpoint({
      checkpointKey: parserDedupeKey,
      jobId: payload.job_id,
      sourceDocumentId: payload.document_id,
      stage: "parsing",
    });

    if (completedCheckpoint?.status === "completed") {
      const parsedContentId = readString(completedCheckpoint.summary.parsed_content_id);

      if (parsedContentId !== null) {
        await resumeSourceParseCheckpoint({
          checkpointSummary: completedCheckpoint.summary,
          compileQueue: this.compileQueue,
          jobProgress: this.jobProgress,
          parsedContentId,
          payload,
        });

        return {
          status: "completed",
          should_continue: true,
          document_id: payload.document_id,
          parsed_content_id: parsedContentId,
          error: null,
        };
      }
    }

    await this.processingState?.upsertUnit({
      configHash: parserConfigHash,
      contentHash: payload.content_hash,
      dedupeKey: parserDedupeKey,
      jobId: payload.job_id,
      metadata: {
        mime_type: payload.mime_type,
        source_type: payload.source_type,
      },
      objectKey: payload.object_key,
      parserName: resolution.parser.name,
      parserVersion: resolution.parser.version,
      sourceDocumentId: payload.document_id,
      stage: "parsing",
      status: "running",
      unitKey: payload.object_key,
      unitType: "source_object",
    });

    const original = await this.objectStorage.getObject({
      key: payload.object_key,
    });
    const contentResult = await this.readOriginalContentWithinLimits(
      original.body,
      original.contentLength,
      resolution.parser,
      fileName,
      payload.mime_type,
    );

    if (contentResult.kind === "fatal") {
      await this.markParsingUnitFailed(
        payload,
        parserConfigHash,
        parserDedupeKey,
        contentResult.error,
      );
      await this.markParsingFailed(payload, contentResult.error);

      return this.createFailedResult(payload, contentResult.error);
    }

    const parsedContentId = createResourceId("parsedContent");
    const result = await parseWithCache(
      this.createParserWithRuntimeLimits(resolution.parser),
      {
        sourceDocumentId: payload.document_id,
        objectKey: payload.object_key,
        fileName,
        mimeType: payload.mime_type,
        contentHash: payload.content_hash,
        content: contentResult.content,
      },
      this.parserCache,
      {
        reuseCachedParsedContent: true,
      },
    );

    if (result.kind === "fatal") {
      await this.markParsingUnitFailed(payload, parserConfigHash, parserDedupeKey, result.error);
      await this.markParsingFailed(payload, result.error);

      return this.createFailedResult(payload, result.error);
    }

    const postParseGuardError = await this.createStaleJobError(payload);

    if (postParseGuardError !== undefined) {
      await this.markParsingUnitFailed(
        payload,
        parserConfigHash,
        parserDedupeKey,
        postParseGuardError,
      );
      await this.markParsingFailed(payload, postParseGuardError);

      return this.createFailedResult(payload, postParseGuardError);
    }

    const parsedContent = remapParsedContentObjectKeys(result.parsedContent, payload);
    const normalizedMarkdownObjectKey = createNormalizedMarkdownObjectKey(payload);
    const markdownWindows = createMarkdownWindows({
      markdown: parsedContent.normalizedMarkdown,
      maxChars: this.processingStateMarkdownWindowChars,
      payload,
    });

    await this.objectStorage.putObject({
      key: normalizedMarkdownObjectKey,
      body: Buffer.from(parsedContent.normalizedMarkdown),
      contentType: "text/markdown",
      metadata: {
        documentId: payload.document_id,
        parsedContentId,
      },
    });
    await this.writeMarkdownWindowObjects(markdownWindows, payload, parsedContentId);
    await this.writer.saveParsedContent({
      id: parsedContentId,
      document_id: payload.document_id,
      ...createMarkdownPreview(
        parsedContent.normalizedMarkdown,
        normalizedMarkdownObjectKey,
        this.previewMaxChars,
      ),
      parser_name: parsedContent.parserName,
      parser_version: parsedContent.parserVersion,
      normalized_markdown: parsedContent.normalizedMarkdown,
      normalized_markdown_object_key: normalizedMarkdownObjectKey,
      locators: parsedContent.locators.map(toJsonObject),
      tables: parsedContent.tables.map(toJsonObject),
      warnings: parsedContent.warnings.map(toJsonObject),
      error: null,
    });
    const mediaAssets = parsedContent.mediaAssets.map((asset) =>
      toMediaAssetWrite(payload.document_id, parsedContentId, asset),
    );

    await this.writeMediaAssetObjects(parsedContent.mediaAssets, payload, parsedContentId);
    await this.writer.saveMediaAssets(mediaAssets);
    await this.processingState?.upsertUnits(
      createParserProcessingUnits({
        configHash: parserConfigHash,
        markdownWindows,
        parsedContent,
        parsedContentId,
        payload,
      }),
    );
    await this.processingState?.upsertUnit({
      configHash: parserConfigHash,
      contentHash: payload.content_hash,
      counters: {
        locator_count: parsedContent.locators.length,
        markdown_chars: parsedContent.normalizedMarkdown.length,
        media_asset_count: parsedContent.mediaAssets.length,
        table_count: parsedContent.tables.length,
        warning_count: parsedContent.warnings.length,
      },
      jobId: payload.job_id,
      objectKey: normalizedMarkdownObjectKey,
      parsedContentId,
      parserName: parsedContent.parserName,
      parserVersion: parsedContent.parserVersion,
      sourceDocumentId: payload.document_id,
      stage: "parsed_artifact",
      status: "succeeded",
      unitKey: "normalized_markdown",
      unitType: "normalized_markdown",
      warnings: parsedContent.warnings.map(toJsonObject),
    });
    await this.processingState?.upsertUnits(
      createMediaExtractionProcessingUnits({
        mediaAssets,
        parsedContentId,
        payload,
      }),
    );
    await this.processingState?.upsertUnit({
      configHash: parserConfigHash,
      contentHash: payload.content_hash,
      counters: {
        content_bytes: Buffer.isBuffer(contentResult.content)
          ? contentResult.content.byteLength
          : undefined,
      },
      dedupeKey: parserDedupeKey,
      jobId: payload.job_id,
      objectKey: payload.object_key,
      parsedContentId,
      parserName: parsedContent.parserName,
      parserVersion: parsedContent.parserVersion,
      sourceDocumentId: payload.document_id,
      stage: "parsing",
      status: "succeeded",
      unitKey: payload.object_key,
      unitType: "source_object",
    });

    const ocrDecision = evaluateSourceOcrDecision({
      payload,
      normalizedMarkdown: parsedContent.normalizedMarkdown,
      ocrQueue: this.ocrQueue,
    });

    if (ocrDecision.kind === "enqueue") {
      await this.ocrQueue?.enqueueSourceOcrJob({
        job_id: payload.job_id,
        tenant_id: payload.tenant_id,
        project_id: payload.project_id,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: parsedContentId,
        normalized_markdown_object_key: normalizedMarkdownObjectKey,
        content_hash: payload.content_hash,
        input_snapshot_id: payload.input_snapshot_id,
        ...(payload.dataset_configuration_snapshot === undefined
          ? {}
          : { dataset_configuration_snapshot: payload.dataset_configuration_snapshot }),
        source_object_key: payload.object_key,
        candidate_pages: ocrDecision.candidatePages,
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "ocr",
        status: "running",
        progress: 20,
        message: "Running OCR on scanned PDF pages...",
        parsedContentId,
        metadata: {
          ocr_candidate_page_count: ocrDecision.candidatePages.length,
          ocr_candidate_pages: ocrDecision.candidatePages.map((page) => page.pageNumber),
          parser_cache: result.cache,
        },
      });
      await this.markParsingCheckpointCompleted(payload, {
        checkpointKey: parserDedupeKey,
        configHash: parserConfigHash,
        downstreamStage: "ocr",
        normalizedMarkdownObjectKey,
        parsedContentId,
        parserCache: result.cache,
      });

      return {
        status: "completed",
        should_continue: true,
        document_id: payload.document_id,
        parsed_content_id: parsedContentId,
        error: null,
        cache: result.cache,
      };
    }

    if (ocrDecision.kind === "skip") {
      if (ocrDecision.requiredForDocument) {
        const error = createOcrRequiredError(ocrDecision.reason);

        await this.markParsingFailed(payload, error);
        await this.markParsingCheckpointFailed(payload, {
          checkpointKey: parserDedupeKey,
          configHash: parserConfigHash,
          error,
        });

        return this.createFailedResult(payload, error);
      }

      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "parsing",
        status: "running",
        progress: 20,
        message: "OCR skipped.",
        parsedContentId,
        metadata: {
          ocr_status: "skipped",
          ocr_skip_reason: ocrDecision.reason,
          parser_cache: result.cache,
        },
      });
    }

    if (this.captionQueue !== undefined && mediaAssets.length > 0) {
      await this.captionQueue.enqueueMediaCaptionJob({
        job_id: payload.job_id,
        tenant_id: payload.tenant_id,
        project_id: payload.project_id,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: parsedContentId,
        normalized_markdown_object_key: normalizedMarkdownObjectKey,
        content_hash: payload.content_hash,
        input_snapshot_id: payload.input_snapshot_id,
        ...(payload.dataset_configuration_snapshot === undefined
          ? {}
          : { dataset_configuration_snapshot: payload.dataset_configuration_snapshot }),
        media_asset_ids: mediaAssets.map((asset) => asset.id),
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "captioning",
        status: "running",
        progress: 25,
        message: "Captioning media assets...",
        parsedContentId,
        metadata: {
          eligible_media_asset_count: mediaAssets.length,
          media_asset_ids: mediaAssets.map((asset) => asset.id),
          parser_cache: result.cache,
        },
      });
      await this.markParsingCheckpointCompleted(payload, {
        checkpointKey: parserDedupeKey,
        configHash: parserConfigHash,
        downstreamStage: "captioning",
        normalizedMarkdownObjectKey,
        parsedContentId,
        parserCache: result.cache,
      });

      return {
        status: "completed",
        should_continue: true,
        document_id: payload.document_id,
        parsed_content_id: parsedContentId,
        error: null,
        cache: result.cache,
      };
    }

    await this.compileQueue?.enqueueWikiAnalyzeJob({
      job_id: payload.job_id,
      tenant_id: payload.tenant_id,
      project_id: payload.project_id,
      knowledge_base_id: payload.knowledge_base_id,
      document_id: payload.document_id,
      parsed_content_id: parsedContentId,
      normalized_markdown_object_key: normalizedMarkdownObjectKey,
      content_hash: payload.content_hash,
      ...(payload.dataset_configuration_snapshot === undefined
        ? {}
        : { dataset_configuration_snapshot: payload.dataset_configuration_snapshot }),
      input_snapshot_id: payload.input_snapshot_id,
    });
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "analyzing",
      status: "running",
      progress: 30,
      message: "Analyzing content...",
      parsedContentId,
      metadata: {
        parser_cache: result.cache,
      },
    });
    await this.markParsingCheckpointCompleted(payload, {
      checkpointKey: parserDedupeKey,
      configHash: parserConfigHash,
      downstreamStage: "analyzing",
      normalizedMarkdownObjectKey,
      parsedContentId,
      parserCache: result.cache,
    });

    return {
      status: "completed",
      should_continue: true,
      document_id: payload.document_id,
      parsed_content_id: parsedContentId,
      error: null,
      cache: result.cache,
    };
  }

  private createParserWithRuntimeLimits(parser: DocumentParser): DocumentParser {
    const limits = this.parserLimits;

    if (limits === undefined) {
      return {
        ...parser,
        parse: (input) => parseWithErrorBoundary(parser, input),
      };
    }

    return {
      ...parser,
      parse: (input) => parseWithLimits(parser, input, limits),
    };
  }

  private async readOriginalContentWithinLimits(
    body: unknown,
    contentLength: number | undefined,
    parser: DocumentParser,
    fileName: string,
    mimeType: string,
  ): Promise<
    { kind: "success"; content: Buffer | string } | { kind: "fatal"; error: ParserFatalError }
  > {
    const limit = this.parserLimits?.maxFileSizeBytes;

    if (limit !== undefined && contentLength !== undefined && contentLength > limit) {
      return {
        kind: "fatal",
        error: createParserLimitError("file_size", contentLength, limit, {
          parserName: parser.name,
          parserVersion: parser.version,
          fileName,
          mimeType,
        }),
      };
    }

    const content = isTextSourceParser(parser, fileName, mimeType)
      ? await readTextBodyWithinLimit(body, limit)
      : await readBodyWithinLimit(body, limit);

    if (content.kind === "fatal") {
      return {
        kind: "fatal",
        error: createParserLimitError("file_size", content.actual, content.limit, {
          parserName: parser.name,
          parserVersion: parser.version,
          fileName,
          mimeType,
        }),
      };
    }

    return content;
  }

  private async writeMediaAssetObjects(
    assets: readonly ParserMediaAsset[],
    payload: SourceParsePayload,
    parsedContentId: string,
  ): Promise<void> {
    await mapWithConcurrency(
      assets.filter((asset) => asset.content !== undefined),
      this.mediaAssetUploadConcurrency,
      (asset) =>
        this.objectStorage.putObject({
          key: asset.objectKey,
          body: asset.content ?? Buffer.alloc(0),
          contentType: asset.mimeType,
          metadata: {
            documentId: payload.document_id,
            parsedContentId,
          },
        }),
    );
  }

  private async writeMarkdownWindowObjects(
    windows: readonly ParserMarkdownWindow[],
    payload: SourceParsePayload,
    parsedContentId: string,
  ): Promise<void> {
    await mapWithConcurrency(windows, this.mediaAssetUploadConcurrency, (window) =>
      this.objectStorage.putObject({
        key: window.objectKey,
        body: Buffer.from(window.content),
        contentType: "text/markdown",
        metadata: {
          documentId: payload.document_id,
          parsedContentId,
          sha256: window.sha256,
        },
      }),
    );
  }

  private async createFailedResult(
    payload: SourceParsePayload,
    error: ParserFatalError,
  ): Promise<SourceParseProcessorResult> {
    return {
      status: "failed",
      should_continue: false,
      document_id: payload.document_id,
      parsed_content_id: null,
      error,
    };
  }

  private async markParsingFailed(
    payload: SourceParsePayload,
    error: ParserFatalError,
  ): Promise<void> {
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "parsing",
      status: "failed",
      progress: 100,
      message: "Parsing failed.",
      error: {
        code: "source_parse_failed",
        parser_error: error,
      },
    });
  }

  private async markParsingUnitFailed(
    payload: SourceParsePayload,
    configHash: string,
    dedupeKey: string,
    error: ParserFatalError,
  ): Promise<void> {
    await this.processingState?.upsertUnit({
      configHash,
      contentHash: payload.content_hash,
      dedupeKey,
      jobId: payload.job_id,
      objectKey: payload.object_key,
      retryEligible: error.retryable,
      safeError: toJsonObject(error),
      sourceDocumentId: payload.document_id,
      stage: "parsing",
      status: "failed",
      unitKey: payload.object_key,
      unitType: "source_object",
    });
  }

  private async markParsingCheckpointCompleted(
    payload: SourceParsePayload,
    input: {
      checkpointKey: string;
      configHash: string;
      downstreamStage: "ocr" | "captioning" | "analyzing";
      normalizedMarkdownObjectKey: string;
      parsedContentId: string;
      parserCache?: ParserCacheMetadata;
    },
  ): Promise<void> {
    await this.processingState?.upsertCheckpoint({
      checkpointKey: input.checkpointKey,
      configHash: input.configHash,
      jobId: payload.job_id,
      parsedContentId: input.parsedContentId,
      sourceDocumentId: payload.document_id,
      stage: "parsing",
      status: "completed",
      summary: {
        downstream_stage: input.downstreamStage,
        normalized_markdown_object_key: input.normalizedMarkdownObjectKey,
        parsed_content_id: input.parsedContentId,
        parser_cache: input.parserCache ?? {},
      },
    });
  }

  private async markParsingCheckpointFailed(
    payload: SourceParsePayload,
    input: {
      checkpointKey: string;
      configHash: string;
      error: ParserFatalError;
    },
  ): Promise<void> {
    await this.processingState?.upsertCheckpoint({
      checkpointKey: input.checkpointKey,
      configHash: input.configHash,
      jobId: payload.job_id,
      safeError: toJsonObject(input.error),
      sourceDocumentId: payload.document_id,
      stage: "parsing",
      status: "failed",
      summary: {
        retryable: input.error.retryable,
      },
    });
  }

  private async createStaleJobError(
    payload: SourceParsePayload,
  ): Promise<ParserFatalError | undefined> {
    const guard = await this.jobGuard?.canContinueJob({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      tenantId: payload.tenant_id,
      projectId: payload.project_id,
      sourceDocumentId: payload.document_id,
    });

    return guard?.canContinue === false ? createSkippedParseError(guard.reason) : undefined;
  }
}

export class BullMqSourceParseWorker {
  private readonly worker: Worker<SourceParsePayload>;

  constructor(config: RuntimeConfig, processor: SourceParseProcessor) {
    this.worker = new Worker<SourceParsePayload>(
      sourceParseQueueName,
      createSourceParseJobProcessor(processor),
      createSourceParseWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createSourceParseWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.queue.sourceParseConcurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export function createSourceParseJobProcessor(
  processor: SourceParseProcessor,
): (job: SourceParseQueueJob) => Promise<SourceParseProcessorResult> {
  return async (job) => {
    if (job.name !== sourceParseJobName) {
      throw new Error(`Unsupported source.parse job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

type SourceOcrDecision =
  | {
      kind: "none";
    }
  | {
      kind: "skip";
      reason: "disabled" | "no_candidate_pages";
      requiredForDocument: boolean;
    }
  | {
      kind: "enqueue";
      candidatePages: SourceOcrPayload["candidate_pages"];
    };

function evaluateSourceOcrDecision(input: {
  payload: SourceParsePayload;
  normalizedMarkdown: string;
  ocrQueue: SourceOcrQueue | undefined;
}): SourceOcrDecision {
  if (input.payload.mime_type !== "application/pdf") {
    return { kind: "none" };
  }

  const pages = extractPdfNativePages(input.normalizedMarkdown);

  if (pages.length === 0) {
    return { kind: "none" };
  }

  if (input.ocrQueue === undefined) {
    return { kind: "none" };
  }

  const ocrPolicy = input.payload.ocr_policy;
  const mode = ocrPolicy?.mode ?? (input.ocrQueue.enabled ? "auto" : "disabled");
  const maxPagesPerDocument =
    ocrPolicy?.max_pages_per_document ?? input.ocrQueue.maxPagesPerDocument ?? 200;
  const minTextCharsPerPage =
    ocrPolicy?.min_text_chars_per_page ?? input.ocrQueue.minTextCharsPerPage ?? 80;
  const requiredEligibility = evaluatePdfOcrEligibility({
    pages,
    policy: {
      enabled: true,
      mode: mode === "disabled" ? "auto" : mode,
      maxPagesPerDocument,
      minTextCharsPerPage,
    },
  });
  const eligibility = evaluatePdfOcrEligibility({
    pages,
    policy: {
      enabled: input.ocrQueue.enabled && mode !== "disabled",
      mode,
      maxPagesPerDocument,
      minTextCharsPerPage,
    },
  });

  if (!input.ocrQueue.enabled || mode === "disabled") {
    return {
      kind: "skip",
      reason: "disabled",
      requiredForDocument: requiredEligibility.requiredForDocument,
    };
  }

  if (eligibility.eligiblePages.length === 0) {
    return {
      kind: "skip",
      reason: "no_candidate_pages",
      requiredForDocument: eligibility.requiredForDocument,
    };
  }

  return {
    kind: "enqueue",
    candidatePages: eligibility.eligiblePages.map((page) => ({
      pageNumber: page.pageNumber,
      reason: page.reason,
      nativeTextChars: page.nativeTextChars,
    })),
  };
}

function extractPdfNativePages(normalizedMarkdown: string): { pageNumber: number; text: string }[] {
  const pages: { pageNumber: number; text: string }[] = [];
  let currentPageNumber: number | undefined;
  let currentLines: string[] = [];

  for (const line of normalizedMarkdown.split(/\r?\n/u)) {
    const match = /^##\s+Page\s+(\d+)\s*$/iu.exec(line.trim());

    if (match !== null) {
      if (currentPageNumber !== undefined) {
        pages.push({
          pageNumber: currentPageNumber,
          text: currentLines.join("\n").trim(),
        });
      }

      currentPageNumber = Number(match[1]);
      currentLines = [];
      continue;
    }

    if (currentPageNumber !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentPageNumber !== undefined) {
    pages.push({
      pageNumber: currentPageNumber,
      text: currentLines.join("\n").trim(),
    });
  }

  return pages;
}

function toMediaAssetWrite(
  documentId: string,
  parsedContentId: string,
  asset: ParserMediaAsset,
): SourceParseMediaAssetWrite {
  return {
    id: createResourceId("mediaAsset"),
    document_id: documentId,
    parsed_content_id: parsedContentId,
    mime_type: asset.mimeType,
    object_key: asset.objectKey,
    sha256: asset.hash,
    locator: toMediaAssetLocatorRecord(asset),
    width: asset.width ?? null,
    height: asset.height ?? null,
    caption_status: "pending",
  };
}

function toMediaAssetLocatorRecord(asset: ParserMediaAsset): Record<string, unknown> {
  const locator = asset.locator === undefined ? {} : toJsonObject(asset.locator);

  return {
    source_format: asset.sourceFormat,
    asset_kind: asset.assetKind,
    extraction_method: asset.extractionMethod,
    ...locator,
    ...(asset.sourceMetadata === undefined
      ? {}
      : { source_metadata: toJsonObject(asset.sourceMetadata) }),
  };
}

function toJsonObject(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function createNormalizedMarkdownObjectKey(payload: SourceParsePayload): string {
  return createParsedContentObjectKey({
    knowledgeBaseId: payload.knowledge_base_id,
    documentId: payload.document_id,
    contentHash: payload.content_hash,
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const normalizedConcurrency = Math.min(Math.max(1, concurrency), items.length);
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: normalizedConcurrency }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex] as T);
      }
    }),
  );

  return results;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "source.bin";
}

function isTextSourceParser(parser: DocumentParser, fileName: string, mimeType: string): boolean {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const extension = fileName.includes(".")
    ? `.${fileName.split(".").at(-1)?.toLowerCase() ?? ""}`
    : "";
  const textMimeTypes = new Set([
    "application/json",
    "application/jsonl",
    "application/ndjson",
    "application/x-ndjson",
    "application/xml",
    "application/yaml",
  ]);
  const textExtensions = new Set([
    ".csv",
    ".html",
    ".htm",
    ".json",
    ".jsonl",
    ".markdown",
    ".md",
    ".ndjson",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
  ]);

  return (
    normalizedMimeType.startsWith("text/") ||
    textMimeTypes.has(normalizedMimeType) ||
    textExtensions.has(extension) ||
    parser.mimeTypes.some((item) => item.trim().toLowerCase().startsWith("text/")) ||
    parser.extensions.some((item) => textExtensions.has(item.trim().toLowerCase()))
  );
}

async function readBodyWithinLimit(
  body: unknown,
  maxBytes: number | undefined,
): Promise<
  { kind: "success"; content: Buffer } | { kind: "fatal"; actual: number; limit: number }
> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (maxBytes !== undefined && totalBytes > maxBytes) {
      return {
        kind: "fatal",
        actual: totalBytes,
        limit: maxBytes,
      };
    }

    chunks.push(buffer);
  }

  return {
    kind: "success",
    content: Buffer.concat(chunks, totalBytes),
  };
}

async function readTextBodyWithinLimit(
  body: unknown,
  maxBytes: number | undefined,
): Promise<
  { kind: "success"; content: string } | { kind: "fatal"; actual: number; limit: number }
> {
  const chunks: string[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;

    totalBytes += Buffer.byteLength(text);

    if (maxBytes !== undefined && totalBytes > maxBytes) {
      return {
        kind: "fatal",
        actual: totalBytes,
        limit: maxBytes,
      };
    }

    chunks.push(text);
  }

  return {
    kind: "success",
    content: chunks.join(""),
  };
}
