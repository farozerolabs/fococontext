import { createHash } from "node:crypto";

import { createBackgroundOperationDedupeKey } from "@fococontext/core";
import {
  backgroundOperationIdPrefix,
  createStableIdTimeCheckpointCursor,
  readStableIdTimeCheckpointCursor,
  type BackgroundOperationCheckpointRecord,
  type BackgroundOperationCheckpointRepository,
} from "@fococontext/db";

import type {
  KnowledgeCheckStore,
  WorkerKnowledgeCheckPageCursor,
  WorkerKnowledgeCheckRecord,
} from "./knowledge-check.worker.js";

export function readKnowledgeCheckCheckpointResumeState(
  checkpoint: BackgroundOperationCheckpointRecord | null,
): {
  cursor: WorkerKnowledgeCheckPageCursor | null;
  processed: number;
} {
  if (checkpoint === null || checkpoint.status === "completed") {
    return {
      cursor: null,
      processed: 0,
    };
  }
  const resume = readStableIdTimeCheckpointCursor(checkpoint.cursor, {
    cursorKey: "page_cursor",
  });

  return {
    cursor: resume.cursor,
    processed: resume.processedCount,
  };
}

export async function createOrReuseKnowledgeCheckCheckpoint(input: {
  check: WorkerKnowledgeCheckRecord;
  repository: BackgroundOperationCheckpointRepository | undefined;
  store: KnowledgeCheckStore;
  total: number;
  now: string;
}): Promise<BackgroundOperationCheckpointRecord | null> {
  if (input.repository === undefined) {
    return null;
  }
  const operationId = createStableKnowledgeCheckOperationId(input.check.id);
  const scope = await input.store.resolveKnowledgeBaseScope(input.check.knowledgeBaseId);

  return input.repository.createOrReuse({
    id: operationId,
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    knowledgeBaseId: input.check.knowledgeBaseId,
    jobId: input.check.id,
    operationKind: "knowledge_check",
    stage: "queued",
    lockKey: createBackgroundOperationDedupeKey({
      operationId,
      operationKind: "knowledge_check",
      scopeId: input.check.knowledgeBaseId,
    }),
    totalCount: input.total,
    metadata: {
      check_id: input.check.id,
      check_types: [...input.check.checks],
    },
    now: input.now,
  });
}

export async function markKnowledgeCheckCheckpointRunning(input: {
  checkpoint: BackgroundOperationCheckpointRecord | null;
  repository: BackgroundOperationCheckpointRepository | undefined;
  now: string;
}): Promise<void> {
  if (input.checkpoint === null || input.checkpoint.status === "completed") {
    return;
  }
  await input.repository?.markRunning({
    id: input.checkpoint.id,
    now: input.now,
    stage: "scanning",
  });
}

export async function saveKnowledgeCheckCheckpointProgress(input: {
  checkpoint: BackgroundOperationCheckpointRecord | null;
  cursor: WorkerKnowledgeCheckPageCursor | null;
  findingsCount: number;
  lastItemId: string | null;
  processed: number;
  repository: BackgroundOperationCheckpointRepository | undefined;
  total: number;
  now: string;
}): Promise<void> {
  if (input.checkpoint === null) {
    return;
  }
  await input.repository?.saveProgress({
    id: input.checkpoint.id,
    cursor: createStableIdTimeCheckpointCursor({
      cursor: input.cursor,
      processedCount: input.processed,
      cursorKey: "page_cursor",
    }),
    processedCount: input.processed,
    totalCount: input.total,
    lastItemId: input.lastItemId,
    metadata: {
      finding_count: input.findingsCount,
    },
    now: input.now,
    stage: "scanning",
  });
}

export async function markKnowledgeCheckCheckpointCompleted(input: {
  checkpoint: BackgroundOperationCheckpointRecord | null;
  findingsCount: number;
  lastItemId: string | null;
  processed: number;
  repository: BackgroundOperationCheckpointRepository | undefined;
  total: number;
  now: string;
}): Promise<void> {
  if (input.checkpoint === null) {
    return;
  }
  await input.repository?.markCompleted({
    id: input.checkpoint.id,
    processedCount: input.processed,
    totalCount: input.total,
    lastItemId: input.lastItemId,
    metadata: {
      finding_count: input.findingsCount,
    },
    now: input.now,
    stage: "completed",
  });
}

export async function markKnowledgeCheckCheckpointFailed(input: {
  check: WorkerKnowledgeCheckRecord;
  error: unknown;
  repository: BackgroundOperationCheckpointRepository | undefined;
  now: string;
}): Promise<void> {
  const checkpoint = input.repository
    ? await input.repository.getById(createStableKnowledgeCheckOperationId(input.check.id))
    : null;
  if (checkpoint === null) {
    return;
  }
  await input.repository?.markFailed({
    id: checkpoint.id,
    safeError: {
      message: summarizeWorkerError(input.error),
    },
    now: input.now,
    stage: "failed",
  });
}

function createStableKnowledgeCheckOperationId(checkId: string): string {
  const digest = createHash("sha256").update(checkId).digest("hex").slice(0, 32);

  return `${backgroundOperationIdPrefix}knowledge_check_${digest}`;
}

function summarizeWorkerError(error: unknown): string {
  return error instanceof Error ? error.message : "Knowledge Check worker failed.";
}
