import {
  Body,
  Controller,
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

import {
  wikiStoreToken,
  type RollbackKnowledgeBaseInput,
  type RollbackPageInput,
  type UpdateWikiPageInput,
  type WikiStore,
} from "./wiki-store.js";
import { requireApiKeyScope, type ApiKeyRequest } from "../auth/api-key.guard.js";
import { parseCursorPaginationQuery, type CursorPaginationQuery } from "../http/pagination.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { WebhookService } from "../webhooks/webhook.service.js";

@Controller("v1/knowledge-bases/:knowledgeBaseId/pages")
export class KnowledgeBasePageController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const paginationInput = parseCursorPaginationQuery(query);
    const pagination = await this.wikiStore.listPagesPaginated(knowledgeBaseId, paginationInput);

    return createListEnvelope(pagination.items.map(toRenderableWikiPage), {
      page: paginationInput.page,
      page_size: paginationInput.pageSize,
      total: pagination.total,
      has_more: pagination.hasMore,
      next_cursor: pagination.nextCursor,
      requestId: createRequestId(),
    });
  }
}

@Controller("v1/pages")
export class WikiPageController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly webhookService: WebhookService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get(":pageId")
  async detail(@Param("pageId") pageId: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    const page = await this.wikiStore.getPage(pageId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(page.knowledge_base_id),
      scope,
    );

    return createSuccessEnvelope(toRenderableWikiPage(page), createRequestId());
  }

  @Patch(":pageId")
  async update(
    @Param("pageId") pageId: string,
    @Body() body: UpdateWikiPageInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    const currentPage = await this.wikiStore.getPage(pageId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(currentPage.knowledge_base_id),
      scope,
    );
    const result = await this.wikiStore.updatePage(pageId, body);
    const page = readRecord(result.page);
    const knowledgeBaseId = readString(page.knowledge_base_id);

    await this.webhookService.emit({
      eventType: "page.updated",
      knowledgeBaseId,
      payload: {
        change_set_id: readString(result.change_set_id),
        knowledge_version_id: readString(result.knowledge_version_id),
        page_id: pageId,
        page_version_id: readString(result.page_version_id),
      },
      requestTrace: {
        event_source: "page.update",
      },
      scope,
    });
    await this.webhookService.emit({
      eventType: "change_set.created",
      knowledgeBaseId,
      payload: {
        change_set_id: readString(result.change_set_id),
        source: "page.update",
      },
      requestTrace: {
        event_source: "page.update",
      },
      scope,
    });
    await this.webhookService.emit({
      eventType: "version.created",
      knowledgeBaseId,
      payload: {
        change_set_id: readString(result.change_set_id),
        knowledge_version_id: readString(result.knowledge_version_id),
      },
      requestTrace: {
        event_source: "page.update",
      },
      scope,
    });

    return createSuccessEnvelope(result, createRequestId());
  }

  @Get(":pageId/related")
  async related(
    @Param("pageId") pageId: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    const page = await this.wikiStore.getPage(pageId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(page.knowledge_base_id),
      scope,
    );
    const paginationInput = parseCursorPaginationQuery(query, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const related = await this.wikiStore.listRelatedPagesPaginated(pageId, paginationInput);

    return createListEnvelope(related.items, {
      page: paginationInput.page,
      page_size: paginationInput.pageSize,
      total: related.total,
      has_more: related.hasMore,
      next_cursor: related.nextCursor,
      requestId: createRequestId(),
    });
  }

  @Get(":pageId/versions")
  async versions(
    @Param("pageId") pageId: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    const page = await this.wikiStore.getPage(pageId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(page.knowledge_base_id),
      scope,
    );
    const paginationInput = parseCursorPaginationQuery(query);
    const pagination = await this.wikiStore.listPageVersionsPaginated(pageId, paginationInput);

    return createListEnvelope(pagination.items.map(normalizeVersionRecord), {
      page: paginationInput.page,
      page_size: paginationInput.pageSize,
      total: pagination.total,
      has_more: pagination.hasMore,
      next_cursor: pagination.nextCursor,
      requestId: createRequestId(),
    });
  }

  @Post(":pageId/rollback")
  @HttpCode(200)
  async rollback(
    @Param("pageId") pageId: string,
    @Body() body: RollbackPageInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);
    const page = await this.wikiStore.getPage(pageId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(page.knowledge_base_id),
      scope,
    );
    const result = await this.wikiStore.rollbackPage(pageId, body);

    await this.webhookService.emit({
      eventType: "rollback.completed",
      knowledgeBaseId: page.knowledge_base_id,
      payload: {
        change_set_id: readString(result.change_set_id),
        page_id: pageId,
        page_version_id: readString(result.page_version_id),
        rollback_id: readString(result.rollback_id),
      },
      requestTrace: {
        event_source: "page.rollback",
      },
      scope,
    });
    await this.webhookService.emit({
      eventType: "version.created",
      knowledgeBaseId: page.knowledge_base_id,
      payload: {
        change_set_id: readString(result.change_set_id),
        knowledge_version_id: readString(result.knowledge_version_id),
      },
      requestTrace: {
        event_source: "page.rollback",
      },
      scope,
    });

    return createSuccessEnvelope(result, createRequestId());
  }
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/versions")
export class KnowledgeBaseVersionController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const paginationInput = parseCursorPaginationQuery(query);
    const pagination = await this.wikiStore.listKnowledgeVersionsPaginated(
      knowledgeBaseId,
      paginationInput,
    );

    return createListEnvelope(pagination.items.map(normalizeVersionRecord), {
      page: paginationInput.page,
      page_size: paginationInput.pageSize,
      total: pagination.total,
      has_more: pagination.hasMore,
      next_cursor: pagination.nextCursor,
      requestId: createRequestId(),
    });
  }
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/page-versions")
export class KnowledgeBasePageVersionController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const paginationInput = parseCursorPaginationQuery(query);
    const pagination = await this.wikiStore.listKnowledgeBasePageVersionsPaginated(
      knowledgeBaseId,
      paginationInput,
    );

    return createListEnvelope(pagination.items.map(normalizeVersionRecord), {
      page: paginationInput.page,
      page_size: paginationInput.pageSize,
      total: pagination.total,
      has_more: pagination.hasMore,
      next_cursor: pagination.nextCursor,
      requestId: createRequestId(),
    });
  }
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/change-sets")
export class KnowledgeBaseChangeSetController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Query() query: CursorPaginationQuery,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const paginationInput = parseCursorPaginationQuery(query);
    const pagination = await this.wikiStore.listChangeSetsPaginated(
      knowledgeBaseId,
      paginationInput,
    );

    return createListEnvelope(pagination.items.map(normalizeVersionRecord), {
      page: paginationInput.page,
      page_size: paginationInput.pageSize,
      total: pagination.total,
      has_more: pagination.hasMore,
      next_cursor: pagination.nextCursor,
      requestId: createRequestId(),
    });
  }
}

