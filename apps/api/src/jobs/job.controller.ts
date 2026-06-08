import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { createListEnvelope, createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { JobService } from "./job.service.js";
import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import type { BatchIngestJobStatusInput } from "../documents/document.types.js";
import { parsePaginationQuery } from "../http/pagination.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";

interface JobListQuery {
  page?: string;
  page_size?: string;
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/jobs")
export class KnowledgeBaseJobController {
  constructor(
    private readonly jobService: JobService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: JobListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const result = await this.jobService.list(knowledgeBaseId, parsePaginationQuery(query), scope);

    return createListEnvelope(result.items, {
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
      has_more: result.hasMore,
      requestId: createRequestId(),
    });
  }
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/ingest-progress")
export class KnowledgeBaseIngestProgressController {
  constructor(
    private readonly jobService: JobService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async detail(@Param("knowledgeBaseId") knowledgeBaseId: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);

    return createSuccessEnvelope(
      await this.jobService.getKnowledgeBaseIngestProgress(knowledgeBaseId, scope),
      createRequestId(),
    );
  }
}

@Controller("v1/jobs")
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post("batch")
  @HttpCode(200)
  async batch(@Body() input: BatchIngestJobStatusInput, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.jobService.batch(input, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":jobId")
  async detail(@Param("jobId") jobId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.jobService.get(jobId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":jobId/retry")
  @HttpCode(201)
  async retry(@Param("jobId") jobId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.jobService.retry(jobId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":jobId/cancel")
  @HttpCode(200)
  async cancel(@Param("jobId") jobId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.jobService.cancel(jobId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }
}
