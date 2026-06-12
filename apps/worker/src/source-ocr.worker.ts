import { Queue, Worker } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";
import {
  applyPdfOcrResults,
  isRetryableOcrProviderError,
  renderPdfPagesForOcr,
  type OcrProvider,
  type OcrProviderBlock,
  type ParserWarning,
  type PdfNativeTextPage,
  type PdfOcrBlock,
  type PdfOcrRenderSkippedPage,
  type PdfOcrRenderedPage,
} from "@fococontext/parsers";
import type { ObjectStorageAdapter } from "@fococontext/storage";

import type {
  WorkerJobProgressWriter,
  WorkerJobStateGuard,
} from "./job-progress.postgres-writer.js";
import type { DocumentProcessingStateStore } from "./document-processing-state.js";
import type { MediaCaptionQueue } from "./media-caption.worker.js";
import {
  createOcrPolicyHash,
  toOcrCandidateProcessingUnit,
  toOcrProcessingUnit,
} from "./source-ocr-processing-state.js";
import type { SourceOcrPayload } from "./source-parse.worker.js";
import type { WikiAnalyzeQueue } from "./wiki-compile.worker.js";

export const sourceOcrQueueName = "source.ocr";
export const sourceOcrJobName = "source.ocr.document";

type BoundedObjectReadResult = BoundedObjectReadSuccess | BoundedObjectReadFailure;

interface BoundedObjectReadSuccess {
  kind: "success";
  content: Buffer;
}

interface BoundedObjectReadFailure {
  kind: "fatal";
  error: Record<string, unknown>;
}

export interface SourceOcrQueueJob {
  name: string;
  data: SourceOcrPayload;
}

export interface SourceOcrProcessorConfig {
  concurrency: number;
  checkpointInterval: number;
  confidenceThreshold: number;
  languages: string[];
  maxObjectBytes: number;
  maxPagePixels: number;
  maxPagesPerDocument: number;
  maxRetries: number;
  pageDpi: number;
  retryBaseDelayMs: number;
  storePageImages: boolean;
  timeoutSeconds: number;
  windowSize: number;
}

export interface SourceOcrProcessorOptions {
  captionQueue?: MediaCaptionQueue;
  compileQueue?: WikiAnalyzeQueue;
  config: SourceOcrProcessorConfig;
  jobGuard?: WorkerJobStateGuard;
  jobProgress?: WorkerJobProgressWriter;
  objectStorage: ObjectStorageAdapter;
  ocrProvider: OcrProvider;
  processingState?: DocumentProcessingStateStore;
  repository: SourceOcrRepository;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface SourceOcrProcessorResult {
  block_count: number;
  document_id: string;
  failed_page_count: number;
  parsed_content_id: string;
  should_continue: boolean;
  status: "completed" | "failed";
}

export interface SourceOcrParsedContentContext {
  mediaAssetIds: string[];
  normalizedMarkdownObjectKey: string;
  parserName: string;
  parserVersion: string;
}

export interface SourceOcrArtifactWrite {
  id: string;
  mimeType: string;
  objectKey: string;
  pageNumber: number;
  sha256: string;
  sizeBytes: number;
}

export interface SourceOcrPageWrite {
  artifactId?: string | null;
  attemptCount: number;
  blocks: PdfOcrBlock[];
  confidenceAvg: number | null;
  error: Record<string, unknown> | null;
  modelVersion: string | null;
  pageNumber: number;
  providerName: string | null;
  engine: string | null;
  reason: string | null;
  retryable: boolean;
  status: "succeeded" | "failed" | "skipped";
  warnings: readonly ParserWarning[];
}

export interface SourceOcrSaveResultInput {
  artifacts: readonly SourceOcrArtifactWrite[];
  blockCount: number;
  completedAt: string;
  documentId: string;
  jobId: string;
  locators: readonly Record<string, unknown>[];
  normalizedMarkdownObjectKey: string;
  ocrStatus: "succeeded" | "failed" | "skipped" | "not_required";
  pages: readonly SourceOcrPageWrite[];
  parsedContentId: string;
  providerMetadata: Record<string, unknown>;
  summary: Record<string, unknown>;
  warnings: readonly ParserWarning[];
}

export interface SourceOcrPageProgressInput {
  artifacts: readonly SourceOcrArtifactWrite[];
  completedAt: string;
  documentId: string;
  jobId: string;
  pages: readonly SourceOcrPageWrite[];
  parsedContentId: string;
}

export interface SourceOcrReusablePageInput {
  documentId: string;
  pageNumbers: readonly number[];
  parsedContentId: string;
}

export interface SourceOcrRepository {
  getParsedContentContext(parsedContentId: string): Promise<SourceOcrParsedContentContext | null>;
  listReusableOcrPages(input: SourceOcrReusablePageInput): Promise<SourceOcrPageWrite[]>;
  saveOcrPageWindow(input: SourceOcrPageProgressInput): Promise<void>;
  saveOcrResult(input: SourceOcrSaveResultInput): Promise<void>;
}

export class BullMqSourceOcrQueue {
  readonly enabled: boolean;
  readonly maxPagesPerDocument: number;
  readonly minTextCharsPerPage: number;
  private readonly queue: Queue<SourceOcrPayload>;

