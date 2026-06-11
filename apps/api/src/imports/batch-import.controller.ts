import { Body, Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import { createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import type { CreateBatchImportInput } from "./batch-import.types.js";
import { BatchImportService } from "./batch-import.service.js";

@Controller("v1/knowledge-bases/:knowledgeBaseId/imports")
export class BatchImportController {
  constructor(
    private readonly batchImportService: BatchImportService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(202)
  async create(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Body() body: CreateBatchImportInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.batchImportService.create(knowledgeBaseId, body, scope),
      createRequestId(),
    );
  }
}
