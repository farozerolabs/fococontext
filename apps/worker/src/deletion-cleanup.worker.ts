import { createHash } from "node:crypto";

import { Queue, Worker } from "bullmq";
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
import { createBackgroundOperationDedupeKey, type RuntimeConfig } from "@fococontext/core";
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
import type { ObjectStorageAdapter } from "@fococontext/storage";
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
  itemType: "object" | "database_row";
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
}

export interface DeletionCleanupDatabaseCleaner {
  cleanupDatabaseItem(
    item: DeletionCleanupItemRecord,
  ): Promise<DeletionCleanupDatabaseCleanupResult>;
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

export interface DeletionCleanupProcessorOptions {
  repository: DeletionCleanupStore;
  objectStorage: ObjectStorageAdapter;
  databaseCleanup?: DeletionCleanupDatabaseCleaner;
  manifestPlanner?: DeletionCleanupManifestPlanner;
  targetGuard?: DeletionCleanupTargetGuard;
  webhookEvents?: WorkerWebhookEventEmitter;
  checkpointRepository?: BackgroundOperationCheckpointRepository;
  objectBatchSize?: number;
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

    let databaseItems = await this.listRetryableItems(
      operationId,
      "database_row",
      started.updatedAt,
    );

    if (databaseItems.length > 0) {
      const databasePhase = await this.updateOperation(started, {
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

    return this.finishOperation(started.id);
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

    const updated = await this.updateOperation(operation, {
      ...counts,
      status: hasIncomplete ? "failed" : "completed",
      phase: hasIncomplete ? operation.phase : "completed",
      retryable,
      lastError: hasIncomplete
        ? {
            message: "Cleanup failed or still has pending items.",
          }
        : null,
      failedAt: hasIncomplete ? now : operation.failedAt,
      completedAt: hasIncomplete ? operation.completedAt : now,
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
    itemType: "object" | "database_row",
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
    const retryableItems = items.filter((item) =>
      itemType === "object"
        ? isRetryableObjectItem(item, retryFailedBefore)
        : isRetryableDatabaseItem(item, retryFailedBefore),
    );
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
        count(*) filter (where table_name is not null)::text as database_row_count
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
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async planOperation(
    input: DeletionCleanupManifestPlanInput,
  ): Promise<DeletionCleanupOperationRecord> {
    if (input.operation.targetType !== "knowledge_base") {
      return input.operation;
    }

    await this.insertKnowledgeBaseManifestItems(input.operation, input.now());
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
        skipped_reference_count: 0,
        total_item_count: counts.totalItemCount,
        item_page_size: counts.totalItemCount,
        item_page_count: counts.totalItemCount === 0 ? 0 : 1,
        planning_status: "completed",
        planning_mode: "worker_bounded_db",
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
            'media_assets'::text as resource_type,
            media_assets.id as resource_id,
            media_assets.object_key as object_key
          from media_assets
          inner join source_documents on source_documents.id = media_assets.source_document_id
          inner join target_kb on target_kb.id = source_documents.knowledge_base_id
          where media_assets.object_key is not null
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
      return {
        status: "skipped",
        skipReason: "source_document_tombstone_preserved",
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

    return {
      allowed: true,
    };
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

    return false;
  }
}

function shouldPlanManifest(operation: DeletionCleanupOperationRecord): boolean {
  return (
    operation.targetType === "knowledge_base" &&
    operation.totalItemCount === 0 &&
    operation.manifest.planning_status !== "completed"
  );
}

function createStableDeletionCleanupOperationId(operationId: string): string {
  const digest = createHash("sha256").update(operationId).digest("hex").slice(0, 32);

  return `${backgroundOperationIdPrefix}deletion_cleanup_${digest}`;
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
