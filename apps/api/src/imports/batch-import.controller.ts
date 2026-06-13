import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
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

  @Get(":importJobId")
  async get(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Param("importJobId") importJobId: string,
    @Query("page") page: string | undefined,
    @Query("page_size") pageSize: string | undefined,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.batchImportService.getStatus(
        knowledgeBaseId,
        importJobId,
        {
          page: readPage(page),
          pageSize: readPageSize(pageSize),
        },
        scope,
      ),
      createRequestId(),
    );
  }
}

function readPage(value: string | undefined): number {
  const parsed = Number(value ?? "1");

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function readPageSize(value: string | undefined): number {
  const parsed = Number(value ?? "50");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(200, Math.floor(parsed));
}
