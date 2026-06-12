import { rmSync, writeFileSync } from "node:fs";

import { Queue } from "bullmq";
import { loadRuntimeConfig } from "@fococontext/core";
import type { RuntimeConfig } from "@fococontext/core";
import {
  createPostgresBackgroundOperationCheckpointRepository,
  createPostgresCompileArtifactRepository,
  createPostgresDatabase,
  requireKnowledgeBaseTenantProject,
} from "@fococontext/db";
import {
  createOpenAICompatibleChatProvider,
  createOpenAICompatibleVisionCaptionProvider,
  resolveModelProviderProfiles,
} from "@fococontext/llm";
import { createS3ObjectStorageAdapter } from "@fococontext/storage";
import { createRapidOcrProvider, type ParserLimitConfig } from "@fococontext/parsers";

import { PostgresWorkerJobProgressWriter } from "./job-progress.postgres-writer.js";
import {
  BullMqDeletionCleanupWorker,
  PostgresDeletionCleanupDatabaseCleaner,
  DeletionCleanupProcessor,
  deletionCleanupQueueName,
  PostgresDeletionCleanupManifestPlanner,
  PostgresDeletionCleanupRepository,
  PostgresDeletionCleanupTargetGuard,
} from "./deletion-cleanup.worker.js";
import { PostgresModelCallRecorder } from "./model-call.postgres-recorder.js";
import { createRedisObjectStorageOperationRecorder } from "./redis-object-storage-operation-recorder.js";
import { createRedisRuntimeQueuePressureRecorder } from "./redis-runtime-queue-pressure.js";
import { PostgresSourceParseWriter } from "./source-parse.postgres-writer.js";
import {
  BullMqKnowledgeCheckWorker,
  KnowledgeCheckProcessor,
  knowledgeCheckQueueName,
  PostgresKnowledgeCheckStore,
} from "./knowledge-check.worker.js";
import {
  BullMqGraphInsightsRefreshWorker,
  graphInsightsRefreshQueueName,
  PostgresGraphInsightsRefreshProcessor,
} from "./graph-insights-refresh.worker.js";
import {
  BullMqReindexWorker,
  createPostgresReindexProcessor,
  reindexQueueName,
} from "./reindex.worker.js";
import {
  BullMqMediaCaptionQueue,
  BullMqMediaCaptionWorker,
  MediaCaptionProcessor,
  PostgresMediaCaptionRepository,
} from "./media-caption.worker.js";
import {
  BullMqSourceParseWorker,
  SourceParseProcessor,
  type SourceOcrQueue,
} from "./source-parse.worker.js";
import {
  BullMqSourceOcrQueue,
  BullMqSourceOcrWorker,
  PostgresSourceOcrRepository,
  SourceOcrProcessor,
} from "./source-ocr.worker.js";
import {
  BullMqWebhookDispatchWorker,
  PostgresWebhookEventEmitter,
  PostgresWebhookDispatchProcessor,
  type WebhookDispatchPayload,
  webhookDispatchQueueName,
} from "./webhook-dispatch.worker.js";
import {
  OpenAICompatiblePageEmbeddingIndexer,
  PostgresWikiMergeApplier,
  PostgresWikiCompileContextReader,
  WikiAnalyzeProcessorService,
  WikiGenerateProcessorService,
  WikiMergeProcessorService,
} from "./wiki-compile.processors.js";
import {
  BullMqWikiAnalyzeQueue,
  BullMqWikiAnalyzeWorker,
  BullMqWikiGenerateQueue,
  BullMqWikiGenerateWorker,
  BullMqWikiMergeQueue,
  BullMqWikiMergeWorker,
} from "./wiki-compile.worker.js";

const WORKER_READY_FILE = "/tmp/fococontext-worker-ready";

