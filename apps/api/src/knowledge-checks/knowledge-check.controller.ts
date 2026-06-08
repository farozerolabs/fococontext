import { Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import { createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
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

    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
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
}
