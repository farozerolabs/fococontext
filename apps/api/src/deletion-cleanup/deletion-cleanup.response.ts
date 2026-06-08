import { createResourceId } from "@fococontext/contracts";

import type {
  DeletionCleanupItemRecord,
  DeletionCleanupOperationRecord,
  DeletionCleanupTargetType,
} from "./deletion-cleanup.types.js";

export interface DeletionCleanupOperationSummaryResponse {
  id: string;
  target_type: DeletionCleanupTargetType;
  target_id: string;
  knowledge_base_id: string | null;
  status: DeletionCleanupOperationRecord["status"];
  phase: DeletionCleanupOperationRecord["phase"];
  retryable: boolean;
  item_counts: {
    total: number;
    pending: number;
    deleted: number;
    skipped: number;
    failed: number;
    object_keys: number;
    database_rows: number;
  };
  settled_state: DeletionCleanupSettledStateResponse;
  created_at: string;
  updated_at: string;
}

export interface DeletionCleanupSettledStateResponse {
  is_settled: boolean;
  phase: DeletionCleanupOperationRecord["phase"];
  object_storage: DeletionCleanupPhaseArtifactStateResponse;
  database: DeletionCleanupPhaseArtifactStateResponse;
  residual_artifacts: {
    total: number;
    pending: number;
    failed: number;
  };
}

export interface DeletionCleanupPhaseArtifactStateResponse {
  status: "pending" | "running" | "completed" | "failed" | "canceled" | "not_applicable";
  total: number;
  residual: number;
  failed: number;
}

export interface DeletionCleanupItemSummaryResponse {
  id: string;
  operation_id: string;
  item_type: DeletionCleanupItemRecord["itemType"];
  resource_type: string | null;
  resource_id: string | null;
  object_key: string | null;
  table_name: string | null;
  status: DeletionCleanupItemRecord["status"];
  phase: DeletionCleanupItemRecord["phase"];
  attempt_count: number;
  max_attempts: number;
  last_error: Record<string, unknown> | null;
  skip_reason: string | null;
  retry_after: string | null;
  retained_until: string | null;
  completed_at: string | null;
}

export interface DeletionCleanupOperationDetailResponse extends DeletionCleanupOperationSummaryResponse {
  requested_by: string | null;
  request_id: string | null;
  queue_job_id: string | null;
  attempt_count: number;
  max_attempts: number;
  retry_after: string | null;
  last_error: Record<string, unknown> | null;
  retention_expires_at: string | null;
  item_retention_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  canceled_at: string | null;
  items: DeletionCleanupItemSummaryResponse[];
}

