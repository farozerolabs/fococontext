import { createHash } from "node:crypto";

import { Queue, RedisConnection, Worker } from "bullmq";
import { sql, type Kysely } from "kysely";
import type {
  DeletionCleanupItemRecord,
  DeletionCleanupItemStatus,
  DeletionCleanupItemType,
  DeletionCleanupOperationRecord,
  DeletionCleanupPhase,
  DeletionCleanupStatus,
  DeletionCleanupTargetType,
} from "@fococontext/contracts";
import {
  createBackgroundOperationDedupeKey,
  createKnowledgeBaseObjectPrefix,
  createMediaAssetObjectPrefix,
  createOcrObjectPrefix,
  createParsedContentObjectPrefix,
  createProcessingObjectPrefix,
  createRuntimeQueuePressureKey,
  createSourceObjectPrefix,
  createWikiEdgeObjectPrefix,
  createWikiPageObjectPrefix,
  createWikiPageVersionObjectPrefix,
  runtimeQueueWorkKinds,
  sanitizeObjectKeySegment,
  type RuntimeConfig,
} from "@fococontext/core";
import {
  backgroundOperationIdPrefix,
  type BackgroundOperationCheckpointRecord,
  type BackgroundOperationCheckpointRepository,
  requirePersistedCleanupItemTenantProject,
  requirePersistedCleanupOperationTenantProject,
  requireCleanupItemTenantProject,
  requireCleanupOperationTenantProject,
  type DatabaseSchema,
} from "@fococontext/db";
import type { DeleteObjectVersionIdentifier, ObjectStorageAdapter } from "@fococontext/storage";
import {
  getDatabaseCleanupPriority,
  getScopedCleanupColumn,
  isCleanupEnabledDatabaseTable,
  isScopedCleanupTable,
  isTenantProjectScopedDatabaseTable,
  listDatabaseCleanupPriorityEntries,
} from "./deletion-cleanup.database-policy.js";
import type { WorkerWebhookEventEmitter } from "./webhook-dispatch.worker.js";

export const deletionCleanupQueueName = "deletion.cleanup";
export const deletionCleanupJobName = "deletion.cleanup.operation";

const cleanupManifestPlanningPageSize = 1000;
const knowledgeBaseLegacySourceDocumentPageSize = 500;

export interface DeletionCleanupPayload {
  operation_id: string;
}

export interface EnqueuedDeletionCleanupJob {
  queue_name: typeof deletionCleanupQueueName;
  job_name: typeof deletionCleanupJobName;
  job_id: string;
}

export interface DeletionCleanupQueue {
  enqueueDeletionCleanupJob(payload: DeletionCleanupPayload): Promise<EnqueuedDeletionCleanupJob>;
  close?(): Promise<void>;
}

export interface DeletionCleanupStore {
  findOperationById(
    id: string,
  ):
    | DeletionCleanupOperationRecord
    | undefined
    | Promise<DeletionCleanupOperationRecord | undefined>;
  updateOperation(
    record: DeletionCleanupOperationRecord,
  ): DeletionCleanupOperationRecord | Promise<DeletionCleanupOperationRecord>;
  listItemsByOperationId(
    operationId: string,
  ): DeletionCleanupItemRecord[] | Promise<DeletionCleanupItemRecord[]>;
  resolveOperationScope?(operationId: string): Promise<{ tenantId: string; projectId: string }>;
  listRetryableItemsByOperationId?(
    operationId: string,
    input: ListRetryableDeletionCleanupItemsInput,
  ): DeletionCleanupItemRecord[] | Promise<DeletionCleanupItemRecord[]>;
  countItemsByOperationId?(
    operationId: string,
  ): DeletionCleanupOperationItemCounts | Promise<DeletionCleanupOperationItemCounts>;
  hasFailedItemsByOperationId?(
    operationId: string,
    input?: { itemType?: DeletionCleanupItemType },
  ): boolean | Promise<boolean>;
  hasRetryableItemsByOperationId?(operationId: string): boolean | Promise<boolean>;
  upsertItem(
    record: DeletionCleanupItemRecord,
  ): DeletionCleanupItemRecord | Promise<DeletionCleanupItemRecord>;
  pruneExpiredRecords?(
    now: string,
  ):
    | { deletedItems: number; deletedOperations: number }
    | Promise<{ deletedItems: number; deletedOperations: number }>;
}

export interface ListRetryableDeletionCleanupItemsInput {
  itemType: "object" | "database_row" | "redis_key";
  limit: number;
  retryFailedBefore: string;
}

export interface DeletionCleanupOperationItemCounts {
  totalItemCount: number;
  pendingItemCount: number;
  deletedItemCount: number;
  skippedItemCount: number;
  failedItemCount: number;
  objectKeyCount: number;
  databaseRowCount: number;
  redisKeyCount: number;
}

export interface DeletionCleanupDatabaseCleaner {
  cleanupDatabaseItem(
    item: DeletionCleanupItemRecord,
  ): Promise<DeletionCleanupDatabaseCleanupResult>;
}

export interface DeletionCleanupRedisCleaner {
  cleanupRedisItem(item: DeletionCleanupItemRecord): Promise<DeletionCleanupRedisCleanupResult>;
}

export interface DeletionCleanupResidualVerifier {
  verifyResiduals(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupResidualVerificationResult>;
}

export interface DeletionCleanupResidualVerificationResult {
  objectStorageResidualCount: number;
  objectStorageResidualExamples: string[];
  databaseResidualCount: number;
  databaseResidualExamples: string[];
  redisResidualCount: number;
  redisResidualExamples: string[];
  legacyLayoutResidualCount: number;
  legacyLayoutResidualExamples: string[];
  versionedObjectResidualCount: number;
  versionedObjectResidualExamples: string[];
}

export interface DeletionCleanupRedisResidualChecker {
  countResidualRedisKeys(keys: readonly string[]): Promise<{ count: number; examples: string[] }>;
}

export interface DeletionCleanupTargetGuard {
  checkCleanupAllowed(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupTargetGuardResult>;
}

export type DeletionCleanupTargetGuardResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
    };

export type DeletionCleanupDatabaseCleanupResult =
  | {
      status: "deleted";
    }
  | {
      status: "skipped";
      skipReason: string;
    }
  | {
      status: "failed";
      error: Record<string, unknown>;
    };

export type DeletionCleanupRedisCleanupResult =
  | {
      status: "deleted";
    }
  | {
      status: "skipped";
      skipReason: string;
    }
  | {
      status: "failed";
      error: Record<string, unknown>;
    };

export interface DeletionCleanupProcessorOptions {
  repository: DeletionCleanupStore;
  objectStorage: ObjectStorageAdapter;
  databaseCleanup?: DeletionCleanupDatabaseCleaner;
  redisCleanup?: DeletionCleanupRedisCleaner;
  residualVerifier?: DeletionCleanupResidualVerifier;
  manifestPlanner?: DeletionCleanupManifestPlanner;
  targetGuard?: DeletionCleanupTargetGuard;
  webhookEvents?: WorkerWebhookEventEmitter;
  checkpointRepository?: BackgroundOperationCheckpointRepository;
  objectBatchSize?: number;
  versionedObjectCleanupEnabled?: boolean;
  now?: () => string;
}

export interface DeletionCleanupManifestPlanInput {
  operation: DeletionCleanupOperationRecord;
  repository: DeletionCleanupStore;
  now: () => string;
}

export interface DeletionCleanupManifestPlanner {
  planOperation(input: DeletionCleanupManifestPlanInput): Promise<DeletionCleanupOperationRecord>;
}

export class BullMqDeletionCleanupQueue implements DeletionCleanupQueue {
  private readonly queue: Queue<DeletionCleanupPayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<DeletionCleanupPayload>(
      deletionCleanupQueueName,
      createDeletionCleanupQueueOptions(config),
    );
  }