@Controller("v1/change-sets")
export class ChangeSetController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly webhookService: WebhookService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get(":changeSetId")
  async detail(@Param("changeSetId") changeSetId: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    const changeSet = await this.wikiStore.getChangeSet(changeSetId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(changeSet.knowledge_base_id),
      scope,
    );

    return createSuccessEnvelope(changeSet, createRequestId());
  }

  @Post(":changeSetId/apply")
  @HttpCode(200)
  async apply(@Param("changeSetId") changeSetId: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    const changeSet = await this.wikiStore.getChangeSet(changeSetId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(changeSet.knowledge_base_id),
      scope,
    );
    const result = await this.wikiStore.applyChangeSet(changeSetId);

    await this.webhookService.emit({
      eventType: "change_set.created",
      knowledgeBaseId: readString(result.knowledge_base_id),
      payload: {
        change_set_id: changeSetId,
        status: readString(result.status),
      },
      requestTrace: {
        event_source: "change_set.apply",
      },
      scope,
    });

    return createSuccessEnvelope(result, createRequestId());
  }

  @Post(":changeSetId/discard")
  @HttpCode(200)
  async discard(@Param("changeSetId") changeSetId: string, @Req() request: ApiKeyRequest) {
    const scope = requireApiKeyScope(request);
    const changeSet = await this.wikiStore.getChangeSet(changeSetId);
    await this.knowledgeBaseService.assertReadableKnowledgeBase(
      readRequiredString(changeSet.knowledge_base_id),
      scope,
    );

    return createSuccessEnvelope(
      await this.wikiStore.discardChangeSet(changeSetId),
      createRequestId(),
    );
  }
}

