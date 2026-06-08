import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { createListEnvelope, createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import {
  parsePaginationQuery,
  type PaginationInput,
  type PaginationQuery,
} from "../http/pagination.js";
import { WebhookService } from "./webhook.service.js";
import type { CreateWebhookInput, UpdateWebhookInput } from "./webhook.types.js";

@Controller("v1/webhooks")
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  async list(@Req() request: ApiKeyRequest, @Query() query: PaginationQuery) {
    const pagination = paginateItems(
      this.webhookService.list(requireApiKeyScope(request)).webhooks,
      parsePaginationQuery(query),
    );

    return createListEnvelope(pagination.items, {
      has_more: pagination.hasMore,
      page: pagination.page,
      page_size: pagination.pageSize,
      requestId: createRequestId(),
      total: pagination.total,
    });
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateWebhookInput, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.webhookService.create(body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":webhookId")
  async get(@Param("webhookId") webhookId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      this.webhookService.get(webhookId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Patch(":webhookId")
  async update(
    @Param("webhookId") webhookId: string,
    @Body() body: UpdateWebhookInput,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.webhookService.update(webhookId, body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":webhookId/test")
  @HttpCode(202)
  async test(
    @Param("webhookId") webhookId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.webhookService.test(webhookId, body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":webhookId/deliveries")
  async listDeliveries(
    @Param("webhookId") webhookId: string,
    @Req() request: ApiKeyRequest,
    @Query() query: PaginationQuery,
  ) {
    const pagination = paginateItems(
      this.webhookService.listDeliveries(webhookId, requireApiKeyScope(request)).deliveries,
      parsePaginationQuery(query),
    );

    return createListEnvelope(pagination.items, {
      has_more: pagination.hasMore,
      page: pagination.page,
      page_size: pagination.pageSize,
      requestId: createRequestId(),
      total: pagination.total,
    });
  }
}

function paginateItems<TItem>(items: readonly TItem[], input: PaginationInput) {
  const start = (input.page - 1) * input.pageSize;
  const end = start + input.pageSize;
  const total = items.length;

  return {
    hasMore: end < total,
    items: items.slice(start, end),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}