  async enqueueDeletionCleanupJob(
    payload: DeletionCleanupPayload,
  ): Promise<EnqueuedDeletionCleanupJob> {
    await this.queue.add(deletionCleanupJobName, payload, {
      jobId: payload.operation_id,
    });

    return {
      queue_name: deletionCleanupQueueName,
      job_name: deletionCleanupJobName,
      job_id: payload.operation_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqDeletionCleanupWorker {
  private readonly worker: Worker<DeletionCleanupPayload>;

  constructor(config: RuntimeConfig, processor: DeletionCleanupProcessor) {
    this.worker = new Worker<DeletionCleanupPayload>(
      deletionCleanupQueueName,
      createDeletionCleanupJobProcessor(processor),
      createDeletionCleanupWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createDeletionCleanupQueueOptions(config: RuntimeConfig) {
  return {
    connection: {
      url: config.redis.url,
    },
    defaultJobOptions: {
      attempts: Math.max(1, config.limits.deletionCleanup.maxRetries + 1),
      backoff: {
        delay: config.limits.deletionCleanup.retryBaseDelayMs,
        type: config.limits.deletionCleanup.retryBackoff,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  };
}

export function createDeletionCleanupWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.backgroundJobs.cleanup.concurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export function createDeletionCleanupJobProcessor(processor: DeletionCleanupProcessor) {
  return async (job: { data: DeletionCleanupPayload }) =>
    processor.processOperation(job.data.operation_id);
}

export class DeletionCleanupProcessor {
  private readonly now: () => string;

  constructor(private readonly options: DeletionCleanupProcessorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async processOperation(operationId: string): Promise<DeletionCleanupOperationRecord> {
    const operation = await this.options.repository.findOperationById(operationId);

    if (operation === undefined) {
      throw new Error("Cleanup operation not found.");
    }
    if (operation.status === "completed" || operation.status === "canceled") {
      return operation;
    }
    const checkpoint = await this.createOrReuseCheckpoint(operation);

    const fenced = await this.updateOperation(operation, {
      status: "running",
      phase: "fencing",
      attemptCount: operation.attemptCount + 1,
      startedAt: operation.startedAt ?? this.now(),
      updatedAt: this.now(),
    });
    await this.saveCheckpointProgress(checkpoint, fenced);
    const guardResult = await this.checkCleanupAllowed(fenced);

    if (!guardResult.allowed) {
      const failed = await this.updateOperation(fenced, {
        status: "failed",
        phase: "fencing",
        retryable: false,
        lastError: {
          message: "Cleanup target is not ready for deletion cleanup.",
          reason: guardResult.reason,
        },
        failedAt: this.now(),
        updatedAt: this.now(),
      });
      await this.saveTerminalCheckpoint(checkpoint, failed);

      return failed;
    }

    const planned = await this.ensureManifestPlanned(fenced);

    if (planned.status === "failed" || planned.status === "canceled") {
      await this.saveTerminalCheckpoint(checkpoint, planned);
      return planned;
    }

    const started = await this.updateOperation(planned, {
      status: "running",
      phase: "object_cleanup",
      updatedAt: this.now(),
    });
    await this.saveCheckpointProgress(checkpoint, started);
    let objectItems = await this.listRetryableItems(operationId, "object", started.updatedAt);

    while (objectItems.length > 0) {
      await this.deleteObjectItems(objectItems);
      await this.refreshCheckpointCounts(checkpoint, operationId, "object_cleanup");
      if (await this.hasFailedItems(operationId, "object")) {
        return this.finishOperation(started.id);
      }
      objectItems = await this.listRetryableItems(operationId, "object", started.updatedAt);
    }

    const objectFailed = await this.hasFailedItems(operationId, "object");

    if (objectFailed) {
      return this.finishOperation(started.id);
    }

    const objectCleaned = await this.cleanupVersionedObjectStorage(started);
    let redisItems = await this.listRetryableItems(
      operationId,
      "redis_key",
      objectCleaned.updatedAt,
    );

    if (redisItems.length > 0) {
      const redisPhase = await this.updateOperation(objectCleaned, {
        status: "running",
        phase: "redis_cleanup",
        updatedAt: this.now(),
      });
      await this.saveCheckpointProgress(checkpoint, redisPhase);

      while (redisItems.length > 0) {
        await this.deleteRedisItems(redisItems);
        await this.refreshCheckpointCounts(checkpoint, operationId, "redis_cleanup");
        if (await this.hasFailedItems(operationId, "redis_key")) {
          return this.finishOperation(redisPhase.id);
        }
        redisItems = await this.listRetryableItems(operationId, "redis_key", redisPhase.updatedAt);
      }
    }

    const redisFailed = await this.hasFailedItems(operationId, "redis_key");

    if (redisFailed) {
      return this.finishOperation(objectCleaned.id);
    }

    let databaseItems = await this.listRetryableItems(
      operationId,
      "database_row",
      objectCleaned.updatedAt,
    );

    if (databaseItems.length > 0) {
      const databasePhase = await this.updateOperation(objectCleaned, {
        status: "running",
        phase: "database_cleanup",
        updatedAt: this.now(),
      });
      await this.saveCheckpointProgress(checkpoint, databasePhase);

      while (databaseItems.length > 0) {
        await this.deleteDatabaseItems(databaseItems);
        await this.refreshCheckpointCounts(checkpoint, operationId, "database_cleanup");
        if (await this.hasFailedItems(operationId, "database_row")) {
          return this.finishOperation(databasePhase.id);
        }
        databaseItems = await this.listRetryableItems(
          operationId,
          "database_row",
          databasePhase.updatedAt,
        );
      }

      return this.finishOperation(databasePhase.id);
    }

    return this.finishOperation(objectCleaned.id);
  }

  private async createOrReuseCheckpoint(
    operation: DeletionCleanupOperationRecord,
  ): Promise<BackgroundOperationCheckpointRecord | null> {
    if (
      this.options.checkpointRepository === undefined ||
      this.options.repository.resolveOperationScope === undefined
    ) {
      return null;
    }
    const scope = await this.options.repository.resolveOperationScope(operation.id);

    return this.options.checkpointRepository.createOrReuse({
      id: createStableDeletionCleanupOperationId(operation.id),
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      knowledgeBaseId: operation.knowledgeBaseId,
      jobId: operation.queueJobId ?? operation.id,
      operationKind: "deletion_cleanup",
      stage: operation.phase,
      lockKey: createBackgroundOperationDedupeKey({
        operationId: createStableDeletionCleanupOperationId(operation.id),
        operationKind: "deletion_cleanup",
        scopeId: operation.knowledgeBaseId ?? operation.id,
      }),
      processedCount: operation.deletedItemCount + operation.skippedItemCount,
      failedCount: operation.failedItemCount,
      totalCount: operation.totalItemCount,
      metadata: {
        operation_id: operation.id,
        target_id: operation.targetId,
        target_type: operation.targetType,
      },
      now: this.now(),
    });
  }

  private async saveCheckpointProgress(
    checkpoint: BackgroundOperationCheckpointRecord | null,
    operation: DeletionCleanupOperationRecord,
  ): Promise<void> {
    if (checkpoint === null) {
      return;
    }
    await this.options.checkpointRepository?.saveProgress({
      id: checkpoint.id,
      stage: operation.phase,
      processedCount: operation.deletedItemCount + operation.skippedItemCount,
      failedCount: operation.failedItemCount,
      totalCount: operation.totalItemCount,
      metadata: {
        pending_item_count: operation.pendingItemCount,
        skipped_item_count: operation.skippedItemCount,
      },
      now: this.now(),
    });
  }

  private async refreshCheckpointCounts(
    checkpoint: BackgroundOperationCheckpointRecord | null,
    operationId: string,
    stage: string,
  ): Promise<void> {
    if (checkpoint === null) {
      return;
    }
    const counts = await this.countItems(operationId);

    await this.options.checkpointRepository?.saveProgress({
      id: checkpoint.id,
      stage,
      processedCount: counts.deletedItemCount + counts.skippedItemCount,
      failedCount: counts.failedItemCount,
      totalCount: counts.totalItemCount,
      metadata: {
        pending_item_count: counts.pendingItemCount,
        skipped_item_count: counts.skippedItemCount,
      },
      now: this.now(),
    });
  }

  private async saveTerminalCheckpoint(
    checkpoint: BackgroundOperationCheckpointRecord | null,
    operation: DeletionCleanupOperationRecord,
  ): Promise<void> {
    if (checkpoint === null) {
      return;
    }
    const input = {
      id: checkpoint.id,
      stage: operation.phase,
      processedCount: operation.deletedItemCount + operation.skippedItemCount,
      failedCount: operation.failedItemCount,
      totalCount: operation.totalItemCount,
      metadata: {
        pending_item_count: operation.pendingItemCount,
        skipped_item_count: operation.skippedItemCount,
      },
      now: this.now(),
    };

    if (operation.status === "completed") {
      await this.options.checkpointRepository?.markCompleted(input);
      return;
    }
    if (operation.status === "failed") {
      await this.options.checkpointRepository?.markFailed({
        ...input,
        safeError: operation.lastError ?? {
          message: "Deletion cleanup failed.",
        },
      });
    }
  }

  private async deleteObjectItems(items: DeletionCleanupItemRecord[]): Promise<void> {
    const objectKeys = items.flatMap((item) => (item.objectKey === null ? [] : [item.objectKey]));
    const result = await this.options.objectStorage.deleteObjects({
      keys: objectKeys,
      ...(this.options.objectBatchSize === undefined
        ? {}
        : { batchSize: this.options.objectBatchSize }),
    });
    const deletedKeys = new Set(result.deleted.map((item) => item.key));
    const failuresByKey = new Map(result.failed.map((failure) => [failure.key, failure]));
    const now = this.now();

    for (const item of items) {
      if (item.objectKey === null) {
        continue;
      }
      const failure = failuresByKey.get(item.objectKey);

      if (failure !== undefined) {
        await this.options.repository.upsertItem({
          ...item,
          status: "failed",
          phase: "object_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: {
            ...(failure.code === undefined ? {} : { code: failure.code }),
            message: failure.message,
          },
          updatedAt: now,
        });
        continue;
      }

      if (deletedKeys.has(item.objectKey)) {
        await this.options.repository.upsertItem({
          ...item,
          status: "deleted",
          phase: "object_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: null,
          updatedAt: now,
          completedAt: now,
        });
      }
    }
  }

  private async cleanupVersionedObjectStorage(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupOperationRecord> {
    if (this.options.versionedObjectCleanupEnabled !== true) {
      return operation;
    }
    if (
      this.options.objectStorage.listObjectVersionsByPrefix === undefined ||
      this.options.objectStorage.deleteObjectVersions === undefined
    ) {
      return this.updateOperation(operation, {
        manifest: {
          ...operation.manifest,
          versioned_object_status: "unsupported",
          versioned_object_count: 0,
          versioned_object_failed_count: 0,
          versioned_object_residual_count: 0,
          versioned_object_residual_examples: [],
        },
        updatedAt: this.now(),
      });
    }
    const prefixes = createVersionedObjectCleanupPrefixes(operation);

    if (prefixes.length === 0) {
      return this.updateOperation(operation, {
        manifest: {
          ...operation.manifest,
          versioned_object_status: "not_applicable",
          versioned_object_count: 0,
          versioned_object_failed_count: 0,
          versioned_object_residual_count: 0,
          versioned_object_residual_examples: [],
        },
        updatedAt: this.now(),
      });
    }

    let versionCount = 0;
    let failedCount = 0;
    const residualExamples: string[] = [];

    try {
      for (const prefix of prefixes) {
        let keyMarker: string | undefined;
        let versionIdMarker: string | undefined;

        do {
          const page = await this.options.objectStorage.listObjectVersionsByPrefix({
            prefix,
            ...(this.options.objectBatchSize === undefined
              ? {}
              : { maxKeys: this.options.objectBatchSize }),
            ...(keyMarker === undefined ? {} : { keyMarker }),
            ...(versionIdMarker === undefined ? {} : { versionIdMarker }),
          });
          const versions = page.versions.map(
            (version): DeleteObjectVersionIdentifier => ({
              key: version.key,
              ...(version.versionId === undefined ? {} : { versionId: version.versionId }),
            }),
          );
          versionCount += versions.length;

          if (versions.length > 0) {
            const result = await this.options.objectStorage.deleteObjectVersions({
              objects: versions,
              ...(this.options.objectBatchSize === undefined
                ? {}
                : { batchSize: this.options.objectBatchSize }),
            });
            failedCount += result.failed.length;
            for (const failure of result.failed) {
              if (residualExamples.length >= 5) {
                break;
              }
              residualExamples.push(createObjectVersionExample(failure));
            }
          }
          keyMarker = page.nextKeyMarker;
          versionIdMarker = page.nextVersionIdMarker;
        } while (keyMarker !== undefined || versionIdMarker !== undefined);
      }
    } catch (error) {
      if (isVersionedCleanupUnsupportedError(error)) {
        return this.updateOperation(operation, {
          manifest: {
            ...operation.manifest,
            versioned_object_status: "unsupported",
            versioned_object_count: versionCount,
            versioned_object_failed_count: 0,
            versioned_object_residual_count: 0,
            versioned_object_residual_examples: [],
          },
          updatedAt: this.now(),
        });
      }

      failedCount += 1;
      residualExamples.push(
        error instanceof Error ? error.message : "Object version cleanup failed.",
      );
    }

    return this.updateOperation(operation, {
      manifest: {
        ...operation.manifest,
        versioned_object_status: failedCount > 0 ? "failed" : "completed",
        versioned_object_count: versionCount,
        versioned_object_failed_count: failedCount,
        versioned_object_residual_count: failedCount,
        versioned_object_residual_examples: residualExamples.slice(0, 5),
      },
      updatedAt: this.now(),
    });
  }

  private async deleteDatabaseItems(items: DeletionCleanupItemRecord[]): Promise<void> {
    const now = this.now();

    for (const item of items) {
      if (this.options.databaseCleanup === undefined) {
        await this.options.repository.upsertItem({
          ...item,
          status: "failed",
          phase: "database_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: {
            message: "Database cleanup is not configured.",
          },
          updatedAt: now,
        });
        continue;
      }

      const result = await this.cleanupDatabaseItem(item);

      if (result.status === "deleted") {
        await this.options.repository.upsertItem({
          ...item,
          status: "deleted",
          phase: "database_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: null,
          skipReason: null,
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }

      if (result.status === "skipped") {
        await this.options.repository.upsertItem({
          ...item,
          status: "skipped",
          phase: "database_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: null,
          skipReason: result.skipReason,
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }

      await this.options.repository.upsertItem({
        ...item,
        status: "failed",
        phase: "database_cleanup",
        attemptCount: item.attemptCount + 1,
        lastError: result.error,
        updatedAt: now,
      });
    }
  }

  private async deleteRedisItems(items: DeletionCleanupItemRecord[]): Promise<void> {
    const now = this.now();

    for (const item of items) {
      if (this.options.redisCleanup === undefined) {
        await this.options.repository.upsertItem({
          ...item,
          status: "failed",
          phase: "redis_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: {
            message: "Redis cleanup is not configured.",
          },
          updatedAt: now,
        });
        continue;
      }

      const result = await this.cleanupRedisItem(item);

      if (result.status === "deleted") {
        await this.options.repository.upsertItem({
          ...item,
          status: "deleted",
          phase: "redis_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: null,
          skipReason: null,
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }

      if (result.status === "skipped") {
        await this.options.repository.upsertItem({
          ...item,
          status: "skipped",
          phase: "redis_cleanup",
          attemptCount: item.attemptCount + 1,
          lastError: null,
          skipReason: result.skipReason,
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }

      await this.options.repository.upsertItem({
        ...item,
        status: "failed",
        phase: "redis_cleanup",
        attemptCount: item.attemptCount + 1,
        lastError: result.error,
        updatedAt: now,
      });
    }
  }

  private async cleanupDatabaseItem(
    item: DeletionCleanupItemRecord,
  ): Promise<DeletionCleanupDatabaseCleanupResult> {
    try {
      return await this.options.databaseCleanup!.cleanupDatabaseItem(item);
    } catch (error) {
      return {
        status: "failed",
        error: {
          message: error instanceof Error ? error.message : "Database cleanup failed.",
        },
      };
    }
  }

  private async cleanupRedisItem(
    item: DeletionCleanupItemRecord,
  ): Promise<DeletionCleanupRedisCleanupResult> {
    try {
      return await this.options.redisCleanup!.cleanupRedisItem(item);
    } catch (error) {
      return {
        status: "failed",
        error: {
          message: error instanceof Error ? error.message : "Redis cleanup failed.",
        },
      };
    }
  }

  private async checkCleanupAllowed(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupTargetGuardResult> {
    if (this.options.targetGuard === undefined) {
      return {
        allowed: true,
      };
    }

    try {
      return await this.options.targetGuard.checkCleanupAllowed(operation);
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "target_guard_failed",
      };
    }
  }

  private async finishOperation(operationId: string): Promise<DeletionCleanupOperationRecord> {
    const operation = await this.options.repository.findOperationById(operationId);

    if (operation === undefined) {
      throw new Error("Cleanup operation not found.");
    }

    const counts = await this.countItems(operationId);
    const now = this.now();
    const hasIncomplete = counts.failedItemCount > 0 || counts.pendingItemCount > 0;
    const retryable = await this.hasRetryableItems(operationId);
    const residuals =
      !hasIncomplete && this.options.residualVerifier !== undefined
        ? await this.options.residualVerifier.verifyResiduals(operation)
        : createEmptyResidualVerificationResult();
    const residualManifest = createResidualVerificationManifestPatch(
      residuals,
      operation.manifest,
      {
        defaultVersionedStatus:
          this.options.versionedObjectCleanupEnabled === true ? "unsupported" : "disabled",
      },
    );
    const versionedObjectResidualCount = readNonNegativeManifestInteger(
      residualManifest,
      "versioned_object_residual_count",
    );
    const residualCount =
      countNonVersionedResidualVerificationResult(residuals) + versionedObjectResidualCount;
    const hasResiduals = residualCount > 0;

    const updated = await this.updateOperation(operation, {
      ...counts,
      manifest: {
        ...operation.manifest,
        ...residualManifest,
      },
      status: hasIncomplete || hasResiduals ? "failed" : "completed",
      phase: hasIncomplete ? operation.phase : hasResiduals ? "failed" : "completed",
      retryable: hasResiduals ? true : retryable,
      lastError: hasIncomplete
        ? {
            message: "Cleanup failed or still has pending items.",
          }
        : hasResiduals
          ? {
              message: "Cleanup residual check failed.",
              residual_counts: {
                database: residuals.databaseResidualCount,
                legacy_layout: residuals.legacyLayoutResidualCount,
                object_storage: residuals.objectStorageResidualCount,
                redis: residuals.redisResidualCount,
                versioned_object_storage: versionedObjectResidualCount,
              },
            }
          : null,
      failedAt: hasIncomplete || hasResiduals ? now : operation.failedAt,
      completedAt: hasIncomplete || hasResiduals ? operation.completedAt : now,
      updatedAt: now,
    });

    await this.options.repository.pruneExpiredRecords?.(now);
    const checkpoint =
      this.options.checkpointRepository === undefined
        ? null
        : await this.options.checkpointRepository.getById(
            createStableDeletionCleanupOperationId(updated.id),
          );
    await this.saveTerminalCheckpoint(checkpoint, updated);
    await this.options.webhookEvents?.emit({
      eventType: updated.status === "completed" ? "cleanup.completed" : "cleanup.failed",
      knowledgeBaseId: updated.knowledgeBaseId,
      payload: {
        failed_item_count: updated.failedItemCount,
        operation_id: updated.id,
        pending_item_count: updated.pendingItemCount,
        target_id: updated.targetId,
        target_type: updated.targetType,
        total_item_count: updated.totalItemCount,
      },
      requestTrace: {
        event_source: "worker.deletion_cleanup",
      },
    });

    return updated;
  }

  private async ensureManifestPlanned(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupOperationRecord> {
    if (!shouldPlanManifest(operation)) {
      return operation;
    }

    const planning = await this.updateOperation(operation, {
      status: "running",
      phase: "manifest",
      manifest: {
        ...operation.manifest,
        planning_status: "running",
      },
      startedAt: operation.startedAt ?? this.now(),
      updatedAt: this.now(),
    });

    if (this.options.manifestPlanner === undefined) {
      return this.updateOperation(planning, {
        status: "failed",
        phase: "manifest",
        retryable: true,
        lastError: {
          message: "Deletion cleanup manifest planner is not configured.",
        },
        failedAt: this.now(),
        updatedAt: this.now(),
      });
    }

    try {
      return await this.options.manifestPlanner.planOperation({
        operation: planning,
        repository: this.options.repository,
        now: this.now,
      });
    } catch (error) {
      return this.updateOperation(planning, {
        status: "failed",
        phase: "manifest",
        retryable: true,
        lastError: {
          message:
            error instanceof Error ? error.message : "Deletion cleanup manifest planning failed.",
        },
        failedAt: this.now(),
        updatedAt: this.now(),
      });
    }
  }

  private async updateOperation(
    operation: DeletionCleanupOperationRecord,
    patch: Partial<DeletionCleanupOperationRecord>,
  ): Promise<DeletionCleanupOperationRecord> {
    return this.options.repository.updateOperation({
      ...operation,
      ...patch,
    });
  }

  private getItemPageLimit(): number {
    return Math.max(1, this.options.objectBatchSize ?? 100);
  }

  private async listRetryableItems(
    operationId: string,
    itemType: "object" | "database_row" | "redis_key",
    retryFailedBefore: string,
  ): Promise<DeletionCleanupItemRecord[]> {
    const limit = this.getItemPageLimit();
    const listRetryable = this.options.repository.listRetryableItemsByOperationId;

    if (listRetryable !== undefined) {
      return listRetryable.call(this.options.repository, operationId, {
        itemType,
        limit,
        retryFailedBefore,
      });
    }

    const items = await this.options.repository.listItemsByOperationId(operationId);
    const retryableItems = items.filter((item) => {
      if (itemType === "object") {
        return isRetryableObjectItem(item, retryFailedBefore);
      }
      if (itemType === "redis_key") {
        return isRetryableRedisItem(item, retryFailedBefore);
      }

      return isRetryableDatabaseItem(item, retryFailedBefore);
    });
    const sortedItems =
      itemType === "database_row"
        ? retryableItems.sort(compareDatabaseCleanupItems)
        : retryableItems;

    return sortedItems.slice(0, limit);
  }

  private async hasFailedItems(
    operationId: string,
    itemType: DeletionCleanupItemType,
  ): Promise<boolean> {
    const hasFailed = this.options.repository.hasFailedItemsByOperationId;

    if (hasFailed !== undefined) {
      return hasFailed.call(this.options.repository, operationId, {
        itemType,
      });
    }

    const items = await this.options.repository.listItemsByOperationId(operationId);

    return items.some((item) => item.itemType === itemType && item.status === "failed");
  }

  private async hasRetryableItems(operationId: string): Promise<boolean> {
    const hasRetryable = this.options.repository.hasRetryableItemsByOperationId;

    if (hasRetryable !== undefined) {
      return hasRetryable.call(this.options.repository, operationId);
    }

    const items = await this.options.repository.listItemsByOperationId(operationId);

    return items.some(
      (item) =>
        (item.status === "pending" || item.status === "failed") &&
        item.attemptCount < item.maxAttempts,
    );
  }

  private async countItems(operationId: string): Promise<DeletionCleanupOperationItemCounts> {
    const countItemsByOperationId = this.options.repository.countItemsByOperationId;

    if (countItemsByOperationId !== undefined) {
      return countItemsByOperationId.call(this.options.repository, operationId);
    }

    const items = await this.options.repository.listItemsByOperationId(operationId);

    return countItems(items);
  }
}

export class PostgresDeletionCleanupRepository implements DeletionCleanupStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async findOperationById(id: string): Promise<DeletionCleanupOperationRecord | undefined> {
    const result = await sql<DeletionCleanupOperationRow>`
      select
        id,
        target_type,
        target_id,
        knowledge_base_id,
        status,
        phase,
        requested_by,
        request_id,
        queue_job_id,
        manifest,
        total_item_count,
        pending_item_count,
        deleted_item_count,
        skipped_item_count,
        failed_item_count,
        object_key_count,
        database_row_count,
        redis_key_count,
        attempt_count,
        max_attempts,
        retry_after,
        retryable,
        last_error,
        retention_expires_at,
        item_retention_expires_at,
        started_at,
        completed_at,
        failed_at,
        canceled_at,
        created_at,
        updated_at
      from deletion_cleanup_operations
      where id = ${id}
      limit 1
    `.execute(this.db);

    return result.rows[0] === undefined ? undefined : toOperationRecord(result.rows[0]);
  }

  async resolveOperationScope(
    operationId: string,
  ): Promise<{ tenantId: string; projectId: string }> {
    return requirePersistedCleanupOperationTenantProject(this.db, operationId);
  }

  async updateOperation(
    record: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupOperationRecord> {
    const scope = await requireCleanupOperationTenantProject(this.db, record);

    await sql`
      insert into deletion_cleanup_operations (
        id,
        tenant_id,
        project_id,
        target_type,
        target_id,
        knowledge_base_id,
        status,
        phase,
        requested_by,
        request_id,
        queue_job_id,
        manifest,
        total_item_count,
        pending_item_count,
        deleted_item_count,
        skipped_item_count,
        failed_item_count,
        object_key_count,
        database_row_count,
        redis_key_count,
        attempt_count,
        max_attempts,
        retry_after,
        retryable,
        last_error,
        retention_expires_at,
        item_retention_expires_at,
        started_at,
        completed_at,
        failed_at,
        canceled_at,
        created_at,
        updated_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.targetType},
        ${record.targetId},
        ${record.knowledgeBaseId},
        ${record.status},
        ${record.phase},
        ${record.requestedBy},
        ${record.requestId},
        ${record.queueJobId},
        ${JSON.stringify(record.manifest)}::jsonb,
        ${record.totalItemCount},
        ${record.pendingItemCount},
        ${record.deletedItemCount},
        ${record.skippedItemCount},
        ${record.failedItemCount},
        ${record.objectKeyCount},
        ${record.databaseRowCount},
        ${record.redisKeyCount},
        ${record.attemptCount},
        ${record.maxAttempts},
        ${record.retryAfter},
        ${record.retryable},
        ${record.lastError === null ? null : JSON.stringify(record.lastError)}::jsonb,
        ${record.retentionExpiresAt},
        ${record.itemRetentionExpiresAt},
        ${record.startedAt},
        ${record.completedAt},
        ${record.failedAt},
        ${record.canceledAt},
        ${record.createdAt},
        ${record.updatedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        phase = excluded.phase,
        queue_job_id = excluded.queue_job_id,
        manifest = excluded.manifest,
        total_item_count = excluded.total_item_count,
        pending_item_count = excluded.pending_item_count,
        deleted_item_count = excluded.deleted_item_count,
        skipped_item_count = excluded.skipped_item_count,
        failed_item_count = excluded.failed_item_count,
        object_key_count = excluded.object_key_count,
        database_row_count = excluded.database_row_count,
        redis_key_count = excluded.redis_key_count,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        retry_after = excluded.retry_after,
        retryable = excluded.retryable,
        last_error = excluded.last_error,
        retention_expires_at = excluded.retention_expires_at,
        item_retention_expires_at = excluded.item_retention_expires_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        failed_at = excluded.failed_at,
        canceled_at = excluded.canceled_at,
        updated_at = excluded.updated_at
    `.execute(this.db);

    return record;
  }

  async listItemsByOperationId(operationId: string): Promise<DeletionCleanupItemRecord[]> {
    const result = await sql<DeletionCleanupItemRow>`
      select
        id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      from deletion_cleanup_items
      where operation_id = ${operationId}
      order by created_at asc
    `.execute(this.db);

    return result.rows.map(toItemRecord);
  }

  async listRetryableItemsByOperationId(
    operationId: string,
    input: ListRetryableDeletionCleanupItemsInput,
  ): Promise<DeletionCleanupItemRecord[]> {
    if (input.itemType === "object") {
      const result = await sql<DeletionCleanupItemRow>`
        select
          id,
          operation_id,
          item_type,
          resource_type,
          resource_id,
          object_key,
          table_name,
          knowledge_base_id,
          source_document_id,
          status,
          phase,
          attempt_count,
          max_attempts,
          last_error,
          skip_reason,
          retry_after,
          retained_until,
          created_at,
          updated_at,
          completed_at
        from deletion_cleanup_items
        where operation_id = ${operationId}
          and item_type = 'object'
          and object_key is not null
          and attempt_count < max_attempts
          and (
            status = 'pending'
            or (status = 'failed' and updated_at <= ${input.retryFailedBefore})
          )
        order by created_at asc, id asc
        limit ${input.limit}
      `.execute(this.db);

      return result.rows.map(toItemRecord);
    }

    if (input.itemType === "redis_key") {
      const result = await sql<DeletionCleanupItemRow>`
        select
          id,
          operation_id,
          item_type,
          resource_type,
          resource_id,
          object_key,
          table_name,
          knowledge_base_id,
          source_document_id,
          status,
          phase,
          attempt_count,
          max_attempts,
          last_error,
          skip_reason,
          retry_after,
          retained_until,
          created_at,
          updated_at,
          completed_at
        from deletion_cleanup_items
        where operation_id = ${operationId}
          and item_type = 'redis_key'
          and resource_id is not null
          and attempt_count < max_attempts
          and (
            status = 'pending'
            or (status = 'failed' and updated_at <= ${input.retryFailedBefore})
          )
        order by resource_id asc, id asc
        limit ${input.limit}
      `.execute(this.db);

      return result.rows.map(toItemRecord);
    }

    const result = await sql<DeletionCleanupItemRow>`
      select
        id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      from deletion_cleanup_items
      where operation_id = ${operationId}
        and item_type = 'database_row'
        and table_name is not null
        and resource_id is not null
        and attempt_count < max_attempts
        and (
          status = 'pending'
          or (status = 'failed' and updated_at <= ${input.retryFailedBefore})
        )
      order by ${databaseCleanupPriorityOrderSql()} asc, resource_id asc, id asc
      limit ${input.limit}
    `.execute(this.db);

    return result.rows.map(toItemRecord);
  }

  async countItemsByOperationId(operationId: string): Promise<DeletionCleanupOperationItemCounts> {
    const result = await sql<DeletionCleanupItemCountRow>`
      select
        count(*)::text as total_item_count,
        count(*) filter (where status in ('pending', 'running'))::text as pending_item_count,
        count(*) filter (where status = 'deleted')::text as deleted_item_count,
        count(*) filter (where status = 'skipped')::text as skipped_item_count,
        count(*) filter (where status = 'failed')::text as failed_item_count,
        count(*) filter (where object_key is not null)::text as object_key_count,
        count(*) filter (where table_name is not null)::text as database_row_count,
        count(*) filter (where item_type = 'redis_key')::text as redis_key_count
      from deletion_cleanup_items
      where operation_id = ${operationId}
    `.execute(this.db);

    return toItemCounts(result.rows[0]);
  }

  async hasFailedItemsByOperationId(
    operationId: string,
    input: { itemType?: DeletionCleanupItemType } = {},
  ): Promise<boolean> {
    const result = await sql<{ exists: boolean }>`
      select exists (
        select 1
        from deletion_cleanup_items
        where operation_id = ${operationId}
          and status = 'failed'
          ${input.itemType === undefined ? sql`` : sql`and item_type = ${input.itemType}`}
        limit 1
      ) as exists
    `.execute(this.db);

    return result.rows[0]?.exists ?? false;
  }

  async hasRetryableItemsByOperationId(operationId: string): Promise<boolean> {
    const result = await sql<{ exists: boolean }>`
      select exists (
        select 1
        from deletion_cleanup_items
        where operation_id = ${operationId}
          and status in ('pending', 'failed')
          and attempt_count < max_attempts
        limit 1
      ) as exists
    `.execute(this.db);

    return result.rows[0]?.exists ?? false;
  }

  async upsertItem(record: DeletionCleanupItemRecord): Promise<DeletionCleanupItemRecord> {
    const scope = await requireCleanupItemTenantProject(this.db, record);

    await sql`
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      values (
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.operationId},
        ${record.itemType},
        ${record.resourceType},
        ${record.resourceId},
        ${record.objectKey},
        ${record.tableName},
        ${record.knowledgeBaseId},
        ${record.sourceDocumentId},
        ${record.status},
        ${record.phase},
        ${record.attemptCount},
        ${record.maxAttempts},
        ${record.lastError === null ? null : JSON.stringify(record.lastError)}::jsonb,
        ${record.skipReason},
        ${record.retryAfter},
        ${record.retainedUntil},
        ${record.createdAt},
        ${record.updatedAt},
        ${record.completedAt}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        status = excluded.status,
        phase = excluded.phase,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        last_error = excluded.last_error,
        skip_reason = excluded.skip_reason,
        retry_after = excluded.retry_after,
        retained_until = excluded.retained_until,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `.execute(this.db);

    return record;
  }

  async pruneExpiredRecords(
    now: string,
  ): Promise<{ deletedItems: number; deletedOperations: number }> {
    const deletedItems = await sql<{ count: string }>`
      with deleted as (
        delete from deletion_cleanup_items
        where retained_until is not null
          and retained_until <= ${now}
        returning id
      )
      select count(*)::text as count from deleted
    `.execute(this.db);
    const deletedOperations = await sql<{ id: string }>`
      delete from deletion_cleanup_operations
      where retention_expires_at is not null
        and retention_expires_at <= ${now}
      returning id
    `.execute(this.db);

    return {
      deletedItems: Number(deletedItems.rows[0]?.count ?? 0),
      deletedOperations: deletedOperations.rows.length,
    };
  }
}

export class PostgresDeletionCleanupManifestPlanner implements DeletionCleanupManifestPlanner {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly objectStorage?: ObjectStorageAdapter,
  ) {}

  async planOperation(
    input: DeletionCleanupManifestPlanInput,
  ): Promise<DeletionCleanupOperationRecord> {
    if (input.operation.targetType === "source_document") {
      await this.insertSourceDocumentDatabaseItems(input.operation, input.now());
      await this.insertSourceDocumentRedisItems(input.operation, input.now());
      await this.insertSourceDocumentPersistedObjectItems(input.operation, input.now());
      await this.insertSourceDocumentPrefixObjectItems(input.operation, input.now());
      const counts = await readOperationItemCounts(input.repository, input.operation.id);
      const legacyLayoutObjectCount = await this.countLegacyLayoutObjectItems(input.operation.id);
      const now = input.now();

      return input.repository.updateOperation({
        ...input.operation,
        ...counts,
        status: "running",
        phase: "manifest",
        manifest: {
          ...input.operation.manifest,
          object_key_count: counts.objectKeyCount,
          database_row_count: counts.databaseRowCount,
          redis_key_count: counts.redisKeyCount,
          total_item_count: counts.totalItemCount,
          prefix_scan_status: "completed",
          planning_status: "completed",
          planning_mode: "worker_source_document_prefix_scan",
          legacy_layout_object_count: legacyLayoutObjectCount,
        },
        retryable: true,
        lastError: null,
        updatedAt: now,
      });
    }

    if (isChildResourceCleanupTarget(input.operation.targetType)) {
      await this.insertChildResourceDatabaseItems(input.operation, input.now());
      await this.insertChildResourcePrefixObjectItems(input.operation, input.now());
      const counts = await readOperationItemCounts(input.repository, input.operation.id);
      const now = input.now();

      return input.repository.updateOperation({
        ...input.operation,
        ...counts,
        status: "running",
        phase: "manifest",
        manifest: {
          ...input.operation.manifest,
          target_type: input.operation.targetType,
          target_id: input.operation.targetId,
          knowledge_base_id: input.operation.knowledgeBaseId,
          object_key_count: counts.objectKeyCount,
          database_row_count: counts.databaseRowCount,
          redis_key_count: counts.redisKeyCount,
          total_item_count: counts.totalItemCount,
          prefix_scan_status: "completed",
          planning_status: "completed",
          planning_mode: "worker_child_resource_prefix_scan",
        },
        retryable: true,
        lastError: null,
        updatedAt: now,
      });
    }

    if (input.operation.targetType !== "knowledge_base") {
      return input.operation;
    }

    await this.insertKnowledgeBaseManifestItems(input.operation, input.now());
    await this.insertKnowledgeBasePrefixObjectItems(input.operation, input.now());
    await this.insertKnowledgeBaseRedisItems(input.operation, input.now());
    const counts = await readOperationItemCounts(input.repository, input.operation.id);
    const legacyLayoutObjectCount = await this.countLegacyLayoutObjectItems(input.operation.id);
    const now = input.now();

    return input.repository.updateOperation({
      ...input.operation,
      ...counts,
      status: "running",
      phase: "manifest",
      manifest: {
        ...input.operation.manifest,
        target_type: input.operation.targetType,
        target_id: input.operation.targetId,
        knowledge_base_id: input.operation.knowledgeBaseId,
        object_key_count: counts.objectKeyCount,
        database_row_count: counts.databaseRowCount,
        redis_key_count: counts.redisKeyCount,
        skipped_reference_count: 0,
        total_item_count: counts.totalItemCount,
        item_page_size: cleanupManifestPlanningPageSize,
        item_page_count:
          counts.totalItemCount === 0
            ? 0
            : Math.ceil(counts.totalItemCount / cleanupManifestPlanningPageSize),
        planning_status: "completed",
        planning_mode: "worker_bounded_db",
        legacy_layout_object_count: legacyLayoutObjectCount,
      },
      retryable: true,
      lastError: null,
      updatedAt: now,
    });
  }

  private async insertKnowledgeBaseManifestItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);
    const forkScopedRowsSql = createForkScopedManifestRowsSql();

    await sql`
      with target_kb as (
        select id, knowledge_base_type
        from knowledge_bases
        where id = ${operation.targetId}
          and tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
        limit 1
      ),
      object_rows as (
        select distinct on (object_key)
          'object'::text as item_type,
          resource_type,
          resource_id,
          object_key,
          null::text as table_name,
          10 as sort_group,
          object_key as sort_key
        from (
          select
            'source_documents'::text as resource_type,
            source_documents.id as resource_id,
            source_documents.object_key as object_key
          from source_documents
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where source_documents.object_key is not null
          union all
          select
            'parsed_contents'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.normalized_markdown_object_key as object_key
          from parsed_contents
          inner join source_documents on source_documents.id = parsed_contents.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where parsed_contents.normalized_markdown_object_key is not null
          union all
          select
            'parsed_contents'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.plain_text_object_key as object_key
          from parsed_contents
          inner join source_documents on source_documents.id = parsed_contents.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where parsed_contents.plain_text_object_key is not null
          union all
          select
            'parsed_contents'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.captioned_markdown_object_key as object_key
          from parsed_contents
          inner join source_documents on source_documents.id = parsed_contents.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where parsed_contents.captioned_markdown_object_key is not null
          union all
          select
            'parsed_contents'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.markdown_preview_object_key as object_key
          from parsed_contents
          inner join source_documents on source_documents.id = parsed_contents.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where parsed_contents.markdown_preview_object_key is not null
          union all
          select
            'media_assets'::text as resource_type,
            media_assets.id as resource_id,
            media_assets.object_key as object_key
          from media_assets
          inner join source_documents on source_documents.id = media_assets.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where media_assets.object_key is not null
          union all
          select
            'ocr_artifacts'::text as resource_type,
            ocr_artifacts.id as resource_id,
            ocr_artifacts.object_key as object_key
          from ocr_artifacts
          inner join source_documents on source_documents.id = ocr_artifacts.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where ocr_artifacts.object_key is not null
          union all
          select
            'document_processing_units'::text as resource_type,
            document_processing_units.id as resource_id,
            document_processing_units.object_key as object_key
          from document_processing_units
          inner join target_kb on target_kb.id = document_processing_units.knowledge_base_id
          where document_processing_units.object_key is not null
          union all
          select
            'document_processing_units.object_refs'::text as resource_type,
            document_processing_units.id as resource_id,
            object_ref.value ->> 'object_key' as object_key
          from document_processing_units
          inner join target_kb on target_kb.id = document_processing_units.knowledge_base_id
          cross join lateral jsonb_array_elements(document_processing_units.object_refs) as object_ref(value)
          where object_ref.value ->> 'object_key' is not null
        ) raw_object_rows
        order by object_key, resource_type, resource_id
      ),
      database_rows as (
        select distinct on (table_name, resource_type, resource_id)
          'database_row'::text as item_type,
          resource_type,
          resource_id,
          null::text as object_key,
          table_name,
          1000 + ${databaseCleanupPriorityOrderSql()} as sort_group,
          resource_id as sort_key
        from (
          select
            'knowledge_bases'::text as resource_type,
            target_kb.id as resource_id,
            'knowledge_bases'::text as table_name
          from target_kb
          union all
          select
            'source_documents'::text as resource_type,
            source_documents.id as resource_id,
            'source_documents'::text as table_name
          from source_documents
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          union all
          select
            'parsed_contents'::text as resource_type,
            parsed_contents.id as resource_id,
            'parsed_contents'::text as table_name
          from parsed_contents
          inner join source_documents on source_documents.id = parsed_contents.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          union all
          select
            'media_assets'::text as resource_type,
            media_assets.id as resource_id,
            'media_assets'::text as table_name
          from media_assets
          inner join source_documents on source_documents.id = media_assets.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          union all
          select
            'ocr_artifacts'::text as resource_type,
            ocr_artifacts.id as resource_id,
            'ocr_artifacts'::text as table_name
          from ocr_artifacts
          inner join source_documents on source_documents.id = ocr_artifacts.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          union all
          select
            'ocr_page_statuses'::text as resource_type,
            ocr_page_statuses.id as resource_id,
            'ocr_page_statuses'::text as table_name
          from ocr_page_statuses
          inner join source_documents on source_documents.id = ocr_page_statuses.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          union all
          select
            'ocr_blocks'::text as resource_type,
            ocr_blocks.id as resource_id,
            'ocr_blocks'::text as table_name
          from ocr_blocks
          inner join source_documents on source_documents.id = ocr_blocks.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          union all
          select
            'document_processing_units'::text as resource_type,
            document_processing_units.id as resource_id,
            'document_processing_units'::text as table_name
          from document_processing_units
          inner join target_kb on target_kb.id = document_processing_units.knowledge_base_id
          union all
          select
            'document_processing_checkpoints'::text as resource_type,
            document_processing_checkpoints.id as resource_id,
            'document_processing_checkpoints'::text as table_name
          from document_processing_checkpoints
          inner join target_kb on target_kb.id = document_processing_checkpoints.knowledge_base_id
          union all
          select
            'jobs'::text as resource_type,
            jobs.id as resource_id,
            'jobs'::text as table_name
          from jobs
          inner join target_kb on target_kb.id = jobs.knowledge_base_id
          union all
          select
            'job_events'::text as resource_type,
            jobs.id || ':' || job_events.created_at::text || ':' || job_events.event_type as resource_id,
            'job_events'::text as table_name
          from job_events
          inner join jobs on jobs.id = job_events.job_id
          inner join target_kb on target_kb.id = jobs.knowledge_base_id
          union all
          select
            'webhook_deliveries'::text as resource_type,
            webhook_deliveries.id as resource_id,
            'webhook_deliveries'::text as table_name
          from webhook_deliveries
          inner join target_kb on target_kb.id = webhook_deliveries.knowledge_base_id
          union all
          select
            'scheduled_import_jobs'::text as resource_type,
            scheduled_import_jobs.id as resource_id,
            'scheduled_import_jobs'::text as table_name
          from scheduled_import_jobs
          inner join target_kb on target_kb.id = scheduled_import_jobs.knowledge_base_id
          union all
          select
            'import_previews'::text as resource_type,
            import_previews.id as resource_id,
            'import_previews'::text as table_name
          from import_previews
          inner join target_kb on target_kb.id = import_previews.knowledge_base_id
          union all
          select
            'page_embeddings'::text as resource_type,
            page_embeddings.id as resource_id,
            'page_embeddings'::text as table_name
          from page_embeddings
          inner join target_kb on target_kb.id = page_embeddings.knowledge_base_id
          union all
          select
            'retrieval_traces'::text as resource_type,
            retrieval_traces.id as resource_id,
            'retrieval_traces'::text as table_name
          from retrieval_traces
          inner join target_kb on target_kb.id = retrieval_traces.knowledge_base_id
          union all
          select
            'wiki_edge_sources'::text as resource_type,
            wiki_edge_sources.id as resource_id,
            'wiki_edge_sources'::text as table_name
          from wiki_edge_sources
          inner join wiki_edges on wiki_edges.id = wiki_edge_sources.edge_id
          inner join target_kb on target_kb.id = wiki_edges.knowledge_base_id
          union all
          select
            'wiki_edges'::text as resource_type,
            wiki_edges.id as resource_id,
            'wiki_edges'::text as table_name
          from wiki_edges
          inner join target_kb on target_kb.id = wiki_edges.knowledge_base_id
          union all
          select
            'duplicate_decisions'::text as resource_type,
            duplicate_decisions.id as resource_id,
            'duplicate_decisions'::text as table_name
          from duplicate_decisions
          inner join target_kb on target_kb.id = duplicate_decisions.knowledge_base_id
          union all
          select
            'knowledge_checks'::text as resource_type,
            knowledge_checks.id as resource_id,
            'knowledge_checks'::text as table_name
          from knowledge_checks
          inner join target_kb on target_kb.id = knowledge_checks.knowledge_base_id
          union all
          select
            'page_merge_records'::text as resource_type,
            page_merge_records.id as resource_id,
            'page_merge_records'::text as table_name
          from page_merge_records
          inner join target_kb on target_kb.id = page_merge_records.knowledge_base_id
          union all
          select
            'rollback_records'::text as resource_type,
            rollback_records.id as resource_id,
            'rollback_records'::text as table_name
          from rollback_records
          inner join target_kb on target_kb.id = rollback_records.knowledge_base_id
          union all
          select
            'change_set_items'::text as resource_type,
            change_set_items.id as resource_id,
            'change_set_items'::text as table_name
          from change_set_items
          inner join change_sets on change_sets.id = change_set_items.change_set_id
          inner join target_kb on target_kb.id = change_sets.knowledge_base_id
          union all
          select
            'change_sets'::text as resource_type,
            change_sets.id as resource_id,
            'change_sets'::text as table_name
          from change_sets
          inner join target_kb on target_kb.id = change_sets.knowledge_base_id
          union all
          select
            'wiki_draft_candidates'::text as resource_type,
            wiki_draft_candidates.id as resource_id,
            'wiki_draft_candidates'::text as table_name
          from wiki_draft_candidates
          inner join target_kb on target_kb.id = wiki_draft_candidates.knowledge_base_id
          union all
          select
            'wiki_analysis_results'::text as resource_type,
            wiki_analysis_results.id as resource_id,
            'wiki_analysis_results'::text as table_name
          from wiki_analysis_results
          inner join target_kb on target_kb.id = wiki_analysis_results.knowledge_base_id
          union all
          select
            'model_calls'::text as resource_type,
            model_calls.id as resource_id,
            'model_calls'::text as table_name
          from model_calls
          inner join target_kb on target_kb.id = model_calls.knowledge_base_id
          union all
          select
            'compile_stage_executions'::text as resource_type,
            compile_stage_executions.id as resource_id,
            'compile_stage_executions'::text as table_name
          from compile_stage_executions
          inner join target_kb on target_kb.id = compile_stage_executions.knowledge_base_id
          union all
          select
            'source_watch_rules'::text as resource_type,
            source_watch_rules.id as resource_id,
            'source_watch_rules'::text as table_name
          from source_watch_rules
          inner join target_kb on target_kb.id = source_watch_rules.knowledge_base_id
          union all
          select
            'webhooks'::text as resource_type,
            webhooks.id as resource_id,
            'webhooks'::text as table_name
          from webhooks
          inner join target_kb on target_kb.id = webhooks.knowledge_base_id
          union all
          select
            'knowledge_versions'::text as resource_type,
            knowledge_versions.id as resource_id,
            'knowledge_versions'::text as table_name
          from knowledge_versions
          inner join target_kb on target_kb.id = knowledge_versions.knowledge_base_id
          union all
          select
            'system_pages'::text as resource_type,
            system_pages.id as resource_id,
            'system_pages'::text as table_name
          from system_pages
          inner join target_kb on target_kb.id = system_pages.knowledge_base_id
          union all
          select
            'wiki_page_versions'::text as resource_type,
            wiki_page_versions.id as resource_id,
            'wiki_page_versions'::text as table_name
          from wiki_page_versions
          inner join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
          inner join target_kb on target_kb.id = wiki_pages.knowledge_base_id
          union all
          select
            'wiki_pages'::text as resource_type,
            wiki_pages.id as resource_id,
            'wiki_pages'::text as table_name
          from wiki_pages
          inner join target_kb on target_kb.id = wiki_pages.knowledge_base_id
          union all
          ${forkScopedRowsSql}
        ) raw_database_rows
        order by table_name, resource_type, resource_id
      ),
      numbered_items as (
        select
          row_number() over (order by sort_group asc, sort_key asc, resource_type asc, resource_id asc) as item_index,
          item_type,
          resource_type,
          resource_id,
          object_key,
          table_name
        from (
          select * from object_rows
          union all
          select * from database_rows
        ) manifest_rows
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        ${operation.id} || '_item_' || lpad(item_index::text, 6, '0'),
        ${scope.tenantId},
        ${scope.projectId},
        ${operation.id},
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        ${operation.knowledgeBaseId},
        null,
        'pending',
        'queued',
        0,
        ${operation.maxAttempts},
        null,
        null,
        null,
        ${operation.itemRetentionExpiresAt},
        ${now},
        ${now},
        null
      from numbered_items
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertKnowledgeBasePrefixObjectItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (this.objectStorage === undefined || operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);
    const prefix = createKnowledgeBaseObjectPrefix({
      knowledgeBaseId: operation.knowledgeBaseId,
    });
    await this.insertListedObjectPrefixItems({
      now,
      operation,
      prefixes: [prefix],
      resourceType: "object_storage_prefix",
      scope,
      sourceDocumentId: null,
    });

    await this.insertKnowledgeBaseLegacyPrefixObjectItems(operation, now, scope);
  }

  private async insertPrefixObjectRows(input: {
    keys: readonly string[];
    now: string;
    operation: DeletionCleanupOperationRecord;
    resourceType: string;
    scope: { tenantId: string; projectId: string };
    sourceDocumentId: string | null;
  }): Promise<void> {
    const rows = input.keys
      .filter((key) => key.length > 0)
      .map((key) => ({
        id: createCleanupManifestItemId(input.operation.id, "object", key),
        object_key: key,
      }));

    if (rows.length === 0) {
      return;
    }

    await sql`
      with input_rows as (
        select *
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as row(id text, object_key text)
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        input_rows.id,
        ${input.scope.tenantId},
        ${input.scope.projectId},
        ${input.operation.id},
        'object',
        ${input.resourceType},
        input_rows.object_key,
        input_rows.object_key,
        null,
        ${input.operation.knowledgeBaseId},
        ${input.sourceDocumentId},
        'pending',
        'queued',
        0,
        ${input.operation.maxAttempts},
        null,
        null,
        null,
        ${input.operation.itemRetentionExpiresAt},
        ${input.now},
        ${input.now},
        null
      from input_rows
      where not exists (
        select 1
        from deletion_cleanup_items existing
        where existing.operation_id = ${input.operation.id}
          and existing.object_key = input_rows.object_key
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertSourceDocumentDatabaseItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    await sql`
      with target_source as (
        select id, knowledge_base_id
        from source_documents
        where id = ${operation.targetId}
          and knowledge_base_id = ${operation.knowledgeBaseId}
          and tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
        limit 1
      ),
      database_rows as (
        select distinct on (table_name, resource_type, resource_id)
          'database_row'::text as item_type,
          resource_type,
          resource_id,
          null::text as object_key,
          table_name,
          1000 + ${databaseCleanupPriorityOrderSql()} as sort_group,
          resource_id as sort_key
        from (
          select
            'source_documents'::text as resource_type,
            target_source.id as resource_id,
            'source_documents'::text as table_name
          from target_source
          union all
          select
            'parsed_contents'::text as resource_type,
            parsed_contents.id as resource_id,
            'parsed_contents'::text as table_name
          from parsed_contents
          inner join target_source on target_source.id = parsed_contents.source_document_id
          union all
          select
            'media_assets'::text as resource_type,
            media_assets.id as resource_id,
            'media_assets'::text as table_name
          from media_assets
          inner join target_source on target_source.id = media_assets.source_document_id
          union all
          select
            'ocr_artifacts'::text as resource_type,
            ocr_artifacts.id as resource_id,
            'ocr_artifacts'::text as table_name
          from ocr_artifacts
          inner join target_source on target_source.id = ocr_artifacts.source_document_id
          union all
          select
            'ocr_page_statuses'::text as resource_type,
            ocr_page_statuses.id as resource_id,
            'ocr_page_statuses'::text as table_name
          from ocr_page_statuses
          inner join target_source on target_source.id = ocr_page_statuses.source_document_id
          union all
          select
            'ocr_blocks'::text as resource_type,
            ocr_blocks.id as resource_id,
            'ocr_blocks'::text as table_name
          from ocr_blocks
          inner join target_source on target_source.id = ocr_blocks.source_document_id
          union all
          select
            'document_processing_units'::text as resource_type,
            document_processing_units.id as resource_id,
            'document_processing_units'::text as table_name
          from document_processing_units
          inner join target_source on target_source.id = document_processing_units.source_document_id
          union all
          select
            'document_processing_checkpoints'::text as resource_type,
            document_processing_checkpoints.id as resource_id,
            'document_processing_checkpoints'::text as table_name
          from document_processing_checkpoints
          inner join target_source on target_source.id = document_processing_checkpoints.source_document_id
          union all
          select
            'jobs'::text as resource_type,
            jobs.id as resource_id,
            'jobs'::text as table_name
          from jobs
          inner join target_source on target_source.id = jobs.source_document_id
          union all
          select
            'job_events'::text as resource_type,
            jobs.id || ':' || job_events.created_at::text || ':' || job_events.event_type as resource_id,
            'job_events'::text as table_name
          from job_events
          inner join jobs on jobs.id = job_events.job_id
          inner join target_source on target_source.id = jobs.source_document_id
          union all
          select
            'wiki_analysis_results'::text as resource_type,
            wiki_analysis_results.id as resource_id,
            'wiki_analysis_results'::text as table_name
          from wiki_analysis_results
          inner join target_source on target_source.id = wiki_analysis_results.source_document_id
          union all
          select
            'model_calls'::text as resource_type,
            model_calls.id as resource_id,
            'model_calls'::text as table_name
          from model_calls
          inner join target_source on target_source.id = model_calls.source_document_id
          union all
          select
            'compile_stage_executions'::text as resource_type,
            compile_stage_executions.id as resource_id,
            'compile_stage_executions'::text as table_name
          from compile_stage_executions
          inner join target_source on target_source.id = compile_stage_executions.source_document_id
          union all
          select
            'delete_impact_previews'::text as resource_type,
            delete_impact_previews.id as resource_id,
            'delete_impact_previews'::text as table_name
          from delete_impact_previews
          inner join target_source on target_source.id = delete_impact_previews.source_document_id
        ) raw_database_rows
        order by table_name, resource_type, resource_id
      ),
      numbered_items as (
        select
          row_number() over (order by sort_group asc, sort_key asc, resource_type asc, resource_id asc) as item_index,
          item_type,
          resource_type,
          resource_id,
          object_key,
          table_name
        from database_rows
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        ${operation.id} || '_source_database_' || md5(table_name || ':' || resource_id),
        ${scope.tenantId},
        ${scope.projectId},
        ${operation.id},
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        ${operation.knowledgeBaseId},
        ${operation.targetId},
        'pending',
        'queued',
        0,
        ${operation.maxAttempts},
        null,
        null,
        null,
        ${operation.itemRetentionExpiresAt},
        ${now},
        ${now},
        null
      from numbered_items
      where not exists (
        select 1
        from deletion_cleanup_items existing
        where existing.operation_id = ${operation.id}
          and existing.item_type = 'database_row'
          and existing.table_name = numbered_items.table_name
          and existing.resource_id = numbered_items.resource_id
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertSourceDocumentRedisItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    await sql`
      with target_source as (
        select id, knowledge_base_id
        from source_documents
        where id = ${operation.targetId}
          and knowledge_base_id = ${operation.knowledgeBaseId}
          and tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
        limit 1
      ),
      source_jobs as (
        select jobs.id
        from jobs
        inner join target_source on target_source.id = jobs.source_document_id
        where jobs.tenant_id = ${scope.tenantId}
          and jobs.project_id = ${scope.projectId}
      ),
      redis_rows as (
        select distinct on (redis_key)
          resource_type,
          redis_key
        from (
          select
            'bullmq_source_parse_job'::text as resource_type,
            'bull:source.parse:' || source_jobs.id as redis_key
          from source_jobs
          union all
          select
            'bullmq_wiki_analyze_job'::text as resource_type,
            'bull:wiki.analyze:' || source_jobs.id || '-analyze' as redis_key
          from source_jobs
          union all
          select
            'bullmq_wiki_generate_job'::text as resource_type,
            'bull:wiki.generate:'
              || source_jobs.id
              || '-generate-analysis_'
              || regexp_replace(wiki_analysis_results.id, '^analysis_', '') as redis_key
          from wiki_analysis_results
          inner join source_jobs on source_jobs.id = wiki_analysis_results.job_id
          union all
          select
            'bullmq_wiki_merge_job'::text as resource_type,
            'bull:wiki.merge:'
              || source_jobs.id
              || '-merge-draft_'
              || regexp_replace(wiki_draft_candidates.id, '^draft_', '') as redis_key
          from wiki_draft_candidates
          inner join source_jobs on source_jobs.id = wiki_draft_candidates.job_id
        ) raw_redis_rows
        order by redis_key, resource_type
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        ${operation.id} || '_source_redis_' || md5(redis_key),
        ${scope.tenantId},
        ${scope.projectId},
        ${operation.id},
        'redis_key',
        resource_type,
        redis_key,
        null,
        null,
        ${operation.knowledgeBaseId},
        ${operation.targetId},
        'pending',
        'queued',
        0,
        ${operation.maxAttempts},
        null,
        null,
        null,
        ${operation.itemRetentionExpiresAt},
        ${now},
        ${now},
        null
      from redis_rows
      where not exists (
        select 1
        from deletion_cleanup_items existing
        where existing.operation_id = ${operation.id}
          and existing.item_type = 'redis_key'
          and existing.resource_id = redis_rows.redis_key
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertSourceDocumentPersistedObjectItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    await sql`
      with target_source as (
        select id, knowledge_base_id
        from source_documents
        where id = ${operation.targetId}
          and knowledge_base_id = ${operation.knowledgeBaseId}
          and tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
        limit 1
      ),
      object_rows as (
        select distinct on (object_key)
          resource_type,
          resource_id,
          object_key
        from (
          select
            'source_documents.object_key'::text as resource_type,
            target_source.id as resource_id,
            source_documents.object_key as object_key
          from source_documents
          inner join target_source on target_source.id = source_documents.id
          where source_documents.object_key is not null
          union all
          select
            'parsed_contents.normalized_markdown_object_key'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.normalized_markdown_object_key as object_key
          from parsed_contents
          inner join target_source on target_source.id = parsed_contents.source_document_id
          where parsed_contents.normalized_markdown_object_key is not null
          union all
          select
            'parsed_contents.plain_text_object_key'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.plain_text_object_key as object_key
          from parsed_contents
          inner join target_source on target_source.id = parsed_contents.source_document_id
          where parsed_contents.plain_text_object_key is not null
          union all
          select
            'parsed_contents.captioned_markdown_object_key'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.captioned_markdown_object_key as object_key
          from parsed_contents
          inner join target_source on target_source.id = parsed_contents.source_document_id
          where parsed_contents.captioned_markdown_object_key is not null
          union all
          select
            'parsed_contents.markdown_preview_object_key'::text as resource_type,
            parsed_contents.id as resource_id,
            parsed_contents.markdown_preview_object_key as object_key
          from parsed_contents
          inner join target_source on target_source.id = parsed_contents.source_document_id
          where parsed_contents.markdown_preview_object_key is not null
          union all
          select
            'media_assets.object_key'::text as resource_type,
            media_assets.id as resource_id,
            media_assets.object_key as object_key
          from media_assets
          inner join target_source on target_source.id = media_assets.source_document_id
          where media_assets.object_key is not null
          union all
          select
            'ocr_artifacts.object_key'::text as resource_type,
            ocr_artifacts.id as resource_id,
            ocr_artifacts.object_key as object_key
          from ocr_artifacts
          inner join target_source on target_source.id = ocr_artifacts.source_document_id
          where ocr_artifacts.object_key is not null
          union all
          select
            'document_processing_units.object_key'::text as resource_type,
            document_processing_units.id as resource_id,
            document_processing_units.object_key as object_key
          from document_processing_units
          inner join target_source on target_source.id = document_processing_units.source_document_id
          where document_processing_units.object_key is not null
          union all
          select
            'document_processing_units.object_refs'::text as resource_type,
            document_processing_units.id as resource_id,
            object_ref.value ->> 'object_key' as object_key
          from document_processing_units
          inner join target_source on target_source.id = document_processing_units.source_document_id
          cross join lateral jsonb_array_elements(document_processing_units.object_refs) as object_ref(value)
          where object_ref.value ->> 'object_key' is not null
        ) raw_object_rows
        order by object_key, resource_type, resource_id
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        ${operation.id} || '_source_object_' || md5(object_key),
        ${scope.tenantId},
        ${scope.projectId},
        ${operation.id},
        'object',
        resource_type,
        resource_id,
        object_key,
        null,
        ${operation.knowledgeBaseId},
        ${operation.targetId},
        'pending',
        'queued',
        0,
        ${operation.maxAttempts},
        null,
        null,
        null,
        ${operation.itemRetentionExpiresAt},
        ${now},
        ${now},
        null
      from object_rows
      where not exists (
        select 1
        from deletion_cleanup_items existing
        where existing.operation_id = ${operation.id}
          and existing.object_key = object_rows.object_key
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertSourceDocumentPrefixObjectItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (this.objectStorage === undefined || operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    await this.insertListedObjectPrefixItems({
      now,
      operation,
      prefixes: createSourceDocumentObjectPrefixes(operation),
      resourceType: "source_document_prefix",
      scope,
      sourceDocumentId: operation.targetId,
    });
    await this.insertListedObjectPrefixItems({
      now,
      operation,
      prefixes: createLegacySourceDocumentObjectPrefixes({
        documentId: operation.targetId,
        knowledgeBaseId: operation.knowledgeBaseId,
      }),
      resourceType: "legacy_source_document_prefix",
      scope,
      sourceDocumentId: operation.targetId,
    });
  }

  private async insertListedObjectPrefixItems(input: {
    now: string;
    operation: DeletionCleanupOperationRecord;
    prefixes: readonly string[];
    resourceType: string;
    scope: { tenantId: string; projectId: string };
    sourceDocumentId: string | null;
  }): Promise<void> {
    if (this.objectStorage === undefined) {
      return;
    }

    for (const prefix of input.prefixes) {
      let continuationToken: string | undefined;

      do {
        const page = await this.objectStorage.listObjectsByPrefix({
          maxKeys: 1000,
          prefix,
          ...(continuationToken === undefined ? {} : { continuationToken }),
        });
        await this.insertPrefixObjectRows({
          keys: page.objects.map((object) => object.key),
          now: input.now,
          operation: input.operation,
          resourceType: input.resourceType,
          scope: input.scope,
          sourceDocumentId: input.sourceDocumentId,
        });
        continuationToken = page.nextContinuationToken;
      } while (continuationToken !== undefined);
    }
  }

  private async insertKnowledgeBaseLegacyPrefixObjectItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
    scope: { tenantId: string; projectId: string },
  ): Promise<void> {
    if (operation.knowledgeBaseId === null) {
      return;
    }

    const sourceDocumentPageSize = knowledgeBaseLegacySourceDocumentPageSize;
    let afterId: string | null = null;

    while (true) {
      const result = await sql<{ id: string }>`
        select id
        from source_documents
        where knowledge_base_id = ${operation.knowledgeBaseId}
          and tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
          and (${afterId}::text is null or id > ${afterId})
        order by id asc
        limit ${sourceDocumentPageSize}
      `.execute(this.db);

      if (result.rows.length === 0) {
        return;
      }

      for (const row of result.rows) {
        await this.insertListedObjectPrefixItems({
          now,
          operation,
          prefixes: createLegacySourceDocumentObjectPrefixes({
            documentId: row.id,
            knowledgeBaseId: operation.knowledgeBaseId,
          }),
          resourceType: "legacy_source_document_prefix",
          scope,
          sourceDocumentId: row.id,
        });
      }

      afterId = result.rows[result.rows.length - 1]?.id ?? afterId;
      if (result.rows.length < sourceDocumentPageSize) {
        return;
      }
    }
  }

  private async countLegacyLayoutObjectItems(operationId: string): Promise<number> {
    const result = await sql<{ count: string }>`
      select count(*)::text as count
      from deletion_cleanup_items
      where operation_id = ${operationId}
        and item_type = 'object'
        and object_key is not null
        and (
          resource_type like 'legacy_%'
          or object_key ~ '^(sources|parsed|media|ocr|processing)/'
        )
    `.execute(this.db);

    return Number(result.rows[0]?.count ?? 0);
  }

  private async insertChildResourceDatabaseItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    await sql`
      with target_page as (
        select id, knowledge_base_id
        from wiki_pages
        where ${operation.targetType === "wiki_page" ? sql`id = ${operation.targetId}` : sql`false`}
          and knowledge_base_id = ${operation.knowledgeBaseId}
        limit 1
      ),
      target_page_version as (
        select wiki_page_versions.id, wiki_page_versions.page_id, wiki_pages.knowledge_base_id
        from wiki_page_versions
        inner join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
        where ${operation.targetType === "wiki_page_version" ? sql`wiki_page_versions.id = ${operation.targetId}` : sql`false`}
          and wiki_pages.knowledge_base_id = ${operation.knowledgeBaseId}
        limit 1
      ),
      target_edge as (
        select id, knowledge_base_id
        from wiki_edges
        where ${operation.targetType === "wiki_edge" ? sql`id = ${operation.targetId}` : sql`false`}
          and knowledge_base_id = ${operation.knowledgeBaseId}
        limit 1
      ),
      database_rows as (
        select distinct on (table_name, resource_type, resource_id)
          'database_row'::text as item_type,
          resource_type,
          resource_id,
          null::text as object_key,
          table_name,
          1000 + ${databaseCleanupPriorityOrderSql()} as sort_group,
          resource_id as sort_key
        from (
          select
            'page_embeddings'::text as resource_type,
            page_embeddings.id as resource_id,
            'page_embeddings'::text as table_name
          from page_embeddings
          inner join target_page on target_page.id = page_embeddings.page_id
          union all
          select
            'page_embeddings'::text as resource_type,
            page_embeddings.id as resource_id,
            'page_embeddings'::text as table_name
          from page_embeddings
          inner join wiki_page_versions on wiki_page_versions.id = page_embeddings.page_version_id
          inner join target_page on target_page.id = wiki_page_versions.page_id
          union all
          select
            'page_embeddings'::text as resource_type,
            page_embeddings.id as resource_id,
            'page_embeddings'::text as table_name
          from page_embeddings
          inner join target_page_version on target_page_version.id = page_embeddings.page_version_id
          union all
          select
            'page_embeddings'::text as resource_type,
            page_embeddings.id as resource_id,
            'page_embeddings'::text as table_name
          from page_embeddings
          inner join target_edge on page_embeddings.object_type = 'wiki_edge'
            and page_embeddings.object_id = target_edge.id
          union all
          select
            'wiki_edge_sources'::text as resource_type,
            wiki_edge_sources.id as resource_id,
            'wiki_edge_sources'::text as table_name
          from wiki_edge_sources
          inner join wiki_edges on wiki_edges.id = wiki_edge_sources.edge_id
          inner join target_page on target_page.id = wiki_edges.from_page_id
            or target_page.id = wiki_edges.to_page_id
          union all
          select
            'wiki_edge_sources'::text as resource_type,
            wiki_edge_sources.id as resource_id,
            'wiki_edge_sources'::text as table_name
          from wiki_edge_sources
          inner join target_page_version on target_page_version.id = wiki_edge_sources.page_version_id
          union all
          select
            'wiki_edge_sources'::text as resource_type,
            wiki_edge_sources.id as resource_id,
            'wiki_edge_sources'::text as table_name
          from wiki_edge_sources
          inner join target_edge on target_edge.id = wiki_edge_sources.edge_id
          union all
          select
            'wiki_edges'::text as resource_type,
            wiki_edges.id as resource_id,
            'wiki_edges'::text as table_name
          from wiki_edges
          inner join target_page on target_page.id = wiki_edges.from_page_id
            or target_page.id = wiki_edges.to_page_id
          union all
          select
            'wiki_edges'::text as resource_type,
            target_edge.id as resource_id,
            'wiki_edges'::text as table_name
          from target_edge
          union all
          select
            'wiki_page_versions'::text as resource_type,
            wiki_page_versions.id as resource_id,
            'wiki_page_versions'::text as table_name
          from wiki_page_versions
          inner join target_page on target_page.id = wiki_page_versions.page_id
          union all
          select
            'wiki_page_versions'::text as resource_type,
            target_page_version.id as resource_id,
            'wiki_page_versions'::text as table_name
          from target_page_version
          union all
          select
            'wiki_pages'::text as resource_type,
            target_page.id as resource_id,
            'wiki_pages'::text as table_name
          from target_page
        ) raw_database_rows
        order by table_name, resource_type, resource_id
      ),
      numbered_items as (
        select
          row_number() over (order by sort_group asc, sort_key asc, resource_type asc, resource_id asc) as item_index,
          item_type,
          resource_type,
          resource_id,
          object_key,
          table_name
        from database_rows
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        ${operation.id} || '_child_database_' || md5(table_name || ':' || resource_id),
        ${scope.tenantId},
        ${scope.projectId},
        ${operation.id},
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        ${operation.knowledgeBaseId},
        null,
        'pending',
        'queued',
        0,
        ${operation.maxAttempts},
        null,
        null,
        null,
        ${operation.itemRetentionExpiresAt},
        ${now},
        ${now},
        null
      from numbered_items
      where not exists (
        select 1
        from deletion_cleanup_items existing
        where existing.operation_id = ${operation.id}
          and existing.item_type = 'database_row'
          and existing.table_name = numbered_items.table_name
          and existing.resource_id = numbered_items.resource_id
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertChildResourcePrefixObjectItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (this.objectStorage === undefined || operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    for (const prefix of createChildResourceObjectPrefixes(operation)) {
      let continuationToken: string | undefined;

      do {
        const page = await this.objectStorage.listObjectsByPrefix({
          maxKeys: 1000,
          prefix,
          ...(continuationToken === undefined ? {} : { continuationToken }),
        });
        await this.insertPrefixObjectRows({
          keys: page.objects.map((object) => object.key),
          now,
          operation,
          resourceType: `${operation.targetType}_prefix`,
          scope,
          sourceDocumentId: null,
        });
        continuationToken = page.nextContinuationToken;
      } while (continuationToken !== undefined);
    }
  }

  private async insertKnowledgeBaseRedisItems(
    operation: DeletionCleanupOperationRecord,
    now: string,
  ): Promise<void> {
    if (operation.knowledgeBaseId === null) {
      return;
    }

    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);
    const rows = createKnowledgeBaseRedisCleanupRows(operation.knowledgeBaseId).map((row) => ({
      id: createCleanupManifestItemId(operation.id, "redis", row.key),
      redis_key: row.key,
      resource_type: row.resourceType,
    }));

    await sql`
      with input_rows as (
        select *
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          as row(id text, redis_key text, resource_type text)
      )
      insert into deletion_cleanup_items (
        id,
        tenant_id,
        project_id,
        operation_id,
        item_type,
        resource_type,
        resource_id,
        object_key,
        table_name,
        knowledge_base_id,
        source_document_id,
        status,
        phase,
        attempt_count,
        max_attempts,
        last_error,
        skip_reason,
        retry_after,
        retained_until,
        created_at,
        updated_at,
        completed_at
      )
      select
        input_rows.id,
        ${scope.tenantId},
        ${scope.projectId},
        ${operation.id},
        'redis_key',
        input_rows.resource_type,
        input_rows.redis_key,
        null,
        null,
        ${operation.knowledgeBaseId},
        null,
        'pending',
        'queued',
        0,
        ${operation.maxAttempts},
        null,
        null,
        null,
        ${operation.itemRetentionExpiresAt},
        ${now},
        ${now},
        null
      from input_rows
      on conflict (id) do nothing
    `.execute(this.db);
  }
}

export class PostgresDeletionCleanupDatabaseCleaner implements DeletionCleanupDatabaseCleaner {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async cleanupDatabaseItem(
    item: DeletionCleanupItemRecord,
  ): Promise<DeletionCleanupDatabaseCleanupResult> {
    if (item.tableName === null || item.resourceId === null) {
      return {
        status: "skipped",
        skipReason: "database_row_reference_incomplete",
      };
    }

    const scopedColumn = getScopedCleanupColumn(item);

    if (scopedColumn !== null) {
      if (!isScopedCleanupTable(item.tableName)) {
        return {
          status: "skipped",
          skipReason: "database_scoped_cleanup_not_enabled",
        };
      }

      const itemScope = await requirePersistedCleanupItemTenantProject(this.db, item.id);

      if (isTenantProjectScopedDatabaseTable(item.tableName)) {
        await sql`
          delete from ${sql.table(item.tableName)}
          where ${sql.ref(scopedColumn)} = ${item.resourceId}
            and tenant_id = ${itemScope.tenantId}
            and project_id = ${itemScope.projectId}
        `.execute(this.db);

        return {
          status: "deleted",
        };
      }

      await sql`
        delete from ${sql.table(item.tableName)}
        where ${sql.ref(scopedColumn)} = ${item.resourceId}
      `.execute(this.db);

      return {
        status: "deleted",
      };
    }

    if (item.tableName === "knowledge_bases") {
      return {
        status: "skipped",
        skipReason: "knowledge_base_tombstone_preserved",
      };
    }

    if (item.tableName === "source_documents") {
      const operationTargetType = await this.readOperationTargetType(item.operationId);

      if (operationTargetType !== "knowledge_base") {
        return {
          status: "skipped",
          skipReason: "source_document_tombstone_preserved",
        };
      }

      const itemScope = await requirePersistedCleanupItemTenantProject(this.db, item.id);

      await sql`
        delete from source_documents
        where id = ${item.resourceId}
          and tenant_id = ${itemScope.tenantId}
          and project_id = ${itemScope.projectId}
      `.execute(this.db);

      return {
        status: "deleted",
      };
    }

    if (item.tableName === "job_events") {
      return {
        status: "skipped",
        skipReason: "job_events_retained_for_audit",
      };
    }

    if (!isCleanupEnabledDatabaseTable(item.tableName)) {
      return {
        status: "skipped",
        skipReason: "database_table_not_cleanup_enabled",
      };
    }

    const itemScope = await requirePersistedCleanupItemTenantProject(this.db, item.id);

    if (isTenantProjectScopedDatabaseTable(item.tableName)) {
      await sql`
        delete from ${sql.table(item.tableName)}
        where id = ${item.resourceId}
          and tenant_id = ${itemScope.tenantId}
          and project_id = ${itemScope.projectId}
      `.execute(this.db);

      return {
        status: "deleted",
      };
    }

    await sql`
      delete from ${sql.table(item.tableName)}
      where id = ${item.resourceId}
    `.execute(this.db);

    return {
      status: "deleted",
    };
  }

  private async readOperationTargetType(operationId: string): Promise<string | null> {
    const result = await sql<{ target_type: string }>`
      select target_type
      from deletion_cleanup_operations
      where id = ${operationId}
      limit 1
    `.execute(this.db);

    return result.rows[0]?.target_type ?? null;
  }
}

export class RedisDeletionCleanupCleaner implements DeletionCleanupRedisCleaner {
  private readonly connection: RedisConnection;

  constructor(config: RuntimeConfig) {
    this.connection = new RedisConnection({
      url: config.redis.url,
    });
  }

  async cleanupRedisItem(
    item: DeletionCleanupItemRecord,
  ): Promise<DeletionCleanupRedisCleanupResult> {
    if (item.resourceId === null || item.resourceId.length === 0) {
      return {
        status: "skipped",
        skipReason: "redis_key_reference_incomplete",
      };
    }

    const client = await this.connection.client;

    if (item.resourceType === "runtime_cache_index") {
      const indexedKeys = readRedisStringArray(
        await client.runCommand("smembers", [item.resourceId]),
      );

      if (indexedKeys.length > 0) {
        await client.runCommand("del", indexedKeys);
      }
    }

    await client.runCommand("del", [item.resourceId]);

    return {
      status: "deleted",
    };
  }

  async countResidualRedisKeys(
    keys: readonly string[],
  ): Promise<{ count: number; examples: string[] }> {
    const uniqueKeys = [...new Set(keys.filter((key) => key.length > 0))];

    if (uniqueKeys.length === 0) {
      return {
        count: 0,
        examples: [],
      };
    }

    const client = await this.connection.client;
    const examples: string[] = [];
    let count = 0;

    for (const key of uniqueKeys) {
      const exists = Number(await client.runCommand("exists", [key]));

      if (exists > 0) {
        count += 1;
        if (examples.length < 5) {
          examples.push(key);
        }
      }
    }

    return {
      count,
      examples,
    };
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

export class PostgresDeletionCleanupResidualVerifier implements DeletionCleanupResidualVerifier {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly objectStorage?: ObjectStorageAdapter,
    private readonly redisResidualChecker?: DeletionCleanupRedisResidualChecker,
  ) {}

  async verifyResiduals(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupResidualVerificationResult> {
    if (operation.targetType === "knowledge_base" && operation.knowledgeBaseId !== null) {
      const [objectStorage, legacyLayout, database, redis] = await Promise.all([
        this.countObjectStorageResiduals([
          createKnowledgeBaseObjectPrefix({
            knowledgeBaseId: operation.knowledgeBaseId,
          }),
        ]),
        this.countLegacyLayoutResiduals(operation),
        this.countKnowledgeBaseDatabaseResiduals(operation),
        this.countRedisResiduals(createKnowledgeBaseRedisCleanupRows(operation.knowledgeBaseId)),
      ]);

      return createResidualVerificationResult({
        databaseResidualCount: database.count,
        databaseResidualExamples: database.examples,
        legacyLayoutResidualCount: legacyLayout.count,
        legacyLayoutResidualExamples: legacyLayout.examples,
        objectStorageResidualCount: objectStorage.count,
        objectStorageResidualExamples: objectStorage.examples,
        redisResidualCount: redis.count,
        redisResidualExamples: redis.examples,
      });
    }

    if (operation.targetType === "source_document" && operation.knowledgeBaseId !== null) {
      const [objectStorage, legacyLayout, database, redisRows] = await Promise.all([
        this.countObjectStorageResiduals(createSourceDocumentObjectPrefixes(operation)),
        this.countLegacyLayoutResiduals(operation),
        this.countSourceDocumentDatabaseResiduals(operation),
        this.listOperationRedisCleanupRows(operation.id),
      ]);
      const redis = await this.countRedisResiduals(redisRows);

      return createResidualVerificationResult({
        databaseResidualCount: database.count,
        databaseResidualExamples: database.examples,
        legacyLayoutResidualCount: legacyLayout.count,
        legacyLayoutResidualExamples: legacyLayout.examples,
        objectStorageResidualCount: objectStorage.count,
        objectStorageResidualExamples: objectStorage.examples,
        redisResidualCount: redis.count,
        redisResidualExamples: redis.examples,
      });
    }

    if (isChildResourceCleanupTarget(operation.targetType) && operation.knowledgeBaseId !== null) {
      const [objectStorage, database] = await Promise.all([
        this.countObjectStorageResiduals(createChildResourceObjectPrefixes(operation)),
        this.countChildResourceDatabaseResiduals(operation),
      ]);

      return createResidualVerificationResult({
        databaseResidualCount: database.count,
        databaseResidualExamples: database.examples,
        objectStorageResidualCount: objectStorage.count,
        objectStorageResidualExamples: objectStorage.examples,
      });
    }

    return createEmptyResidualVerificationResult();
  }

  private async countObjectStorageResiduals(
    prefixes: readonly string[],
  ): Promise<{ count: number; examples: string[] }> {
    if (this.objectStorage === undefined) {
      return {
        count: 0,
        examples: [],
      };
    }

    const examples: string[] = [];
    let count = 0;

    for (const prefix of prefixes) {
      let continuationToken: string | undefined;

      do {
        const page = await this.objectStorage.listObjectsByPrefix({
          maxKeys: 1000,
          prefix,
          ...(continuationToken === undefined ? {} : { continuationToken }),
        });
        count += page.objects.length;
        for (const object of page.objects) {
          if (examples.length >= 5) {
            break;
          }
          examples.push(object.key);
        }
        continuationToken = page.nextContinuationToken;
      } while (continuationToken !== undefined);
    }

    return {
      count,
      examples,
    };
  }

  private async countLegacyLayoutResiduals(
    operation: DeletionCleanupOperationRecord,
  ): Promise<{ count: number; examples: string[] }> {
    if (this.objectStorage === undefined) {
      return {
        count: 0,
        examples: [],
      };
    }

    const result = await sql<{ object_key: string }>`
      select object_key
      from deletion_cleanup_items
      where operation_id = ${operation.id}
        and item_type = 'object'
        and object_key is not null
        and (
          resource_type like 'legacy_%'
          or object_key ~ '^(sources|parsed|media|ocr|processing)/'
        )
      order by object_key asc
    `.execute(this.db);
    const examples: string[] = [];
    let count = 0;

    for (const row of result.rows) {
      const head = await this.objectStorage.headObject({ key: row.object_key });

      if (!head.exists) {
        continue;
      }

      count += 1;
      if (examples.length < 5) {
        examples.push(row.object_key);
      }
    }

    return {
      count,
      examples,
    };
  }

  private async countKnowledgeBaseDatabaseResiduals(
    operation: DeletionCleanupOperationRecord,
  ): Promise<{ count: number; examples: string[] }> {
    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);
    const countResult = await sql<{ count: string }>`
      select coalesce(sum(residual_count), 0)::text as count
      from (${knowledgeBaseResidualRowsSql({
        knowledgeBaseId: operation.targetId,
        projectId: scope.projectId,
        tenantId: scope.tenantId,
      })}) residuals
    `.execute(this.db);
    const examplesResult = await sql<{ table_name: string }>`
      select table_name
      from (${knowledgeBaseResidualRowsSql({
        knowledgeBaseId: operation.targetId,
        projectId: scope.projectId,
        tenantId: scope.tenantId,
      })}) residuals
      where residual_count > 0
      order by table_name asc
      limit 5
    `.execute(this.db);

    return {
      count: Number(countResult.rows[0]?.count ?? 0),
      examples: examplesResult.rows.map((row) => row.table_name),
    };
  }

  private async countSourceDocumentDatabaseResiduals(
    operation: DeletionCleanupOperationRecord,
  ): Promise<{ count: number; examples: string[] }> {
    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);
    const countResult = await sql<{ count: string }>`
      select coalesce(sum(residual_count), 0)::text as count
      from (${sourceDocumentResidualRowsSql({
        projectId: scope.projectId,
        sourceDocumentId: operation.targetId,
        tenantId: scope.tenantId,
      })}) residuals
    `.execute(this.db);
    const examplesResult = await sql<{ table_name: string }>`
      select table_name
      from (${sourceDocumentResidualRowsSql({
        projectId: scope.projectId,
        sourceDocumentId: operation.targetId,
        tenantId: scope.tenantId,
      })}) residuals
      where residual_count > 0
      order by table_name asc
      limit 5
    `.execute(this.db);

    return {
      count: Number(countResult.rows[0]?.count ?? 0),
      examples: examplesResult.rows.map((row) => row.table_name),
    };
  }

  private async countChildResourceDatabaseResiduals(
    operation: DeletionCleanupOperationRecord,
  ): Promise<{ count: number; examples: string[] }> {
    const countResult = await sql<{ count: string }>`
      select coalesce(sum(residual_count), 0)::text as count
      from (${childResourceResidualRowsSql({
        targetId: operation.targetId,
        targetType: operation.targetType,
      })}) residuals
    `.execute(this.db);
    const examplesResult = await sql<{ table_name: string }>`
      select table_name
      from (${childResourceResidualRowsSql({
        targetId: operation.targetId,
        targetType: operation.targetType,
      })}) residuals
      where residual_count > 0
      order by table_name asc
      limit 5
    `.execute(this.db);

    return {
      count: Number(countResult.rows[0]?.count ?? 0),
      examples: examplesResult.rows.map((row) => row.table_name),
    };
  }

  private async countRedisResiduals(
    rows: readonly { key: string; resourceType: string }[],
  ): Promise<{ count: number; examples: string[] }> {
    if (this.redisResidualChecker === undefined) {
      return {
        count: 0,
        examples: [],
      };
    }

    return this.redisResidualChecker.countResidualRedisKeys(rows.map((row) => row.key));
  }

  private async listOperationRedisCleanupRows(
    operationId: string,
  ): Promise<Array<{ key: string; resourceType: string }>> {
    const result = await sql<{ key: string; resource_type: string }>`
      select resource_id as key, coalesce(resource_type, 'redis_key') as resource_type
      from deletion_cleanup_items
      where operation_id = ${operationId}
        and item_type = 'redis_key'
        and resource_id is not null
      order by resource_id asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      key: row.key,
      resourceType: row.resource_type,
    }));
  }
}

export class PostgresDeletionCleanupTargetGuard implements DeletionCleanupTargetGuard {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async checkCleanupAllowed(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupTargetGuardResult> {
    const scope = await requirePersistedCleanupOperationTenantProject(this.db, operation.id);

    if (operation.targetType === "knowledge_base") {
      const result = await sql<{ status: string; deleted_at: Date | string | null }>`
        select status, deleted_at
        from knowledge_bases
        where id = ${operation.targetId}
          and tenant_id = ${scope.tenantId}
          and project_id = ${scope.projectId}
        limit 1
      `.execute(this.db);
      const row = result.rows[0];

      if (row === undefined) {
        if (await this.targetExistsInAnyScope(operation)) {
          return {
            allowed: false,
            reason: "cleanup_target_scope_mismatch",
          };
        }

        return {
          allowed: true,
        };
      }

      if (row.status === "deleted" || row.deleted_at !== null) {
        return {
          allowed: true,
        };
      }

      return {
        allowed: false,
        reason: "knowledge_base_is_active",
      };
    }

    if (operation.targetType === "source_document") {
      const result = await sql<{ status: string }>`
        select source_documents.status
        from source_documents
        inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
        where source_documents.id = ${operation.targetId}
          and knowledge_bases.tenant_id = ${scope.tenantId}
          and knowledge_bases.project_id = ${scope.projectId}
        limit 1
      `.execute(this.db);
      const row = result.rows[0];

      if (row === undefined) {
        if (await this.targetExistsInAnyScope(operation)) {
          return {
            allowed: false,
            reason: "cleanup_target_scope_mismatch",
          };
        }

        return {
          allowed: true,
        };
      }

      if (row.status === "deleted") {
        return {
          allowed: true,
        };
      }

      return {
        allowed: false,
        reason: "source_document_is_active",
      };
    }

    if (operation.targetType === "wiki_page") {
      const result = await sql<{ deleted_at: Date | string | null }>`
        select wiki_pages.deleted_at
        from wiki_pages
        inner join knowledge_bases on knowledge_bases.id = wiki_pages.knowledge_base_id
        where wiki_pages.id = ${operation.targetId}
          and wiki_pages.knowledge_base_id = ${operation.knowledgeBaseId}
          and knowledge_bases.tenant_id = ${scope.tenantId}
          and knowledge_bases.project_id = ${scope.projectId}
        limit 1
      `.execute(this.db);
      const row = result.rows[0];

      if (row === undefined) {
        if (await this.targetExistsInAnyScope(operation)) {
          return {
            allowed: false,
            reason: "cleanup_target_scope_mismatch",
          };
        }

        return {
          allowed: true,
        };
      }

      if (row.deleted_at !== null) {
        return {
          allowed: true,
        };
      }

      return {
        allowed: false,
        reason: "wiki_page_is_active",
      };
    }

    if (operation.targetType === "wiki_page_version" || operation.targetType === "wiki_edge") {
      if (await this.targetExistsInScope(operation, scope)) {
        return {
          allowed: true,
        };
      }

      if (await this.targetExistsInAnyScope(operation)) {
        return {
          allowed: false,
          reason: "cleanup_target_scope_mismatch",
        };
      }

      return {
        allowed: true,
      };
    }

    return {
      allowed: true,
    };
  }

  private async targetExistsInScope(
    operation: DeletionCleanupOperationRecord,
    scope: { tenantId: string; projectId: string },
  ): Promise<boolean> {
    if (operation.targetType === "wiki_page_version") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from wiki_page_versions
          inner join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
          inner join knowledge_bases on knowledge_bases.id = wiki_pages.knowledge_base_id
          where wiki_page_versions.id = ${operation.targetId}
            and wiki_pages.knowledge_base_id = ${operation.knowledgeBaseId}
            and knowledge_bases.tenant_id = ${scope.tenantId}
            and knowledge_bases.project_id = ${scope.projectId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    if (operation.targetType === "wiki_edge") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from wiki_edges
          inner join knowledge_bases on knowledge_bases.id = wiki_edges.knowledge_base_id
          where wiki_edges.id = ${operation.targetId}
            and wiki_edges.knowledge_base_id = ${operation.knowledgeBaseId}
            and knowledge_bases.tenant_id = ${scope.tenantId}
            and knowledge_bases.project_id = ${scope.projectId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    return false;
  }

  private async targetExistsInAnyScope(
    operation: DeletionCleanupOperationRecord,
  ): Promise<boolean> {
    if (operation.targetType === "knowledge_base") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from knowledge_bases
          where id = ${operation.targetId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    if (operation.targetType === "source_document") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from source_documents
          where id = ${operation.targetId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    if (operation.targetType === "wiki_page") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from wiki_pages
          where id = ${operation.targetId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    if (operation.targetType === "wiki_page_version") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from wiki_page_versions
          where id = ${operation.targetId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    if (operation.targetType === "wiki_edge") {
      const result = await sql<{ exists: boolean }>`
        select exists (
          select 1
          from wiki_edges
          where id = ${operation.targetId}
        ) as exists
      `.execute(this.db);

      return result.rows[0]?.exists ?? false;
    }

    return false;
  }
}

function shouldPlanManifest(operation: DeletionCleanupOperationRecord): boolean {
  if (
    operation.targetType === "source_document" &&
    operation.manifest.worker_prefix_scan_required === true &&
    operation.manifest.prefix_scan_status !== "completed"
  ) {
    return true;
  }

  return (
    (operation.targetType === "knowledge_base" ||
      isChildResourceCleanupTarget(operation.targetType)) &&
    operation.totalItemCount === 0 &&
    operation.manifest.planning_status !== "completed"
  );
}

function createStableDeletionCleanupOperationId(operationId: string): string {
  const digest = createHash("sha256").update(operationId).digest("hex").slice(0, 32);

  return `${backgroundOperationIdPrefix}deletion_cleanup_${digest}`;
}

function createCleanupManifestItemId(operationId: string, itemKind: string, value: string): string {
  const digest = createHash("sha256").update(`${itemKind}\0${value}`).digest("hex").slice(0, 32);

  return `${operationId}_${itemKind}_${digest}`;
}

function createKnowledgeBaseRedisCleanupRows(
  knowledgeBaseId: string,
): Array<{ key: string; resourceType: string }> {
  return [
    {
      key: `fococontext:runtime-cache-index:${encodeURIComponent(knowledgeBaseId)}`,
      resourceType: "runtime_cache_index",
    },
    ...runtimeQueueWorkKinds.map((workKind) => ({
      key: createRuntimeQueuePressureKey({
        scopeId: knowledgeBaseId,
        workKind,
      }),
      resourceType: "queue_pressure",
    })),
  ];
}

function createSourceDocumentObjectPrefixes(operation: DeletionCleanupOperationRecord): string[] {
  if (operation.knowledgeBaseId === null) {
    return [];
  }

  const input = {
    documentId: operation.targetId,
    knowledgeBaseId: operation.knowledgeBaseId,
  };

  return [
    createSourceObjectPrefix(input),
    createParsedContentObjectPrefix(input),
    createMediaAssetObjectPrefix(input),
    createOcrObjectPrefix(input),
    createProcessingObjectPrefix(input),
  ];
}

function createLegacySourceDocumentObjectPrefixes(input: {
  documentId: string;
  knowledgeBaseId: string;
}): string[] {
  const documentId = sanitizeObjectKeySegment(input.documentId);
  const knowledgeBaseId = sanitizeObjectKeySegment(input.knowledgeBaseId);

  return [
    `sources/${knowledgeBaseId}/${documentId}/`,
    `parsed/${knowledgeBaseId}/${documentId}/`,
    `media/${knowledgeBaseId}/${documentId}/`,
    `ocr/${knowledgeBaseId}/${documentId}/`,
    `processing/${knowledgeBaseId}/${documentId}/`,
    `sources/${documentId}/`,
    `parsed/${documentId}/`,
    `media/${documentId}/`,
    `ocr/${documentId}/`,
    `processing/${documentId}/`,
  ];
}

function createChildResourceObjectPrefixes(operation: DeletionCleanupOperationRecord): string[] {
  if (operation.knowledgeBaseId === null) {
    return [];
  }

  const knowledgeBaseId = operation.knowledgeBaseId;

  if (operation.targetType === "wiki_page") {
    return [
      createWikiPageObjectPrefix({
        knowledgeBaseId,
        pageId: operation.targetId,
      }),
    ];
  }

  if (operation.targetType === "wiki_page_version") {
    return [
      createWikiPageVersionObjectPrefix({
        knowledgeBaseId,
        pageVersionId: operation.targetId,
      }),
    ];
  }

  if (operation.targetType === "wiki_edge") {
    return [
      createWikiEdgeObjectPrefix({
        edgeId: operation.targetId,
        knowledgeBaseId,
      }),
    ];
  }

  return [];
}

function createVersionedObjectCleanupPrefixes(operation: DeletionCleanupOperationRecord): string[] {
  if (operation.targetType === "knowledge_base" && operation.knowledgeBaseId !== null) {
    return [
      createKnowledgeBaseObjectPrefix({
        knowledgeBaseId: operation.knowledgeBaseId,
      }),
    ];
  }
  if (operation.targetType === "source_document") {
    return createSourceDocumentObjectPrefixes(operation);
  }
  if (isChildResourceCleanupTarget(operation.targetType)) {
    return createChildResourceObjectPrefixes(operation);
  }

  return [];
}

function createObjectVersionExample(object: { key: string; versionId?: string }): string {
  return object.versionId === undefined ? object.key : `${object.key}#${object.versionId}`;
}

function isVersionedCleanupUnsupportedError(error: unknown): boolean {
  const code = readErrorCode(error);

  return (
    code === "NotImplemented" ||
    code === "NotSupported" ||
    code === "UnsupportedOperation" ||
    code === "MethodNotAllowed"
  );
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("Code" in error && typeof error.Code === "string") {
    return error.Code;
  }
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  if ("name" in error && typeof error.name === "string") {
    return error.name;
  }

  return undefined;
}

function isChildResourceCleanupTarget(targetType: DeletionCleanupTargetType): boolean {
  return (
    targetType === "wiki_page" || targetType === "wiki_page_version" || targetType === "wiki_edge"
  );
}

function createEmptyResidualVerificationResult(): DeletionCleanupResidualVerificationResult {
  return createResidualVerificationResult({});
}

function createResidualVerificationResult(
  input: Partial<DeletionCleanupResidualVerificationResult>,
): DeletionCleanupResidualVerificationResult {
  return {
    databaseResidualCount: input.databaseResidualCount ?? 0,
    databaseResidualExamples: input.databaseResidualExamples ?? [],
    legacyLayoutResidualCount: input.legacyLayoutResidualCount ?? 0,
    legacyLayoutResidualExamples: input.legacyLayoutResidualExamples ?? [],
    objectStorageResidualCount: input.objectStorageResidualCount ?? 0,
    objectStorageResidualExamples: input.objectStorageResidualExamples ?? [],
    redisResidualCount: input.redisResidualCount ?? 0,
    redisResidualExamples: input.redisResidualExamples ?? [],
    versionedObjectResidualCount: input.versionedObjectResidualCount ?? 0,
    versionedObjectResidualExamples: input.versionedObjectResidualExamples ?? [],
  };
}

function countNonVersionedResidualVerificationResult(
  result: DeletionCleanupResidualVerificationResult,
): number {
  return (
    result.objectStorageResidualCount +
    result.databaseResidualCount +
    result.redisResidualCount +
    result.legacyLayoutResidualCount
  );
}

function createResidualVerificationManifestPatch(
  result: DeletionCleanupResidualVerificationResult,
  existingManifest: Record<string, unknown>,
  options: { defaultVersionedStatus: string },
): Record<string, unknown> {
  const versionedObjectResidualCount = Math.max(
    readNonNegativeManifestInteger(existingManifest, "versioned_object_residual_count"),
    result.versionedObjectResidualCount,
  );
  const versionedObjectResidualExamples =
    readStringArrayManifestValue(existingManifest, "versioned_object_residual_examples").length > 0
      ? readStringArrayManifestValue(existingManifest, "versioned_object_residual_examples")
      : result.versionedObjectResidualExamples;

  return {
    database_residual_count: result.databaseResidualCount,
    database_residual_examples: result.databaseResidualExamples,
    legacy_layout_residual_count: result.legacyLayoutResidualCount,
    legacy_layout_residual_examples: result.legacyLayoutResidualExamples,
    object_storage_residual_count: result.objectStorageResidualCount,
    object_storage_residual_examples: result.objectStorageResidualExamples,
    redis_residual_count: result.redisResidualCount,
    redis_residual_examples: result.redisResidualExamples,
    residual_check_status:
      countNonVersionedResidualVerificationResult(result) + versionedObjectResidualCount === 0
        ? "completed"
        : "failed",
    versioned_object_count: readNonNegativeManifestInteger(
      existingManifest,
      "versioned_object_count",
    ),
    versioned_object_failed_count: readNonNegativeManifestInteger(
      existingManifest,
      "versioned_object_failed_count",
    ),
    versioned_object_residual_count: versionedObjectResidualCount,
    versioned_object_residual_examples: versionedObjectResidualExamples,
    versioned_object_status:
      readStringManifestValue(existingManifest, "versioned_object_status") ??
      options.defaultVersionedStatus,
  };
}

function readNonNegativeManifestInteger(manifest: Record<string, unknown>, key: string): number {
  const value = manifest[key];

  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function readStringManifestValue(manifest: Record<string, unknown>, key: string): string | null {
  const value = manifest[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringArrayManifestValue(manifest: Record<string, unknown>, key: string): string[] {
  const value = manifest[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function knowledgeBaseResidualRowsSql(input: {
  knowledgeBaseId: string;
  projectId: string;
  tenantId: string;
}) {
  return sql`
    select 'change_set_items'::text as table_name, count(*)::bigint as residual_count
    from change_set_items
    inner join change_sets on change_sets.id = change_set_items.change_set_id
    where change_sets.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'change_sets'::text, count(*)::bigint
    from change_sets
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'compile_stage_executions'::text, count(*)::bigint
    from compile_stage_executions
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'delete_impact_previews'::text, count(*)::bigint
    from delete_impact_previews
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'document_processing_checkpoints'::text, count(*)::bigint
    from document_processing_checkpoints
    where knowledge_base_id = ${input.knowledgeBaseId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'document_processing_units'::text, count(*)::bigint
    from document_processing_units
    where knowledge_base_id = ${input.knowledgeBaseId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'duplicate_decisions'::text, count(*)::bigint
    from duplicate_decisions
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'import_previews'::text, count(*)::bigint
    from import_previews
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'jobs'::text, count(*)::bigint
    from jobs
    where knowledge_base_id = ${input.knowledgeBaseId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'knowledge_checks'::text, count(*)::bigint
    from knowledge_checks
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'knowledge_versions'::text, count(*)::bigint
    from knowledge_versions
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'media_assets'::text, count(*)::bigint
    from media_assets
    inner join source_documents on source_documents.id = media_assets.source_document_id
    where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'model_calls'::text, count(*)::bigint
    from model_calls
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'ocr_artifacts'::text, count(*)::bigint
    from ocr_artifacts
    inner join source_documents on source_documents.id = ocr_artifacts.source_document_id
    where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'ocr_blocks'::text, count(*)::bigint
    from ocr_blocks
    inner join source_documents on source_documents.id = ocr_blocks.source_document_id
    where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'ocr_page_statuses'::text, count(*)::bigint
    from ocr_page_statuses
    inner join source_documents on source_documents.id = ocr_page_statuses.source_document_id
    where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'page_embeddings'::text, count(*)::bigint
    from page_embeddings
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'page_merge_records'::text, count(*)::bigint
    from page_merge_records
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'parsed_contents'::text, count(*)::bigint
    from parsed_contents
    inner join source_documents on source_documents.id = parsed_contents.source_document_id
    where source_documents.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'retrieval_traces'::text, count(*)::bigint
    from retrieval_traces
    where knowledge_base_id = ${input.knowledgeBaseId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'rollback_records'::text, count(*)::bigint
    from rollback_records
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'scheduled_import_jobs'::text, count(*)::bigint
    from scheduled_import_jobs
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'source_documents'::text, count(*)::bigint
    from source_documents
    where knowledge_base_id = ${input.knowledgeBaseId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'source_watch_rules'::text, count(*)::bigint
    from source_watch_rules
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'system_pages'::text, count(*)::bigint
    from system_pages
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'webhook_deliveries'::text, count(*)::bigint
    from webhook_deliveries
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'webhooks'::text, count(*)::bigint
    from webhooks
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'wiki_analysis_results'::text, count(*)::bigint
    from wiki_analysis_results
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'wiki_draft_candidates'::text, count(*)::bigint
    from wiki_draft_candidates
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'wiki_edge_sources'::text, count(*)::bigint
    from wiki_edge_sources
    inner join wiki_edges on wiki_edges.id = wiki_edge_sources.edge_id
    where wiki_edges.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'wiki_edges'::text, count(*)::bigint
    from wiki_edges
    where knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'wiki_page_versions'::text, count(*)::bigint
    from wiki_page_versions
    inner join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
    where wiki_pages.knowledge_base_id = ${input.knowledgeBaseId}
    union all
    select 'wiki_pages'::text, count(*)::bigint
    from wiki_pages
    where knowledge_base_id = ${input.knowledgeBaseId}
  `;
}

function sourceDocumentResidualRowsSql(input: {
  projectId: string;
  sourceDocumentId: string;
  tenantId: string;
}) {
  return sql`
    select 'compile_stage_executions'::text as table_name, count(*)::bigint as residual_count
    from compile_stage_executions
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'delete_impact_previews'::text, count(*)::bigint
    from delete_impact_previews
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'document_processing_checkpoints'::text, count(*)::bigint
    from document_processing_checkpoints
    where source_document_id = ${input.sourceDocumentId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'document_processing_units'::text, count(*)::bigint
    from document_processing_units
    where source_document_id = ${input.sourceDocumentId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'jobs'::text, count(*)::bigint
    from jobs
    where source_document_id = ${input.sourceDocumentId}
      and tenant_id = ${input.tenantId}
      and project_id = ${input.projectId}
    union all
    select 'media_assets'::text, count(*)::bigint
    from media_assets
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'model_calls'::text, count(*)::bigint
    from model_calls
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'ocr_artifacts'::text, count(*)::bigint
    from ocr_artifacts
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'ocr_blocks'::text, count(*)::bigint
    from ocr_blocks
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'ocr_page_statuses'::text, count(*)::bigint
    from ocr_page_statuses
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'parsed_contents'::text, count(*)::bigint
    from parsed_contents
    where source_document_id = ${input.sourceDocumentId}
    union all
    select 'wiki_analysis_results'::text, count(*)::bigint
    from wiki_analysis_results
    where source_document_id = ${input.sourceDocumentId}
  `;
}

function childResourceResidualRowsSql(input: {
  targetId: string;
  targetType: DeletionCleanupTargetType;
}) {
  if (input.targetType === "wiki_page") {
    return sql`
      select 'page_embeddings'::text as table_name, count(*)::bigint as residual_count
      from page_embeddings
      where page_id = ${input.targetId}
         or page_version_id in (
           select id
           from wiki_page_versions
           where page_id = ${input.targetId}
         )
      union all
      select 'wiki_edge_sources'::text, count(*)::bigint
      from wiki_edge_sources
      where edge_id in (
        select id
        from wiki_edges
        where from_page_id = ${input.targetId}
           or to_page_id = ${input.targetId}
      )
      union all
      select 'wiki_edges'::text, count(*)::bigint
      from wiki_edges
      where from_page_id = ${input.targetId}
         or to_page_id = ${input.targetId}
      union all
      select 'wiki_page_versions'::text, count(*)::bigint
      from wiki_page_versions
      where page_id = ${input.targetId}
      union all
      select 'wiki_pages'::text, count(*)::bigint
      from wiki_pages
      where id = ${input.targetId}
    `;
  }

  if (input.targetType === "wiki_page_version") {
    return sql`
      select 'page_embeddings'::text as table_name, count(*)::bigint as residual_count
      from page_embeddings
      where page_version_id = ${input.targetId}
         or (object_type = 'wiki_page_version' and object_id = ${input.targetId})
      union all
      select 'wiki_edge_sources'::text, count(*)::bigint
      from wiki_edge_sources
      where page_version_id = ${input.targetId}
      union all
      select 'wiki_page_versions'::text, count(*)::bigint
      from wiki_page_versions
      where id = ${input.targetId}
    `;
  }

  if (input.targetType === "wiki_edge") {
    return sql`
      select 'page_embeddings'::text as table_name, count(*)::bigint as residual_count
      from page_embeddings
      where object_type = 'wiki_edge'
        and object_id = ${input.targetId}
      union all
      select 'wiki_edge_sources'::text, count(*)::bigint
      from wiki_edge_sources
      where edge_id = ${input.targetId}
      union all
      select 'wiki_edges'::text, count(*)::bigint
      from wiki_edges
      where id = ${input.targetId}
    `;
  }

  return sql`
    select 'unsupported_child_resource'::text as table_name, 0::bigint as residual_count
  `;
}

function readRedisStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function readOperationItemCounts(
  repository: DeletionCleanupStore,
  operationId: string,
): Promise<DeletionCleanupOperationItemCounts> {
  if (repository.countItemsByOperationId !== undefined) {
    return repository.countItemsByOperationId(operationId);
  }

  const items = await repository.listItemsByOperationId(operationId);

  return countItems(items);
}

function isRetryableObjectItem(
  item: DeletionCleanupItemRecord,
  retryFailedBefore = "9999-12-31T23:59:59.999Z",
): boolean {
  return (
    item.itemType === "object" &&
    item.objectKey !== null &&
    (item.status === "pending" ||
      (item.status === "failed" && item.updatedAt <= retryFailedBefore)) &&
    item.attemptCount < item.maxAttempts
  );
}

function isRetryableDatabaseItem(
  item: DeletionCleanupItemRecord,
  retryFailedBefore = "9999-12-31T23:59:59.999Z",
): boolean {
  return (
    item.itemType === "database_row" &&
    item.tableName !== null &&
    item.resourceId !== null &&
    (item.status === "pending" ||
      (item.status === "failed" && item.updatedAt <= retryFailedBefore)) &&
    item.attemptCount < item.maxAttempts
  );
}

function isRetryableRedisItem(
  item: DeletionCleanupItemRecord,
  retryFailedBefore = "9999-12-31T23:59:59.999Z",
): boolean {
  return (
    item.itemType === "redis_key" &&
    item.resourceId !== null &&
    (item.status === "pending" ||
      (item.status === "failed" && item.updatedAt <= retryFailedBefore)) &&
    item.attemptCount < item.maxAttempts
  );
}

function compareDatabaseCleanupItems(
  left: DeletionCleanupItemRecord,
  right: DeletionCleanupItemRecord,
): number {
  const leftPriority = getDatabaseCleanupPriority(left.tableName);
  const rightPriority = getDatabaseCleanupPriority(right.tableName);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return (left.resourceId ?? "").localeCompare(right.resourceId ?? "");
}

function countItems(items: readonly DeletionCleanupItemRecord[]) {
  return {
    totalItemCount: items.length,
    pendingItemCount: items.filter((item) => item.status === "pending" || item.status === "running")
      .length,
    deletedItemCount: items.filter((item) => item.status === "deleted").length,
    skippedItemCount: items.filter((item) => item.status === "skipped").length,
    failedItemCount: items.filter((item) => item.status === "failed").length,
    objectKeyCount: items.filter((item) => item.objectKey !== null).length,
    databaseRowCount: items.filter((item) => item.tableName !== null).length,
    redisKeyCount: items.filter((item) => item.itemType === "redis_key").length,
  };
}

interface DeletionCleanupOperationRow {
  id: string;
  target_type: string;
  target_id: string;
  knowledge_base_id: string | null;
  status: string;
  phase: string;
  requested_by: string | null;
  request_id: string | null;
  queue_job_id: string | null;
  manifest: unknown;
  total_item_count: number;
  pending_item_count: number;
  deleted_item_count: number;
  skipped_item_count: number;
  failed_item_count: number;
  object_key_count: number;
  database_row_count: number;
  redis_key_count: number;
  attempt_count: number;
  max_attempts: number;
  retry_after: Date | string | null;
  retryable: boolean;
  last_error: unknown;
  retention_expires_at: Date | string | null;
  item_retention_expires_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  failed_at: Date | string | null;
  canceled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DeletionCleanupItemRow {
  id: string;
  operation_id: string;
  item_type: string;
  resource_type: string | null;
  resource_id: string | null;
  object_key: string | null;
  table_name: string | null;
  knowledge_base_id: string | null;
  source_document_id: string | null;
  status: string;
  phase: string;
  attempt_count: number;
  max_attempts: number;
  last_error: unknown;
  skip_reason: string | null;
  retry_after: Date | string | null;
  retained_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

interface DeletionCleanupItemCountRow {
  total_item_count: string;
  pending_item_count: string;
  deleted_item_count: string;
  skipped_item_count: string;
  failed_item_count: string;
  object_key_count: string;
  database_row_count: string;
  redis_key_count: string;
}

function toOperationRecord(row: DeletionCleanupOperationRow): DeletionCleanupOperationRecord {
  return {
    id: row.id,
    targetType: row.target_type as DeletionCleanupTargetType,
    targetId: row.target_id,
    knowledgeBaseId: row.knowledge_base_id,
    status: row.status as DeletionCleanupStatus,
    phase: row.phase as DeletionCleanupPhase,
    requestedBy: row.requested_by,
    requestId: row.request_id,
    queueJobId: row.queue_job_id,
    manifest: normalizeJsonObject(row.manifest),
    totalItemCount: row.total_item_count,
    pendingItemCount: row.pending_item_count,
    deletedItemCount: row.deleted_item_count,
    skippedItemCount: row.skipped_item_count,
    failedItemCount: row.failed_item_count,
    objectKeyCount: row.object_key_count,
    databaseRowCount: row.database_row_count,
    redisKeyCount: row.redis_key_count,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    retryAfter: normalizeNullableTimestamp(row.retry_after),
    retryable: row.retryable,
    lastError: row.last_error === null ? null : normalizeJsonObject(row.last_error),
    retentionExpiresAt: normalizeNullableTimestamp(row.retention_expires_at),
    itemRetentionExpiresAt: normalizeNullableTimestamp(row.item_retention_expires_at),
    startedAt: normalizeNullableTimestamp(row.started_at),
    completedAt: normalizeNullableTimestamp(row.completed_at),
    failedAt: normalizeNullableTimestamp(row.failed_at),
    canceledAt: normalizeNullableTimestamp(row.canceled_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toItemRecord(row: DeletionCleanupItemRow): DeletionCleanupItemRecord {
  return {
    id: row.id,
    operationId: row.operation_id,
    itemType: row.item_type as DeletionCleanupItemType,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    objectKey: row.object_key,
    tableName: row.table_name,
    knowledgeBaseId: row.knowledge_base_id,
    sourceDocumentId: row.source_document_id,
    status: row.status as DeletionCleanupItemStatus,
    phase: row.phase as DeletionCleanupPhase,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lastError: row.last_error === null ? null : normalizeJsonObject(row.last_error),
    skipReason: row.skip_reason,
    retryAfter: normalizeNullableTimestamp(row.retry_after),
    retainedUntil: normalizeNullableTimestamp(row.retained_until),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
    completedAt: normalizeNullableTimestamp(row.completed_at),
  };
}

function toItemCounts(
  row: DeletionCleanupItemCountRow | undefined,
): DeletionCleanupOperationItemCounts {
  return {
    totalItemCount: Number(row?.total_item_count ?? 0),
    pendingItemCount: Number(row?.pending_item_count ?? 0),
    deletedItemCount: Number(row?.deleted_item_count ?? 0),
    skippedItemCount: Number(row?.skipped_item_count ?? 0),
    failedItemCount: Number(row?.failed_item_count ?? 0),
    objectKeyCount: Number(row?.object_key_count ?? 0),
    databaseRowCount: Number(row?.database_row_count ?? 0),
    redisKeyCount: Number(row?.redis_key_count ?? 0),
  };
}

function databaseCleanupPriorityOrderSql() {
  const caseClauses = listDatabaseCleanupPriorityEntries()
    .map(([tableName, priority]) => `when table_name = '${tableName}' then ${priority}`)
    .join(" ");

  return sql.raw(`case ${caseClauses} else 1000 end`);
}

function createForkScopedManifestRowsSql() {
  const values = forkOwnedOverlayTables.map((tableName) => `('${tableName}'::text)`).join(", ");

  return sql.raw(`
    select
      scoped.table_name || '.owner_knowledge_base_id' as resource_type,
      target_kb.id as resource_id,
      scoped.table_name as table_name
    from target_kb
    cross join (values ${values}) as scoped(table_name)
    where target_kb.knowledge_base_type = 'fork'
  `);
}

const forkOwnedOverlayTables = [
  "source_documents",
  "parsed_contents",
  "media_assets",
  "ocr_page_statuses",
  "ocr_blocks",
  "ocr_artifacts",
  "media_caption_cache",
  "wiki_pages",
  "wiki_page_versions",
  "system_pages",
  "wiki_edges",
  "wiki_edge_sources",
  "wiki_analysis_results",
  "wiki_draft_candidates",
  "compile_stage_executions",
  "knowledge_versions",
  "change_sets",
  "change_set_items",
  "rollback_records",
  "page_merge_records",
  "knowledge_checks",
  "duplicate_decisions",
  "delete_impact_previews",
  "page_embeddings",
  "retrieval_traces",
] as const;

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeNullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : normalizeTimestamp(value);
}
