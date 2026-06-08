import { Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  ApiError,
  createListEnvelope,
  createRequestId,
  createSuccessEnvelope,
} from "@fococontext/contracts";

import { DeletionCleanupService } from "./deletion-cleanup.service.js";
import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { deletionCleanupStatuses, type DeletionCleanupStatus } from "./deletion-cleanup.types.js";

interface CleanupOperationListQuery {
  page?: string;
  page_size?: string;
  knowledge_base_id?: string;
  status?: string;
}

@Controller("v1/cleanup-operations")
export class DeletionCleanupController {
  constructor(private readonly deletionCleanupService: DeletionCleanupService) {}

  @Get()
  async list(@Query() query: CleanupOperationListQuery, @Req() request: ApiKeyRequest) {
    const result = await this.deletionCleanupService.list(
      {
        page: parsePositiveIntegerQuery(query.page, 1),
        pageSize: parsePositiveIntegerQuery(query.page_size, 20),
        ...(query.knowledge_base_id === undefined
          ? {}
          : { knowledgeBaseId: query.knowledge_base_id }),
        ...(query.status === undefined ? {} : { status: readCleanupStatus(query.status) }),
      },
      requireApiKeyScope(request),
    );

    return createListEnvelope(result.items, {
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
      has_more: result.hasMore,
      requestId: createRequestId(),
    });
  }

  @Get(":operationId")
  async get(@Param("operationId") operationId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.deletionCleanupService.get(operationId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":operationId/retry")
  @HttpCode(200)
  async retry(@Param("operationId") operationId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.deletionCleanupService.retry(operationId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }
}

function parsePositiveIntegerQuery(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readCleanupStatus(value: string): DeletionCleanupStatus {
  if (deletionCleanupStatuses.includes(value as DeletionCleanupStatus)) {
    return value as DeletionCleanupStatus;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.cleanup_status_invalid",
    details: {
      fields: ["status"],
    },
  });
}
