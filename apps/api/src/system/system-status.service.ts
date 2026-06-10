import { Injectable } from "@nestjs/common";
import {
  maskSecret,
  snapshotRuntimeCacheMetrics,
  type ReleaseMetadata,
  type RuntimeConfig,
} from "@fococontext/core";
import { openApiDocument } from "@fococontext/contracts";
import { getOrderedSqlMigrations, type DefaultIdentitySeed } from "@fococontext/db";
import {
  defaultObjectStorageOperationRecorder,
  type ObjectStorageOperationClass,
  type ObjectStorageOperationRecord,
  type ObjectStorageOperationStatus,
} from "@fococontext/storage";

import type { DeletionCleanupRepository } from "../deletion-cleanup/deletion-cleanup.repository.js";
import type { DocumentRepository } from "../documents/document.repository.js";
import type {
  JobEventRecord,
  JobRecord,
  JobStage,
  JobStatus,
} from "../documents/document.types.js";
import type { UploadAdmissionService } from "../documents/upload-admission.service.js";
import { snapshotRetrievalQualityMetrics } from "../retrieve/retrieve-quality-metrics.js";
import { snapshotRuntimeApiMetrics } from "../runtime/runtime-api-metrics.js";

@Injectable()
export class SystemStatusService {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly defaultIdentity?: DefaultIdentitySeed,
    private readonly deletionCleanupRepository?: DeletionCleanupRepository,
    private readonly uploadAdmissionService?: UploadAdmissionService,
    private readonly documentRepository?: DocumentRepository,
  ) {}

  async getHealthStatus() {
    return {
      status: "ready",
      runtime: this.getRuntimeStatus(),
      dependencies: await this.getDependencyStatus(),
      limits: this.getRuntimeLimits(),
    };
  }

  async getSettingsStatus() {
    return {
      runtime: this.getRuntimeStatus(),
      admin: {
        username: this.config.admin.username,
        passwordConfigured: isConfigured(this.config.admin.password),
        lastSignIn: null,
      },
      apiAccess: {
        status: statusOf(this.config.auth.apiKey),
        maskedKey: maskSecret(this.config.auth.apiKey),
        authMode: "env_api_key",
        apiBaseUrl: this.getApiBaseUrl(),
        management: {
          supported: false,
          boundary: "v0.2",
          supported_operations: [],
        },
      },
      models: this.getModelStatus(),
      storage: this.getStorageStatus(),
      dependencies: await this.getDependencyStatus(),
      limits: this.getRuntimeLimits(),
    };
  }

  private getRuntimeStatus() {
    return {
      version: this.config.release.version,
      release: this.config.release,
      apiContractVersion: openApiDocument.info.version,
      apiPort: this.config.api.port,
      adminPort: this.config.admin.port,
      apiBaseUrl: this.getApiBaseUrl(),
      adminBaseUrl: this.getAdminBaseUrl(),
      defaultContext: this.getDefaultContextStatus(),
    };
  }

  private getDefaultContextStatus() {
    if (this.defaultIdentity === undefined) {
      return {
        status: "pending_seed",
      };
    }

    return {
      status: "seeded",
      tenantId: this.defaultIdentity.tenant.id,
      accountId: this.defaultIdentity.account.id,
      projectId: this.defaultIdentity.project.id,
    };
  }

  private getApiBaseUrl(): string {
    return this.config.api.publicBaseUrl ?? `http://localhost:${this.config.api.port}/v1`;
  }

  private getAdminBaseUrl(): string {
    return this.config.admin.publicBaseUrl ?? `http://localhost:${this.config.admin.port}`;
  }

  private async getDependencyStatus() {
    return {
      database: {
        status: statusOf(this.config.database.url),
      },
      redis: {
        status: statusOf(this.config.redis.url),
      },
      objectStorage: {
        status: statusOf(this.config.storage.bucket),
        providerName: this.config.storage.providerName,
      },
      worker: {
        status: this.getWorkerStatus(),
        release: this.getServiceReleaseMetadata("worker"),
        compileRuntime: this.getCompileRuntimeStatus(),
      },
      queue: {
        status: "configured",
        concurrency: this.config.limits.queue.concurrency,
      },
      upload: this.getUploadRuntimeStatus(),
      pressure: this.getPressureStatus(),
      metrics: this.getRuntimeMetricsStatus(),
      migration: this.getMigrationRuntimeStatus(),
      cleanupQueue: this.getCleanupQueueStatus(),
      ocr: await this.getOcrRuntimeStatus(),
      sourceWatch: this.getSourceWatchRuntimeStatus(),
    };
  }

  private getModelStatus() {
    return {
      chat: {
        status: statusOf(this.config.models.chat.apiKey),
        providerName: this.config.models.chat.providerName,
        baseUrl: maskEndpoint(this.config.models.chat.baseUrl),
        apiKeyStatus: statusOf(this.config.models.chat.apiKey),
        defaultModel: this.config.models.chat.defaultModel,
        analysisModel: this.config.models.chat.analysisModel,
        generationModel: this.config.models.chat.generationModel,
        mergeModel: this.config.models.chat.mergeModel,
        requestMaxRetries: this.config.models.chat.requestMaxRetries,
      },
      embedding: {
        status: statusOf(this.config.models.embedding.apiKey),
        providerName: this.config.models.embedding.providerName,
        baseUrl: maskEndpoint(this.config.models.embedding.baseUrl),
        apiKeyStatus: statusOf(this.config.models.embedding.apiKey),
        model: this.config.models.embedding.model,
        dimensions: this.config.models.embedding.dimensions,
      },
      rerank:
        this.config.models.rerank === undefined
          ? {
              status: "optional_missing",
            }
          : {
              status: statusOf(this.config.models.rerank.apiKey),
              providerName: this.config.models.rerank.providerName,
              baseUrl: maskEndpoint(this.config.models.rerank.baseUrl),
              apiKeyStatus: statusOf(this.config.models.rerank.apiKey),
              model: this.config.models.rerank.model,
            },
      visionCaption:
        this.config.models.visionCaption === undefined
          ? {
              status: "disabled",
            }
          : {
              status: statusOf(this.config.models.visionCaption.apiKey),
              providerName: this.config.models.visionCaption.providerName,
              baseUrl: maskEndpoint(this.config.models.visionCaption.baseUrl),
              apiKeyStatus: statusOf(this.config.models.visionCaption.apiKey),
              model: this.config.models.visionCaption.model,
              requestMaxRetries: this.config.models.visionCaption.requestMaxRetries,
            },
    };
  }

  private getStorageStatus() {
    return {
      status: statusOf(this.config.storage.bucket),
      providerName: this.config.storage.providerName,
      endpoint: maskEndpoint(this.config.storage.endpoint),
      bucket: this.config.storage.bucket,
      region: this.config.storage.region,
      forcePathStyle: this.config.storage.forcePathStyle,
      accessKeyStatus: statusOf(this.config.storage.accessKeyId),
      secretKeyStatus: statusOf(this.config.storage.secretAccessKey),
      publicBaseUrl: this.config.storage.publicBaseUrl ?? null,
    };
  }

  private getRuntimeLimits() {
    const uploadRuntimeStatus = this.getUploadRuntimeStatus();

    return {
      upload: {
        ...this.config.limits.upload,
        directUpload: uploadRuntimeStatus.directUpload,
        runtime: uploadRuntimeStatus,
      },
      parser: this.config.limits.parser,
      visionCaption: this.config.limits.visionCaption,
      ocr: this.config.limits.ocr,
      deletionCleanup: this.config.limits.deletionCleanup,
      pressure: this.config.limits.pressure,
      queue: this.config.limits.queue,
      apiFanOut: this.config.limits.apiFanOut,
      effectiveConcurrency: this.config.limits.effectiveConcurrency,
      compile: this.config.limits.compile,
      retrieve: this.config.limits.retrieve,
      sourceEvidence: this.config.limits.sourceEvidence,
      cors: this.config.cors,
      webhook: {
        secretStatus: this.config.webhook.secretConfigured ? "configured" : "missing",
        maskedSecret: this.config.webhook.maskedSecret,
        deliveryReadiness: this.config.webhook.delivery.enabled ? "enabled" : "disabled",
        delivery: this.config.limits.webhookDelivery,
      },
      sourceWatch: this.getSourceWatchRuntimeStatus(),
      objectStorageOperations: this.config.limits.objectStorageOperations,
    };
  }

  private getRuntimeMetricsStatus() {
    const sourceJobs = summarizeSourceJobs(
      this.documentRepository?.listAllJobs() ?? [],
      this.documentRepository?.listAllJobEvents() ?? [],
    );
    const objectStorageOperations = summarizeObjectStorageOperations(
      defaultObjectStorageOperationRecorder.snapshot(
        this.config.limits.objectStorageOperations.metricsWindowSeconds,
      ),
      this.config.limits.objectStorageOperations.metricsWindowSeconds,
      this.config.limits.objectStorageOperations.metricsEnabled,
    );

    return {
      api: snapshotRuntimeApiMetrics(),
      cache: snapshotRuntimeCacheMetrics(),
      sourceJobs,
      objectStorageOperations,
      retrievalQuality: snapshotRetrievalQualityMetrics(),
      queue: {
        depth: sourceJobs.queueDepth,
        activeJobs: sourceJobs.activeJobs,
        retryCount: sourceJobs.retryCount,
      },
      compile: {
        depth: sourceJobs.queueDepth,
        activeJobs: sourceJobs.activeJobs,
        retryCount: sourceJobs.retryCount,
        stageDurations: sourceJobs.stageDurations,
      },
    };
  }

  private getMigrationRuntimeStatus() {
    const migrations = readAvailableMigrations();
    const targetSchemaVersion = migrations.at(-1)?.name ?? null;

    return {
      status: this.config.database.url === undefined ? "database_not_configured" : "managed",
      mode: "dedicated_migration_service",
      startupService: "migrate",
      currentSchemaVersion: null,
      targetSchemaVersion,
      knownMigrationCount: migrations.length,
      pendingCount: null,
      lastOutcome: "managed_by_startup_service",
    };
  }

  private getPressureStatus() {
    const admission = this.uploadAdmissionService?.getSnapshot() ?? {
      activeMultipartUploads: 0,
      multipartAdmissionLimit: this.config.limits.upload.admissionConcurrency,
      pressureDegradedThreshold: this.config.limits.upload.pressureDegradedThreshold,
      pressure: "normal",
    };
    const metrics = this.getRuntimeMetricsStatus();
    const queueStatus = classifyPressureState(
      metrics.queue.depth,
      this.config.limits.pressure.queueDepthDegradedThreshold,
      this.config.limits.pressure.queueDepthSaturatedThreshold,
    );
    const compileStatus = classifyPressureState(
      metrics.compile.depth,
      this.config.limits.pressure.compileQueueDepthDegradedThreshold,
      this.config.limits.pressure.compileQueueDepthSaturatedThreshold,
    );
    const objectStorageOperations = summarizeObjectStorageOperationPressure(
      metrics.objectStorageOperations,
      this.config.limits.objectStorageOperations,
    );

    return {
      status: admission.pressure,
      objectStorageOperations,
      upload: {
        pressure: admission.pressure,
        activeMultipartUploads: admission.activeMultipartUploads,
        admissionLimit: admission.multipartAdmissionLimit,
        degradedThreshold: this.config.limits.pressure.uploadDegradedThreshold,
      },
      queue: {
        status: queueStatus,
        depth: metrics.queue.depth,
        activeJobs: metrics.queue.activeJobs,
        retryCount: metrics.queue.retryCount,
        degradedThreshold: this.config.limits.pressure.queueDepthDegradedThreshold,
        saturatedThreshold: this.config.limits.pressure.queueDepthSaturatedThreshold,
      },
      compile: {
        status: compileStatus,
        depth: metrics.compile.depth,
        activeJobs: metrics.compile.activeJobs,
        retryCount: metrics.compile.retryCount,
        stageDurations: metrics.compile.stageDurations,
        degradedThreshold: this.config.limits.pressure.compileQueueDepthDegradedThreshold,
        saturatedThreshold: this.config.limits.pressure.compileQueueDepthSaturatedThreshold,
      },
      providers: {
        failureDegradedThreshold: this.config.limits.pressure.providerFailureDegradedThreshold,
      },
      validation: {
        expensiveValidationEnabled: this.config.limits.pressure.expensiveValidationEnabled,
      },
    };
  }

  private getUploadRuntimeStatus() {
    const admission = this.uploadAdmissionService?.getSnapshot() ?? {
      activeMultipartUploads: 0,
      multipartAdmissionLimit: this.config.limits.upload.admissionConcurrency,
      pressureDegradedThreshold: this.config.limits.upload.pressureDegradedThreshold,
      pressure: "normal",
    };
    const directUploadEnabled = this.config.limits.upload.directUploadEnabled;
    const storageReady = [
      this.config.storage.bucket,
      this.config.storage.accessKeyId,
      this.config.storage.secretAccessKey,
      this.config.storage.endpoint,
    ].every(isConfigured);
    const directUploadReady = directUploadEnabled && storageReady;
    const unavailableReasons = [
      ...(directUploadEnabled ? [] : ["direct_upload_disabled"]),
      ...(storageReady ? [] : ["object_storage_not_configured"]),
    ];

    return {
      status:
        directUploadReady || this.config.limits.upload.multipartFallbackMode === "enabled"
          ? "configured"
          : "disabled",
      directUpload: {
        enabled: directUploadEnabled,
        ready: directUploadReady,
        thresholdMb: this.config.limits.upload.directUploadThresholdMb,
        thresholdBytes: this.config.limits.upload.directUploadThresholdMb * 1024 * 1024,
        sessionExpiresSeconds: this.config.limits.upload.uploadSessionExpiresSeconds,
        unavailableReasons,
      },
      multipart: {
        fallbackMode: this.config.limits.upload.multipartFallbackMode,
        timeoutSeconds: this.config.limits.upload.multipartTimeoutSeconds,
        admission,
      },
    };
  }

  private getWorkerStatus(): "configured" | "missing" {
    const requiredValues = [
      this.config.database.url,
      this.config.redis.url,
      this.config.storage.bucket,
      this.config.storage.accessKeyId,
      this.config.storage.secretAccessKey,
    ];

    return requiredValues.every(isConfigured) ? "configured" : "missing";
  }

  private getCompileRuntimeStatus() {
    const requiredValues = [
      this.config.database.url,
      this.config.redis.url,
      this.config.storage.bucket,
      this.config.storage.accessKeyId,
      this.config.storage.secretAccessKey,
      this.config.models.chat.apiKey,
      this.config.models.embedding.apiKey,
    ];

    const ocrEnabled = this.config.ocr.enabled;
    const visionCaptionEnabled = this.config.models.visionCaption !== undefined;

    return {
      status: requiredValues.every(isConfigured) ? "configured" : "missing",
      queues: [
        "source.parse",
        ...(ocrEnabled ? ["source.ocr"] : []),
        ...(visionCaptionEnabled ? ["media.caption"] : []),
        "wiki.analyze",
        "wiki.generate",
        "wiki.merge",
      ],
      stages: [
        "parsing",
        ...(ocrEnabled ? ["ocr"] : []),
        ...(visionCaptionEnabled ? ["captioning"] : []),
        "analyzing",
        "generating",
        "merging",
        "indexing",
      ],
      chatProviderStatus: statusOf(this.config.models.chat.apiKey),
      embeddingProviderStatus: statusOf(this.config.models.embedding.apiKey),
      ocrProviderStatus:
        this.config.ocr.enabled && this.config.ocr.serviceBaseUrl !== undefined
          ? "configured"
          : this.config.ocr.enabled
            ? "missing"
            : "disabled",
      visionCaptionProviderStatus:
        this.config.models.visionCaption === undefined
          ? "disabled"
          : statusOf(this.config.models.visionCaption.apiKey),
    };
  }

  private getCleanupQueueStatus() {
    const workerConfigured = this.getWorkerStatus() === "configured";
    const operations = this.deletionCleanupRepository?.listOperations() ?? [];
    const pending = operations.filter(
      (operation) => operation.status === "queued" || operation.status === "running",
    ).length;
    const failed = operations.filter((operation) => operation.status === "failed").length;

    return {
      enabled: true,
      queueName: "deletion.cleanup",
      status: workerConfigured ? "configured" : "missing",
      workerConfigured,
      concurrency: this.config.limits.deletionCleanup.concurrency,
      objectBatchSize: this.config.limits.deletionCleanup.objectBatchSize,
      retryPolicy: {
        maxRetries: this.config.limits.deletionCleanup.maxRetries,
        retryBaseDelayMs: this.config.limits.deletionCleanup.retryBaseDelayMs,
        retryBackoff: this.config.limits.deletionCleanup.retryBackoff,
      },
      retention: {
        operationRetentionDays: this.config.limits.deletionCleanup.operationRetentionDays,
        itemRetentionDays: this.config.limits.deletionCleanup.itemRetentionDays,
      },
      operations: {
        pending,
        failed,
      },
    };
  }

  private getSourceWatchRuntimeStatus() {
    const adapters = this.config.sourceWatch.adapters;

    return {
      mountedDirectory: {
        enabled: adapters.mountedDirectory.enabled,
        containerDir: adapters.mountedDirectory.containerDir,
        hostDirConfigured: adapters.mountedDirectory.hostDir !== undefined,
      },
      urlList: {
        enabled: adapters.urlList.enabled,
        allowedProtocols: adapters.urlList.allowedProtocols,
        maxUrls: adapters.urlList.maxItems,
        maxResponseBytes: adapters.urlList.maxBytes,
        timeoutSeconds: adapters.urlList.timeoutSeconds,
        concurrency: adapters.urlList.concurrency,
        maxRetries: adapters.urlList.maxRetries,
      },
      s3Prefix: {
        enabled: adapters.s3Prefix.enabled,
        endpoint:
          adapters.s3Prefix.endpoint === undefined
            ? null
            : maskEndpoint(adapters.s3Prefix.endpoint),
        region: adapters.s3Prefix.region ?? null,
        bucket: adapters.s3Prefix.bucket ?? null,
        accessKeyStatus: adapters.s3Prefix.accessKeyConfigured ? "configured" : "missing",
        secretKeyStatus: adapters.s3Prefix.secretKeyConfigured ? "configured" : "missing",
        maxObjects: adapters.s3Prefix.maxItems,
        maxObjectBytes: adapters.s3Prefix.maxBytes,
        incrementalScanEnabled: adapters.s3Prefix.incrementalScanEnabled,
        timeoutSeconds: adapters.s3Prefix.timeoutSeconds,
        concurrency: adapters.s3Prefix.concurrency,
        maxRetries: adapters.s3Prefix.maxRetries,
      },
      gitRepo: {
        enabled: adapters.gitRepo.enabled,
        allowedProtocols: adapters.gitRepo.allowedProtocols,
        cloneDepth: adapters.gitRepo.cloneDepth,
        tempDir: adapters.gitRepo.tempDir,
        tokenStatus: adapters.gitRepo.tokenConfigured ? "configured" : "missing",
        maxFiles: adapters.gitRepo.maxItems,
        maxFileBytes: adapters.gitRepo.maxBytes,
        timeoutSeconds: adapters.gitRepo.timeoutSeconds,
        concurrency: adapters.gitRepo.concurrency,
        maxRetries: adapters.gitRepo.maxRetries,
      },
      scheduler: {
        enabled: this.config.sourceWatch.scheduler.enabled,
        defaultIntervalSeconds: this.config.sourceWatch.scheduler.defaultIntervalSeconds,
        maxRetries: this.config.sourceWatch.scheduler.maxRetries,
        retryBaseDelayMs: this.config.sourceWatch.scheduler.retryBaseDelayMs,
      },
    };
  }

  private async getOcrRuntimeStatus() {
    const baseStatus = {
      enabled: this.config.ocr.enabled,
      provider: this.config.ocr.provider,
      languages: this.config.ocr.languages,
      limits: {
        pageDpi: this.config.limits.ocr.pageDpi,
        maxPagesPerDocument: this.config.limits.ocr.maxPagesPerDocument,
        maxPagePixels: this.config.limits.ocr.maxPagePixels,
        concurrency: this.config.limits.ocr.concurrency,
        pageConcurrency: this.config.limits.ocr.pageConcurrency,
        timeoutSeconds: this.config.limits.ocr.timeoutSeconds,
        maxRetries: this.config.limits.ocr.maxRetries,
        retryBaseDelayMs: this.config.limits.ocr.retryBaseDelayMs,
        minTextCharsPerPage: this.config.limits.ocr.minTextCharsPerPage,
        confidenceThreshold: this.config.limits.ocr.confidenceThreshold,
        storePageImages: this.config.limits.ocr.storePageImages,
      },
      apiKeyStatus: statusOf(this.config.ocr.serviceApiKey),
      ...(this.config.ocr.serviceBaseUrl === undefined
        ? {}
        : { serviceBaseUrl: maskEndpoint(this.config.ocr.serviceBaseUrl) }),
    };

    if (!this.config.ocr.enabled) {
      return {
        ...baseStatus,
        status: "disabled",
        health: "disabled",
      };
    }

    if (this.config.ocr.serviceBaseUrl === undefined) {
      return {
        ...baseStatus,
        status: "missing",
        health: "missing",
      };
    }

    const health = await this.checkOcrServiceHealth(this.config.ocr.serviceBaseUrl);

    return {
      ...baseStatus,
      status: "configured",
      health: health.status,
      ...(health.engine === undefined ? {} : { engine: health.engine }),
      ...(health.modelVersion === undefined ? {} : { modelVersion: health.modelVersion }),
      ...(health.release === undefined ? {} : { release: health.release }),
    };
  }

  private async checkOcrServiceHealth(baseUrl: string): Promise<{
    status: "healthy" | "unhealthy";
    engine?: string;
    modelVersion?: string;
    release?: ReleaseMetadata;
  }> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 1_000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/u, "")}/health`, {
        signal: abortController.signal,
        ...(this.config.ocr.serviceApiKey === undefined
          ? {}
          : {
              headers: {
                authorization: `Bearer ${this.config.ocr.serviceApiKey}`,
              },
            }),
      });

      if (!response.ok) {
        return { status: "unhealthy" };
      }

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const engine = typeof body.engine === "string" ? body.engine : undefined;
      const modelVersion =
        typeof body.model_version === "string"
          ? body.model_version
          : typeof body.modelVersion === "string"
            ? body.modelVersion
            : undefined;
      const release = normalizeReleaseMetadata(body.release);

      return {
        status: "healthy",
        ...(engine === undefined ? {} : { engine }),
        ...(modelVersion === undefined ? {} : { modelVersion }),
        ...(release === undefined ? {} : { release }),
      };
    } catch {
      return { status: "unhealthy" };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getServiceReleaseMetadata(service: string): ReleaseMetadata {
    return {
      ...this.config.release,
      service,
    };
  }
}

function normalizeReleaseMetadata(value: unknown): ReleaseMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const version = readString(value.version);
  const revision = readString(value.revision);
  const buildTime = readString(value.buildTime ?? value.build_time);
  const source = readString(value.source);
  const service = readString(value.service);

  if (
    version === undefined ||
    revision === undefined ||
    buildTime === undefined ||
    source === undefined ||
    service === undefined
  ) {
    return undefined;
  }

  return {
    buildTime,
    revision,
    service,
    source,
    version,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isConfigured(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}

function statusOf(value: string | undefined): "configured" | "missing" {
  return isConfigured(value) ? "configured" : "missing";
}

function maskEndpoint(value: string): string {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;

    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return "Configured";
  }
}

export type PressureState = "normal" | "degraded" | "saturated";
export type ObjectStorageOperationPressureState = "normal" | "degraded" | "disabled";

export interface DurationSummary {
  count: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  latestMs: number;
}

type SourceStatusCounts = Record<JobStatus, number>;

export interface ObjectStorageOperationMetricSummary {
  countsByCaller: Record<string, number>;
  countsByClass: Record<ObjectStorageOperationClass, number>;
  countsByOperation: Record<string, number>;
  countsByStatus: Record<ObjectStorageOperationStatus, number>;
  enabled: boolean;
  hotCallers: Array<{ caller: string; count: number; classA: number; classB: number }>;
  hotOperations: Array<{
    operation: string;
    count: number;
    operationClass: ObjectStorageOperationClass;
  }>;
  latency: DurationSummary | null;
  retryCount: number;
  total: number;
  windowSeconds: number;
}

function summarizeSourceJobs(jobs: readonly JobRecord[], events: readonly JobEventRecord[]) {
  const statusCounts = countSourceStatuses(jobs);
  const stageCounts = countBy(jobs, (job) => job.stage);
  const durationSamples = new Map<JobStage, number[]>();

  for (const event of events) {
    const duration = readFiniteNumber(event.metadata.stage_duration_ms);
    if (duration !== undefined) {
      addDurationSample(durationSamples, event.stage, duration);
    }
  }

  return {
    total: jobs.length,
    queueDepth: statusCounts.queued,
    activeJobs: statusCounts.running,
    retryCount: jobs.filter((job) => job.retryOfJobId !== null).length,
    statusCounts,
    stageCounts,
    stageDurations: summarizeDurations(durationSamples),
  };
}

function summarizeObjectStorageOperations(
  records: readonly ObjectStorageOperationRecord[],
  windowSeconds: number,
  enabled: boolean,
): ObjectStorageOperationMetricSummary {
  const countsByClass: Record<ObjectStorageOperationClass, number> = {
    class_a: 0,
    class_b: 0,
    free: 0,
    unknown: 0,
  };
  const countsByStatus: Record<ObjectStorageOperationStatus, number> = {
    error: 0,
    success: 0,
  };
  const countsByOperation: Record<string, number> = {};
  const countsByCaller: Record<string, number> = {};
  const retryCount = records.reduce((sum, record) => sum + record.retryCount, 0);

  for (const record of records) {
    countsByClass[record.operationClass] += 1;
    countsByStatus[record.status] += 1;
    countsByOperation[record.operation] = (countsByOperation[record.operation] ?? 0) + 1;
    countsByCaller[record.caller] = (countsByCaller[record.caller] ?? 0) + 1;
  }

  return {
    countsByCaller,
    countsByClass,
    countsByOperation,
    countsByStatus,
    enabled,
    hotCallers: summarizeObjectStorageHotCallers(records),
    hotOperations: summarizeObjectStorageHotOperations(records),
    latency: summarizeFlatDuration(records.map((record) => record.latencyMs)),
    retryCount,
    total: records.length,
    windowSeconds,
  };
}

function summarizeObjectStorageOperationPressure(
  metrics: ObjectStorageOperationMetricSummary,
  limits: RuntimeConfig["limits"]["objectStorageOperations"],
): {
  classA: { count: number; warningThreshold: number };
  classB: { count: number; warningThreshold: number };
  guidanceKeys: string[];
  hotCallers: ObjectStorageOperationMetricSummary["hotCallers"];
  hotOperations: ObjectStorageOperationMetricSummary["hotOperations"];
  metricsEnabled: boolean;
  status: ObjectStorageOperationPressureState;
  warningsEnabled: boolean;
  windowSeconds: number;
} {
  const classA = metrics.countsByClass.class_a;
  const classB = metrics.countsByClass.class_b;
  const disabled = !metrics.enabled || !limits.pressureWarningsEnabled;
  const degraded =
    !disabled &&
    (classA >= limits.classAWarningThreshold || classB >= limits.classBWarningThreshold);

  return {
    classA: {
      count: classA,
      warningThreshold: limits.classAWarningThreshold,
    },
    classB: {
      count: classB,
      warningThreshold: limits.classBWarningThreshold,
    },
    guidanceKeys: createObjectStorageGuidanceKeys(metrics),
    hotCallers: metrics.hotCallers,
    hotOperations: metrics.hotOperations,
    metricsEnabled: metrics.enabled,
    status: disabled ? "disabled" : degraded ? "degraded" : "normal",
    warningsEnabled: limits.pressureWarningsEnabled,
    windowSeconds: metrics.windowSeconds,
  };
}

function summarizeObjectStorageHotCallers(
  records: readonly ObjectStorageOperationRecord[],
): Array<{ caller: string; count: number; classA: number; classB: number }> {
  const grouped = new Map<
    string,
    { caller: string; count: number; classA: number; classB: number }
  >();

  for (const record of records) {
    const next = grouped.get(record.caller) ?? {
      caller: record.caller,
      classA: 0,
      classB: 0,
      count: 0,
    };
    next.count += 1;
    next.classA += record.operationClass === "class_a" ? 1 : 0;
    next.classB += record.operationClass === "class_b" ? 1 : 0;
    grouped.set(record.caller, next);
  }

  return [...grouped.values()].sort(compareCountDesc).slice(0, 5);
}

function summarizeObjectStorageHotOperations(
  records: readonly ObjectStorageOperationRecord[],
): Array<{ operation: string; count: number; operationClass: ObjectStorageOperationClass }> {
  const grouped = new Map<
    string,
    { operation: string; count: number; operationClass: ObjectStorageOperationClass }
  >();

  for (const record of records) {
    const next = grouped.get(record.operation) ?? {
      operation: record.operation,
      count: 0,
      operationClass: record.operationClass,
    };
    next.count += 1;
    grouped.set(record.operation, next);
  }

  return [...grouped.values()].sort(compareCountDesc).slice(0, 5);
}

function createObjectStorageGuidanceKeys(metrics: ObjectStorageOperationMetricSummary): string[] {
  const keys = new Set<string>();
  const operations = new Set(Object.keys(metrics.countsByOperation));
  const callers = new Set(Object.keys(metrics.countsByCaller));

  if ([...callers].some((caller) => caller.includes("source_watch"))) {
    keys.add("source_watch_scan_cadence");
  }
  if (operations.has("GetObject")) {
    keys.add("preview_cache_or_worker_read_reuse");
  }
  if (
    operations.has("PutObject") ||
    operations.has("PutObjectStream") ||
    operations.has("UploadPart")
  ) {
    keys.add("upload_concurrency_or_multipart_part_size");
  }
  if (operations.has("ListObjectsV2") || operations.has("ListObjects")) {
    keys.add("incremental_source_watch_fingerprints");
  }
  if (operations.has("DeleteObjects")) {
    keys.add("cleanup_batch_size");
  }

  return [...keys].sort();
}

function summarizeFlatDuration(values: readonly number[]): DurationSummary | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    count: values.length,
    avgMs: Math.round(total / values.length),
    maxMs: Math.max(...values),
    minMs: Math.min(...values),
    latestMs: values.at(-1) ?? 0,
  };
}

function compareCountDesc<TRecord extends { count: number }>(
  left: TRecord,
  right: TRecord,
): number {
  return right.count - left.count;
}

function countSourceStatuses(jobs: readonly JobRecord[]): SourceStatusCounts {
  return {
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    completed: jobs.filter((job) => job.status === "completed").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    canceled: jobs.filter((job) => job.status === "canceled").length,
  };
}

function countBy<TRecord, TKey extends string>(
  records: readonly TRecord[],
  getKey: (record: TRecord) => TKey,
): Record<TKey, number> {
  const counts = {} as Record<TKey, number>;

  for (const record of records) {
    const key = getKey(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function addDurationSample<TKey extends string>(
  samples: Map<TKey, number[]>,
  key: TKey,
  value: number,
): void {
  const values = samples.get(key) ?? [];
  values.push(value);
  samples.set(key, values);
}

function summarizeDurations<TKey extends string>(
  samples: ReadonlyMap<TKey, readonly number[]>,
): Record<TKey, DurationSummary> {
  const summary = {} as Record<TKey, DurationSummary>;

  for (const [key, values] of samples.entries()) {
    if (values.length === 0) {
      continue;
    }
    const total = values.reduce((sum, value) => sum + value, 0);

    summary[key] = {
      count: values.length,
      avgMs: Math.round(total / values.length),
      maxMs: Math.max(...values),
      minMs: Math.min(...values),
      latestMs: values.at(-1) ?? 0,
    };
  }

  return summary;
}

function readAvailableMigrations(): Array<{ name: string }> {
  try {
    return getOrderedSqlMigrations().map((migration) => ({
      name: migration.name,
    }));
  } catch {
    return [];
  }
}

function classifyPressureState(
  depth: number,
  degradedThreshold: number,
  saturatedThreshold: number,
): PressureState {
  if (depth >= saturatedThreshold) {
    return "saturated";
  }
  if (depth >= degradedThreshold) {
    return "degraded";
  }

  return "normal";
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
