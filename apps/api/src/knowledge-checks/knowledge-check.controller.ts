import { Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { createListEnvelope, createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { parsePaginationQuery, type PaginationQuery } from "../http/pagination.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { KnowledgeCheckService } from "./knowledge-check.service.js";
import type { CreateKnowledgeCheckInput } from "./knowledge-check.types.js";

@Controller("v1/knowledge-bases/:knowledgeBaseId/knowledge-checks")
export class KnowledgeBaseKnowledgeCheckController {
  constructor(
    private readonly knowledgeCheckService: KnowledgeCheckService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Req() request: ApiKeyRequest & { body: CreateKnowledgeCheckInput },
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.knowledgeCheckService.create(knowledgeBaseId, request.body, scope),
      createRequestId(),
    );
  }
}

@Controller("v1/knowledge-checks")
export class KnowledgeCheckController {
  constructor(private readonly knowledgeCheckService: KnowledgeCheckService) {}

  @Get(":checkId")
  async detail(@Param("checkId") checkId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeCheckService.get(checkId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":checkId/findings")
  async findings(
    @Param("checkId") checkId: string,
    @Query() query: PaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const result = await this.knowledgeCheckService.listFindings(
      checkId,
      parsePaginationQuery(query),
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
}
