import { Body, Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import { createRequestId, createSuccessEnvelope } from "@fococontext/contracts";
import type { RetrieveExpandInput, RetrieveInput } from "@fococontext/retrieval";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { RetrieveService } from "./retrieve.service.js";

@Controller("v1/knowledge-bases/:knowledgeBaseId/retrieve")
export class RetrieveController {
  constructor(
    private readonly retrieveService: RetrieveService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(200)
  async retrieve(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Body() body: Omit<RetrieveInput, "knowledge_base_id">,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.retrieveService.retrieve(knowledgeBaseId, body, scope),
      createRequestId(),
    );
  }

  @Post("expand")
  @HttpCode(200)
  async expand(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Body() body: Omit<RetrieveExpandInput, "knowledge_base_id">,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.retrieveService.expand(knowledgeBaseId, body, scope),
      createRequestId(),
    );
  }
}