async function main(): Promise<void> {
  const config = loadRuntimeConfig(process.env);

  const db = createPostgresDatabase(config.database.url);
  const webhookEventEmitter = config.webhook.delivery.enabled
    ? new PostgresWebhookEventEmitter(db, config)
    : undefined;
  const queuePressureRecorder = createRedisRuntimeQueuePressureRecorder(config);
  const objectStorageOperationRecorder = createRedisObjectStorageOperationRecorder(config);
  const objectStorage = createS3ObjectStorageAdapter(config.storage, {
    instrumentation: {
      caller: "worker.object_storage",
      enabled: config.limits.objectStorageOperations.metricsEnabled,
      recorder: objectStorageOperationRecorder,
      scope: "system",
    },
    multipartPartSizeBytes: config.limits.objectStorageOperations.multipartPartSizeBytes,
  });
  const artifactRepository = createPostgresCompileArtifactRepository(db);
  const backgroundOperationCheckpoints = createPostgresBackgroundOperationCheckpointRepository(db);
  const modelCallRecorder = new PostgresModelCallRecorder(artifactRepository);
  const modelProfiles = resolveModelProviderProfiles(config.models);
  const chatProvider = createOpenAICompatibleChatProvider(modelProfiles.chat);
  const jobProgress = new PostgresWorkerJobProgressWriter(
    db,
    webhookEventEmitter,
    queuePressureRecorder,
  );
  const contextReader = new PostgresWikiCompileContextReader(db);
  const pageEmbeddingIndexer = new OpenAICompatiblePageEmbeddingIndexer(
    db,
    config.models.embedding,
  );
  const mergeApplier = new PostgresWikiMergeApplier(db, undefined, pageEmbeddingIndexer, {
    graphInsightBatchSize: config.limits.backgroundJobs.graphInsights.batchSize,
  });
  const wikiAnalyzeQueue = new BullMqWikiAnalyzeQueue(config);
  const wikiGenerateQueue = new BullMqWikiGenerateQueue(config);
  const wikiMergeQueue = new BullMqWikiMergeQueue(config);
  const deletionCleanupWorker = new BullMqDeletionCleanupWorker(
    config,
    new DeletionCleanupProcessor({
      repository: new PostgresDeletionCleanupRepository(db),
      databaseCleanup: new PostgresDeletionCleanupDatabaseCleaner(db),
      checkpointRepository: backgroundOperationCheckpoints,
      manifestPlanner: new PostgresDeletionCleanupManifestPlanner(db),
      targetGuard: new PostgresDeletionCleanupTargetGuard(db),
      ...(webhookEventEmitter === undefined ? {} : { webhookEvents: webhookEventEmitter }),
      objectStorage,
      objectBatchSize: config.limits.backgroundJobs.cleanup.batchSize,
    }),
  );
  const knowledgeCheckWorker = new BullMqKnowledgeCheckWorker(
    config,
    new KnowledgeCheckProcessor(new PostgresKnowledgeCheckStore(db), {
      batchSize: config.limits.backgroundJobs.knowledgeCheck.batchSize,
      checkpointRepository: backgroundOperationCheckpoints,
      ...(webhookEventEmitter === undefined ? {} : { webhookEvents: webhookEventEmitter }),
    }),
  );
  const mediaCaptionQueue =
    modelProfiles.visionCaption === undefined ? undefined : new BullMqMediaCaptionQueue(config);
  const sourceOcrQueue =
    config.ocr.enabled && config.ocr.serviceBaseUrl !== undefined
      ? new BullMqSourceOcrQueue(config)
      : createDisabledSourceOcrQueue(config);
  const mediaCaptionWorker =
    modelProfiles.visionCaption === undefined
      ? undefined
      : new BullMqMediaCaptionWorker(
          config,
          new MediaCaptionProcessor({
            compileQueue: wikiAnalyzeQueue,
            config: {
              checkpointInterval: config.limits.residualMemory.mediaCaption.checkpointInterval,
              concurrency: config.limits.visionCaption.imageConcurrency,
              contextChars: config.limits.visionCaption.contextChars,
              maxImageBytes: config.limits.parser.maxImageBytes,
              maxImagesPerDocument: config.limits.visionCaption.maxImagesPerDocument,
              maxMarkdownBytes: config.limits.parser.maxFileSizeMb * 1024 * 1024,
              maxOutputTokens: config.limits.visionCaption.maxOutputTokens,
              model: modelProfiles.visionCaption.model,
              previewMaxChars: config.limits.objectStorageOperations.previewMaxChars,
              providerName: modelProfiles.visionCaption.providerName,
              requestMaxRetries: modelProfiles.visionCaption.requestMaxRetries,
              retryBaseDelayMs: config.limits.visionCaption.retryBaseDelayMs,
              timeoutSeconds: config.limits.visionCaption.timeoutSeconds,
              windowSize: config.limits.residualMemory.mediaCaption.windowSize,
            },
            jobGuard: jobProgress,
            jobProgress,
            modelCallRecorder,
            objectStorage,
            repository: new PostgresMediaCaptionRepository(db),
            visionProvider: createOpenAICompatibleVisionCaptionProvider(
              modelProfiles.visionCaption,
            ),
          }),
        );
  const sourceParseWorker = new BullMqSourceParseWorker(
    config,
    new SourceParseProcessor({
      ocrQueue: sourceOcrQueue,
      ...(mediaCaptionQueue === undefined ? {} : { captionQueue: mediaCaptionQueue }),
      compileQueue: wikiAnalyzeQueue,
      jobGuard: jobProgress,
      jobProgress,
      objectStorage,
      parserLimits: createParserLimitConfig(config.limits.parser),
      mediaAssetUploadConcurrency: config.limits.parser.mediaUploadConcurrency,
      previewMaxChars: config.limits.objectStorageOperations.previewMaxChars,
      writer: new PostgresSourceParseWriter(db),
    }),
  );
  const sourceOcrWorker =
    config.ocr.enabled && config.ocr.serviceBaseUrl !== undefined
      ? new BullMqSourceOcrWorker(
          config,
          new SourceOcrProcessor({
            ...(mediaCaptionQueue === undefined ? {} : { captionQueue: mediaCaptionQueue }),
            compileQueue: wikiAnalyzeQueue,
            config: {
              concurrency: config.limits.ocr.pageConcurrency,
              checkpointInterval: config.limits.residualMemory.ocr.checkpointInterval,
              confidenceThreshold: config.limits.ocr.confidenceThreshold,
              languages: config.ocr.languages,
              maxObjectBytes: config.limits.parser.maxFileSizeMb * 1024 * 1024,
              maxPagePixels: config.limits.ocr.maxPagePixels,
              maxPagesPerDocument: config.limits.ocr.maxPagesPerDocument,
              maxRetries: config.limits.ocr.maxRetries,
              pageDpi: config.limits.ocr.pageDpi,
              retryBaseDelayMs: config.limits.ocr.retryBaseDelayMs,
              storePageImages: config.limits.ocr.storePageImages,
              timeoutSeconds: config.limits.ocr.timeoutSeconds,
              windowSize: config.limits.residualMemory.ocr.windowSize,
            },
            jobGuard: jobProgress,
            jobProgress,
            objectStorage,
            ocrProvider: createRapidOcrProvider({
              baseUrl: config.ocr.serviceBaseUrl,
              confidenceThreshold: config.limits.ocr.confidenceThreshold,
              timeoutSeconds: config.limits.ocr.timeoutSeconds,
              ...(config.ocr.serviceApiKey === undefined
                ? {}
                : { apiKey: config.ocr.serviceApiKey }),
            }),
            repository: new PostgresSourceOcrRepository(db, {
              writeBatchSize: config.limits.backgroundJobs.ocr.batchSize,
            }),
          }),
        )
      : undefined;
  const wikiAnalyzeWorker = new BullMqWikiAnalyzeWorker(
    config,
    new WikiAnalyzeProcessorService({
      artifactRepository,
      chatProvider,
      contextReader,
      generateQueue: wikiGenerateQueue,
      jobGuard: jobProgress,
      jobProgress,
      maxParsedMarkdownBytes: config.limits.parser.maxFileSizeMb * 1024 * 1024,
      objectStorage,
      promptLimits: config.limits.compile,
    }),
  );
  const wikiGenerateWorker = new BullMqWikiGenerateWorker(
    config,
    new WikiGenerateProcessorService({
      artifactRepository,
      chatProvider,
      jobGuard: jobProgress,
      jobProgress,
      mergeQueue: wikiMergeQueue,
      promptLimits: config.limits.compile,
    }),
  );
  const wikiMergeWorker = new BullMqWikiMergeWorker(
    config,
    new WikiMergeProcessorService({
      applier: mergeApplier,
      artifactRepository,
      jobGuard: jobProgress,
      jobProgress,
    }),
  );
  const graphInsightsRefreshWorker = new BullMqGraphInsightsRefreshWorker(
    config,
    new PostgresGraphInsightsRefreshProcessor(mergeApplier, {
      checkpointRepository: backgroundOperationCheckpoints,
      resolveKnowledgeBaseScope: (knowledgeBaseId) =>
        requireKnowledgeBaseTenantProject(db, knowledgeBaseId),
    }),
  );
  const reindexWorker = new BullMqReindexWorker(
    config,
    createPostgresReindexProcessor({
      checkpointRepository: backgroundOperationCheckpoints,
      config,
      db,
      jobGuard: jobProgress,
      jobProgress,
    }),
  );
  const webhookRetryQueue = config.webhook.delivery.enabled
    ? new Queue(webhookDispatchQueueName, {
        connection: {
          url: config.redis.url,
        },
      })
    : undefined;
  const webhookDispatchWorker = config.webhook.delivery.enabled
    ? new BullMqWebhookDispatchWorker(
        config,
        new PostgresWebhookDispatchProcessor(
          db,
          undefined,
          webhookRetryQueue as Queue<WebhookDispatchPayload>,
        ),
      )
    : undefined;
  const closables = [
    sourceParseWorker,
    sourceOcrQueue,
    ...(mediaCaptionQueue === undefined ? [] : [mediaCaptionQueue]),
    wikiAnalyzeQueue,
    wikiGenerateQueue,
    wikiMergeQueue,
    ...(mediaCaptionWorker === undefined ? [] : [mediaCaptionWorker]),
    ...(sourceOcrWorker === undefined ? [] : [sourceOcrWorker]),
    deletionCleanupWorker,
    knowledgeCheckWorker,
    graphInsightsRefreshWorker,
    reindexWorker,
    wikiAnalyzeWorker,
    wikiGenerateWorker,
    wikiMergeWorker,
    ...(webhookDispatchWorker === undefined ? [] : [webhookDispatchWorker]),
    ...(webhookEventEmitter === undefined ? [] : [webhookEventEmitter]),
    ...(webhookRetryQueue === undefined ? [] : [webhookRetryQueue]),
    queuePressureRecorder,
    objectStorageOperationRecorder,
  ];

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`Received ${signal}; shutting down FocoContext worker runtime.`);
    rmSync(WORKER_READY_FILE, { force: true });
    await Promise.all(closables.map((worker) => worker.close?.()));
    await db.destroy();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  writeFileSync(WORKER_READY_FILE, "ready\n", "utf8");
  console.log(
    `FocoContext worker runtime started with ${deletionCleanupQueueName}, ${knowledgeCheckQueueName}, ${graphInsightsRefreshQueueName}, ${reindexQueueName}, ${webhookDispatchQueueName}.`,
  );
}

