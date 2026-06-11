import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { sql, type Kysely } from "kysely";
import type { RuntimeConfig } from "@fococontext/core";
import type {
  ModelCallMetadataInput,
  ModelCallRecorder,
  ModelCallUsage,
  ResolvedDatasetPromptTemplate,
} from "@fococontext/llm";
import { resolveDatasetPromptTemplateFromSnapshot } from "@fococontext/llm";
import type { ObjectStorageAdapter } from "@fococontext/storage";
import { createMarkdownPreview, defaultParsedMarkdownPreviewMaxChars } from "./parsed-preview.js";

import type {
  WorkerJobProgressWriter,
  WorkerJobStateGuard,
} from "./job-progress.postgres-writer.js";
import type { DatabaseSchema } from "@fococontext/db";
import type {
  DatasetConfigurationSnapshotPayload,
  EnqueuedWikiCompileJob,
  WikiAnalyzeQueue,
} from "./wiki-compile.worker.js";

export const mediaCaptionQueueName = "media.caption";
export const mediaCaptionJobName = "media.caption.document";

export const visionCaptionPromptVersion = {
  id: "vision_caption@0.1.0",
  version: "0.1.0",
} as const;

export interface MediaCaptionPayload {
  job_id: string;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string;
  normalized_markdown_object_key: string;
  content_hash: string;
  input_snapshot_id: string;
  media_asset_ids: readonly string[];
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
}

export interface MediaCaptionQueue {
  enqueueMediaCaptionJob(payload: MediaCaptionPayload): Promise<EnqueuedWikiCompileJob>;
  close?(): Promise<void>;
}

export interface MediaCaptionQueueJob {
  name: string;
  data: MediaCaptionPayload;
}

export interface MediaCaptionAssetRecord {
  caption: string | null;
  caption_attempt_count: number;
  caption_cache_hit: boolean;
  caption_error: Record<string, unknown> | null;
  caption_model: string | null;
  caption_model_call_id: string | null;
  caption_prompt_version: string | null;
  caption_provider_name: string | null;
  caption_status: "not_configured" | "pending" | "generated" | "skipped" | "failed";
  document_id: string;
  height: number | null;
  id: string;
  locator: Record<string, unknown>;
  mime_type: string;
  object_key: string;
  parsed_content_id: string | null;
  sha256: string;
  width: number | null;
}

export interface MediaCaptionCacheLookupInput {
  imageHash: string;
  model: string;
  promptVersion: string;
  providerName: string;
}

export interface MediaCaptionCacheRecord {
  caption: string;
  usage?: ModelCallUsage;
}

export interface MediaCaptionCacheWriteInput extends MediaCaptionCacheLookupInput {
  caption: string;
  mimeType?: string;
  usage?: ModelCallUsage;
}

export interface MediaCaptionAssetPatch {
  caption?: string | null;
  caption_attempt_count?: number;
  caption_cache_hit?: boolean;
  caption_error?: Record<string, unknown> | null;
  caption_model?: string | null;
  caption_model_call_id?: string | null;
  caption_prompt_version?: string | null;
  caption_provider_name?: string | null;
  caption_status?: MediaCaptionAssetRecord["caption_status"];
}

export interface MediaCaptionRepository {
  listMediaAssetsByIds(ids: readonly string[]): Promise<MediaCaptionAssetRecord[]>;
  readCaptionCache(input: MediaCaptionCacheLookupInput): Promise<MediaCaptionCacheRecord | null>;
  upsertCaptionCache(input: MediaCaptionCacheWriteInput): Promise<void>;
  updateMediaAssetCaption(id: string, patch: MediaCaptionAssetPatch): Promise<void>;
  recordCaptionedMarkdownObjectKey?(
    parsedContentId: string,
    objectKey: string,
    preview?: {
      markdown_preview: string;
      markdown_preview_object_key: string;
      markdown_preview_truncated: boolean;
    },
  ): Promise<void>;
}

export interface VisionCaptionInput {
  image: {
    dataBase64: string;
    mediaType: string;
  };
  maxOutputTokens: number;
  prompt: string;
  timeoutMs: number;
}

export interface VisionCaptionProvider {
  caption(input: VisionCaptionInput): Promise<{
    caption?: string;
    content?: string;
    modelCallId?: string;
    usage?: ModelCallUsage;
  }>;
}

export interface MediaCaptionProcessorConfig {
  concurrency: number;
  contextChars: number;
  maxImageBytes: number;
  maxImagesPerDocument: number;
  maxMarkdownBytes: number;
  maxOutputTokens: number;
  model: string;
  previewMaxChars?: number;
  providerName: string;
  requestMaxRetries: number;
  retryBaseDelayMs: number;
  timeoutSeconds: number;
}

export interface MediaCaptionProcessorOptions {
  compileQueue: WikiAnalyzeQueue;
  config: MediaCaptionProcessorConfig;
  jobGuard?: WorkerJobStateGuard;
  jobProgress?: WorkerJobProgressWriter;
  modelCallRecorder?: ModelCallRecorder;
  objectStorage: ObjectStorageAdapter;
  repository: MediaCaptionRepository;
  sleep?: (milliseconds: number) => Promise<void>;
  visionProvider: VisionCaptionProvider;
}

