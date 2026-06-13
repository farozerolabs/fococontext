import type {
  BackgroundOperationCheckpointRecord,
  CreateBackgroundOperationCheckpointInput,
} from "@fococontext/db";

import type { ApiDatabaseMirror } from "./api-database-mirror.js";

export function createNoopApiDatabaseMirror(): ApiDatabaseMirror {
  return {
    async saveKnowledgeBase() {},
    async updateKnowledgeBase() {},
    async saveSourceDocument() {},
    async updateSourceDocument() {},
    async markSourceDocumentsDeletedForKnowledgeBase() {},
    async saveUploadSession() {},
    async updateUploadSession() {},
    async saveBatchImport() {},
    async updateBatchImport() {},
    async saveBatchImportItems() {},
    async updateBatchImportItem() {},
    async saveDeletionCleanupOperation() {},
    async updateDeletionCleanupOperation() {},
    async saveDeletionCleanupItems() {},
    async updateDeletionCleanupItem() {},
    async saveJob() {},
    async updateJob() {},
    async cancelOpenJobsForKnowledgeBase() {
      return 0;
    },
    async cancelOpenJobsForSourceDocument() {
      return 0;
    },
    async appendJobEvent() {},
    async saveSourceWatchRule() {},
    async updateSourceWatchRule() {},
    async saveScheduledImportJob() {},
    async saveSourceWatchScanItems() {},
    async saveWebhook() {},
    async saveWebhookDelivery() {},
    async saveKnowledgeCheck() {},
    async cleanupExpiredMaintenanceIntermediateState() {
      return {
        knowledgeCheckFindings: 0,
        knowledgeCheckWindowCheckpoints: 0,
        sourceWatchScanItems: 0,
      };
    },
    async createOrReuseBackgroundOperationCheckpoint(input) {
      return createNoopBackgroundOperationCheckpoint(input);
    },
    async getBackgroundOperationCheckpointById() {
      return null;
    },
    async markBackgroundOperationCheckpointRunning(input) {
      return createNoopBackgroundOperationCheckpoint({
        id: input.id,
        tenantId: "tenant_default",
        projectId: "project_default",
        operationKind: "source_watch_scan",
        stage: input.stage ?? "running",
        now: input.now,
      });
    },
    async saveBackgroundOperationCheckpointProgress(input) {
      return createNoopBackgroundOperationCheckpoint({
        id: input.id,
        tenantId: "tenant_default",
        projectId: "project_default",
        operationKind: "source_watch_scan",
        stage: input.stage ?? "running",
        now: input.now,
        cursor: input.cursor ?? {},
        processedCount: input.processedCount ?? 0,
        failedCount: input.failedCount ?? 0,
        totalCount: input.totalCount ?? null,
        lastItemId: input.lastItemId ?? null,
        metadata: input.metadata ?? {},
      });
    },
    async completeBackgroundOperationCheckpoint(input) {
      return createNoopBackgroundOperationCheckpoint({
        id: input.id,
        tenantId: "tenant_default",
        projectId: "project_default",
        operationKind: "source_watch_scan",
        stage: input.stage ?? "completed",
        now: input.now,
        processedCount: input.processedCount ?? 0,
        failedCount: 0,
        totalCount: input.totalCount ?? null,
        lastItemId: input.lastItemId ?? null,
        metadata: input.metadata ?? {},
      });
    },
    async failBackgroundOperationCheckpoint(input) {
      return createNoopBackgroundOperationCheckpoint({
        id: input.id,
        tenantId: "tenant_default",
        projectId: "project_default",
        operationKind: "source_watch_scan",
        stage: input.stage ?? "failed",
        now: input.now,
        processedCount: input.processedCount ?? 0,
        failedCount: input.failedCount ?? 0,
        totalCount: input.totalCount ?? null,
        lastItemId: input.lastItemId ?? null,
        metadata: input.metadata ?? {},
      });
    },
  };
}

function createNoopBackgroundOperationCheckpoint(
  input: CreateBackgroundOperationCheckpointInput,
): BackgroundOperationCheckpointRecord {
  return {
    id: input.id ?? "bgop_noop",
    tenantId: input.tenantId,
    projectId: input.projectId,
    knowledgeBaseId: input.knowledgeBaseId ?? null,
    jobId: input.jobId ?? null,
    operationKind: input.operationKind,
    stage: input.stage,
    status: "queued",
    cursor: input.cursor ?? {},
    processedCount: input.processedCount ?? 0,
    failedCount: input.failedCount ?? 0,
    totalCount: input.totalCount ?? null,
    lastItemId: input.lastItemId ?? null,
    safeError: null,
    metadata: input.metadata ?? {},
    lockKey: input.lockKey ?? null,
    queuedAt: input.now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    canceledAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