  constructor(private readonly config: RuntimeConfig) {
    this.enabled = config.ocr.enabled && config.ocr.serviceBaseUrl !== undefined;
    this.maxPagesPerDocument = config.limits.ocr.maxPagesPerDocument;
    this.minTextCharsPerPage = config.limits.ocr.minTextCharsPerPage;
    this.queue = new Queue<SourceOcrPayload>(sourceOcrQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: Math.max(1, config.limits.ocr.maxRetries + 1),
        backoff: {
          delay: config.limits.ocr.retryBaseDelayMs,
          type: "exponential",
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueSourceOcrJob(payload: SourceOcrPayload): Promise<unknown> {
    if (!this.enabled) {
      throw new Error("source.ocr queue is disabled.");
    }

    await this.queue.add(sourceOcrJobName, payload, {
      jobId: `${payload.job_id}-ocr-${payload.parsed_content_id}`,
    });

    return {
      queue_name: sourceOcrQueueName,
      job_name: sourceOcrJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqSourceOcrWorker {
  private readonly worker: Worker<SourceOcrPayload>;

  constructor(config: RuntimeConfig, processor: SourceOcrProcessor) {
    this.worker = new Worker<SourceOcrPayload>(
      sourceOcrQueueName,
      createSourceOcrJobProcessor(processor),
      createSourceOcrWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createSourceOcrWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.backgroundJobs.ocr.concurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export class SourceOcrProcessor {
  private readonly captionQueue: MediaCaptionQueue | undefined;
  private readonly compileQueue: WikiAnalyzeQueue | undefined;
  private readonly config: SourceOcrProcessorConfig;
  private readonly jobGuard: WorkerJobStateGuard | undefined;
  private readonly jobProgress: WorkerJobProgressWriter | undefined;
  private readonly objectStorage: ObjectStorageAdapter;
  private readonly ocrProvider: OcrProvider;
  private readonly processingState: DocumentProcessingStateStore | undefined;
  private readonly repository: SourceOcrRepository;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: SourceOcrProcessorOptions) {
    this.captionQueue = options.captionQueue;
    this.compileQueue = options.compileQueue;
    this.config = options.config;
    this.jobGuard = options.jobGuard;
    this.jobProgress = options.jobProgress;
    this.objectStorage = options.objectStorage;
    this.ocrProvider = options.ocrProvider;
    this.processingState = options.processingState;
    this.repository = options.repository;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async process(payload: SourceOcrPayload): Promise<SourceOcrProcessorResult> {
    const guard = await this.jobGuard?.canContinueJob({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      tenantId: payload.tenant_id,
      projectId: payload.project_id,
      sourceDocumentId: payload.document_id,
    });

    if (guard?.canContinue === false) {
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "ocr",
        status: "failed",
        progress: 100,
        message: "OCR skipped because the ingest job is no longer runnable.",
        parsedContentId: payload.parsed_content_id,
        error: {
          code: "source_ocr_stale_job",
          reason: guard.reason ?? "unknown",
        },
      });

      return createSourceOcrFailedResult(payload);
    }

    const context = await this.repository.getParsedContentContext(payload.parsed_content_id);

    if (context === null) {
      await this.markFailed(payload, {
        code: "source_ocr_context_missing",
        message: "OCR requires parsed content context.",
      });

      return createSourceOcrFailedResult(payload);
    }

    const candidatePageNumbers = payload.candidate_pages.map((page) => page.pageNumber);
    const policyHash = createOcrPolicyHash(this.config);
    const reusablePages = await this.repository.listReusableOcrPages({
      documentId: payload.document_id,
      pageNumbers: candidatePageNumbers,
      parsedContentId: payload.parsed_content_id,
    });
    const reusablePageNumbers = new Set(reusablePages.map((page) => page.pageNumber));
    const pendingCandidatePages = payload.candidate_pages
      .filter((page) => !reusablePageNumbers.has(page.pageNumber))
      .slice(0, Math.max(0, this.config.maxPagesPerDocument - reusablePages.length));
    await this.processingState?.upsertUnits([
      ...reusablePages.map((page) =>
        toOcrProcessingUnit(payload, page, {
          policyHash,
          status: page.status,
        }),
      ),
      ...pendingCandidatePages.map((page, index) =>
        toOcrCandidateProcessingUnit(payload, page, {
          policyHash,
          status: "pending",
          unitIndex: index,
        }),
      ),
    ]);

    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "ocr",
      status: "running",
      progress: 35,
      message: "Rendering PDF pages for OCR...",
      parsedContentId: payload.parsed_content_id,
      metadata: {
        ocr_candidate_page_count: payload.candidate_pages.length,
        ocr_candidate_pages: candidatePageNumbers,
        ocr_reusable_page_count: reusablePages.length,
        ocr_window_size: this.config.windowSize,
      },
    });

    if (candidatePageNumbers.length > 0 && pendingCandidatePages.length === 0) {
      await this.processingState?.upsertCheckpoint({
        checkpointKey: "ocr-pages",
        configHash: policyHash,
        cursor: {
          completed_page_count: reusablePages.length,
          total_page_count: candidatePageNumbers.length,
        },
        jobId: payload.job_id,
        parsedContentId: payload.parsed_content_id,
        sourceDocumentId: payload.document_id,
        stage: "ocr",
        status: "completed",
        summary: {
          reused_page_count: reusablePages.length,
        },
      });
      await this.enqueueDownstream(payload, context);

      return {
        block_count: reusablePages.flatMap((page) => page.blocks).length,
        document_id: payload.document_id,
        failed_page_count: countFailedPages(reusablePages),
        parsed_content_id: payload.parsed_content_id,
        should_continue: true,
        status: "completed",
      };
    }

    const objectReads = new Map<string, Promise<BoundedObjectReadResult>>();
    const readObjectOnce = (key: string): Promise<BoundedObjectReadResult> => {
      const existing = objectReads.get(key);

      if (existing !== undefined) {
        return existing;
      }

      const next = this.objectStorage
        .getObject({ key })
        .then((object) =>
          readBodyWithinLimit(object.body, object.contentLength, this.config.maxObjectBytes, key),
        );
      objectReads.set(key, next);

      return next;
    };
    const [sourceRead, normalizedRead] = await Promise.all([
      readObjectOnce(payload.source_object_key),
      readObjectOnce(context.normalizedMarkdownObjectKey),
    ]);
    if (sourceRead.kind === "fatal") {
      await this.markFailed(payload, sourceRead.error);

      return createSourceOcrFailedResult(payload);
    }

    if (normalizedRead.kind === "fatal") {
      await this.markFailed(payload, normalizedRead.error);

      return createSourceOcrFailedResult(payload);
    }

    const sourceContent = sourceRead.content;
    const normalizedContent = normalizedRead.content;
    const nativeMarkdown = normalizedContent.toString("utf8");
    const nativePages = extractPdfNativePages(nativeMarkdown);
    const artifacts: SourceOcrArtifactWrite[] = [];
    const pageWrites: SourceOcrPageWrite[] = [...reusablePages];
    const pendingWindows = chunkArray(pendingCandidatePages, this.config.windowSize);

    for (const [windowIndex, pageWindow] of pendingWindows.entries()) {
      await this.processingState?.upsertCheckpoint({
        checkpointKey: "ocr-pages",
        configHash: policyHash,
        cursor: {
          next_window_index: windowIndex,
          processed_page_count: pageWrites.length,
          total_window_count: pendingWindows.length,
        },
        jobId: payload.job_id,
        parsedContentId: payload.parsed_content_id,
        sourceDocumentId: payload.document_id,
        stage: "ocr",
        status: "running",
      });
      await this.processingState?.upsertUnits(
        pageWindow.map((page, index) =>
          toOcrCandidateProcessingUnit(payload, page, {
            policyHash,
            status: "running",
            unitIndex: windowIndex * this.config.windowSize + index,
          }),
        ),
      );
      const rendered = await renderPdfPagesForOcr({
        candidatePages: pageWindow.map((page) => page.pageNumber),
        concurrency: this.config.concurrency,
        content: sourceContent,
        dpi: this.config.pageDpi,
        maxPagePixels: this.config.maxPagePixels,
        maxPages: this.config.maxPagesPerDocument,
        timeoutMs: this.config.timeoutSeconds * 1000,
        shouldCancel: async () => {
          const nextGuard = await this.jobGuard?.canContinueJob({
            jobId: payload.job_id,
            knowledgeBaseId: payload.knowledge_base_id,
            inputSnapshotId: payload.input_snapshot_id,
            tenantId: payload.tenant_id,
            projectId: payload.project_id,
            sourceDocumentId: payload.document_id,
          });

          return nextGuard?.canContinue === false;
        },
      });
      const recognizedPages = await mapWithConcurrency(
        rendered.pages,
        this.config.concurrency,
        (page) => this.recognizeRenderedPage(page),
      );
      const nextGuard = await this.canContinue(payload);

      if (!nextGuard.canContinue) {
        await this.jobProgress?.updateJobProgress({
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          stage: "ocr",
          status: "failed",
          progress: 100,
          message: "OCR stopped because the ingest job is no longer runnable.",
          parsedContentId: payload.parsed_content_id,
          error: {
            code: "source_ocr_stale_job",
            reason: nextGuard.reason ?? "unknown",
          },
        });

        return createSourceOcrFailedResult(payload);
      }

      const windowArtifacts = await this.storeRenderedPages(payload, rendered.pages);
      const artifactByPageNumber = new Map(
        windowArtifacts.map((artifact) => [artifact.pageNumber, artifact]),
      );
      const windowPageWrites = [
        ...recognizedPages.map((page) => ({
          ...page,
          artifactId: artifactByPageNumber.get(page.pageNumber)?.id ?? null,
        })),
        ...rendered.skippedPages.map((page) => toSkippedPageWrite(page)),
      ];

      await this.repository.saveOcrPageWindow({
        artifacts: windowArtifacts,
        completedAt: new Date().toISOString(),
        documentId: payload.document_id,
        jobId: payload.job_id,
        pages: windowPageWrites,
        parsedContentId: payload.parsed_content_id,
      });
      await this.processingState?.upsertUnits(
        windowPageWrites.map((page) => {
          const artifact = artifactByPageNumber.get(page.pageNumber);

          if (artifact === undefined) {
            return toOcrProcessingUnit(payload, page, {
              policyHash,
              status: page.status,
            });
          }

          return toOcrProcessingUnit(payload, page, {
            artifact,
            policyHash,
            status: page.status,
          });
        }),
      );
      await this.processingState?.upsertCheckpoint({
        checkpointKey: "ocr-pages",
        configHash: policyHash,
        cursor: {
          completed_window_index: windowIndex,
          processed_page_count: pageWrites.length + windowPageWrites.length,
          total_window_count: pendingWindows.length,
        },
        jobId: payload.job_id,
        parsedContentId: payload.parsed_content_id,
        sourceDocumentId: payload.document_id,
        stage: "ocr",
        status: "running",
        summary: {
          completed_windows: windowIndex + 1,
        },
      });
      artifacts.push(...windowArtifacts);
      pageWrites.push(...windowPageWrites);

      if ((windowIndex + 1) % this.config.checkpointInterval === 0) {
        await this.jobProgress?.updateJobProgress({
          jobId: payload.job_id,
          knowledgeBaseId: payload.knowledge_base_id,
          inputSnapshotId: payload.input_snapshot_id,
          stage: "ocr",
          status: "running",
          progress: 40,
          message: "Running OCR on scanned PDF pages...",
          parsedContentId: payload.parsed_content_id,
          metadata: {
            ocr_completed_windows: windowIndex + 1,
            ocr_processed_page_count: pageWrites.length,
            ocr_total_windows: pendingWindows.length,
            ocr_window_size: this.config.windowSize,
          },
        });
      }
    }

    pageWrites.sort((left, right) => left.pageNumber - right.pageNumber);
    const ocrBlocks = pageWrites.flatMap((page) => page.blocks);
    const applied = applyPdfOcrResults({
      nativePages,
      ocrBlocks,
      parserName: context.parserName,
      parserVersion: context.parserVersion,
      fileExtension: ".pdf",
      mimeType: "application/pdf",
      ocrWasRequired: isOcrRequired(nativePages, payload),
    });

    if (applied.kind === "fatal") {
      await this.repository.saveOcrResult({
        artifacts,
        blockCount: ocrBlocks.length,
        completedAt: new Date().toISOString(),
        documentId: payload.document_id,
        jobId: payload.job_id,
        locators: [],
        normalizedMarkdownObjectKey: context.normalizedMarkdownObjectKey,
        ocrStatus: "failed",
        pages: pageWrites,
        parsedContentId: payload.parsed_content_id,
        providerMetadata: createProviderMetadata(pageWrites),
        summary: {
          error: applied.error,
          failed_page_count: countFailedPages(pageWrites),
        },
        warnings: pageWrites.flatMap((page) => page.warnings),
      });
      await this.markFailed(payload, {
        code: "source_ocr_failed",
        parser_error: applied.error,
      });
      await this.processingState?.upsertCheckpoint({
        checkpointKey: "ocr-pages",
        configHash: policyHash,
        jobId: payload.job_id,
        parsedContentId: payload.parsed_content_id,
        safeError: {
          code: "source_ocr_failed",
          parser_error: applied.error,
        },
        sourceDocumentId: payload.document_id,
        stage: "ocr",
        status: "failed",
        summary: {
          failed_page_count: countFailedPages(pageWrites),
        },
      });

      return createSourceOcrFailedResult(payload, ocrBlocks.length, countFailedPages(pageWrites));
    }

    await this.objectStorage.putObject({
      key: context.normalizedMarkdownObjectKey,
      body: Buffer.from(applied.normalizedMarkdown),
      contentType: "text/markdown",
      metadata: {
        documentId: payload.document_id,
        parsedContentId: payload.parsed_content_id,
        source: "ocr",
      },
    });
    await this.repository.saveOcrResult({
      artifacts,
      blockCount: ocrBlocks.length,
      completedAt: new Date().toISOString(),
      documentId: payload.document_id,
      jobId: payload.job_id,
      locators: applied.locators.map((locator) => ({ ...locator })),
      normalizedMarkdownObjectKey: context.normalizedMarkdownObjectKey,
      ocrStatus:
        ocrBlocks.length > 0
          ? "succeeded"
          : pageWrites.some((page) => page.status === "skipped")
            ? "skipped"
            : "not_required",
      pages: pageWrites,
      parsedContentId: payload.parsed_content_id,
      providerMetadata: createProviderMetadata(pageWrites),
      summary: {
        failed_page_count: countFailedPages(pageWrites),
        ocr_candidate_pages: candidatePageNumbers,
        ocr_page_count: pageWrites.filter((page) => page.status === "succeeded").length,
        ocr_reused_page_count: reusablePages.length,
        ocr_window_size: this.config.windowSize,
        skipped_page_count: pageWrites.filter((page) => page.status === "skipped").length,
      },
      warnings: pageWrites.flatMap((page) => page.warnings),
    });
    await this.processingState?.upsertCheckpoint({
      checkpointKey: "ocr-pages",
      configHash: policyHash,
      cursor: {
        completed_page_count: pageWrites.length,
        total_page_count: candidatePageNumbers.length,
      },
      jobId: payload.job_id,
      parsedContentId: payload.parsed_content_id,
      sourceDocumentId: payload.document_id,
      stage: "ocr",
      status: "completed",
      summary: {
        failed_page_count: countFailedPages(pageWrites),
        ocr_block_count: ocrBlocks.length,
        ocr_page_count: pageWrites.filter((page) => page.status === "succeeded").length,
        skipped_page_count: pageWrites.filter((page) => page.status === "skipped").length,
      },
    });

    await this.enqueueDownstream(payload, context);

    return {
      block_count: ocrBlocks.length,
      document_id: payload.document_id,
      failed_page_count: countFailedPages(pageWrites),
      parsed_content_id: payload.parsed_content_id,
      should_continue: true,
      status: "completed",
    };
  }

  private async recognizeRenderedPage(page: PdfOcrRenderedPage): Promise<SourceOcrPageWrite> {
    let attemptCount = 0;

    while (attemptCount <= this.config.maxRetries) {
      attemptCount += 1;

      try {
        const result = await this.ocrProvider.recognizePage({
          pageNumber: page.pageNumber,
          image: page.image,
          mimeType: page.mimeType,
          languages: this.config.languages,
        });
        const blocks = result.blocks.map(toPdfOcrBlock);

        return {
          attemptCount,
          blocks,
          confidenceAvg: averageConfidence(blocks),
          error: null,
          engine: result.engine,
          modelVersion: result.modelVersion,
          pageNumber: page.pageNumber,
          providerName: result.provider,
          reason: null,
          retryable: false,
          status: "succeeded",
          warnings: result.warnings,
        };
      } catch (error) {
        const retryable = isRetryableOcrProviderError(error);

        if (retryable && attemptCount <= this.config.maxRetries) {
          await this.sleep(this.config.retryBaseDelayMs * attemptCount);
          continue;
        }

        return {
          attemptCount,
          blocks: [],
          confidenceAvg: null,
          error: normalizeOcrError(error),
          engine: null,
          modelVersion: null,
          pageNumber: page.pageNumber,
          providerName: null,
          reason: "provider_failed",
          retryable,
          status: "failed",
          warnings: [],
        };
      }
    }

    throw new Error("Unreachable OCR retry loop state.");
  }

  private async storeRenderedPages(
    payload: SourceOcrPayload,
    pages: readonly PdfOcrRenderedPage[],
  ): Promise<SourceOcrArtifactWrite[]> {
    if (!this.config.storePageImages) {
      return [];
    }

    const artifacts: SourceOcrArtifactWrite[] = [];

    for (const page of pages) {
      const objectKey = `ocr/${payload.document_id}/${payload.parsed_content_id}/page-${page.pageNumber}.png`;
      const sha256 = await sha256Hex(page.image);
      const artifact: SourceOcrArtifactWrite = {
        id: `ocrart_${payload.document_id}_${page.pageNumber}`,
        mimeType: page.mimeType,
        objectKey,
        pageNumber: page.pageNumber,
        sha256: `sha256:${sha256}`,
        sizeBytes: page.image.byteLength,
      };

      await this.objectStorage.putObject({
        key: objectKey,
        body: page.image,
        contentType: page.mimeType,
        metadata: {
          documentId: payload.document_id,
          parsedContentId: payload.parsed_content_id,
          pageNumber: String(page.pageNumber),
        },
      });
      artifacts.push(artifact);
    }

    return artifacts;
  }

  private async enqueueDownstream(
    payload: SourceOcrPayload,
    context: SourceOcrParsedContentContext,
  ): Promise<void> {
    const guard = await this.canContinue(payload);

    if (!guard.canContinue) {
      return;
    }

    if (this.captionQueue !== undefined && context.mediaAssetIds.length > 0) {
      await this.captionQueue.enqueueMediaCaptionJob({
        job_id: payload.job_id,
        tenant_id: payload.tenant_id,
        project_id: payload.project_id,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: payload.parsed_content_id,
        normalized_markdown_object_key: context.normalizedMarkdownObjectKey,
        content_hash: payload.content_hash,
        input_snapshot_id: payload.input_snapshot_id,
        ...(payload.dataset_configuration_snapshot === undefined
          ? {}
          : { dataset_configuration_snapshot: payload.dataset_configuration_snapshot }),
        media_asset_ids: context.mediaAssetIds,
      });
      await this.jobProgress?.updateJobProgress({
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        inputSnapshotId: payload.input_snapshot_id,
        stage: "captioning",
        status: "running",
        progress: 45,
        message: "Captioning media assets...",
        parsedContentId: payload.parsed_content_id,
        metadata: {
          eligible_media_asset_count: context.mediaAssetIds.length,
          media_asset_ids: context.mediaAssetIds,
        },
      });
      return;
    }

    await this.compileQueue?.enqueueWikiAnalyzeJob({
      job_id: payload.job_id,
      tenant_id: payload.tenant_id,
      project_id: payload.project_id,
      knowledge_base_id: payload.knowledge_base_id,
      document_id: payload.document_id,
      parsed_content_id: payload.parsed_content_id,
      normalized_markdown_object_key: context.normalizedMarkdownObjectKey,
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
      progress: 45,
      message: "Analyzing OCR-enriched content...",
      parsedContentId: payload.parsed_content_id,
    });
  }

  private async markFailed(
    payload: SourceOcrPayload,
    error: Record<string, unknown>,
  ): Promise<void> {
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "ocr",
      status: "failed",
      progress: 100,
      message: "OCR failed.",
      parsedContentId: payload.parsed_content_id,
      error,
    });
  }

  private async canContinue(payload: SourceOcrPayload): Promise<{
    canContinue: boolean;
    reason?: string;
  }> {
    const guard = await this.jobGuard?.canContinueJob({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      tenantId: payload.tenant_id,
      projectId: payload.project_id,
      sourceDocumentId: payload.document_id,
    });

    if (guard === undefined) {
      return {
        canContinue: true,
      };
    }

    return guard;
  }
}

export function createSourceOcrJobProcessor(
  processor: SourceOcrProcessor,
): (job: SourceOcrQueueJob) => Promise<SourceOcrProcessorResult> {
  return async (job) => {
    if (job.name !== sourceOcrJobName) {
      throw new Error(`Unsupported source.ocr job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

function extractPdfNativePages(normalizedMarkdown: string): PdfNativeTextPage[] {
  const pages: PdfNativeTextPage[] = [];
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

function toPdfOcrBlock(block: OcrProviderBlock): PdfOcrBlock {
  return {
    pageNumber: block.pageNumber,
    blockIndex: block.blockIndex,
    text: block.text,
    ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
    ...(block.bbox === undefined ? {} : { bbox: block.bbox }),
    ...(block.language === undefined ? {} : { language: block.language }),
    provider: block.provider,
    engine: block.engine,
    modelVersion: block.modelVersion,
  };
}

function toSkippedPageWrite(page: PdfOcrRenderSkippedPage): SourceOcrPageWrite {
  return {
    attemptCount: 0,
    blocks: [],
    confidenceAvg: null,
    error: null,
    engine: null,
    modelVersion: null,
    pageNumber: page.pageNumber,
    providerName: null,
    reason: page.reason,
    retryable: page.reason === "render_timeout",
    status: "skipped",
    warnings: [],
  };
}

function isOcrRequired(nativePages: readonly PdfNativeTextPage[], payload: SourceOcrPayload) {
  if (nativePages.length === 0) {
    return true;
  }

  const candidatePageNumbers = new Set(payload.candidate_pages.map((page) => page.pageNumber));

  return nativePages.every(
    (page) =>
      candidatePageNumbers.has(page.pageNumber) && page.text.replace(/\s+/gu, "").length === 0,
  );
}

function createProviderMetadata(pages: readonly SourceOcrPageWrite[]): Record<string, unknown> {
  const first = pages.find((page) => page.providerName !== null);

  return first === undefined
    ? {}
    : {
        provider: first.providerName,
        engine: first.engine,
        model_version: first.modelVersion,
      };
}

function countFailedPages(pages: readonly SourceOcrPageWrite[]) {
  return pages.filter((page) => page.status === "failed").length;
}

function averageConfidence(blocks: readonly PdfOcrBlock[]) {
  const values = blocks.flatMap((block) =>
    block.confidence === undefined ? [] : [block.confidence],
  );

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }

  return chunks;
}

function normalizeOcrError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      code: "ocr_provider_failed",
      message: error.message,
      retryable: isRetryableOcrProviderError(error),
    };
  }

  return {
    code: "ocr_provider_failed",
    message: "OCR provider failed.",
    retryable: false,
  };
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
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

function createSourceOcrFailedResult(
  payload: SourceOcrPayload,
  blockCount = 0,
  failedPageCount = 0,
): SourceOcrProcessorResult {
  return {
    block_count: blockCount,
    document_id: payload.document_id,
    failed_page_count: failedPageCount,
    parsed_content_id: payload.parsed_content_id,
    should_continue: false,
    status: "failed",
  };
}

async function sha256Hex(buffer: Buffer) {
  const { createHash } = await import("node:crypto");

  return createHash("sha256").update(buffer).digest("hex");
}

async function readBodyWithinLimit(
  body: unknown,
  contentLength: number | undefined,
  maxBytes: number,
  objectKey: string,
): Promise<BoundedObjectReadResult> {
  if (contentLength !== undefined && contentLength > maxBytes) {
    return createObjectReadLimitExceededResult(objectKey, contentLength, maxBytes);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      return createObjectReadLimitExceededResult(objectKey, totalBytes, maxBytes);
    }

    chunks.push(buffer);
  }

  return {
    kind: "success",
    content: Buffer.concat(chunks, totalBytes),
  };
}

function createObjectReadLimitExceededResult(
  objectKey: string,
  actualBytes: number,
  limitBytes: number,
): BoundedObjectReadFailure {
  return {
    kind: "fatal",
    error: {
      code: "source_ocr_object_limit_exceeded",
      object_key: objectKey,
      actual_bytes: actualBytes,
      limit_bytes: limitBytes,
    },
  };
}