main().catch((error: unknown) => {
  rmSync(WORKER_READY_FILE, { force: true });
  console.error("Failed to start FocoContext worker runtime.", error);
  process.exitCode = 1;
});

function createDisabledSourceOcrQueue(config: RuntimeConfig): SourceOcrQueue {
  return {
    enabled: false,
    maxPagesPerDocument: config.limits.ocr.maxPagesPerDocument,
    minTextCharsPerPage: config.limits.ocr.minTextCharsPerPage,
    async enqueueSourceOcrJob() {
      throw new Error("source.ocr queue is disabled.");
    },
    async close() {
      return undefined;
    },
  };
}

function createParserLimitConfig(config: RuntimeConfig["limits"]["parser"]): ParserLimitConfig {
  const maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;

  return {
    maxFileSizeBytes,
    timeoutMs: config.timeoutSeconds * 1000,
    zip: {
      maxEntries: config.maxZipEntries,
      maxExpandedBytes: config.maxZipExpandedMb * 1024 * 1024,
      maxEntryBytes: config.maxZipEntryMb * 1024 * 1024,
    },
    images: {
      maxImagesPerDocument: config.maxImagesPerDocument,
      maxRenderedSnapshotsPerDocument: config.maxRenderedSnapshotsPerDocument,
      maxPixelsPerAsset: config.maxImagePixels,
      maxAssetBytes: config.maxImageBytes,
      minWidth: config.minImageWidth,
      minHeight: config.minImageHeight,
      visualExtractionConcurrency: config.visualExtractionConcurrency,
      remoteFetchingEnabled: config.remoteImageFetchingEnabled,
      pdfSnapshotMinTextChars: config.pdfSnapshotMinTextChars,
    },
  };
}