class MediaCaptionStaleJobError extends Error {
  constructor(readonly reason: string) {
    super(`Media caption stopped because the ingest job is not runnable: ${reason}.`);
  }
}

export interface MediaCaptionProcessorResult {
  status: "completed" | "failed";
  should_continue: boolean;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string | null;
  cache_hit_count: number;
  failed_count: number;
  generated_count: number;
  provider_call_count: number;
  captioned_markdown_object_key: string | null;
}

export class BullMqMediaCaptionQueue implements MediaCaptionQueue {
  private readonly queue: Queue<MediaCaptionPayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<MediaCaptionPayload>(mediaCaptionQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: Math.max(1, (config.models.visionCaption?.requestMaxRetries ?? 2) + 1),
        backoff: {
          delay: config.limits.visionCaption.retryBaseDelayMs,
          type: "exponential",
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueMediaCaptionJob(payload: MediaCaptionPayload): Promise<EnqueuedWikiCompileJob> {
    await this.queue.add(mediaCaptionJobName, payload, {
      jobId: `${payload.job_id}-caption-${payload.parsed_content_id}`,
    });

    return {
      queue_name: mediaCaptionQueueName,
      job_name: mediaCaptionJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqMediaCaptionWorker {
  private readonly worker: Worker<MediaCaptionPayload>;

  constructor(config: RuntimeConfig, processor: MediaCaptionProcessor) {
    this.worker = new Worker<MediaCaptionPayload>(
      mediaCaptionQueueName,
      createMediaCaptionJobProcessor(processor),
      createMediaCaptionWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createMediaCaptionWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.visionCaption.concurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export class MediaCaptionProcessor {
  private readonly compileQueue: WikiAnalyzeQueue;
  private readonly config: MediaCaptionProcessorConfig;
  private readonly captionWorkLimiter: AsyncLimiter;
  private readonly jobGuard: WorkerJobStateGuard | undefined;
  private readonly jobProgress: WorkerJobProgressWriter | undefined;
  private readonly modelCallRecorder: ModelCallRecorder | undefined;
  private readonly objectStorage: ObjectStorageAdapter;
  private readonly repository: MediaCaptionRepository;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly visionProvider: VisionCaptionProvider;

  constructor(options: MediaCaptionProcessorOptions) {
    this.compileQueue = options.compileQueue;
    this.config = options.config;
    this.captionWorkLimiter = createAsyncLimiter(options.config.concurrency);
    this.jobGuard = options.jobGuard;
    this.jobProgress = options.jobProgress;
    this.modelCallRecorder = options.modelCallRecorder;
    this.objectStorage = options.objectStorage;
    this.repository = options.repository;
    this.sleep = options.sleep ?? sleepFor;
    this.visionProvider = options.visionProvider;
  }

  async process(payload: MediaCaptionPayload): Promise<MediaCaptionProcessorResult> {
    const guard = await this.jobGuard?.canContinueJob({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      sourceDocumentId: payload.document_id,
    });

    if (guard?.canContinue === false) {
      return {
        status: "failed",
        should_continue: false,
        knowledge_base_id: payload.knowledge_base_id,
        document_id: payload.document_id,
        parsed_content_id: payload.parsed_content_id,
        cache_hit_count: 0,
        failed_count: 0,
        generated_count: 0,
        provider_call_count: 0,
        captioned_markdown_object_key: null,
      };
    }

    const normalizedMarkdownRead = await this.readObjectTextWithinLimit(
      payload.normalized_markdown_object_key,
      this.config.maxMarkdownBytes,
    );

    if (normalizedMarkdownRead.kind === "fatal") {
      await this.markCaptioningFailed(payload, normalizedMarkdownRead.error);

      return this.createFailedResult(payload);
    }

    const normalizedMarkdown = normalizedMarkdownRead.text;
    const resolvedPrompt = resolveDatasetPromptTemplateFromSnapshot({
      purpose: "vision_caption",
      datasetConfigurationSnapshot: payload.dataset_configuration_snapshot,
    });
    const requestedAssets = await this.repository.listMediaAssetsByIds(payload.media_asset_ids);
    const eligibleAssets = requestedAssets.filter(isCaptionEligibleImage);
    const assets = eligibleAssets.slice(0, this.config.maxImagesPerDocument);
    const selectedAssetIds = new Set(assets.map((asset) => asset.id));
    const skippedAssets = requestedAssets.filter((asset) => !selectedAssetIds.has(asset.id));
    const beforeWriteGuard = await this.canContinue(payload);

    if (!beforeWriteGuard.canContinue) {
      return this.createStoppedResult(payload);
    }

    await this.markAssetsSkipped(skippedAssets);

    if (assets.length === 0) {
      await this.enqueueAnalyze(payload, payload.normalized_markdown_object_key, {
        caption_status: "skipped_no_eligible_media",
      });

      return this.createCompletedResult(payload, {
        cacheHitCount: 0,
        captionedObjectKey: null,
        failedCount: 0,
        generatedCount: 0,
        providerCallCount: 0,
      });
    }

    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "captioning",
      status: "running",
      progress: 35,
      message: "Captioning media assets...",
      parsedContentId: payload.parsed_content_id,
      metadata: {
        eligible_media_asset_count: assets.length,
        media_asset_ids: assets.map((asset) => asset.id),
      },
    });

    const captions: CaptionedMarkdownImage[] = [];
    let cacheHitCount = 0;
    let failedCount = 0;
    let generatedCount = 0;
    let providerCallCount = 0;
    const captionGroups = this.groupAssetsByCaptionCacheKey(assets, resolvedPrompt.prompt.id);
    const groupResults = await mapWithConcurrency(captionGroups, this.config.concurrency, (group) =>
      this.captionWorkLimiter(() =>
        this.processCaptionGroup(payload, group, normalizedMarkdown, resolvedPrompt),
      ),
    );

    for (const result of groupResults) {
      cacheHitCount += result.cacheHitCount;
      failedCount += result.failedCount;
      generatedCount += result.generatedCount;
      providerCallCount += result.providerCallCount;
      captions.push(...result.captions);
    }

    const afterCaptionGuard = await this.canContinue(payload);

    if (!afterCaptionGuard.canContinue) {
      return this.createStoppedResult(payload);
    }

    const captionedObjectKey =
      captions.length === 0
        ? null
        : createCaptionedMarkdownObjectKey(payload.normalized_markdown_object_key);

    if (captionedObjectKey !== null) {
      const captionedMarkdown = createCaptionEnrichedMarkdown(normalizedMarkdown, captions);

      await this.objectStorage.putObject({
        key: captionedObjectKey,
        body: Buffer.from(captionedMarkdown),
        contentType: "text/markdown",
        metadata: {
          documentId: payload.document_id,
          parsedContentId: payload.parsed_content_id,
        },
      });
      await this.repository.recordCaptionedMarkdownObjectKey?.(
        payload.parsed_content_id,
        captionedObjectKey,
        createMarkdownPreview(
          captionedMarkdown,
          captionedObjectKey,
          this.config.previewMaxChars ?? defaultParsedMarkdownPreviewMaxChars,
        ),
      );
    }

    await this.enqueueAnalyze(
      payload,
      captionedObjectKey ?? payload.normalized_markdown_object_key,
      {
        caption_cache_hit_count: cacheHitCount,
        caption_failed_count: failedCount,
        caption_generated_count: generatedCount,
        captioned_markdown_object_key: captionedObjectKey,
        provider_call_count: providerCallCount,
      },
    );

    return this.createCompletedResult(payload, {
      cacheHitCount,
      captionedObjectKey,
      failedCount,
      generatedCount,
      providerCallCount,
    });
  }

  private groupAssetsByCaptionCacheKey(
    assets: readonly MediaCaptionAssetRecord[],
    promptVersion: string,
  ): MediaCaptionAssetGroup[] {
    const groupsByKey = new Map<string, MediaCaptionAssetGroup>();

    for (const asset of assets) {
      const cacheKeyInput = this.createCacheKeyInput(asset, promptVersion);
      const cacheKey = createCaptionCacheKey(cacheKeyInput);
      const existing = groupsByKey.get(cacheKey);

      if (existing === undefined) {
        groupsByKey.set(cacheKey, {
          assets: [asset],
          cacheKeyInput,
        });
      } else {
        existing.assets.push(asset);
      }
    }

    return [...groupsByKey.values()];
  }

  private async processCaptionGroup(
    payload: MediaCaptionPayload,
    group: MediaCaptionAssetGroup,
    normalizedMarkdown: string,
    resolvedPrompt: ResolvedDatasetPromptTemplate,
  ): Promise<MediaCaptionGroupResult> {
    const cacheRecord = await this.repository.readCaptionCache(group.cacheKeyInput);

    if (cacheRecord !== null) {
      const guard = await this.canContinue(payload);

      if (!guard.canContinue) {
        return emptyCaptionGroupResult();
      }

      await Promise.all(
        group.assets.map((asset) =>
          this.markAssetGenerated(asset, cacheRecord.caption, {
            attemptCount: 0,
            cacheHit: true,
            modelCallId: null,
            promptVersion: resolvedPrompt.prompt.id,
          }),
        ),
      );

      return {
        cacheHitCount: group.assets.length,
        captions: group.assets.map((asset) => ({
          caption: cacheRecord.caption,
          mediaAssetId: asset.id,
          objectKey: asset.object_key,
        })),
        failedCount: 0,
        generatedCount: group.assets.length,
        providerCallCount: 0,
      };
    }

    const [primaryAsset, ...duplicateAssets] = group.assets;

    if (primaryAsset === undefined) {
      return emptyCaptionGroupResult();
    }

    try {
      const result = await this.captionAsset(
        payload,
        primaryAsset,
        normalizedMarkdown,
        resolvedPrompt,
      );
      const cacheWrite: MediaCaptionCacheWriteInput = {
        ...group.cacheKeyInput,
        caption: result.caption,
        mimeType: primaryAsset.mime_type,
      };

      if (result.usage !== undefined) {
        cacheWrite.usage = result.usage;
      }

      const guard = await this.canContinue(payload);

      if (!guard.canContinue) {
        return emptyCaptionGroupResult();
      }

      await this.repository.upsertCaptionCache(cacheWrite);
      await this.markAssetGenerated(primaryAsset, result.caption, {
        attemptCount: result.attemptCount,
        cacheHit: false,
        modelCallId: result.modelCallId,
        promptVersion: resolvedPrompt.prompt.id,
      });
      await Promise.all(
        duplicateAssets.map((asset) =>
          this.markAssetGenerated(asset, result.caption, {
            attemptCount: 0,
            cacheHit: true,
            modelCallId: null,
            promptVersion: resolvedPrompt.prompt.id,
          }),
        ),
      );

      return {
        cacheHitCount: duplicateAssets.length,
        captions: group.assets.map((asset) => ({
          caption: result.caption,
          mediaAssetId: asset.id,
          objectKey: asset.object_key,
        })),
        failedCount: 0,
        generatedCount: group.assets.length,
        providerCallCount: 1,
      };
    } catch (error) {
      if (error instanceof MediaCaptionStaleJobError) {
        return emptyCaptionGroupResult();
      }

      const modelCallId = error instanceof MediaCaptionProcessingError ? error.modelCallId : null;

      await Promise.all(
        group.assets.map((asset) =>
          this.markAssetFailed(asset, error, modelCallId, resolvedPrompt.prompt.id),
        ),
      );

      return {
        cacheHitCount: 0,
        captions: [],
        failedCount: group.assets.length,
        generatedCount: 0,
        providerCallCount: 1,
      };
    }
  }

  private async captionAsset(
    payload: MediaCaptionPayload,
    asset: MediaCaptionAssetRecord,
    normalizedMarkdown: string,
    resolvedPrompt: ResolvedDatasetPromptTemplate,
  ): Promise<{
    attemptCount: number;
    caption: string;
    modelCallId: string | null;
    usage?: ModelCallUsage;
  }> {
    const image = await this.objectStorage.getObject({ key: asset.object_key });
    const imageRead = await readBodyWithinLimit(
      image.body,
      image.contentLength,
      this.config.maxImageBytes,
      asset.object_key,
    );

    if (imageRead.kind === "fatal") {
      throw new Error(
        `Vision caption image read limit exceeded: ${imageRead.actualBytes}/${imageRead.limitBytes}.`,
      );
    }

    const imageBytes = imageRead.content;
    const context = sliceMarkdownImageContext(normalizedMarkdown, {
      contextChars: this.config.contextChars,
      objectKey: asset.object_key,
    });
    let attempt = 0;

    while (true) {
      attempt += 1;

      try {
        const result = await this.visionProvider.caption({
          image: {
            dataBase64: imageBytes.toString("base64"),
            mediaType: asset.mime_type,
          },
          maxOutputTokens: this.config.maxOutputTokens,
          prompt: [resolvedPrompt.prompt.template, createVisionCaptionPrompt(context)].join("\n\n"),
          timeoutMs: this.config.timeoutSeconds * 1000,
        });
        const normalized = normalizeVisionCaptionOutput(result.caption ?? result.content ?? "");

        if (normalized === null) {
          throw new Error("Vision caption output was empty.");
        }

        const guard = await this.canContinue(payload);

        if (!guard.canContinue) {
          throw new MediaCaptionStaleJobError(guard.reason ?? "unknown");
        }

        const modelCallInput: {
          attemptCount: number;
          outputStatus: "succeeded";
          outputSummary: string;
          usage?: ModelCallUsage;
        } = {
          attemptCount: attempt,
          outputStatus: "succeeded",
          outputSummary: normalized,
        };

        if (result.usage !== undefined) {
          modelCallInput.usage = result.usage;
        }

        const modelCall = await this.recordVisionCaptionModelCall(
          payload,
          asset,
          modelCallInput,
          resolvedPrompt,
        );
        const captionResult: {
          attemptCount: number;
          caption: string;
          modelCallId: string | null;
          usage?: ModelCallUsage;
        } = {
          attemptCount: attempt,
          caption: normalized,
          modelCallId: modelCall?.id ?? result.modelCallId ?? null,
        };

        if (result.usage !== undefined) {
          captionResult.usage = result.usage;
        }

        return captionResult;
      } catch (error) {
        if (error instanceof MediaCaptionStaleJobError) {
          throw error;
        }

        if (attempt > this.config.requestMaxRetries) {
          const modelCall = await this.recordVisionCaptionModelCall(
            payload,
            asset,
            {
              attemptCount: attempt,
              error,
              outputStatus: "failed",
              outputSummary: toSafeErrorMessage(error),
            },
            resolvedPrompt,
          );

          throw new MediaCaptionProcessingError(toSafeErrorMessage(error), modelCall?.id ?? null);
        }

        await this.sleep(this.config.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));
      }
    }
  }

  private createCacheKeyInput(
    asset: MediaCaptionAssetRecord,
    promptVersion: string,
  ): MediaCaptionCacheLookupInput {
    return {
      imageHash: asset.sha256,
      model: this.config.model,
      promptVersion,
      providerName: this.config.providerName,
    };
  }

  private async markAssetGenerated(
    asset: MediaCaptionAssetRecord,
    caption: string,
    options: {
      attemptCount: number;
      cacheHit: boolean;
      modelCallId: string | null;
      promptVersion: string;
    },
  ): Promise<void> {
    await this.repository.updateMediaAssetCaption(asset.id, {
      caption,
      caption_attempt_count: options.attemptCount,
      caption_cache_hit: options.cacheHit,
      caption_error: null,
      caption_model: this.config.model,
      caption_model_call_id: options.modelCallId,
      caption_prompt_version: options.promptVersion,
      caption_provider_name: this.config.providerName,
      caption_status: "generated",
    });
  }

  private async markAssetFailed(
    asset: MediaCaptionAssetRecord,
    error: unknown,
    modelCallId: string | null,
    promptVersion: string = visionCaptionPromptVersion.id,
  ): Promise<void> {
    await this.repository.updateMediaAssetCaption(asset.id, {
      caption: null,
      caption_attempt_count: this.config.requestMaxRetries + 1,
      caption_cache_hit: false,
      caption_error: {
        code: "vision_caption_failed",
        message: error instanceof Error ? error.message : "Vision caption failed.",
      },
      caption_model: this.config.model,
      caption_model_call_id: modelCallId,
      caption_prompt_version: promptVersion,
      caption_provider_name: this.config.providerName,
      caption_status: "failed",
    });
  }

  private async markAssetsSkipped(assets: readonly MediaCaptionAssetRecord[]): Promise<void> {
    await Promise.all(
      assets
        .filter((asset) => asset.caption_status === "pending")
        .map((asset) =>
          this.repository.updateMediaAssetCaption(asset.id, {
            caption: null,
            caption_attempt_count: 0,
            caption_cache_hit: false,
            caption_error: null,
            caption_model: null,
            caption_model_call_id: null,
            caption_prompt_version: null,
            caption_provider_name: null,
            caption_status: "skipped",
          }),
        ),
    );
  }

  private async enqueueAnalyze(
    payload: MediaCaptionPayload,
    normalizedMarkdownObjectKey: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const guard = await this.canContinue(payload);

    if (!guard.canContinue) {
      return;
    }

    await this.compileQueue.enqueueWikiAnalyzeJob({
      job_id: payload.job_id,
      knowledge_base_id: payload.knowledge_base_id,
      document_id: payload.document_id,
      parsed_content_id: payload.parsed_content_id,
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
      progress: 40,
      message: "Analyzing caption-enriched content...",
      parsedContentId: payload.parsed_content_id,
      metadata,
    });
  }

  private async canContinue(payload: MediaCaptionPayload): Promise<{
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

  private async readObjectTextWithinLimit(
    key: string,
    maxBytes: number,
  ): Promise<
    { kind: "success"; text: string } | { kind: "fatal"; error: Record<string, unknown> }
  > {
    const object = await this.objectStorage.getObject({ key });
    const body = await readBodyWithinLimit(object.body, object.contentLength, maxBytes, key);

    if (body.kind === "fatal") {
      return {
        kind: "fatal",
        error: {
          code: "media_caption_markdown_limit_exceeded",
          object_key: key,
          actual_bytes: body.actualBytes,
          limit_bytes: body.limitBytes,
        },
      };
    }

    return {
      kind: "success",
      text: body.content.toString("utf8"),
    };
  }

  private createCompletedResult(
    payload: MediaCaptionPayload,
    input: {
      cacheHitCount: number;
      captionedObjectKey: string | null;
      failedCount: number;
      generatedCount: number;
      providerCallCount: number;
    },
  ): MediaCaptionProcessorResult {
    return {
      status: "completed",
      should_continue: true,
      knowledge_base_id: payload.knowledge_base_id,
      document_id: payload.document_id,
      parsed_content_id: payload.parsed_content_id,
      cache_hit_count: input.cacheHitCount,
      failed_count: input.failedCount,
      generated_count: input.generatedCount,
      provider_call_count: input.providerCallCount,
      captioned_markdown_object_key: input.captionedObjectKey,
    };
  }

  private createStoppedResult(payload: MediaCaptionPayload): MediaCaptionProcessorResult {
    return {
      status: "failed",
      should_continue: false,
      knowledge_base_id: payload.knowledge_base_id,
      document_id: payload.document_id,
      parsed_content_id: payload.parsed_content_id,
      cache_hit_count: 0,
      failed_count: 0,
      generated_count: 0,
      provider_call_count: 0,
      captioned_markdown_object_key: null,
    };
  }

  private createFailedResult(payload: MediaCaptionPayload): MediaCaptionProcessorResult {
    return this.createStoppedResult(payload);
  }

  private async markCaptioningFailed(
    payload: MediaCaptionPayload,
    error: Record<string, unknown>,
  ): Promise<void> {
    await this.jobProgress?.updateJobProgress({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId: payload.input_snapshot_id,
      stage: "captioning",
      status: "failed",
      progress: 100,
      message: "Media captioning failed.",
      parsedContentId: payload.parsed_content_id,
      error,
    });
  }

  private async recordVisionCaptionModelCall(
    payload: MediaCaptionPayload,
    asset: MediaCaptionAssetRecord,
    input: {
      attemptCount: number;
      error?: unknown;
      outputStatus: "succeeded" | "failed";
      outputSummary?: string;
      usage?: ModelCallUsage;
    },
    resolvedPrompt: ResolvedDatasetPromptTemplate,
  ) {
    if (this.modelCallRecorder === undefined) {
      return null;
    }

    const recordInput: ModelCallMetadataInput = {
      providerName: this.config.providerName,
      model: this.config.model,
      promptVersion: resolvedPrompt.prompt.id,
      inputSummary: [
        `job_id=${payload.job_id}`,
        `knowledge_base_id=${payload.knowledge_base_id}`,
        `document_id=${payload.document_id}`,
        `parsed_content_id=${payload.parsed_content_id}`,
        `media_asset_id=${asset.id}`,
        `mime_type=${asset.mime_type}`,
        `image_hash=${asset.sha256}`,
        `attempt_count=${input.attemptCount}`,
      ].join(" "),
      outputStatus: input.outputStatus,
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      sourceDocumentId: payload.document_id,
      parsedContentId: payload.parsed_content_id,
      outputSummary: input.outputSummary ?? null,
      metadata: {
        media_asset_id: asset.id,
        prompt_template: resolvedPrompt.metadata,
        dataset_configuration_snapshot: payload.dataset_configuration_snapshot ?? null,
        caption_status: input.outputStatus === "succeeded" ? "generated" : "failed",
        attempt_count: input.attemptCount,
        error_message: input.error === undefined ? undefined : toSafeErrorMessage(input.error),
      },
    };

    if (input.usage !== undefined) {
      recordInput.usage = input.usage;
    }

    return this.modelCallRecorder.record(recordInput);
  }
}

export class PostgresMediaCaptionRepository implements MediaCaptionRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listMediaAssetsByIds(ids: readonly string[]): Promise<MediaCaptionAssetRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const result = await sql<MediaCaptionAssetRow>`
      select
        id,
        source_document_id,
        parsed_content_id,
        mime_type,
        object_key,
        hash,
        locator,
        width,
        height,
        caption_status,
        caption,
        caption_provider_name,
        caption_model,
        caption_prompt_version,
        caption_model_call_id,
        caption_cache_hit,
        caption_attempt_count,
        caption_error
      from media_assets
      where id = any(${ids}::text[])
      order by created_at asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      caption: row.caption,
      caption_attempt_count: row.caption_attempt_count,
      caption_cache_hit: row.caption_cache_hit,
      caption_error: row.caption_error === null ? null : toJsonObject(row.caption_error),
      caption_model: row.caption_model,
      caption_model_call_id: row.caption_model_call_id,
      caption_prompt_version: row.caption_prompt_version,
      caption_provider_name: row.caption_provider_name,
      caption_status: row.caption_status as MediaCaptionAssetRecord["caption_status"],
      document_id: row.source_document_id,
      height: row.height,
      id: row.id,
      locator: toJsonObject(row.locator),
      mime_type: row.mime_type,
      object_key: row.object_key,
      parsed_content_id: row.parsed_content_id,
      sha256: row.hash ?? "",
      width: row.width,
    }));
  }

  async readCaptionCache(
    input: MediaCaptionCacheLookupInput,
  ): Promise<MediaCaptionCacheRecord | null> {
    const result = await sql<{ caption: string; usage: unknown }>`
      select caption, usage
      from media_caption_cache
      where image_hash = ${input.imageHash}
        and provider_name = ${input.providerName}
        and model = ${input.model}
        and prompt_version = ${input.promptVersion}
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    const cacheRecord: MediaCaptionCacheRecord = {
      caption: row.caption,
    };

    const usage = toUsage(row.usage);

    if (usage !== undefined) {
      cacheRecord.usage = usage;
    }

    return cacheRecord;
  }

  async upsertCaptionCache(input: MediaCaptionCacheWriteInput): Promise<void> {
    await sql`
      insert into media_caption_cache (
        id,
        image_hash,
        provider_name,
        model,
        prompt_version,
        caption,
        mime_type,
        usage,
        updated_at
      )
      values (
        ${`mcap_${randomUUID().replaceAll("-", "")}`},
        ${input.imageHash},
        ${input.providerName},
        ${input.model},
        ${input.promptVersion},
        ${input.caption},
        ${input.mimeType ?? null},
        ${JSON.stringify(input.usage ?? {})}::jsonb,
        now()
      )
      on conflict (image_hash, provider_name, model, prompt_version) do update set
        caption = excluded.caption,
        mime_type = excluded.mime_type,
        usage = excluded.usage,
        updated_at = now()
    `.execute(this.db);
  }

  async updateMediaAssetCaption(id: string, patch: MediaCaptionAssetPatch): Promise<void> {
    const hasCaption = "caption" in patch;
    const hasCaptionError = "caption_error" in patch;

    await sql`
      update media_assets
      set
        caption = case when ${hasCaption} then ${patch.caption ?? null} else caption end,
        caption_status = coalesce(${patch.caption_status ?? null}, caption_status),
        caption_provider_name = coalesce(${patch.caption_provider_name ?? null}, caption_provider_name),
        caption_model = coalesce(${patch.caption_model ?? null}, caption_model),
        caption_prompt_version = coalesce(${patch.caption_prompt_version ?? null}, caption_prompt_version),
        caption_model_call_id = ${patch.caption_model_call_id ?? null},
        caption_cache_hit = coalesce(${patch.caption_cache_hit ?? null}, caption_cache_hit),
        caption_attempt_count = coalesce(${patch.caption_attempt_count ?? null}, caption_attempt_count),
        caption_error = case
          when ${hasCaptionError}
            then ${patch.caption_error === undefined ? null : JSON.stringify(patch.caption_error)}::jsonb
          else caption_error
        end,
        caption_generated_at = case
          when ${patch.caption_status ?? null} = 'generated' then now()
          else caption_generated_at
        end,
        updated_at = now()
      where id = ${id}
    `.execute(this.db);
  }

  async recordCaptionedMarkdownObjectKey(
    parsedContentId: string,
    objectKey: string,
    preview?: {
      markdown_preview: string;
      markdown_preview_object_key: string;
      markdown_preview_truncated: boolean;
    },
  ): Promise<void> {
    await sql`
      update parsed_contents
      set
        captioned_markdown_object_key = ${objectKey},
        markdown_preview = coalesce(${preview?.markdown_preview ?? null}, markdown_preview),
        markdown_preview_object_key = coalesce(
          ${preview?.markdown_preview_object_key ?? null},
          markdown_preview_object_key
        ),
        markdown_preview_truncated = coalesce(
          ${preview?.markdown_preview_truncated ?? null},
          markdown_preview_truncated
        ),
        captioned_at = now()
      where id = ${parsedContentId}
    `.execute(this.db);
  }
}

export function createMediaCaptionJobProcessor(
  processor: MediaCaptionProcessor,
): (job: MediaCaptionQueueJob) => Promise<MediaCaptionProcessorResult> {
  return async (job) => {
    if (job.name !== mediaCaptionJobName) {
      throw new Error(`Unsupported media.caption job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

export function createCaptionCacheKey(input: MediaCaptionCacheLookupInput): string {
  return [
    sanitizeCacheKeyPart(input.imageHash),
    sanitizeCacheKeyPart(input.providerName),
    sanitizeCacheKeyPart(input.model),
    sanitizeCacheKeyPart(input.promptVersion),
  ].join(":");
}

export function normalizeVisionCaptionOutput(value: string): string | null {
  const normalized = value
    .replace(/\*\*/gu, "")
    .replace(/`/gu, "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*[-*]\s+/u, "").trim())
    .filter(Boolean)
    .join("; ")
    .replace(/\s+/gu, " ")
    .trim();

  return normalized.length === 0 ? null : normalized.slice(0, 800);
}

export interface MarkdownImageContextInput {
  contextChars: number;
  objectKey: string;
}

export interface MarkdownImageContext {
  after: string;
  before: string;
}

export function sliceMarkdownImageContext(
  markdown: string,
  input: MarkdownImageContextInput,
): MarkdownImageContext {
  const match = findMarkdownImageReference(markdown, input.objectKey);

  if (match === null) {
    return {
      after: "",
      before: markdown.replace(/\s+/gu, " ").trim().slice(0, input.contextChars),
    };
  }

  return {
    before: markdown.slice(0, match.index).replace(/\s+/gu, " ").trim().slice(-input.contextChars),
    after: markdown
      .slice(match.index + match.length)
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, input.contextChars),
  };
}

export interface CaptionedMarkdownImage {
  caption: string;
  mediaAssetId?: string;
  objectKey: string;
}

export function createCaptionEnrichedMarkdown(
  normalizedMarkdown: string,
  captions: readonly CaptionedMarkdownImage[],
): string {
  const captionByObjectKey = new Map(captions.map((item) => [item.objectKey, item.caption]));

  return normalizedMarkdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, (match, _alt, url) => {
    const caption = captionByObjectKey.get(String(url));

    if (caption === undefined) {
      return match;
    }

    const imageReference = `![${escapeMarkdownAlt(caption)}](${String(url)})`;
    const mediaAssetId = captions.find((item) => item.objectKey === String(url))?.mediaAssetId;

    if (mediaAssetId === undefined) {
      return imageReference;
    }

    return [
      imageReference,
      `> Image evidence: ${escapeMarkdownAlt(caption)} (media_asset_id: ${mediaAssetId}; object_key: ${String(url)})`,
    ].join("\n");
  });
}

function createVisionCaptionPrompt(context: MarkdownImageContext): string {
  return [
    "Describe the image for a source-grounded developer documentation wiki.",
    "Only state visible facts. Include visible text, labels, chart axes, values, and diagram structure when present.",
    "Do not speculate. Return one concise plain-text caption.",
    context.before.length === 0 ? "" : `Text before image: ${context.before}`,
    context.after.length === 0 ? "" : `Text after image: ${context.after}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function findMarkdownImageReference(
  markdown: string,
  objectKey: string,
): { index: number; length: number } | null {
  const regex = /!\[[^\]]*\]\(([^)]+)\)/gu;
  let match = regex.exec(markdown);

  while (match !== null) {
    if (match[1] === objectKey) {
      return {
        index: match.index,
        length: match[0].length,
      };
    }

    match = regex.exec(markdown);
  }

  return null;
}

function createCaptionedMarkdownObjectKey(normalizedMarkdownObjectKey: string): string {
  return normalizedMarkdownObjectKey.replace(/\/?normalized\.md$/u, "/captioned.md");
}

function isCaptionEligibleImage(asset: MediaCaptionAssetRecord): boolean {
  return (
    asset.mime_type.startsWith("image/") &&
    asset.sha256.length > 0 &&
    typeof asset.width === "number" &&
    asset.width > 0 &&
    typeof asset.height === "number" &&
    asset.height > 0
  );
}

function escapeMarkdownAlt(value: string): string {
  return value
    .replace(/[\]\n\r[]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function sanitizeCacheKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class MediaCaptionProcessingError extends Error {
  constructor(
    message: string,
    readonly modelCallId: string | null,
  ) {
    super(message);
  }
}

function toSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Vision caption failed.";

  return message
    .replace(/authorization\s*:\s*bearer\s+[^\s,;]+/giu, "Authorization: Bearer [redacted]")
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/api[_-]?key\s*[:=]\s*[^\s,;]+/giu, "api_key=[redacted]");
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toUsage(value: unknown): ModelCallUsage | undefined {
  const object = toJsonObject(value);
  const usage: ModelCallUsage = {};

  if (typeof object.inputTokens === "number") {
    usage.inputTokens = object.inputTokens;
  }
  if (typeof object.outputTokens === "number") {
    usage.outputTokens = object.outputTokens;
  }
  if (typeof object.totalTokens === "number") {
    usage.totalTokens = object.totalTokens;
  }

  return Object.keys(usage).length === 0 ? undefined : usage;
}

async function readBodyWithinLimit(
  body: unknown,
  contentLength: number | undefined,
  maxBytes: number,
  objectKey: string,
): Promise<
  | { kind: "success"; content: Buffer }
  | { kind: "fatal"; objectKey: string; actualBytes: number; limitBytes: number }
> {
  if (contentLength !== undefined && contentLength > maxBytes) {
    return {
      kind: "fatal",
      objectKey,
      actualBytes: contentLength,
      limitBytes: maxBytes,
    };
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      return {
        kind: "fatal",
        objectKey,
        actualBytes: totalBytes,
        limitBytes: maxBytes,
      };
    }

    chunks.push(buffer);
  }

  return {
    kind: "success",
    content: Buffer.concat(chunks, totalBytes),
  };
}

type AsyncLimiter = <T>(task: () => Promise<T>) => Promise<T>;

interface MediaCaptionAssetGroup {
  assets: MediaCaptionAssetRecord[];
  cacheKeyInput: MediaCaptionCacheLookupInput;
}

interface MediaCaptionGroupResult {
  cacheHitCount: number;
  captions: CaptionedMarkdownImage[];
  failedCount: number;
  generatedCount: number;
  providerCallCount: number;
}

function emptyCaptionGroupResult(): MediaCaptionGroupResult {
  return {
    cacheHitCount: 0,
    captions: [],
    failedCount: 0,
    generatedCount: 0,
    providerCallCount: 0,
  };
}

function createAsyncLimiter(concurrency: number): AsyncLimiter {
  const maxActive = Math.max(1, Math.floor(concurrency));
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const runNext = (): void => {
    if (activeCount >= maxActive) {
      return;
    }

    const next = queue.shift();

    if (next === undefined) {
      return;
    }

    activeCount += 1;
    next();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      runNext();
    });

    try {
      return await task();
    } finally {
      activeCount -= 1;
      runNext();
    }
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        const item = items[index] as T;

        nextIndex += 1;
        results[index] = await mapper(item, index);
      }
    }),
  );

  return results;
}

interface MediaCaptionAssetRow {
  caption: string | null;
  caption_attempt_count: number;
  caption_cache_hit: boolean;
  caption_error: unknown;
  caption_model: string | null;
  caption_model_call_id: string | null;
  caption_prompt_version: string | null;
  caption_provider_name: string | null;
  caption_status: string;
  hash: string | null;
  height: number | null;
  id: string;
  locator: unknown;
  mime_type: string;
  object_key: string;
  parsed_content_id: string | null;
  source_document_id: string;
  width: number | null;
}
