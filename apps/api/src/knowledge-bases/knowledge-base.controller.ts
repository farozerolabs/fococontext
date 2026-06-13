import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { createListEnvelope, createRequestId, createSuccessEnvelope } from "@fococontext/contracts";

import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import {
  parseCursorPaginationQuery,
  parsePaginationQuery,
  type CursorPaginationQuery,
} from "../http/pagination.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import { wikiStoreToken, type WikiStore } from "../wiki/wiki-store.js";
import {
  renderMarkdownExportFile,
  systemPageOrder,
  toSystemPageResponse,
} from "./knowledge-base.helpers.js";
import type {
  CreateKnowledgeBaseInput,
  MarkdownContractValidationResponse,
  MarkdownExportResponse,
  ResolveKnowledgeBaseForkInput,
  SyncKnowledgeBaseForkInput,
  SystemPageRecord,
  UpdateDatasetConfigurationInput,
  UpdateKnowledgeBaseInput,
} from "./knowledge-base.types.js";

interface KnowledgeBaseListQuery {
  page?: string;
  page_size?: string;
  keyword?: string;
  status?: string;
}

interface MarkdownExportQuery {
  format?: string;
  include_sources?: string;
}

@Controller("v1/knowledge-bases")
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly webhookService: WebhookService,
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
  ) {}

  @Post()
  async create(@Body() body: CreateKnowledgeBaseInput, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.create(body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get()
  async list(@Query() query: KnowledgeBaseListQuery, @Req() request: ApiKeyRequest) {
    const { page, pageSize } = parsePaginationQuery(query);
    const listInput = {
      page,
      pageSize,
      ...(query.keyword === undefined ? {} : { keyword: query.keyword }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const result = await this.knowledgeBaseService.list(listInput, requireApiKeyScope(request));

    return createListEnvelope(result.items, {
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
      has_more: result.hasMore,
      requestId: createRequestId(),
    });
  }

  @Get(":id/system-pages")
  async systemPages(
    @Param("id") id: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const { page, pageSize, cursor } = parseCursorPaginationQuery(query);
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(id, scope);
    const pagination = await this.wikiStore.listSystemPagesPaginated(id, {
      page,
      pageSize,
      ...(cursor === undefined ? {} : { cursor }),
    });

    return createListEnvelope(pagination.items.map(toSystemPageResponse), {
      page,
      page_size: pageSize,
      total: pagination.total,
      has_more: pagination.hasMore,
      next_cursor: pagination.nextCursor,
      requestId: createRequestId(),
    });
  }

  @Get(":id/dataset-configuration")
  async datasetConfiguration(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.getDatasetConfiguration(id, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Patch(":id/dataset-configuration")
  async updateDatasetConfiguration(
    @Param("id") id: string,
    @Body() body: UpdateDatasetConfigurationInput,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.updateDatasetConfiguration(
        id,
        body,
        requireApiKeyScope(request),
      ),
      createRequestId(),
    );
  }

  @Get(":id/system-pages/:type")
  async systemPage(
    @Param("id") id: string,
    @Param("type") type: string,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(id, scope);

    return createSuccessEnvelope(
      toSystemPageResponse(await this.wikiStore.getSystemPage(id, type)),
      createRequestId(),
    );
  }

  @Post(":id/markdown-contract/validate")
  @HttpCode(200)
  async validateMarkdownContract(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(id, scope);

    return createSuccessEnvelope(
      createMarkdownContractValidation(await this.listSystemPagesForMarkdownContract(id)),
      createRequestId(),
    );
  }

  @Get(":id/markdown-export")
  async exportMarkdown(
    @Param("id") id: string,
    @Query() query: MarkdownExportQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(id, scope);

    return createSuccessEnvelope(
      createMarkdownExport(
        id,
        {
          format: query.format === "zip" ? "zip" : "single_file",
          includeSources: query.include_sources === "true",
        },
        await this.listSystemPagesForMarkdownContract(id),
      ),
      createRequestId(),
    );
  }

  @Post(":id/forks/resolve")
  @HttpCode(200)
  async resolveFork(
    @Param("id") id: string,
    @Body() body: ResolveKnowledgeBaseForkInput,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.resolveFork(id, body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":id/forks")
  @HttpCode(200)
  async createFork(
    @Param("id") id: string,
    @Body() body: ResolveKnowledgeBaseForkInput,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.createFork(id, body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Get(":id/forks")
  async listForks(
    @Param("id") id: string,
    @Query() query: KnowledgeBaseListQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const { page, pageSize } = parsePaginationQuery(query);
    const result = await this.knowledgeBaseService.listForks(
      id,
      {
        page,
        pageSize,
        ...(query.keyword === undefined ? {} : { keyword: query.keyword }),
        ...(query.status === undefined ? {} : { status: query.status }),
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

  @Get(":id")
  async detail(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.get(id, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":id/reindex")
  @HttpCode(201)
  async rebuildIndexes(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    const result = await this.knowledgeBaseService.rebuildIndexes(id, scope);

    await this.webhookService.emit({
      eventType: "knowledge_base.reindexed",
      knowledgeBaseId: id,
      payload: {
        job_id: result.id,
        status: result.status,
      },
      requestTrace: {
        event_source: "knowledge_base.reindex",
      },
      scope,
    });

    return createSuccessEnvelope(result, createRequestId());
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateKnowledgeBaseInput,
    @Req() request: ApiKeyRequest,
  ) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.update(id, body, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Delete(":id")
  @HttpCode(200)
  async delete(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.delete(id, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  private async listSystemPagesForMarkdownContract(id: string): Promise<SystemPageRecord[]> {
    const pagination = await this.wikiStore.listSystemPagesPaginated(id, {
      page: 1,
      pageSize: systemPageOrder.length,
    });

    return orderSystemPages(pagination.items);
  }
}

function createMarkdownContractValidation(
  systemPages: readonly SystemPageRecord[],
): MarkdownContractValidationResponse {
  const systemPageTypes = new Set(systemPages.map((page) => page.type));
  const missingSystemPages = systemPageOrder.filter((type) => !systemPageTypes.has(type));
  const issues = missingSystemPages.map((type) => ({
    field: `system_pages.${type}`,
    message: "Required system page is missing.",
  }));
  const systemPagesPassed = issues.length === 0;

  return {
    valid: systemPagesPassed,
    issues,
    checks: {
      frontmatter: "passed",
      wikilinks: "passed",
      system_pages: systemPagesPassed ? "passed" : "failed",
      export: systemPagesPassed ? "passed" : "failed",
    },
  };
}

function createMarkdownExport(
  knowledgeBaseId: string,
  input: { format: "single_file" | "zip"; includeSources: boolean },
  systemPages: readonly SystemPageRecord[],
): MarkdownExportResponse {
  const files = systemPages.map((page) => ({
    path: `${page.type}.md`,
    content: renderMarkdownExportFile(page, input.includeSources),
  }));

  return {
    knowledge_base_id: knowledgeBaseId,
    format: input.format,
    include_sources: input.includeSources,
    files,
    content: files.map((file) => file.content).join("\n\n"),
  };
}

function orderSystemPages(systemPages: readonly SystemPageRecord[]): SystemPageRecord[] {
  const order = new Map(systemPageOrder.map((type, index) => [type, index]));

  return [...systemPages].sort((left, right) => {
    const leftOrder = order.get(left.type) ?? systemPageOrder.length;
    const rightOrder = order.get(right.type) ?? systemPageOrder.length;

    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });
}

@Controller("v1/forks")
export class ForkController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly webhookService: WebhookService,
  ) {}

  @Get(":id")
  async detail(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.getFork(id, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Delete(":id")
  @HttpCode(200)
  async delete(@Param("id") id: string, @Req() request: ApiKeyRequest) {
    return createSuccessEnvelope(
      await this.knowledgeBaseService.deleteFork(id, requireApiKeyScope(request)),
      createRequestId(),
    );
  }

  @Post(":id/sync")
  @HttpCode(200)
  async sync(
    @Param("id") id: string,
    @Body() body: SyncKnowledgeBaseForkInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    const result = await this.knowledgeBaseService.syncFork(id, body, scope);

    await this.webhookService.emit({
      eventType: "fork.sync.completed",
      knowledgeBaseId: id,
      payload: {
        fork_id: result.fork_id,
        change_set_id: result.change_set_id,
        source_upstream_version_id: result.source_upstream_version_id,
        target_upstream_version_id: result.target_upstream_version_id,
        current_fork_version_id: result.current_fork_version_id,
        conflict_count: result.conflicts.length,
      },
      requestTrace: {
        event_source: "fork.sync",
      },
      scope,
    });

    return createSuccessEnvelope(result, createRequestId());
  }
}

@Controller("v1/dataset-configuration-presets")
export class DatasetConfigurationPresetController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  list() {
    return createSuccessEnvelope(
      this.knowledgeBaseService.listDatasetConfigurationPresets(),
      createRequestId(),
    );
  }
}