export function createQueuedDeletionCleanupOperation(input: {
  targetType: DeletionCleanupTargetType;
  targetId: string;
  knowledgeBaseId: string | null;
  requestedBy?: string | null;
  requestId?: string | null;
  now: string;
  maxAttempts?: number;
  retentionExpiresAt?: string | null;
  itemRetentionExpiresAt?: string | null;
}): DeletionCleanupOperationRecord {
  return {
    id: createResourceId("cleanupOperation"),
    targetType: input.targetType,
    targetId: input.targetId,
    knowledgeBaseId: input.knowledgeBaseId,
    status: "queued",
    phase: "queued",
    requestedBy: input.requestedBy ?? null,
    requestId: input.requestId ?? null,
    queueJobId: null,
    manifest: {},
    totalItemCount: 0,
    pendingItemCount: 0,
    deletedItemCount: 0,
    skippedItemCount: 0,
    failedItemCount: 0,
    objectKeyCount: 0,
    databaseRowCount: 0,
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? 3,
    retryAfter: null,
    retryable: true,
    lastError: null,
    retentionExpiresAt: input.retentionExpiresAt ?? null,
    itemRetentionExpiresAt: input.itemRetentionExpiresAt ?? null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    canceledAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function toDeletionCleanupOperationSummaryResponse(
  record: DeletionCleanupOperationRecord,
): DeletionCleanupOperationSummaryResponse {
  return {
    id: record.id,
    target_type: record.targetType,
    target_id: record.targetId,
    knowledge_base_id: record.knowledgeBaseId,
    status: record.status,
    phase: record.phase,
    retryable: record.retryable,
    item_counts: {
      total: record.totalItemCount,
      pending: record.pendingItemCount,
      deleted: record.deletedItemCount,
      skipped: record.skippedItemCount,
      failed: record.failedItemCount,
      object_keys: record.objectKeyCount,
      database_rows: record.databaseRowCount,
    },
    settled_state: createDeletionCleanupSettledState(record),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function toDeletionCleanupOperationDetailResponse(
  record: DeletionCleanupOperationRecord,
  items: readonly DeletionCleanupItemRecord[],
): DeletionCleanupOperationDetailResponse {
  return {
    ...toDeletionCleanupOperationSummaryResponse(record),
    settled_state: createDeletionCleanupSettledState(record, items),
    requested_by: record.requestedBy,
    request_id: record.requestId,
    queue_job_id: record.queueJobId,
    attempt_count: record.attemptCount,
    max_attempts: record.maxAttempts,
    retry_after: record.retryAfter,
    last_error: record.lastError,
    retention_expires_at: record.retentionExpiresAt,
    item_retention_expires_at: record.itemRetentionExpiresAt,
    started_at: record.startedAt,
    completed_at: record.completedAt,
    failed_at: record.failedAt,
    canceled_at: record.canceledAt,
    items: items.map(toDeletionCleanupItemSummaryResponse),
  };
}

export function toDeletionCleanupItemSummaryResponse(
  record: DeletionCleanupItemRecord,
): DeletionCleanupItemSummaryResponse {
  return {
    id: record.id,
    operation_id: record.operationId,
    item_type: record.itemType,
    resource_type: record.resourceType,
    resource_id: record.resourceId,
    object_key: record.objectKey,
    table_name: record.tableName,
    status: record.status,
    phase: record.phase,
    attempt_count: record.attemptCount,
    max_attempts: record.maxAttempts,
    last_error: record.lastError,
    skip_reason: record.skipReason,
    retry_after: record.retryAfter,
    retained_until: record.retainedUntil,
    completed_at: record.completedAt,
  };
}

function createDeletionCleanupSettledState(
  record: DeletionCleanupOperationRecord,
  items?: readonly DeletionCleanupItemRecord[],
): DeletionCleanupSettledStateResponse {
  const itemCounts =
    items === undefined ? undefined : createDeletionCleanupSettledItemCounts(items);
  const pending = itemCounts?.pending ?? record.pendingItemCount;
  const failed = itemCounts?.failed ?? record.failedItemCount;
  const objectStorage = createPhaseArtifactState({
    failed: itemCounts?.objectFailed ?? inferFailedCount(record.objectKeyCount, record),
    operation: record,
    residual: itemCounts?.objectResidual ?? inferResidualCount(record.objectKeyCount, record),
    total: itemCounts?.objectTotal ?? record.objectKeyCount,
  });
  const database = createPhaseArtifactState({
    failed: itemCounts?.databaseFailed ?? inferFailedCount(record.databaseRowCount, record),
    operation: record,
    residual: itemCounts?.databaseResidual ?? inferResidualCount(record.databaseRowCount, record),
    total: itemCounts?.databaseTotal ?? record.databaseRowCount,
  });
  const residualTotal = Math.max(objectStorage.residual + database.residual, pending + failed);

  return {
    is_settled:
      record.status === "completed" &&
      objectStorage.residual === 0 &&
      database.residual === 0 &&
      pending === 0 &&
      failed === 0,
    phase: record.phase,
    object_storage: objectStorage,
    database,
    residual_artifacts: {
      total: residualTotal,
      pending,
      failed,
    },
  };
}

function createDeletionCleanupSettledItemCounts(items: readonly DeletionCleanupItemRecord[]) {
  const objectItems = items.filter((item) => item.itemType === "object");
  const databaseItems = items.filter((item) => item.itemType === "database_row");

  return {
    pending: items.filter((item) => item.status === "pending" || item.status === "running").length,
    failed: items.filter((item) => item.status === "failed").length,
    objectTotal: objectItems.length,
    objectResidual: objectItems.filter(
      (item) => item.status === "pending" || item.status === "running" || item.status === "failed",
    ).length,
    objectFailed: objectItems.filter((item) => item.status === "failed").length,
    databaseTotal: databaseItems.length,
    databaseResidual: databaseItems.filter(
      (item) => item.status === "pending" || item.status === "running" || item.status === "failed",
    ).length,
    databaseFailed: databaseItems.filter((item) => item.status === "failed").length,
  };
}

function createPhaseArtifactState(input: {
  failed: number;
  operation: DeletionCleanupOperationRecord;
  residual: number;
  total: number;
}): DeletionCleanupPhaseArtifactStateResponse {
  return {
    status: resolvePhaseArtifactStatus(input.operation, input.total, input.residual, input.failed),
    total: input.total,
    residual: input.residual,
    failed: input.failed,
  };
}

function resolvePhaseArtifactStatus(
  operation: DeletionCleanupOperationRecord,
  total: number,
  residual: number,
  failed: number,
): DeletionCleanupPhaseArtifactStateResponse["status"] {
  if (operation.status === "canceled") {
    return "canceled";
  }
  if (operation.status === "failed" || failed > 0) {
    return "failed";
  }
  if (operation.status === "completed" && residual === 0) {
    return total === 0 ? "not_applicable" : "completed";
  }
  if (operation.status === "running") {
    return "running";
  }

  return "pending";
}

function inferResidualCount(total: number, record: DeletionCleanupOperationRecord): number {
  if (total === 0) {
    return 0;
  }
  if (
    record.status === "completed" &&
    record.pendingItemCount === 0 &&
    record.failedItemCount === 0
  ) {
    return 0;
  }

  return Math.min(total, record.pendingItemCount + record.failedItemCount);
}

function inferFailedCount(total: number, record: DeletionCleanupOperationRecord): number {
  if (total === 0) {
    return 0;
  }

  return Math.min(total, record.failedItemCount);
}