@Controller("v1/knowledge-bases/:knowledgeBaseId/rollback")
export class KnowledgeBaseRollbackController {
  constructor(
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    private readonly webhookService: WebhookService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Post()
  @HttpCode(200)
  async rollback(
    @Param("knowledgeBaseId") knowledgeBaseId: string,
    @Body() body: RollbackKnowledgeBaseInput,
    @Req() request: ApiKeyRequest,
  ) {
    const scope = requireApiKeyScope(request);

    await this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    const result = await this.wikiStore.rollbackKnowledgeBase(knowledgeBaseId, body);

    await this.webhookService.emit({
      eventType: "rollback.completed",
      knowledgeBaseId,
      payload: {
        change_set_id: readString(result.change_set_id),
        knowledge_version_id: readString(result.knowledge_version_id),
        rollback_id: readString(result.rollback_id),
      },
      requestTrace: {
        event_source: "knowledge_base.rollback",
      },
      scope,
    });
    await this.webhookService.emit({
      eventType: "version.created",
      knowledgeBaseId,
      payload: {
        change_set_id: readString(result.change_set_id),
        knowledge_version_id: readString(result.knowledge_version_id),
      },
      requestTrace: {
        event_source: "knowledge_base.rollback",
      },
      scope,
    });

    return createSuccessEnvelope(result, createRequestId());
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRequiredString(value: unknown): string {
  return readString(value) ?? "";
}

function normalizeVersionRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    created_at: normalizeTimestampValue(record.created_at),
  };
}

function normalizeTimestampValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (hasToISOString(value)) {
    return value.toISOString();
  }

  return value;
}

function hasToISOString(value: unknown): value is { toISOString: () => string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toISOString" in value &&
    typeof (value as { toISOString?: unknown }).toISOString === "function"
  );
}

function toRenderableWikiPage<
  TPage extends { markdown: string; source_refs?: Record<string, unknown>[] },
>(
  page: TPage,
): TPage & { media_refs: Record<string, unknown>[]; wikilink_targets: Record<string, unknown>[] } {
  return {
    ...page,
    media_refs: extractMediaRefs(page.source_refs),
    wikilink_targets: extractWikilinkTargets(page.markdown),
  };
}

function extractMediaRefs(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        )
        .filter((item) => typeof item.media_asset_id === "string")
        .map((item) => ({
          document_id: item.document_id,
          evidence_kind: item.evidence_kind,
          locator: item.locator,
          media_asset_id: item.media_asset_id,
        }))
    : [];
}

function extractWikilinkTargets(markdown: string): Record<string, unknown>[] {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/gu)].map(
    (match) => {
      const title = match[1]?.trim() ?? "";
      const anchor = match[2]?.trim();
      const label = match[3]?.trim();
      const target: Record<string, unknown> = {
        normalized_key: normalizeWikilinkTarget(title),
        title,
      };

      if (anchor !== undefined && anchor.length > 0) {
        target.anchor = anchor;
      }
      if (label !== undefined && label.length > 0) {
        target.label = label;
      }

      return target;
    },
  );
}

function normalizeWikilinkTarget(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "-");
}
