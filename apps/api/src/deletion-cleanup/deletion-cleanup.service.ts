import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@fococontext/contracts";

import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { isApiResourceInScope, requireScopedCleanupOperation } from "../auth/resource-scope.js";
import {
  apiDatabaseHydratorToken,
  type ApiDatabaseHydrator,
} from "../database/api-database-hydrator.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import {
  deletionCleanupQueueToken,
  type DeletionCleanupQueue,
} from "../queues/deletion-cleanup.queue.js";
import {
  toDeletionCleanupOperationDetailResponse,
  type DeletionCleanupOperationDetailResponse,
} from "./deletion-cleanup.response.js";
import { DeletionCleanupRepository } from "./deletion-cleanup.repository.js";
import type { DeletionCleanupStatus } from "./deletion-cleanup.types.js";

export interface ListDeletionCleanupOperationsInput {
  page: number;
  pageSize: number;
  knowledgeBaseId?: string;
  status?: DeletionCleanupStatus;
}

export interface ListDeletionCleanupOperationsResult {
  items: DeletionCleanupOperationDetailResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

@Injectable()
export class DeletionCleanupService {
  constructor(
    private readonly repository: DeletionCleanupRepository,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    @Inject(deletionCleanupQueueToken) private readonly deletionCleanupQueue: DeletionCleanupQueue,
    @Inject(apiDatabaseHydratorToken) private readonly databaseHydrator: ApiDatabaseHydrator,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
  ) {}

  async list(
    input: ListDeletionCleanupOperationsInput,
    scope?: ApiResourceScope,
  ): Promise<ListDeletionCleanupOperationsResult> {
    await this.databaseHydrator.refresh();
    if (input.knowledgeBaseId !== undefined) {
      this.assertReadableKnowledgeBase(
        input.knowledgeBaseId,
        scope,
        () => new ApiError("knowledge_base_not_found"),
      );
    }

    const operations = this.repository
      .listOperations({
        ...(input.knowledgeBaseId === undefined ? {} : { knowledgeBaseId: input.knowledgeBaseId }),
        ...(input.status === undefined ? {} : { status: input.status }),
      })
      .filter((operation) => this.isOperationVisible(operation.knowledgeBaseId, scope));
    const start = (input.page - 1) * input.pageSize;
    const end = start + input.pageSize;

    return {
      items: operations
        .slice(start, end)
        .map((operation) =>
          toDeletionCleanupOperationDetailResponse(
            operation,
            this.repository.listItemsByOperationId(operation.id),
          ),
        ),
      page: input.page,
      pageSize: input.pageSize,
      total: operations.length,
      hasMore: end < operations.length,
    };
  }

  async get(
    operationId: string,
    scope?: ApiResourceScope,
  ): Promise<DeletionCleanupOperationDetailResponse> {
    await this.databaseHydrator.refresh();

    const operation = this.repository.findOperationById(operationId);

    if (operation === undefined || !this.isOperationVisible(operation.knowledgeBaseId, scope)) {
      throw new ApiError("cleanup_operation_not_found");
    }

    return toDeletionCleanupOperationDetailResponse(
      operation,
      this.repository.listItemsByOperationId(operation.id),
    );
  }

  async retry(
    operationId: string,
    scope?: ApiResourceScope,
  ): Promise<{ cleanup_operation: DeletionCleanupOperationDetailResponse }> {
    await this.databaseHydrator.refresh();

    const operation = this.repository.findOperationById(operationId);

    if (operation === undefined || !this.isOperationVisible(operation.knowledgeBaseId, scope)) {
      throw new ApiError("cleanup_operation_not_found");
    }
    if (
      !operation.retryable ||
      operation.status === "completed" ||
      operation.status === "canceled"
    ) {
      throw new ApiError("cleanup_operation_not_retryable");
    }

    const now = new Date().toISOString();
    let queued = this.repository.updateOperation({
      ...operation,
      status: "queued",
      phase: "queued",
      retryable: true,
      lastError: null,
      retryAfter: null,
      failedAt: null,
      updatedAt: now,
    });

    await this.databaseMirror.updateDeletionCleanupOperation(queued);

    try {
      const enqueued = await this.deletionCleanupQueue.enqueueDeletionCleanupJob({
        operation_id: queued.id,
      });
      queued = this.repository.updateOperation({
        ...queued,
        queueJobId: enqueued.job_id,
        updatedAt: new Date().toISOString(),
      });
      await this.databaseMirror.updateDeletionCleanupOperation(queued);
    } catch (error) {
      queued = this.repository.updateOperation({
        ...queued,
        lastError: {
          message: "Cleanup queue enqueue failed.",
          detail: error instanceof Error ? error.message : "Unknown cleanup queue error.",
        },
        updatedAt: new Date().toISOString(),
      });
      await this.databaseMirror.updateDeletionCleanupOperation(queued);
    }

    return {
      cleanup_operation: toDeletionCleanupOperationDetailResponse(
        queued,
        this.repository.listItemsByOperationId(queued.id),
      ),
    };
  }

  private isOperationVisible(
    knowledgeBaseId: string | null,
    scope: ApiResourceScope | undefined,
  ): boolean {
    if (scope === undefined) {
      return true;
    }
    if (knowledgeBaseId === null) {
      return false;
    }

    const operationScope = this.knowledgeBaseService.getResourceScope(knowledgeBaseId);

    return isApiResourceInScope(operationScope, scope);
  }

  private assertReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope: ApiResourceScope | undefined,
    notFoundFactory: () => ApiError,
  ): void {
    if (scope === undefined) {
      return;
    }

    requireScopedCleanupOperation(
      this.knowledgeBaseService.getResourceScope(knowledgeBaseId),
      scope,
      notFoundFactory,
    );
  }
}
