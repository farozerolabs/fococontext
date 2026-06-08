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
import type { RuntimeConfig } from "@fococontext/core";
import {
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
  upsertItem(
    record: DeletionCleanupItemRecord,
  ): DeletionCleanupItemRecord | Promise<DeletionCleanupItemRecord>;
  pruneExpiredRecords?(
    now: string,
  ):
    | { deletedItems: number; deletedOperations: number }
    | Promise<{ deletedItems: number; deletedOperations: number }>;
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
  targetGuard?: DeletionCleanupTargetGuard;
  webhookEvents?: WorkerWebhookEventEmitter;
  objectBatchSize?: number;
  now?: () => string;
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
    concurrency: config.limits.deletionCleanup.concurrency,
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

    const fenced = await this.updateOperation(operation, {
      status: "running",
      phase: "fencing",
      attemptCount: operation.attemptCount + 1,
      startedAt: operation.startedAt ?? this.now(),
      updatedAt: this.now(),
    });
    const guardResult = await this.checkCleanupAllowed(fenced);

    if (!guardResult.allowed) {
      return this.updateOperation(fenced, {
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
    }

    const started = await this.updateOperation(fenced, {
      status: "running",
      phase: "object_cleanup",
      updatedAt: this.now(),
    });
    const items = await this.options.repository.listItemsByOperationId(operationId);
    const objectItems = items.filter(isRetryableObjectItem);

    if (objectItems.length > 0) {
      await this.deleteObjectItems(objectItems);
    }

    const afterObjects = await this.options.repository.listItemsByOperationId(operationId);
    const objectFailed = afterObjects.some(
      (item) => item.itemType === "object" && item.status === "failed",
    );

    if (objectFailed) {
      return this.finishOperation(started.id);
    }

    const databaseItems = afterObjects
      .filter(isRetryableDatabaseItem)
      .sort(compareDatabaseCleanupItems);

    if (databaseItems.length > 0) {
      const databasePhase = await this.updateOperation(started, {
        status: "running",
        phase: "database_cleanup",
        updatedAt: this.now(),
      });
      await this.deleteDatabaseItems(databaseItems);

      return this.finishOperation(databasePhase.id);
    }

    return this.finishOperation(started.id);
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

    const items = await this.options.repository.listItemsByOperationId(operationId);
    const counts = countItems(items);
    const now = this.now();
    const hasIncomplete = counts.failedItemCount > 0 || counts.pendingItemCount > 0;
    const retryable = items.some(
      (item) =>
        (item.status === "pending" || item.status === "failed") &&
        item.attemptCount < item.maxAttempts,
    );

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

  private async updateOperation(
    operation: DeletionCleanupOperationRecord,
    patch: Partial<DeletionCleanupOperationRecord>,
  ): Promise<DeletionCleanupOperationRecord> {
    return this.options.repository.updateOperation({
      ...operation,
      ...patch,
    });
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

function isRetryableObjectItem(item: DeletionCleanupItemRecord): boolean {
  return (
    item.itemType === "object" &&
    item.objectKey !== null &&
    (item.status === "pending" || item.status === "failed") &&
    item.attemptCount < item.maxAttempts
  );
}

function isRetryableDatabaseItem(item: DeletionCleanupItemRecord): boolean {
  return (
    item.itemType === "database_row" &&
    item.tableName !== null &&
    item.resourceId !== null &&
    (item.status === "pending" || item.status === "failed") &&
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
