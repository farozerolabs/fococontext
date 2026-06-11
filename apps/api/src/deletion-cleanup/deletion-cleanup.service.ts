import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";

import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import {
  deletionCleanupQueueToken,
  type DeletionCleanupQueue,
} from "../queues/deletion-cleanup.queue.js";
import {
  toDeletionCleanupOperationSummaryResponse,
  toDeletionCleanupOperationDetailResponse,
  type DeletionCleanupOperationSummaryResponse,
  type DeletionCleanupOperationDetailResponse,
} from "./deletion-cleanup.response.js";
import type {
  DeletionCleanupItemRecord,
  DeletionCleanupOperationRecord,
  DeletionCleanupStatus,
} from "./deletion-cleanup.types.js";

export interface ListDeletionCleanupOperationsInput {
  page: number;
  pageSize: number;
  knowledgeBaseId?: string;
  status?: DeletionCleanupStatus;
}

export interface ListDeletionCleanupOperationsResult {
  items: DeletionCleanupOperationSummaryResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface DeletionCleanupItemPaginationInput {
  page: number;
  pageSize: number;
}

@Injectable()
export class DeletionCleanupService {
  constructor(
    @Inject(deletionCleanupQueueToken) private readonly deletionCleanupQueue: DeletionCleanupQueue,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
  ) {}

  async list(
    input: ListDeletionCleanupOperationsInput,
    scope?: ApiResourceScope,
  ): Promise<ListDeletionCleanupOperationsResult> {
    try {
      const dbResult = await this.operationalReadStore.listDeletionCleanupOperations(
        scope ?? defaultApiResourceScope,
        input,
      );

      if (dbResult !== null) {
        return {
          items: dbResult.items.map(toDeletionCleanupOperationSummaryResponse),
          page: input.page,
          pageSize: input.pageSize,
          total: dbResult.total,
          hasMore: dbResult.hasMore,
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    throw new ApiError("internal_error");
  }

  async get(
    operationId: string,
    scope?: ApiResourceScope,
    itemPagination: DeletionCleanupItemPaginationInput = { page: 1, pageSize: 100 },
  ): Promise<DeletionCleanupOperationDetailResponse> {
    const { operation, items, itemTotal, itemHasMore } = await this.loadOperationDetail(
      operationId,
      scope,
      itemPagination,
    );

    return toDeletionCleanupOperationDetailResponse(operation, items, {
      ...itemPagination,
      total: itemTotal,
      hasMore: itemHasMore,
    });
  }

  async retry(
    operationId: string,
    scope?: ApiResourceScope,
    itemPagination: DeletionCleanupItemPaginationInput = { page: 1, pageSize: 100 },
  ): Promise<{ cleanup_operation: DeletionCleanupOperationDetailResponse }> {
    const { operation, items } = await this.loadOperationDetail(operationId, scope, itemPagination);

    if (
      !operation.retryable ||
      operation.status === "completed" ||
      operation.status === "canceled"
    ) {
      throw new ApiError("cleanup_operation_not_retryable");
    }

    const now = new Date().toISOString();
    let queued: DeletionCleanupOperationRecord = {
      ...operation,
      status: "queued",
      phase: "queued",
      retryable: true,
      lastError: null,
      retryAfter: null,
      failedAt: null,
      updatedAt: now,
    };

    await this.databaseMirror.updateDeletionCleanupOperation(queued);

    try {
      const enqueued = await this.deletionCleanupQueue.enqueueDeletionCleanupJob({
        operation_id: queued.id,
      });
      queued = {
        ...queued,
        queueJobId: enqueued.job_id,
        updatedAt: new Date().toISOString(),
      };
      await this.databaseMirror.updateDeletionCleanupOperation(queued);
    } catch (error) {
      queued = {
        ...queued,
        lastError: {
          message: "Cleanup queue enqueue failed.",
          detail: error instanceof Error ? error.message : "Unknown cleanup queue error.",
        },
        updatedAt: new Date().toISOString(),
      };
      await this.databaseMirror.updateDeletionCleanupOperation(queued);
    }

    return {
      cleanup_operation: toDeletionCleanupOperationDetailResponse(queued, items, {
        ...itemPagination,
        total: queued.totalItemCount,
        hasMore: itemPagination.page * itemPagination.pageSize < queued.totalItemCount,
      }),
    };
  }

  private async loadOperationDetail(
    operationId: string,
    scope: ApiResourceScope | undefined,
    itemPagination: DeletionCleanupItemPaginationInput,
  ): Promise<{
    operation: DeletionCleanupOperationRecord;
    items: DeletionCleanupItemRecord[];
    itemTotal: number;
    itemHasMore: boolean;
  }> {
    try {
      const dbResult = await this.operationalReadStore.getDeletionCleanupOperationById(
        scope ?? defaultApiResourceScope,
        operationId,
        itemPagination,
      );

      if (dbResult !== null) {
        return dbResult;
      }

      throw new ApiError("cleanup_operation_not_found");
    } catch (error) {
      throw toOperationalListError(error);
    }
  }
}

function toOperationalListError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("internal_error");
}
