import { Queue, Worker } from "bullmq";
import { sql, type Kysely } from "kysely";
import type { RuntimeConfig } from "@fococontext/core";
import type { DatabaseSchema } from "@fococontext/db";
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
import type { MediaCaptionQueue } from "./media-caption.worker.js";
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
}

export interface SourceOcrProcessorOptions {
  captionQueue?: MediaCaptionQueue;
  compileQueue?: WikiAnalyzeQueue;
  config: SourceOcrProcessorConfig;
  jobGuard?: WorkerJobStateGuard;
  jobProgress?: WorkerJobProgressWriter;
  objectStorage: ObjectStorageAdapter;
  ocrProvider: OcrProvider;
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

export interface SourceOcrRepository {
  getParsedContentContext(parsedContentId: string): Promise<SourceOcrParsedContentContext | null>;
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
    concurrency: config.limits.ocr.concurrency,
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
        ocr_candidate_pages: payload.candidate_pages.map((page) => page.pageNumber),
      },
    });

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
    const rendered = await renderPdfPagesForOcr({
      candidatePages: payload.candidate_pages.map((page) => page.pageNumber),
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
    const skippedPages = rendered.skippedPages.map((page) => toSkippedPageWrite(page));
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

    const artifacts = await this.storeRenderedPages(payload, rendered.pages);
    const artifactByPageNumber = new Map(
      artifacts.map((artifact) => [artifact.pageNumber, artifact]),
    );
    const pageWrites = [
      ...recognizedPages.map((page) => ({
        ...page,
        artifactId: artifactByPageNumber.get(page.pageNumber)?.id ?? null,
      })),
      ...skippedPages,
    ];
    const ocrBlocks = recognizedPages.flatMap((page) => page.blocks);
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
        providerMetadata: createProviderMetadata(recognizedPages),
        summary: {
          error: applied.error,
          failed_page_count: countFailedPages(pageWrites),
        },
        warnings: rendered.warnings,
      });
      await this.markFailed(payload, {
        code: "source_ocr_failed",
        parser_error: applied.error,
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
          : rendered.skippedPages.length > 0
            ? "skipped"
            : "not_required",
      pages: pageWrites,
      parsedContentId: payload.parsed_content_id,
      providerMetadata: createProviderMetadata(recognizedPages),
      summary: {
        failed_page_count: countFailedPages(pageWrites),
        ocr_candidate_pages: payload.candidate_pages.map((page) => page.pageNumber),
        ocr_page_count: rendered.pages.length,
        skipped_page_count: rendered.skippedPages.length,
      },
      warnings: [...rendered.warnings, ...recognizedPages.flatMap((page) => page.warnings)],
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

export class PostgresSourceOcrRepository implements SourceOcrRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async getParsedContentContext(
    parsedContentId: string,
  ): Promise<SourceOcrParsedContentContext | null> {
    const parsed = await sql<{
      normalized_markdown_object_key: string;
      parser_name: string;
      parser_version: string;
    }>`
      select
        normalized_markdown_object_key,
        parser_name,
        parser_version
      from parsed_contents
      where id = ${parsedContentId}
    `.execute(this.db);
    const row = parsed.rows[0];

    if (row === undefined) {
      return null;
    }

    const mediaAssets = await sql<{ id: string }>`
      select id
      from media_assets
      where parsed_content_id = ${parsedContentId}
        and caption_status in ('pending', 'failed')
      order by id
    `.execute(this.db);

    return {
      mediaAssetIds: mediaAssets.rows.map((asset) => asset.id),
      normalizedMarkdownObjectKey: row.normalized_markdown_object_key,
      parserName: row.parser_name,
      parserVersion: row.parser_version,
    };
  }

  async saveOcrResult(input: SourceOcrSaveResultInput): Promise<void> {
    const pageNumbers = input.pages.map((page) => page.pageNumber);

    if (pageNumbers.length > 0) {
      await sql`
        delete from ocr_blocks
        where source_document_id = ${input.documentId}
          and page_number in (${sql.join(pageNumbers)})
      `.execute(this.db);
    }

    for (const artifact of input.artifacts) {
      await sql`
        insert into ocr_artifacts (
          id,
          source_document_id,
          parsed_content_id,
          job_id,
          page_number,
          artifact_kind,
          object_key,
          mime_type,
          size_bytes,
          sha256,
          metadata
        )
        values (
          ${artifact.id},
          ${input.documentId},
          ${input.parsedContentId},
          ${input.jobId},
          ${artifact.pageNumber},
          'rendered_page_image',
          ${artifact.objectKey},
          ${artifact.mimeType},
          ${artifact.sizeBytes},
          ${artifact.sha256},
          '{}'::jsonb
        )
        on conflict (id) do update set
          object_key = excluded.object_key,
          mime_type = excluded.mime_type,
          size_bytes = excluded.size_bytes,
          sha256 = excluded.sha256,
          metadata = excluded.metadata
      `.execute(this.db);
    }

    for (const page of input.pages) {
      const pageStatusId = createOcrPageStatusId(input.documentId, page.pageNumber);

      await sql`
        insert into ocr_page_statuses (
          id,
          source_document_id,
          parsed_content_id,
          job_id,
          page_number,
          status,
          reason,
          provider_name,
          engine,
          model_version,
          confidence_avg,
          block_count,
          attempt_count,
          retryable,
          error,
          warnings,
          metadata,
          updated_at
        )
        values (
          ${pageStatusId},
          ${input.documentId},
          ${input.parsedContentId},
          ${input.jobId},
          ${page.pageNumber},
          ${page.status},
          ${page.reason},
          ${page.providerName},
          ${page.engine},
          ${page.modelVersion},
          ${page.confidenceAvg},
          ${page.blocks.length},
          ${page.attemptCount},
          ${page.retryable},
          ${page.error === null ? null : JSON.stringify(page.error)}::jsonb,
          ${JSON.stringify(page.warnings)}::jsonb,
          ${JSON.stringify({ source_artifact_id: page.artifactId ?? null })}::jsonb,
          ${input.completedAt}
        )
        on conflict (source_document_id, page_number) do update set
          parsed_content_id = excluded.parsed_content_id,
          job_id = excluded.job_id,
          status = excluded.status,
          reason = excluded.reason,
          provider_name = excluded.provider_name,
          engine = excluded.engine,
          model_version = excluded.model_version,
          confidence_avg = excluded.confidence_avg,
          block_count = excluded.block_count,
          attempt_count = excluded.attempt_count,
          retryable = excluded.retryable,
          error = excluded.error,
          warnings = excluded.warnings,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `.execute(this.db);

      for (const block of page.blocks) {
        const blockId = createOcrBlockId(input.documentId, page.pageNumber, block.blockIndex);

        await sql`
          insert into ocr_blocks (
            id,
            ocr_page_status_id,
            source_document_id,
            parsed_content_id,
            source_artifact_id,
            page_number,
            block_index,
            text,
            confidence,
            bbox,
            language,
            provider_name,
            engine,
            model_version,
            locator
          )
          values (
            ${blockId},
            ${pageStatusId},
            ${input.documentId},
            ${input.parsedContentId},
            ${page.artifactId ?? null},
            ${page.pageNumber},
            ${block.blockIndex},
            ${block.text},
            ${block.confidence ?? null},
            ${block.bbox === undefined ? null : JSON.stringify(block.bbox)}::jsonb,
            ${block.language ?? null},
            ${block.provider},
            ${block.engine},
            ${block.modelVersion ?? null},
            ${JSON.stringify({
              block_id: blockId,
              block_index: block.blockIndex,
              kind: "page",
              origin: "ocr",
              page_number: page.pageNumber,
              source_artifact_id: page.artifactId ?? null,
              value: String(page.pageNumber),
            })}::jsonb
          )
          on conflict (source_document_id, page_number, block_index) do update set
            ocr_page_status_id = excluded.ocr_page_status_id,
            parsed_content_id = excluded.parsed_content_id,
            source_artifact_id = excluded.source_artifact_id,
            text = excluded.text,
            confidence = excluded.confidence,
            bbox = excluded.bbox,
            language = excluded.language,
            provider_name = excluded.provider_name,
            engine = excluded.engine,
            model_version = excluded.model_version,
            locator = excluded.locator
        `.execute(this.db);
      }
    }

    await sql`
      update parsed_contents
      set
        normalized_markdown_object_key = ${input.normalizedMarkdownObjectKey},
        locators = ${JSON.stringify(input.locators)}::jsonb,
        ocr_status = ${input.ocrStatus},
        ocr_summary = ${JSON.stringify(input.summary)}::jsonb,
        ocr_warnings = ${JSON.stringify(input.warnings)}::jsonb,
        ocr_provider_metadata = ${JSON.stringify(input.providerMetadata)}::jsonb,
        ocr_page_count = ${input.pages.length},
        ocr_block_count = ${input.blockCount},
        ocr_derived_segment_count = ${input.blockCount},
        ocr_completed_at = ${input.completedAt}
      where id = ${input.parsedContentId}
    `.execute(this.db);
    await sql`
      update source_documents
      set
        ocr_status = ${input.ocrStatus},
        ocr_summary = ${JSON.stringify(input.summary)}::jsonb,
        updated_at = ${input.completedAt}
      where id = ${input.documentId}
    `.execute(this.db);
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

function createOcrPageStatusId(documentId: string, pageNumber: number) {
  return `ocrpg_${sanitizeIdSegment(documentId)}_${pageNumber}`;
}

function createOcrBlockId(documentId: string, pageNumber: number, blockIndex: number) {
  return `ocrblk_${sanitizeIdSegment(documentId)}_${pageNumber}_${blockIndex}`;
}

function sanitizeIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_");
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
