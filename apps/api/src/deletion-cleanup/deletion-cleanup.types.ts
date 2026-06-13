export const deletionCleanupTargetTypes = [
  "knowledge_base",
  "source_document",
  "wiki_page",
  "wiki_page_version",
  "wiki_edge",
  "job",
  "job_artifact",
  "source_watch_rule",
  "webhook",
  "import_preview",
  "retrieval_trace",
] as const;

export const deletionCleanupStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
] as const;

export const deletionCleanupPhases = [
  "queued",
  "manifest",
  "fencing",
  "object_cleanup",
  "redis_cleanup",
  "database_cleanup",
  "retention",
  "completed",
  "failed",
  "canceled",
] as const;

export const deletionCleanupItemTypes = [
  "object",
  "database_row",
  "redis_key",
  "reference",
  "audit",
] as const;

export const deletionCleanupItemStatuses = [
  "pending",
  "running",
  "deleted",
  "skipped",
  "failed",
] as const;

export type DeletionCleanupTargetType = (typeof deletionCleanupTargetTypes)[number];
export type DeletionCleanupStatus = (typeof deletionCleanupStatuses)[number];
export type DeletionCleanupPhase = (typeof deletionCleanupPhases)[number];
export type DeletionCleanupItemType = (typeof deletionCleanupItemTypes)[number];
export type DeletionCleanupItemStatus = (typeof deletionCleanupItemStatuses)[number];

export interface DeletionCleanupOperationCounts {
  totalItemCount: number;
  pendingItemCount: number;
  deletedItemCount: number;
  skippedItemCount: number;
  failedItemCount: number;
  objectKeyCount: number;
  databaseRowCount: number;
  redisKeyCount: number;
}

export interface DeletionCleanupOperationRecord extends DeletionCleanupOperationCounts {
  id: string;
  targetType: DeletionCleanupTargetType;
  targetId: string;
  knowledgeBaseId: string | null;
  status: DeletionCleanupStatus;
  phase: DeletionCleanupPhase;
  requestedBy: string | null;
  requestId: string | null;
  queueJobId: string | null;
  manifest: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  retryAfter: string | null;
  retryable: boolean;
  lastError: Record<string, unknown> | null;
  retentionExpiresAt: string | null;
  itemRetentionExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeletionCleanupItemRecord {
  id: string;
  operationId: string;
  itemType: DeletionCleanupItemType;
  resourceType: string | null;
  resourceId: string | null;
  objectKey: string | null;
  tableName: string | null;
  knowledgeBaseId: string | null;
  sourceDocumentId: string | null;
  status: DeletionCleanupItemStatus;
  phase: DeletionCleanupPhase;
  attemptCount: number;
  maxAttempts: number;
  lastError: Record<string, unknown> | null;
  skipReason: string | null;
  retryAfter: string | null;
  retainedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DeletionCleanupRepositorySnapshot {
  operations: readonly DeletionCleanupOperationRecord[];
  items: readonly DeletionCleanupItemRecord[];
}
