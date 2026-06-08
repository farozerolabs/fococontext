import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { createListEnvelope, createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { parsePaginationQuery } from "../http/pagination.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { SourceWatchService } from "./source-watch.service.js";
import type {
  CreateSourceWatchRuleInput,
  UpdateSourceWatchRuleInput,
} from "./source-watch.types.js";

interface SourceWatchRuleListQuery {
  page?: string;
  page_size?: string;
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/source-watch-rules")
export class KnowledgeBaseSourceWatchController {
  constructor(
    private readonly sourceWatchService: SourceWatchService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Body() body: CreateSourceWatchRuleInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    return createSuccessEnvelope(
      await this.sourceWatchService.create(knowledgeBaseId, body, scope),
      createRequestId(),
    );
  }

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: SourceWatchRuleListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const result = await this.sourceWatchService.list(
      knowledgeBaseId,
      {
        ...parsePaginationQuery(query),
      },
      scope,
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

@Controller("v1/source-watch-rules")
export class SourceWatchRuleController {
  constructor(private readonly sourceWatchService: SourceWatchService) {}

  @Get(":ruleId")
  async get(@Param("ruleId") ruleId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.sourceWatchService.get(ruleId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Patch(":ruleId")
  async update(
    @Param("ruleId") ruleId: string,
    @Body() body: UpdateSourceWatchRuleInput,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.sourceWatchService.update(ruleId, body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":ruleId/scans")
  async scans(
    @Param("ruleId") ruleId: string,
    @Query() query: SourceWatchRuleListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const result = await this.sourceWatchService.listScheduledImportJobs(
      ruleId,
      {
        ...parsePaginationQuery(query),
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

  @Post(":ruleId/scan")
  @HttpCode(200)
  async scan(@Param("ruleId") ruleId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.sourceWatchService.scan(ruleId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":ruleId/disable")
  @HttpCode(200)
  async disable(@Param("ruleId") ruleId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.sourceWatchService.disable(ruleId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":ruleId/enable")
  @HttpCode(200)
  async enable(@Param("ruleId") ruleId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.sourceWatchService.enable(ruleId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }
}

@Controller("v1/scheduled-import-jobs")
export class ScheduledImportJobController {
  constructor(private readonly sourceWatchService: SourceWatchService) {}

  @Get(":jobId")
  async get(@Param("jobId") jobId: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.sourceWatchService.getScheduledImportJob(jobId, requireApiKeyScope(request)),
      createRequestId(),
    );
  }
}
