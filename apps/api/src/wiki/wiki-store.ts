import { sql, type Kysely } from "kysely";
import { ApiError, createResourceId } from "@fococontext/contracts";
import {
  requireKnowledgeBaseTenantProject,
  writeIdempotentBatches,
  type DatabaseSchema,
} from "@fococontext/db";
import {
  createEmbeddingUnits,
  type GraphInsightsResponse,
  type GraphInsightStatus,
  type RetrievalEmbeddingProvider,
  type RetrievalEmbeddingRecord,
  type RetrievalPageRecord,
  type RetrievalSourceRef,
  type RetrievalTraceRecord,
  type RetrievalVisibilityOrigin,
} from "@fococontext/retrieval";

import type { SystemPageRecord, SystemPageType } from "../knowledge-bases/knowledge-base.types.js";

export const wikiStoreToken = Symbol("wikiStore");
const retrievalReindexPageSize = 100;
const retrievalEmbeddingWriteBatchSize = 100;

export interface WikiStore {
  listPages(knowledgeBaseId: string): Promise<WikiPageApiRecord[]>;
  listPagesPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiPageApiResult>;
  countKnowledgeCheckPages?(
    knowledgeBaseId: string,
    input: KnowledgeCheckPageScopeInput,
  ): Promise<number>;
  listKnowledgeCheckPages?(
    knowledgeBaseId: string,
    input: KnowledgeCheckPageScopeInput,
  ): Promise<PaginatedWikiPageApiResult>;
  listKnowledgeCheckPageKeys?(knowledgeBaseId: string): Promise<Set<string>>;
  getPage(pageId: string): Promise<WikiPageApiRecord>;
  updatePage(pageId: string, input: UpdateWikiPageInput): Promise<Record<string, unknown>>;
  listRelatedPages(pageId: string): Promise<Record<string, unknown>[]>;
  listRelatedPagesPaginated(
    pageId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult>;
  listRelatedPagesByPageIds(
    pageIds: readonly string[],
  ): Promise<Map<string, Record<string, unknown>[]>>;
  listPageVersions(pageId: string): Promise<Record<string, unknown>[]>;
  listPageVersionsPaginated(
    pageId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult>;
  listKnowledgeBasePageVersions(knowledgeBaseId: string): Promise<Record<string, unknown>[]>;
  listKnowledgeBasePageVersionsPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult>;
  listKnowledgeVersions(knowledgeBaseId: string): Promise<Record<string, unknown>[]>;
  listKnowledgeVersionsPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult>;
  listSystemPagesPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedSystemPageResult>;
  getSystemPage(knowledgeBaseId: string, pageType: string): Promise<SystemPageRecord>;
  listChangeSetsPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult>;
  getChangeSet(changeSetId: string): Promise<Record<string, unknown>>;
  applyChangeSet(changeSetId: string): Promise<Record<string, unknown>>;
  discardChangeSet(changeSetId: string): Promise<Record<string, unknown>>;
  getGraphInsightsSnapshot(knowledgeBaseId: string): Promise<GraphInsightsResponse | null>;
  getGraphInsightStatus(knowledgeBaseId: string): Promise<GraphInsightStatus>;
  rollbackKnowledgeBase(
    knowledgeBaseId: string,
    input: RollbackKnowledgeBaseInput,
  ): Promise<Record<string, unknown>>;
  rollbackPage(pageId: string, input: RollbackPageInput): Promise<Record<string, unknown>>;
  listForkSyncPageConflicts(
    input: ForkSyncPageConflictInput,
  ): Promise<ForkSyncPageConflictRecord[]>;
  syncForkFromUpstream(input: SyncForkFromUpstreamInput): Promise<SyncForkFromUpstreamResult>;
  rebuildRetrievalIndex(
    knowledgeBaseId: string,
    provider: RetrievalEmbeddingProvider,
  ): Promise<RetrievalIndexStats>;
  saveRetrievalTrace(trace: RetrievalTraceRecord): Promise<void>;
}

export interface WikiPaginationInput {
  page: number;
  pageSize: number;
  cursor?: string;
}

export interface KnowledgeCheckPageScopeInput extends WikiPaginationInput {
  pageIds?: readonly string[];
  sourceDocumentIds?: readonly string[];
}

export interface PaginatedWikiPageApiResult {
  items: WikiPageApiRecord[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface PaginatedWikiRecordResult {
  items: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface PaginatedSystemPageResult {
  items: SystemPageRecord[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface RetrievalIndexStats {
  indexedEdgeCount: number;
  indexedEmbeddingCount: number;
  indexedPageCount: number;
}

export interface ForkSyncPageConflictInput {
  forkKnowledgeBaseId: string;
  upstreamKnowledgeBaseId: string;
}

export interface ForkSyncPageConflictRecord {
  [key: string]: unknown;
  type: "fork_page_conflict";
  upstream_page_id: string;
  fork_page_id: string;
  slug: string;
  title: string;
}

export interface WikiPageApiRecord {
  id: string;
  knowledge_base_id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  current_version_id: string | null;
  markdown: string;
  frontmatter: Record<string, unknown>;
  media_refs?: Record<string, unknown>[];
  source_document_ids: string[];
  source_refs?: Record<string, unknown>[];
  wikilink_targets?: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  visibility_origin?: RetrievalVisibilityOrigin;
  owner_knowledge_base_id?: string | null;
  upstream_resource_id?: string | null;
  fork_tombstoned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RetrievalSourceDocumentMetadata {
  id: string;
  name: string;
  metadata: Record<string, unknown>;
}

export interface UpdateWikiPageInput {
  title?: string;
  markdown?: string;
  frontmatter?: Record<string, unknown>;
  summary?: string;
}

export interface RollbackKnowledgeBaseInput {
  target_version_id?: string;
  reason?: string;
}

export interface RollbackPageInput {
  target_page_version_id?: string;
  reason?: string;
}

export interface SyncForkFromUpstreamInput {
  forkId: string;
  upstreamKnowledgeBaseId: string;
  sourceUpstreamVersionId: string | null;
  targetUpstreamVersionId: string;
  baseForkVersionId: string;
  conflicts: readonly Record<string, unknown>[];
}

export interface SyncForkFromUpstreamResult {
  changeSetId: string;
  knowledgeVersionId: string;
}

interface ChangeSetRow {
  id: string;
  knowledge_base_id: string;
  base_version_id: string | null;
  target_version_id: string | null;
  status: string;
  trigger_type: string;
  title: string;
  description: string | null;
  diff: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  applied_at: string | null;
  discarded_at: string | null;
}

interface WikiDraftChangeContent {
  title: string;
  markdown: string;
  tags: string[];
  sources: Record<string, unknown>[];
  metadata: Record<string, unknown>;
}

interface KnowledgeBaseScopeContext {
  knowledgeBaseType: "canonical" | "fork";
  upstreamKnowledgeBaseId: string | null;
  upstreamSyncedVersionId: string | null;
}

type WikiCursorSortKey = "created_at" | "updated_at";

interface WikiKeysetCursor {
  id: string;
  sortKey: WikiCursorSortKey;
  sortValue: string;
}

interface WikiCursorPage<TItem> {
  items: TItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function createNoopWikiStore(): WikiStore {
  return {
    async listPages() {
      return [];
    },
    async listPagesPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async getPage() {
      throw new ApiError("page_not_found");
    },
    async updatePage() {
      throw new ApiError("page_not_found");
    },
    async listRelatedPages() {
      return [];
    },
    async listRelatedPagesByPageIds(pageIds) {
      return new Map(pageIds.map((pageId) => [pageId, []]));
    },
    async listRelatedPagesPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async listPageVersions() {
      return [];
    },
    async listPageVersionsPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async listKnowledgeBasePageVersions() {
      return [];
    },
    async listKnowledgeBasePageVersionsPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async listKnowledgeVersions() {
      return [];
    },
    async listKnowledgeVersionsPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async listSystemPagesPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async getSystemPage() {
      throw new ApiError("page_not_found");
    },
    async listChangeSetsPaginated() {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      };
    },
    async getChangeSet() {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.change_set_not_found",
      });
    },
    async applyChangeSet(changeSetId: string) {
      return { id: changeSetId, status: "applied" };
    },
    async discardChangeSet(changeSetId: string) {
      return { id: changeSetId, status: "discarded" };
    },
    async getGraphInsightsSnapshot() {
      return null;
    },
    async getGraphInsightStatus() {
      return createDefaultGraphInsightStatus();
    },
    async rollbackKnowledgeBase() {
      throw new ApiError("version_not_found");
    },
    async rollbackPage() {
      throw new ApiError("version_not_found");
    },
    async syncForkFromUpstream() {
      return {
        changeSetId: createResourceId("changeSet"),
        knowledgeVersionId: createResourceId("knowledgeVersion"),
      };
    },
    async listForkSyncPageConflicts() {
      return [];
    },
    async rebuildRetrievalIndex() {
      return {
        indexedEdgeCount: 0,
        indexedEmbeddingCount: 0,
        indexedPageCount: 0,
      };
    },
    async saveRetrievalTrace() {},
  };
}

export function createPostgresWikiStore(db: Kysely<DatabaseSchema>): WikiStore {
  return new PostgresWikiStore(db);
}

class PostgresWikiStore implements WikiStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listPages(knowledgeBaseId: string): Promise<WikiPageApiRecord[]> {
    const scope = await this.getKnowledgeBaseScope(knowledgeBaseId);

    if (scope.knowledgeBaseType === "fork" && scope.upstreamKnowledgeBaseId !== null) {
      const result = await sql<WikiPageApiRecord>`
        with fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${knowledgeBaseId}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        )
        select *
        from (
          select
            wiki_pages.id,
            ${knowledgeBaseId}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.status,
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'upstream_inherited'::text as visibility_origin,
            ${knowledgeBaseId}::text as owner_knowledge_base_id,
            wiki_pages.id as upstream_resource_id,
            null::timestamptz as fork_tombstoned_at,
            wiki_pages.created_at,
            wiki_pages.updated_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
            and wiki_pages.owner_knowledge_base_id is null
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
            and not exists (
              select 1
              from fork_page_tombstones
              where fork_page_tombstones.upstream_resource_id = wiki_pages.id
            )
          union all
          select
            wiki_pages.id,
            ${knowledgeBaseId}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.status,
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'fork_owned'::text as visibility_origin,
            ${knowledgeBaseId}::text as owner_knowledge_base_id,
            wiki_pages.upstream_resource_id,
            wiki_pages.fork_tombstoned_at,
            wiki_pages.created_at,
            wiki_pages.updated_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
              or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        ) visible_pages
        order by updated_at desc, title asc
      `.execute(this.db);

      return result.rows.map(normalizePageRow);
    }

    const result = await sql<WikiPageApiRecord>`
      select
        wiki_pages.id,
        wiki_pages.knowledge_base_id,
        wiki_pages.slug,
        wiki_pages.title,
        wiki_pages.page_type as "type",
        wiki_pages.status,
        wiki_pages.current_version_id,
        wiki_pages.markdown,
        wiki_pages.frontmatter,
        wiki_pages.source_document_ids,
        coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
        wiki_pages.metadata,
        'canonical'::text as visibility_origin,
        null::text as owner_knowledge_base_id,
        null::text as upstream_resource_id,
        null::timestamptz as fork_tombstoned_at,
        wiki_pages.created_at,
        wiki_pages.updated_at
      from wiki_pages
      left join wiki_page_versions current_page_version
        on current_page_version.id = wiki_pages.current_version_id
      where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
        and wiki_pages.owner_knowledge_base_id is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_pages.deleted_at is null
      order by wiki_pages.updated_at desc, wiki_pages.title asc
    `.execute(this.db);

    return result.rows.map(normalizePageRow);
  }

  async countKnowledgeCheckPages(
    knowledgeBaseId: string,
    input: KnowledgeCheckPageScopeInput,
  ): Promise<number> {
    const result = await sql<{ total: string | number | bigint }>`
      with visible_pages as (
        ${createVisibleKnowledgeCheckPagesSql(knowledgeBaseId)}
      )
      select count(*) as total
      from visible_pages
      where ${createKnowledgeCheckPageScopePredicate(input)}
    `.execute(this.db);

    return readSqlCount(result.rows[0]?.total);
  }

  async listKnowledgeCheckPages(
    knowledgeBaseId: string,
    input: KnowledgeCheckPageScopeInput,
  ): Promise<PaginatedWikiPageApiResult> {
    const cursor = decodeWikiCursor(input.cursor, "updated_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const cursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            updated_at < ${cursor.sortValue}::timestamptz
            or (updated_at = ${cursor.sortValue}::timestamptz and id < ${cursor.id})
          )`;
    const [itemsResult, totalResult] = await Promise.all([
      sql<WikiPageApiRecord>`
        with visible_pages as (
          ${createVisibleKnowledgeCheckPagesSql(knowledgeBaseId)}
        )
        select *
        from visible_pages
        where ${createKnowledgeCheckPageScopePredicate(input)}
          and ${cursorCondition}
        order by updated_at desc, id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        with visible_pages as (
          ${createVisibleKnowledgeCheckPagesSql(knowledgeBaseId)}
        )
        select count(*) as total
        from visible_pages
        where ${createKnowledgeCheckPageScopePredicate(input)}
      `.execute(this.db),
    ]);
    const page = buildWikiCursorPage(itemsResult.rows, input, "updated_at");

    return {
      items: page.items.map(normalizePageRow),
      total: readSqlCount(totalResult.rows[0]?.total),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async listKnowledgeCheckPageKeys(knowledgeBaseId: string): Promise<Set<string>> {
    const result = await sql<{ page_key: string }>`
      with visible_pages as (
        ${createVisibleKnowledgeCheckPagesSql(knowledgeBaseId)}
      ),
      page_keys as (
        select lower(id) as page_key from visible_pages
        union
        select lower(slug) as page_key from visible_pages
        union
        select regexp_replace(lower(title), '\s+', '-', 'g') as page_key from visible_pages
      )
      select page_key
      from page_keys
    `.execute(this.db);

    return new Set(result.rows.map((row) => row.page_key));
  }

  async listPagesPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiPageApiResult> {
    const scope = await this.getKnowledgeBaseScope(knowledgeBaseId);
    const cursor = decodeWikiCursor(input.cursor, "updated_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const visibleCursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            updated_at < ${cursor.sortValue}::timestamptz
            or (updated_at = ${cursor.sortValue}::timestamptz and id < ${cursor.id})
          )`;
    const canonicalCursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            wiki_pages.updated_at < ${cursor.sortValue}::timestamptz
            or (wiki_pages.updated_at = ${cursor.sortValue}::timestamptz
              and wiki_pages.id < ${cursor.id})
          )`;

    if (scope.knowledgeBaseType === "fork" && scope.upstreamKnowledgeBaseId !== null) {
      const [itemsResult, totalResult] = await Promise.all([
        sql<WikiPageApiRecord>`
          with fork_page_tombstones as (
            select upstream_resource_id
            from wiki_pages
            where owner_knowledge_base_id = ${knowledgeBaseId}
              and fork_tombstoned_at is not null
              and upstream_resource_id is not null
          ),
          visible_pages as (
            select
              wiki_pages.id,
              ${knowledgeBaseId}::text as knowledge_base_id,
              wiki_pages.slug,
              wiki_pages.title,
              wiki_pages.page_type as "type",
              wiki_pages.status,
              wiki_pages.current_version_id,
              wiki_pages.markdown,
              wiki_pages.frontmatter,
              wiki_pages.source_document_ids,
              coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
              wiki_pages.metadata,
              'upstream_inherited'::text as visibility_origin,
              ${knowledgeBaseId}::text as owner_knowledge_base_id,
              wiki_pages.id as upstream_resource_id,
              null::timestamptz as fork_tombstoned_at,
              wiki_pages.created_at,
              wiki_pages.updated_at
            from wiki_pages
            left join wiki_page_versions current_page_version
              on current_page_version.id = wiki_pages.current_version_id
            where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
              and wiki_pages.owner_knowledge_base_id is null
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
              and not exists (
                select 1
                from fork_page_tombstones
                where fork_page_tombstones.upstream_resource_id = wiki_pages.id
              )
            union all
            select
              wiki_pages.id,
              ${knowledgeBaseId}::text as knowledge_base_id,
              wiki_pages.slug,
              wiki_pages.title,
              wiki_pages.page_type as "type",
              wiki_pages.status,
              wiki_pages.current_version_id,
              wiki_pages.markdown,
              wiki_pages.frontmatter,
              wiki_pages.source_document_ids,
              coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
              wiki_pages.metadata,
              'fork_owned'::text as visibility_origin,
              ${knowledgeBaseId}::text as owner_knowledge_base_id,
              wiki_pages.upstream_resource_id,
              wiki_pages.fork_tombstoned_at,
              wiki_pages.created_at,
              wiki_pages.updated_at
            from wiki_pages
            left join wiki_page_versions current_page_version
              on current_page_version.id = wiki_pages.current_version_id
            where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
                or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
          )
          select *
          from visible_pages
          where ${visibleCursorCondition}
          order by updated_at desc, id desc
          limit ${rowLimit}
          offset ${offset}
        `.execute(this.db),
        sql<{ total: string | number | bigint }>`
          with fork_page_tombstones as (
            select upstream_resource_id
            from wiki_pages
            where owner_knowledge_base_id = ${knowledgeBaseId}
              and fork_tombstoned_at is not null
              and upstream_resource_id is not null
          ),
          visible_pages as (
            select wiki_pages.id
            from wiki_pages
            where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
              and wiki_pages.owner_knowledge_base_id is null
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
              and not exists (
                select 1
                from fork_page_tombstones
                where fork_page_tombstones.upstream_resource_id = wiki_pages.id
              )
            union all
            select wiki_pages.id
            from wiki_pages
            where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
                or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
          )
          select count(*) as total
          from visible_pages
        `.execute(this.db),
      ]);
      const total = readSqlCount(totalResult.rows[0]?.total);
      const page = buildWikiCursorPage(itemsResult.rows, input, "updated_at");

      return {
        items: page.items.map(normalizePageRow),
        total,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    }

    const [itemsResult, totalResult] = await Promise.all([
      sql<WikiPageApiRecord>`
        select
          wiki_pages.id,
          wiki_pages.knowledge_base_id,
          wiki_pages.slug,
          wiki_pages.title,
          wiki_pages.page_type as "type",
          wiki_pages.status,
          wiki_pages.current_version_id,
          wiki_pages.markdown,
          wiki_pages.frontmatter,
          wiki_pages.source_document_ids,
          coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
          wiki_pages.metadata,
          'canonical'::text as visibility_origin,
          null::text as owner_knowledge_base_id,
          null::text as upstream_resource_id,
          null::timestamptz as fork_tombstoned_at,
          wiki_pages.created_at,
          wiki_pages.updated_at
        from wiki_pages
        left join wiki_page_versions current_page_version
          on current_page_version.id = wiki_pages.current_version_id
        where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
          and ${canonicalCursorCondition}
        order by wiki_pages.updated_at desc, wiki_pages.id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from wiki_pages
        where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
      `.execute(this.db),
    ]);
    const total = readSqlCount(totalResult.rows[0]?.total);
    const page = buildWikiCursorPage(itemsResult.rows, input, "updated_at");

    return {
      items: page.items.map(normalizePageRow),
      total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async getPage(pageId: string): Promise<WikiPageApiRecord> {
    const result = await sql<WikiPageApiRecord>`
      select
        wiki_pages.id,
        wiki_pages.knowledge_base_id,
        wiki_pages.slug,
        wiki_pages.title,
        wiki_pages.page_type as "type",
        wiki_pages.status,
        wiki_pages.current_version_id,
        wiki_pages.markdown,
        wiki_pages.frontmatter,
        wiki_pages.source_document_ids,
        coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
        wiki_pages.metadata,
        wiki_pages.created_at,
        wiki_pages.updated_at
      from wiki_pages
      left join wiki_page_versions current_page_version
        on current_page_version.id = wiki_pages.current_version_id
      where wiki_pages.id = ${pageId}
        and wiki_pages.deleted_at is null
    `.execute(this.db);
    const page = result.rows[0];

    if (page === undefined) {
      throw new ApiError("page_not_found");
    }

    await this.assertKnowledgeBaseLive(page.knowledge_base_id);

    return normalizePageRow(page);
  }

  async updatePage(pageId: string, input: UpdateWikiPageInput): Promise<Record<string, unknown>> {
    const current = await this.getPage(pageId);
    const title = input.title?.trim() || current.title;
    const markdown = input.markdown ?? current.markdown;
    const frontmatter = input.frontmatter ?? current.frontmatter;
    const pageVersionId = createResourceId("pageVersion");
    const changeSetId = createResourceId("changeSet");
    const knowledgeVersionId = createResourceId("knowledgeVersion");
    const pageVersionNumber = await this.nextPageVersionNumber(pageId);
    const knowledgeVersionNumber = await this.nextKnowledgeVersionNumber(current.knowledge_base_id);
    const baseVersionId = await this.currentKnowledgeVersionId(current.knowledge_base_id);
    const now = new Date().toISOString();

    await this.insertPageVersion({
      id: pageVersionId,
      pageId,
      knowledgeBaseId: current.knowledge_base_id,
      knowledgeVersionId,
      versionNumber: pageVersionNumber,
      title,
      markdown,
      frontmatter,
      createdBy: "api",
      now,
    });
    await this.insertKnowledgeVersion({
      id: knowledgeVersionId,
      knowledgeBaseId: current.knowledge_base_id,
      versionNumber: knowledgeVersionNumber,
      summary: input.summary ?? `Updated ${title}.`,
      changeSetId,
      createdBy: "api",
      now,
    });
    await this.createAppliedChangeSet({
      id: changeSetId,
      knowledgeBaseId: current.knowledge_base_id,
      baseVersionId,
      targetVersionId: knowledgeVersionId,
      title: input.summary ?? `Update ${title}`,
      description: "Update Wiki Page through API.",
      diff: {
        before: { title: current.title, markdown: current.markdown },
        after: { title, markdown },
      },
      now,
    });
    const visibility = await this.createWriteVisibilityMetadata(current.knowledge_base_id);

    await sql`
      update wiki_pages
      set title = ${title},
          markdown = ${markdown},
          frontmatter = ${JSON.stringify(frontmatter)}::jsonb,
          current_version_id = ${pageVersionId},
          owner_knowledge_base_id = ${visibility.ownerKnowledgeBaseId},
          visibility_origin = ${visibility.visibilityOrigin},
          upstream_resource_id = coalesce(upstream_resource_id, null),
          fork_tombstoned_at = null,
          updated_at = ${now}
      where id = ${pageId}
    `.execute(this.db);
    await this.updateKnowledgeBaseVersion(current.knowledge_base_id, knowledgeVersionId, now);
    await this.insertChangeSetItem(changeSetId, "wiki_page", pageId, "update", {
      before: { page_version_id: current.current_version_id },
      after: { page_version_id: pageVersionId },
    });
    await this.recordGraphInsightRefresh(current.knowledge_base_id, changeSetId, now);

    return {
      page: await this.getPage(pageId),
      change_set_id: changeSetId,
      knowledge_version_id: knowledgeVersionId,
      page_version_id: pageVersionId,
    };
  }

  async listRelatedPages(pageId: string): Promise<Record<string, unknown>[]> {
    await this.getPage(pageId);

    const result = await sql<Record<string, unknown>>`
      select
        wiki_edges.id as edge_id,
        wiki_edges.relation_type,
        wiki_edges.weight,
        wiki_edges.explanation,
        wiki_edges.source_document_ids,
        wiki_pages.id as page_id,
        wiki_pages.title,
        wiki_pages.page_type as type,
        wiki_pages.current_version_id
      from wiki_edges
      join wiki_pages on wiki_pages.id = wiki_edges.to_page_id
      where wiki_edges.from_page_id = ${pageId}
      order by wiki_edges.weight desc
    `.execute(this.db);

    return result.rows;
  }

  async listRelatedPagesPaginated(
    pageId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult> {
    await this.getPage(pageId);

    const offset = (input.page - 1) * input.pageSize;
    const totalResult = await sql<{ count: string | number | bigint }>`
      select count(*) as count
      from wiki_edges
      join wiki_pages on wiki_pages.id = wiki_edges.to_page_id
      where wiki_edges.from_page_id = ${pageId}
        and wiki_pages.deleted_at is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_edges.fork_tombstoned_at is null
    `.execute(this.db);
    const total = readSqlCount(totalResult.rows[0]?.count);
    const result = await sql<Record<string, unknown>>`
      select
        wiki_edges.id as edge_id,
        wiki_edges.relation_type,
        wiki_edges.weight,
        wiki_edges.explanation,
        wiki_edges.source_document_ids,
        wiki_pages.id as page_id,
        wiki_pages.title,
        wiki_pages.page_type as type,
        wiki_pages.current_version_id
      from wiki_edges
      join wiki_pages on wiki_pages.id = wiki_edges.to_page_id
      where wiki_edges.from_page_id = ${pageId}
        and wiki_pages.deleted_at is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_edges.fork_tombstoned_at is null
      order by wiki_edges.weight desc, wiki_edges.id asc
      limit ${input.pageSize}
      offset ${offset}
    `.execute(this.db);

    return {
      items: result.rows,
      total,
      hasMore: offset + result.rows.length < total,
      nextCursor: null,
    };
  }

  async listRelatedPagesByPageIds(
    pageIds: readonly string[],
  ): Promise<Map<string, Record<string, unknown>[]>> {
    const uniquePageIds = [...new Set(pageIds)].filter((pageId) => pageId.trim().length > 0);
    const relatedByPageId = new Map<string, Record<string, unknown>[]>(
      uniquePageIds.map((pageId) => [pageId, []]),
    );

    if (uniquePageIds.length === 0) {
      return relatedByPageId;
    }

    const result = await sql<Record<string, unknown> & { map_page_id: string }>`
      select
        wiki_edges.from_page_id as map_page_id,
        'outgoing'::text as direction,
        wiki_edges.id as edge_id,
        wiki_edges.relation_type,
        wiki_edges.weight,
        wiki_edges.explanation,
        wiki_edges.source_document_ids,
        wiki_pages.id as page_id,
        wiki_pages.title,
        wiki_pages.page_type as type,
        wiki_pages.current_version_id
      from wiki_edges
      join wiki_pages on wiki_pages.id = wiki_edges.to_page_id
      where wiki_edges.from_page_id in (${sql.join(uniquePageIds)})
        and wiki_pages.deleted_at is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_edges.fork_tombstoned_at is null
      union all
      select
        wiki_edges.to_page_id as map_page_id,
        'incoming'::text as direction,
        wiki_edges.id as edge_id,
        wiki_edges.relation_type,
        wiki_edges.weight,
        wiki_edges.explanation,
        wiki_edges.source_document_ids,
        wiki_pages.id as page_id,
        wiki_pages.title,
        wiki_pages.page_type as type,
        wiki_pages.current_version_id
      from wiki_edges
      join wiki_pages on wiki_pages.id = wiki_edges.from_page_id
      where wiki_edges.to_page_id in (${sql.join(uniquePageIds)})
        and wiki_pages.deleted_at is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_edges.fork_tombstoned_at is null
      order by map_page_id asc, weight desc
    `.execute(this.db);

    for (const row of result.rows) {
      const entries = relatedByPageId.get(row.map_page_id);

      if (entries === undefined) {
        continue;
      }

      const { map_page_id: _mapPageId, ...relatedPage } = row;
      void _mapPageId;
      entries.push(relatedPage);
    }

    return relatedByPageId;
  }

  async listPageVersions(pageId: string): Promise<Record<string, unknown>[]> {
    await this.getPage(pageId);

    const result = await sql<Record<string, unknown>>`
      select
        wiki_page_versions.id,
        wiki_page_versions.id as page_version_id,
        wiki_page_versions.page_id,
        wiki_page_versions.knowledge_version_id,
        wiki_page_versions.version_number,
        wiki_page_versions.title,
        wiki_page_versions.markdown,
        wiki_page_versions.frontmatter,
        wiki_page_versions.source_snapshot,
        wiki_page_versions.prompt_version,
        wiki_page_versions.created_by,
        to_char(
          wiki_page_versions.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as created_at,
        knowledge_versions.change_set_id,
        knowledge_versions.summary,
        change_sets.trigger_type as trigger,
        (wiki_pages.current_version_id = wiki_page_versions.id) as is_current
      from wiki_page_versions
      join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
      left join knowledge_versions on knowledge_versions.id = wiki_page_versions.knowledge_version_id
      left join change_sets on change_sets.id = knowledge_versions.change_set_id
      where wiki_page_versions.page_id = ${pageId}
      order by wiki_page_versions.version_number desc
    `.execute(this.db);

    return result.rows;
  }

  async listPageVersionsPaginated(
    pageId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult> {
    await this.getPage(pageId);
    const cursor = decodeWikiCursor(input.cursor, "created_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const cursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            wiki_page_versions.created_at < ${cursor.sortValue}::timestamptz
            or (wiki_page_versions.created_at = ${cursor.sortValue}::timestamptz
              and wiki_page_versions.id < ${cursor.id})
          )`;
    const [itemsResult, totalResult] = await Promise.all([
      sql<Record<string, unknown>>`
        select
          wiki_page_versions.id,
          wiki_page_versions.id as page_version_id,
          wiki_page_versions.page_id,
          wiki_page_versions.knowledge_version_id,
          wiki_page_versions.version_number,
          wiki_page_versions.title,
          wiki_page_versions.markdown,
          wiki_page_versions.frontmatter,
          wiki_page_versions.source_snapshot,
          wiki_page_versions.prompt_version,
          wiki_page_versions.created_by,
          to_char(
            wiki_page_versions.created_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) as created_at,
          knowledge_versions.change_set_id,
          knowledge_versions.summary,
          change_sets.trigger_type as trigger,
          (wiki_pages.current_version_id = wiki_page_versions.id) as is_current
        from wiki_page_versions
        join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
        left join knowledge_versions on knowledge_versions.id = wiki_page_versions.knowledge_version_id
        left join change_sets on change_sets.id = knowledge_versions.change_set_id
        where wiki_page_versions.page_id = ${pageId}
          and ${cursorCondition}
        order by wiki_page_versions.created_at desc, wiki_page_versions.id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from wiki_page_versions
        where wiki_page_versions.page_id = ${pageId}
      `.execute(this.db),
    ]);
    const total = readSqlCount(totalResult.rows[0]?.total);
    const page = buildWikiCursorPage(itemsResult.rows, input, "created_at");

    return {
      items: page.items,
      total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async listKnowledgeBasePageVersions(knowledgeBaseId: string): Promise<Record<string, unknown>[]> {
    const scope = await this.getKnowledgeBaseScope(knowledgeBaseId);

    if (scope.knowledgeBaseType === "fork" && scope.upstreamKnowledgeBaseId !== null) {
      const result = await sql<Record<string, unknown>>`
        with fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${knowledgeBaseId}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_pages as (
          select
            wiki_pages.id,
            ${knowledgeBaseId}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.current_version_id
          from wiki_pages
          where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
            and wiki_pages.owner_knowledge_base_id is null
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
            and not exists (
              select 1
              from fork_page_tombstones
              where fork_page_tombstones.upstream_resource_id = wiki_pages.id
            )
          union all
          select
            wiki_pages.id,
            ${knowledgeBaseId}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.current_version_id
          from wiki_pages
          where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
              or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        )
        select
          wiki_page_versions.id,
          wiki_page_versions.id as page_version_id,
          wiki_page_versions.page_id,
          visible_pages.title as page_title,
          visible_pages.slug as page_slug,
          wiki_page_versions.knowledge_version_id,
          wiki_page_versions.version_number,
          wiki_page_versions.title,
          wiki_page_versions.markdown,
          wiki_page_versions.frontmatter,
          wiki_page_versions.source_snapshot,
          wiki_page_versions.prompt_version,
          wiki_page_versions.created_by,
          to_char(
            wiki_page_versions.created_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) as created_at,
          knowledge_versions.change_set_id,
          knowledge_versions.summary,
          change_sets.trigger_type as trigger,
          (visible_pages.current_version_id = wiki_page_versions.id) as is_current
        from wiki_page_versions
        join visible_pages on visible_pages.id = wiki_page_versions.page_id
        left join knowledge_versions on knowledge_versions.id = wiki_page_versions.knowledge_version_id
        left join change_sets on change_sets.id = knowledge_versions.change_set_id
        order by wiki_page_versions.created_at desc, wiki_page_versions.id desc
      `.execute(this.db);

      return result.rows;
    }

    await this.assertKnowledgeBaseLive(knowledgeBaseId);

    const result = await sql<Record<string, unknown>>`
      select
        wiki_page_versions.id,
        wiki_page_versions.id as page_version_id,
        wiki_page_versions.page_id,
        wiki_pages.title as page_title,
        wiki_pages.slug as page_slug,
        wiki_page_versions.knowledge_version_id,
        wiki_page_versions.version_number,
        wiki_page_versions.title,
        wiki_page_versions.markdown,
        wiki_page_versions.frontmatter,
        wiki_page_versions.source_snapshot,
        wiki_page_versions.prompt_version,
        wiki_page_versions.created_by,
        to_char(
          wiki_page_versions.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as created_at,
        knowledge_versions.change_set_id,
        knowledge_versions.summary,
        change_sets.trigger_type as trigger,
        (wiki_pages.current_version_id = wiki_page_versions.id) as is_current
      from wiki_page_versions
      join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
      left join knowledge_versions on knowledge_versions.id = wiki_page_versions.knowledge_version_id
      left join change_sets on change_sets.id = knowledge_versions.change_set_id
      where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
        and wiki_pages.owner_knowledge_base_id is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_pages.deleted_at is null
      order by wiki_page_versions.created_at desc, wiki_page_versions.id desc
    `.execute(this.db);

    return result.rows;
  }

  async listKnowledgeBasePageVersionsPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult> {
    const scope = await this.getKnowledgeBaseScope(knowledgeBaseId);
    const cursor = decodeWikiCursor(input.cursor, "created_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const pageVersionCursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            wiki_page_versions.created_at < ${cursor.sortValue}::timestamptz
            or (wiki_page_versions.created_at = ${cursor.sortValue}::timestamptz
              and wiki_page_versions.id < ${cursor.id})
          )`;

    if (scope.knowledgeBaseType === "fork" && scope.upstreamKnowledgeBaseId !== null) {
      const [itemsResult, totalResult] = await Promise.all([
        sql<Record<string, unknown>>`
          with fork_page_tombstones as (
            select upstream_resource_id
            from wiki_pages
            where owner_knowledge_base_id = ${knowledgeBaseId}
              and fork_tombstoned_at is not null
              and upstream_resource_id is not null
          ),
          visible_pages as (
            select
              wiki_pages.id,
              ${knowledgeBaseId}::text as knowledge_base_id,
              wiki_pages.slug,
              wiki_pages.title,
              wiki_pages.current_version_id
            from wiki_pages
            where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
              and wiki_pages.owner_knowledge_base_id is null
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
              and not exists (
                select 1
                from fork_page_tombstones
                where fork_page_tombstones.upstream_resource_id = wiki_pages.id
              )
            union all
            select
              wiki_pages.id,
              ${knowledgeBaseId}::text as knowledge_base_id,
              wiki_pages.slug,
              wiki_pages.title,
              wiki_pages.current_version_id
            from wiki_pages
            where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
                or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
          )
          select
            wiki_page_versions.id,
            wiki_page_versions.id as page_version_id,
            wiki_page_versions.page_id,
            visible_pages.title as page_title,
            visible_pages.slug as page_slug,
            wiki_page_versions.knowledge_version_id,
            wiki_page_versions.version_number,
            wiki_page_versions.title,
            wiki_page_versions.markdown,
            wiki_page_versions.frontmatter,
            wiki_page_versions.source_snapshot,
            wiki_page_versions.prompt_version,
            wiki_page_versions.created_by,
            to_char(
              wiki_page_versions.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ) as created_at,
            knowledge_versions.change_set_id,
            knowledge_versions.summary,
            change_sets.trigger_type as trigger,
            (visible_pages.current_version_id = wiki_page_versions.id) as is_current
          from wiki_page_versions
          join visible_pages on visible_pages.id = wiki_page_versions.page_id
          left join knowledge_versions on knowledge_versions.id = wiki_page_versions.knowledge_version_id
          left join change_sets on change_sets.id = knowledge_versions.change_set_id
          where ${pageVersionCursorCondition}
          order by wiki_page_versions.created_at desc, wiki_page_versions.id desc
          limit ${rowLimit}
          offset ${offset}
        `.execute(this.db),
        sql<{ total: string | number | bigint }>`
          with fork_page_tombstones as (
            select upstream_resource_id
            from wiki_pages
            where owner_knowledge_base_id = ${knowledgeBaseId}
              and fork_tombstoned_at is not null
              and upstream_resource_id is not null
          ),
          visible_pages as (
            select wiki_pages.id
            from wiki_pages
            where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
              and wiki_pages.owner_knowledge_base_id is null
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
              and not exists (
                select 1
                from fork_page_tombstones
                where fork_page_tombstones.upstream_resource_id = wiki_pages.id
              )
            union all
            select wiki_pages.id
            from wiki_pages
            where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
                or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
              and wiki_pages.deleted_at is null
              and wiki_pages.fork_tombstoned_at is null
          )
          select count(*) as total
          from wiki_page_versions
          join visible_pages on visible_pages.id = wiki_page_versions.page_id
        `.execute(this.db),
      ]);
      const total = readSqlCount(totalResult.rows[0]?.total);
      const page = buildWikiCursorPage(itemsResult.rows, input, "created_at");

      return {
        items: page.items,
        total,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    }

    await this.assertKnowledgeBaseLive(knowledgeBaseId);
    const [itemsResult, totalResult] = await Promise.all([
      sql<Record<string, unknown>>`
        select
          wiki_page_versions.id,
          wiki_page_versions.id as page_version_id,
          wiki_page_versions.page_id,
          wiki_pages.title as page_title,
          wiki_pages.slug as page_slug,
          wiki_page_versions.knowledge_version_id,
          wiki_page_versions.version_number,
          wiki_page_versions.title,
          wiki_page_versions.markdown,
          wiki_page_versions.frontmatter,
          wiki_page_versions.source_snapshot,
          wiki_page_versions.prompt_version,
          wiki_page_versions.created_by,
          to_char(
            wiki_page_versions.created_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) as created_at,
          knowledge_versions.change_set_id,
          knowledge_versions.summary,
          change_sets.trigger_type as trigger,
          (wiki_pages.current_version_id = wiki_page_versions.id) as is_current
        from wiki_page_versions
        join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
        left join knowledge_versions on knowledge_versions.id = wiki_page_versions.knowledge_version_id
        left join change_sets on change_sets.id = knowledge_versions.change_set_id
        where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
          and ${pageVersionCursorCondition}
        order by wiki_page_versions.created_at desc, wiki_page_versions.id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from wiki_page_versions
        join wiki_pages on wiki_pages.id = wiki_page_versions.page_id
        where wiki_pages.knowledge_base_id = ${knowledgeBaseId}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
      `.execute(this.db),
    ]);
    const total = readSqlCount(totalResult.rows[0]?.total);
    const page = buildWikiCursorPage(itemsResult.rows, input, "created_at");

    return {
      items: page.items,
      total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async listKnowledgeVersions(knowledgeBaseId: string): Promise<Record<string, unknown>[]> {
    await this.assertKnowledgeBaseLive(knowledgeBaseId);

    const result = await sql<Record<string, unknown>>`
      select
        knowledge_versions.id,
        knowledge_versions.id as version_id,
        knowledge_versions.knowledge_base_id,
        knowledge_versions.version_number,
        knowledge_versions.status,
        knowledge_versions.summary,
        knowledge_versions.change_set_id,
        knowledge_versions.created_by,
        to_char(
          knowledge_versions.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as created_at,
        change_sets.trigger_type as trigger,
        (knowledge_bases.current_version_id = knowledge_versions.id) as is_current
      from knowledge_versions
      join knowledge_bases on knowledge_bases.id = knowledge_versions.knowledge_base_id
      left join change_sets on change_sets.id = knowledge_versions.change_set_id
      where knowledge_versions.knowledge_base_id = ${knowledgeBaseId}
      order by knowledge_versions.version_number desc
    `.execute(this.db);

    return result.rows;
  }

  async listKnowledgeVersionsPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult> {
    await this.assertKnowledgeBaseLive(knowledgeBaseId);
    const cursor = decodeWikiCursor(input.cursor, "created_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const cursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            knowledge_versions.created_at < ${cursor.sortValue}::timestamptz
            or (knowledge_versions.created_at = ${cursor.sortValue}::timestamptz
              and knowledge_versions.id < ${cursor.id})
          )`;
    const [itemsResult, totalResult] = await Promise.all([
      sql<Record<string, unknown>>`
        select
          knowledge_versions.id,
          knowledge_versions.id as version_id,
          knowledge_versions.knowledge_base_id,
          knowledge_versions.version_number,
          knowledge_versions.status,
          knowledge_versions.summary,
          knowledge_versions.change_set_id,
          knowledge_versions.created_by,
          to_char(
            knowledge_versions.created_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) as created_at,
          change_sets.trigger_type as trigger,
          (knowledge_bases.current_version_id = knowledge_versions.id) as is_current
        from knowledge_versions
        join knowledge_bases on knowledge_bases.id = knowledge_versions.knowledge_base_id
        left join change_sets on change_sets.id = knowledge_versions.change_set_id
        where knowledge_versions.knowledge_base_id = ${knowledgeBaseId}
          and ${cursorCondition}
        order by knowledge_versions.created_at desc, knowledge_versions.id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from knowledge_versions
        where knowledge_versions.knowledge_base_id = ${knowledgeBaseId}
      `.execute(this.db),
    ]);
    const total = readSqlCount(totalResult.rows[0]?.total);
    const page = buildWikiCursorPage(itemsResult.rows, input, "created_at");

    return {
      items: page.items,
      total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async listSystemPagesPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedSystemPageResult> {
    await this.assertKnowledgeBaseLive(knowledgeBaseId);
    const cursor = decodeWikiCursor(input.cursor, "updated_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const cursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            updated_at < ${cursor.sortValue}::timestamptz
            or (updated_at = ${cursor.sortValue}::timestamptz and id < ${cursor.id})
          )`;
    const [itemsResult, totalResult] = await Promise.all([
      sql<SystemPageRow>`
        select
          id,
          knowledge_base_id,
          system_key as page_type,
          title,
          markdown,
          created_at,
          updated_at
        from system_pages
        where knowledge_base_id = ${knowledgeBaseId}
          and ${cursorCondition}
        order by updated_at desc, id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from system_pages
        where knowledge_base_id = ${knowledgeBaseId}
      `.execute(this.db),
    ]);
    const total = readSqlCount(totalResult.rows[0]?.total);
    const page = buildWikiCursorPage(itemsResult.rows, input, "updated_at");

    return {
      items: page.items.map(toSystemPageRecord),
      total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async getSystemPage(knowledgeBaseId: string, pageType: string): Promise<SystemPageRecord> {
    await this.assertKnowledgeBaseLive(knowledgeBaseId);
    const result = await sql<SystemPageRow>`
      select
        id,
        knowledge_base_id,
        system_key as page_type,
        title,
        markdown,
        created_at,
        updated_at
      from system_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and system_key = ${pageType}
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      throw new ApiError("page_not_found");
    }

    return toSystemPageRecord(row);
  }

  async listChangeSetsPaginated(
    knowledgeBaseId: string,
    input: WikiPaginationInput,
  ): Promise<PaginatedWikiRecordResult> {
    await this.assertKnowledgeBaseLive(knowledgeBaseId);
    const cursor = decodeWikiCursor(input.cursor, "created_at");
    const offset = cursor === null ? (input.page - 1) * input.pageSize : 0;
    const rowLimit = input.pageSize + 1;
    const cursorCondition =
      cursor === null
        ? sql`true`
        : sql`(
            created_at < ${cursor.sortValue}::timestamptz
            or (created_at = ${cursor.sortValue}::timestamptz and id < ${cursor.id})
          )`;
    const [itemsResult, totalResult] = await Promise.all([
      sql<Record<string, unknown>>`
        select
          id,
          knowledge_base_id,
          base_version_id,
          target_version_id,
          status,
          trigger_type,
          title,
          description,
          metadata,
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
          to_char(applied_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as applied_at,
          to_char(discarded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as discarded_at
        from change_sets
        where knowledge_base_id = ${knowledgeBaseId}
          and ${cursorCondition}
        order by created_at desc, id desc
        limit ${rowLimit}
        offset ${offset}
      `.execute(this.db),
      sql<{ total: string | number | bigint }>`
        select count(*) as total
        from change_sets
        where knowledge_base_id = ${knowledgeBaseId}
      `.execute(this.db),
    ]);
    const total = readSqlCount(totalResult.rows[0]?.total);
    const page = buildWikiCursorPage(itemsResult.rows, input, "created_at");

    return {
      items: page.items.map((row) => ({
        ...row,
        metadata: normalizeJsonObject(row.metadata),
      })),
      total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }

  async getChangeSet(changeSetId: string): Promise<Record<string, unknown>> {
    const changeSet = await this.requireChangeSet(changeSetId);

    await this.assertKnowledgeBaseLive(changeSet.knowledge_base_id);

    return {
      ...changeSet,
      items: await this.listChangeSetItems(changeSetId),
    };
  }

  async applyChangeSet(changeSetId: string): Promise<Record<string, unknown>> {
    const changeSet = await this.requireChangeSet(changeSetId);
    const now = new Date().toISOString();

    await this.assertKnowledgeBaseLive(changeSet.knowledge_base_id);

    if (changeSet.status === "applied") {
      return this.getChangeSet(changeSetId);
    }

    if (readWikiDraftChangeContent(changeSet.diff) !== null) {
      await this.applyWikiDraftChangeSet(changeSet, now);
      await this.recordGraphInsightRefresh(changeSet.knowledge_base_id, changeSet.id, now);
      return this.getChangeSet(changeSetId);
    }

    await sql`
      update change_sets
      set status = 'applied', applied_at = coalesce(applied_at, ${now})
      where id = ${changeSetId}
    `.execute(this.db);
    await this.recordGraphInsightRefresh(changeSet.knowledge_base_id, changeSet.id, now);

    return this.getChangeSet(changeSetId);
  }

  async getGraphInsightStatus(knowledgeBaseId: string): Promise<GraphInsightStatus> {
    const result = await sql<{
      error: Record<string, unknown> | null;
      finished_at: string | null;
      id: string;
      current_version_id: string | null;
      metadata: Record<string, unknown> | null;
      progress_message: string | null;
      queued_at: string;
      result: Record<string, unknown> | null;
      started_at: string | null;
      status: string;
      updated_at: string;
    }>`
      select
        jobs.id,
        jobs.status,
        jobs.progress_message,
        jobs.error,
        jobs.result,
        jobs.metadata,
        jobs.queued_at,
        jobs.started_at,
        jobs.finished_at,
        jobs.updated_at,
        knowledge_bases.current_version_id
      from jobs
      join knowledge_bases on knowledge_bases.id = jobs.knowledge_base_id
      where jobs.knowledge_base_id = ${knowledgeBaseId}
        and jobs.job_type = 'graph.insights.refresh'
      order by jobs.queued_at desc
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      return createDefaultGraphInsightStatus();
    }

    const state = toGraphInsightStatusState(row.status, {
      currentKnowledgeVersionId: row.current_version_id,
      metadata: row.metadata,
      result: row.result,
    });

    return {
      failure_reason:
        state === "failed" ? readFailureReason(row.error, row.progress_message) : null,
      source_job_id: row.id,
      started_at: row.started_at,
      state,
      updated_at: row.finished_at ?? row.updated_at ?? row.queued_at,
    };
  }

  async getGraphInsightsSnapshot(knowledgeBaseId: string): Promise<GraphInsightsResponse | null> {
    const result = await sql<{ result: Record<string, unknown> | null }>`
      select result
      from jobs
      where knowledge_base_id = ${knowledgeBaseId}
        and job_type = 'graph.insights.refresh'
        and status = 'completed'
        and result ? 'graph_insights'
      order by finished_at desc nulls last, updated_at desc, id desc
      limit 1
    `.execute(this.db);
    const graphInsights = normalizeJsonObject(result.rows[0]?.result?.graph_insights);

    if (graphInsights.knowledge_base_id !== knowledgeBaseId) {
      return null;
    }

    return graphInsights as unknown as GraphInsightsResponse;
  }

  async discardChangeSet(changeSetId: string): Promise<Record<string, unknown>> {
    const now = new Date().toISOString();
    const changeSet = await this.requireChangeSet(changeSetId);

    await this.assertKnowledgeBaseLive(changeSet.knowledge_base_id);

    await sql`
      update change_sets
      set status = 'discarded', discarded_at = coalesce(discarded_at, ${now})
      where id = ${changeSetId}
    `.execute(this.db);

    return this.getChangeSet(changeSetId);
  }

  async rollbackKnowledgeBase(
    knowledgeBaseId: string,
    input: RollbackKnowledgeBaseInput,
  ): Promise<Record<string, unknown>> {
    await this.assertKnowledgeBaseLive(knowledgeBaseId);

    const targetVersionId = readRequired(input.target_version_id, "target_version_id");
    const target = await this.requireKnowledgeVersion(targetVersionId);
    const currentVersionId = await this.currentKnowledgeVersionId(knowledgeBaseId);
    const changeSetId = createResourceId("changeSet");
    const rollbackId = `rb_${cryptoSafeId()}`;
    const knowledgeVersionId = createResourceId("knowledgeVersion");
    const versionNumber = await this.nextKnowledgeVersionNumber(knowledgeBaseId);
    const now = new Date().toISOString();

    if (target.knowledge_base_id !== knowledgeBaseId) {
      throw new ApiError("version_not_found");
    }

    await this.insertKnowledgeVersion({
      id: knowledgeVersionId,
      knowledgeBaseId,
      versionNumber,
      summary: input.reason ?? "Knowledge Base rollback.",
      changeSetId,
      createdBy: "api",
      now,
    });
    await this.createAppliedChangeSet({
      id: changeSetId,
      knowledgeBaseId,
      baseVersionId: currentVersionId,
      targetVersionId: knowledgeVersionId,
      title: "Roll back Knowledge Base",
      description: input.reason ?? "Rollback requested through API.",
      diff: { target_version_id: targetVersionId },
      now,
    });
    const visibility = await this.createWriteVisibilityMetadata(knowledgeBaseId);

    await sql`
      insert into rollback_records (
        id,
        knowledge_base_id,
        source_version_id,
        target_version_id,
        change_set_id,
        rollback_type,
        reason,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${rollbackId},
        ${knowledgeBaseId},
        ${currentVersionId},
        ${targetVersionId},
        ${changeSetId},
        'knowledge_base',
        ${input.reason ?? null},
        ${JSON.stringify({ created_knowledge_version_id: knowledgeVersionId })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now}
      )
    `.execute(this.db);
    await this.updateKnowledgeBaseVersion(knowledgeBaseId, knowledgeVersionId, now);
    await this.recordGraphInsightRefresh(knowledgeBaseId, changeSetId, now);

    return {
      rollback_id: rollbackId,
      change_set_id: changeSetId,
      knowledge_version_id: knowledgeVersionId,
      source_knowledge_version_id: currentVersionId,
      target_knowledge_version_id: targetVersionId,
    };
  }

  async rollbackPage(pageId: string, input: RollbackPageInput): Promise<Record<string, unknown>> {
    const targetPageVersionId = readRequired(
      input.target_page_version_id,
      "target_page_version_id",
    );
    const current = await this.getPage(pageId);
    const target = await this.requirePageVersion(targetPageVersionId);
    const changeSetId = createResourceId("changeSet");
    const rollbackId = `rb_${cryptoSafeId()}`;
    const pageVersionId = createResourceId("pageVersion");
    const knowledgeVersionId = createResourceId("knowledgeVersion");
    const pageVersionNumber = await this.nextPageVersionNumber(pageId);
    const knowledgeVersionNumber = await this.nextKnowledgeVersionNumber(current.knowledge_base_id);
    const baseVersionId = await this.currentKnowledgeVersionId(current.knowledge_base_id);
    const now = new Date().toISOString();

    if (target.page_id !== pageId) {
      throw new ApiError("version_not_found");
    }

    await this.insertPageVersion({
      id: pageVersionId,
      pageId,
      knowledgeBaseId: current.knowledge_base_id,
      knowledgeVersionId,
      versionNumber: pageVersionNumber,
      title: String(target.title),
      markdown: String(target.markdown),
      frontmatter: normalizeJsonObject(target.frontmatter),
      createdBy: "api",
      now,
    });
    await this.insertKnowledgeVersion({
      id: knowledgeVersionId,
      knowledgeBaseId: current.knowledge_base_id,
      versionNumber: knowledgeVersionNumber,
      summary: input.reason ?? `Rolled back ${target.title}.`,
      changeSetId,
      createdBy: "api",
      now,
    });
    await this.createAppliedChangeSet({
      id: changeSetId,
      knowledgeBaseId: current.knowledge_base_id,
      baseVersionId,
      targetVersionId: knowledgeVersionId,
      title: `Roll back ${target.title}`,
      description: input.reason ?? "Page rollback requested through API.",
      diff: { target_page_version_id: targetPageVersionId },
      now,
    });
    const visibility = await this.createWriteVisibilityMetadata(current.knowledge_base_id);

    await sql`
      update wiki_pages
      set title = ${String(target.title)},
          markdown = ${String(target.markdown)},
          frontmatter = ${JSON.stringify(normalizeJsonObject(target.frontmatter))}::jsonb,
          current_version_id = ${pageVersionId},
          owner_knowledge_base_id = ${visibility.ownerKnowledgeBaseId},
          visibility_origin = ${visibility.visibilityOrigin},
          upstream_resource_id = coalesce(upstream_resource_id, null),
          fork_tombstoned_at = null,
          updated_at = ${now}
      where id = ${pageId}
    `.execute(this.db);
    await sql`
      insert into rollback_records (
        id,
        knowledge_base_id,
        source_version_id,
        target_version_id,
        change_set_id,
        rollback_type,
        reason,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${rollbackId},
        ${current.knowledge_base_id},
        ${baseVersionId},
        ${knowledgeVersionId},
        ${changeSetId},
        'page',
        ${input.reason ?? null},
        ${JSON.stringify({
          page_id: pageId,
          source_page_version_id: current.current_version_id,
          target_page_version_id: targetPageVersionId,
          created_page_version_id: pageVersionId,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now}
      )
    `.execute(this.db);
    await this.updateKnowledgeBaseVersion(current.knowledge_base_id, knowledgeVersionId, now);
    await this.recordGraphInsightRefresh(current.knowledge_base_id, changeSetId, now);

    return {
      rollback_id: rollbackId,
      change_set_id: changeSetId,
      knowledge_version_id: knowledgeVersionId,
      page_version_id: pageVersionId,
      source_page_version_id: current.current_version_id,
      target_page_version_id: targetPageVersionId,
    };
  }

  async listForkSyncPageConflicts(
    input: ForkSyncPageConflictInput,
  ): Promise<ForkSyncPageConflictRecord[]> {
    const result = await sql<{
      fork_page_id: string;
      slug: string;
      title: string;
      upstream_page_id: string;
    }>`
      with scoped_kbs as (
        select
          fork.id as fork_id,
          upstream.id as upstream_id,
          fork.tenant_id,
          fork.project_id
        from knowledge_bases fork
        inner join knowledge_bases upstream
          on upstream.id = ${input.upstreamKnowledgeBaseId}
          and upstream.tenant_id = fork.tenant_id
          and upstream.project_id = fork.project_id
        where fork.id = ${input.forkKnowledgeBaseId}
          and fork.upstream_knowledge_base_id = upstream.id
          and fork.knowledge_base_type = 'fork'
          and upstream.knowledge_base_type = 'canonical'
          and fork.deleted_at is null
          and upstream.deleted_at is null
          and fork.status <> 'deleted'
          and upstream.status <> 'deleted'
        limit 1
      ),
      fork_pages as (
        select wiki_pages.id, wiki_pages.slug, wiki_pages.title
        from wiki_pages
        inner join scoped_kbs on true
        where (wiki_pages.knowledge_base_id = scoped_kbs.fork_id
            or wiki_pages.owner_knowledge_base_id = scoped_kbs.fork_id)
          and wiki_pages.deleted_at is null
          and wiki_pages.fork_tombstoned_at is null
      ),
      upstream_pages as (
        select wiki_pages.id, wiki_pages.slug
        from wiki_pages
        inner join scoped_kbs on true
        where wiki_pages.knowledge_base_id = scoped_kbs.upstream_id
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.deleted_at is null
          and wiki_pages.fork_tombstoned_at is null
      )
      select
        upstream_pages.id as upstream_page_id,
        fork_pages.id as fork_page_id,
        fork_pages.slug,
        fork_pages.title
      from fork_pages
      inner join upstream_pages on upstream_pages.slug = fork_pages.slug
      order by fork_pages.slug asc, fork_pages.id asc
    `.execute(this.db);

    return result.rows.map((row) => ({
      type: "fork_page_conflict",
      upstream_page_id: row.upstream_page_id,
      fork_page_id: row.fork_page_id,
      slug: row.slug,
      title: row.title,
    }));
  }

  async syncForkFromUpstream(
    input: SyncForkFromUpstreamInput,
  ): Promise<SyncForkFromUpstreamResult> {
    const changeSetId = createResourceId("changeSet");
    const knowledgeVersionId = createResourceId("knowledgeVersion");
    const knowledgeVersionNumber = await this.nextKnowledgeVersionNumber(input.forkId);
    const now = new Date().toISOString();
    const visibility = await this.createWriteVisibilityMetadata(input.forkId);
    const diff = {
      source_upstream_version_id: input.sourceUpstreamVersionId,
      target_upstream_version_id: input.targetUpstreamVersionId,
      conflicts: [...input.conflicts],
    };

    await this.insertKnowledgeVersion({
      id: knowledgeVersionId,
      knowledgeBaseId: input.forkId,
      versionNumber: knowledgeVersionNumber,
      summary: "Synced fork from upstream.",
      changeSetId,
      createdBy: "api",
      now,
    });

    await sql`
      insert into change_sets (
        id,
        knowledge_base_id,
        base_version_id,
        target_version_id,
        status,
        trigger_type,
        title,
        description,
        diff,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        applied_at
      )
      values (
        ${changeSetId},
        ${input.forkId},
        ${input.baseForkVersionId},
        ${knowledgeVersionId},
        'applied',
        'upstream_sync',
        'Sync fork from upstream',
        'Applied upstream Knowledge Base changes into the fork view.',
        ${JSON.stringify(diff)}::jsonb,
        ${JSON.stringify({
          upstream_knowledge_base_id: input.upstreamKnowledgeBaseId,
          source_upstream_version_id: input.sourceUpstreamVersionId,
          target_upstream_version_id: input.targetUpstreamVersionId,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now},
        ${now}
      )
    `.execute(this.db);

    for (const [index, conflict] of input.conflicts.entries()) {
      const objectId =
        typeof conflict.fork_page_id === "string" ? conflict.fork_page_id : `${input.forkId}:sync`;

      await sql`
        insert into change_set_items (
          id,
          change_set_id,
          object_type,
          object_id,
          operation,
          diff,
          owner_knowledge_base_id,
          visibility_origin,
          upstream_resource_id,
          fork_tombstoned_at
        )
        values (
          ${`${changeSetId}:conflict:${index}`},
          ${changeSetId},
          'wiki_page',
          ${objectId},
          'conflict_detected',
          ${JSON.stringify(conflict)}::jsonb,
          ${visibility.ownerKnowledgeBaseId},
          ${visibility.visibilityOrigin},
          null,
          null
        )
        on conflict (id) do nothing
      `.execute(this.db);
    }

    await this.recordGraphInsightRefresh(input.forkId, changeSetId, now);

    return {
      changeSetId,
      knowledgeVersionId,
    };
  }

  async rebuildRetrievalIndex(
    knowledgeBaseId: string,
    provider: RetrievalEmbeddingProvider,
  ): Promise<RetrievalIndexStats> {
    await this.deleteEmbeddingsForKnowledgeBase(knowledgeBaseId);

    let cursor: string | null = null;
    let indexedEmbeddingCount = 0;
    let indexedPageCount = 0;

    do {
      const page = await this.listPagesPaginated(knowledgeBaseId, {
        page: 1,
        pageSize: retrievalReindexPageSize,
        ...(cursor === null ? {} : { cursor }),
      });
      const embeddings = await this.createEmbeddingBatch(page.items, provider);

      await this.insertEmbeddingBatch(embeddings);
      indexedEmbeddingCount += embeddings.length;
      indexedPageCount += page.items.length;
      cursor = page.nextCursor ?? null;
    } while (cursor !== null);

    return {
      indexedEdgeCount: await this.countVisibleEdges(knowledgeBaseId),
      indexedEmbeddingCount,
      indexedPageCount,
    };
  }

  private async createEmbeddingBatch(
    pages: readonly WikiPageApiRecord[],
    provider: RetrievalEmbeddingProvider,
  ): Promise<RetrievalEmbeddingRecord[]> {
    const records: RetrievalEmbeddingRecord[] = [];

    for (const page of pages) {
      const retrievalPage = this.toRetrievalPageRecord(page);
      const units = createEmbeddingUnits(retrievalPage);
      const embeddingResult = await provider.embed({
        texts: units.map((unit) => unit.text),
      });

      units.forEach((unit, index) => {
        const vector = embeddingResult.vectors[index] ?? [];

        records.push({
          id: `emb:${unit.objectType}:${unit.objectId}`,
          knowledge_base_id: retrievalPage.knowledge_base_id,
          page_id: retrievalPage.page_id,
          page_version_id: retrievalPage.page_version_id,
          object_type: unit.objectType,
          object_id: unit.objectId,
          text: unit.text,
          model: provider.model,
          dimensions: provider.dimensions,
          vector,
          metadata: {
            title: retrievalPage.title,
            type: retrievalPage.type,
            ...(retrievalPage.system_page_key === null
              ? {}
              : { system_page_key: retrievalPage.system_page_key }),
          },
          owner_knowledge_base_id: retrievalPage.owner_knowledge_base_id ?? null,
          visibility_origin: retrievalPage.visibility_origin ?? "canonical",
          upstream_resource_id: retrievalPage.upstream_resource_id ?? null,
          fork_tombstoned_at: retrievalPage.fork_tombstoned_at ?? null,
        });
      });
    }

    return records;
  }

  private toRetrievalPageRecord(page: WikiPageApiRecord): RetrievalPageRecord {
    return {
      knowledge_base_id: page.knowledge_base_id,
      page_id: page.id,
      page_version_id: page.current_version_id ?? page.id,
      title: page.title,
      type: page.type,
      markdown: page.markdown,
      frontmatter: page.frontmatter,
      is_system_page: false,
      system_page_key: null,
      source_refs: normalizePageSourceRefs(page),
      metadata: page.metadata,
      visibility_origin: readVisibilityOrigin(page.visibility_origin),
      owner_knowledge_base_id: page.owner_knowledge_base_id ?? null,
      upstream_resource_id: page.upstream_resource_id ?? null,
      fork_tombstoned_at: page.fork_tombstoned_at ?? null,
    };
  }

  async saveRetrievalTrace(trace: RetrievalTraceRecord): Promise<void> {
    await this.assertKnowledgeBaseLive(trace.knowledge_base_id);
    const scope = await requireKnowledgeBaseTenantProject(this.db, trace.knowledge_base_id);

    await sql`
      insert into retrieval_traces (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        query,
        request,
        results,
        graph_expansions,
        context_pack,
        warnings,
        metadata,
        created_at
      )
      values (
        ${trace.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${trace.knowledge_base_id},
        ${trace.query},
        ${JSON.stringify(trace.request)}::jsonb,
        ${JSON.stringify(trace.results)}::jsonb,
        ${JSON.stringify(trace.graph_expansions)}::jsonb,
        ${JSON.stringify(trace.context_pack ?? {})}::jsonb,
        ${JSON.stringify(trace.warnings)}::jsonb,
        ${JSON.stringify({ stages: trace.stages })}::jsonb,
        ${trace.created_at}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        request = excluded.request,
        results = excluded.results,
        graph_expansions = excluded.graph_expansions,
        context_pack = excluded.context_pack,
        warnings = excluded.warnings,
        metadata = excluded.metadata
    `.execute(this.db);
  }

  private async deleteEmbeddingsForKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    await sql`
      delete from page_embeddings
      where knowledge_base_id = ${knowledgeBaseId}
    `.execute(this.db);
  }

  private async insertEmbeddingBatch(
    embeddings: readonly RetrievalEmbeddingRecord[],
  ): Promise<void> {
    await writeIdempotentBatches({
      batchSize: retrievalEmbeddingWriteBatchSize,
      getIdempotencyKey: (embedding) => embedding.id,
      items: embeddings,
      writeBatch: async (batch) => {
        for (const embedding of batch) {
          const metadata = {
            ...embedding.metadata,
            text: embedding.text,
          };

          await sql`
            insert into page_embeddings (
              id,
              knowledge_base_id,
              page_id,
              page_version_id,
              object_type,
              object_id,
              model,
              dimensions,
              embedding,
              metadata,
              owner_knowledge_base_id,
              visibility_origin,
              upstream_resource_id,
              fork_tombstoned_at
            )
            values (
              ${embedding.id},
              ${embedding.knowledge_base_id},
              ${embedding.page_id},
              ${embedding.page_version_id},
              ${embedding.object_type},
              ${embedding.object_id},
              ${embedding.model},
              ${embedding.dimensions},
              ${formatPgVector(embedding.vector)}::vector,
              ${JSON.stringify(metadata)}::jsonb,
              ${embedding.owner_knowledge_base_id ?? null},
              ${embedding.visibility_origin ?? "canonical"},
              ${embedding.upstream_resource_id ?? null},
              ${embedding.fork_tombstoned_at ?? null}
            )
            on conflict (id) do update set
              knowledge_base_id = excluded.knowledge_base_id,
              page_id = excluded.page_id,
              page_version_id = excluded.page_version_id,
              object_type = excluded.object_type,
              object_id = excluded.object_id,
              model = excluded.model,
              dimensions = excluded.dimensions,
              embedding = excluded.embedding,
              metadata = excluded.metadata,
              owner_knowledge_base_id = excluded.owner_knowledge_base_id,
              visibility_origin = excluded.visibility_origin,
              upstream_resource_id = excluded.upstream_resource_id,
              fork_tombstoned_at = excluded.fork_tombstoned_at
          `.execute(this.db);
        }

        return { written: batch.length };
      },
    });
  }

  private async countVisibleEdges(knowledgeBaseId: string): Promise<number> {
    const scope = await this.getKnowledgeBaseScope(knowledgeBaseId);

    if (scope.knowledgeBaseType === "fork" && scope.upstreamKnowledgeBaseId !== null) {
      const result = await sql<{ total: string | number | bigint }>`
        with fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${knowledgeBaseId}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_pages as (
          select wiki_pages.id
          from wiki_pages
          where wiki_pages.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
            and wiki_pages.owner_knowledge_base_id is null
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
            and not exists (
              select 1
              from fork_page_tombstones
              where fork_page_tombstones.upstream_resource_id = wiki_pages.id
            )
          union
          select wiki_pages.id
          from wiki_pages
          where (wiki_pages.knowledge_base_id = ${knowledgeBaseId}
              or wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        ),
        fork_edge_tombstones as (
          select upstream_resource_id
          from wiki_edges
          where owner_knowledge_base_id = ${knowledgeBaseId}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_edges as (
          select wiki_edges.id
          from wiki_edges
          where wiki_edges.knowledge_base_id = ${scope.upstreamKnowledgeBaseId}
            and wiki_edges.owner_knowledge_base_id is null
            and wiki_edges.fork_tombstoned_at is null
            and exists (select 1 from visible_pages where visible_pages.id = wiki_edges.from_page_id)
            and exists (select 1 from visible_pages where visible_pages.id = wiki_edges.to_page_id)
            and not exists (
              select 1
              from fork_edge_tombstones
              where fork_edge_tombstones.upstream_resource_id = wiki_edges.id
            )
          union
          select wiki_edges.id
          from wiki_edges
          where (wiki_edges.knowledge_base_id = ${knowledgeBaseId}
              or wiki_edges.owner_knowledge_base_id = ${knowledgeBaseId})
            and wiki_edges.fork_tombstoned_at is null
            and exists (select 1 from visible_pages where visible_pages.id = wiki_edges.from_page_id)
            and exists (select 1 from visible_pages where visible_pages.id = wiki_edges.to_page_id)
        )
        select count(*) as total
        from visible_edges
      `.execute(this.db);

      return readSqlCount(result.rows[0]?.total);
    }

    const result = await sql<{ total: string | number | bigint }>`
      select count(*) as total
      from wiki_edges
      where knowledge_base_id = ${knowledgeBaseId}
        and owner_knowledge_base_id is null
        and fork_tombstoned_at is null
    `.execute(this.db);

    return readSqlCount(result.rows[0]?.total);
  }

  private async requireChangeSet(changeSetId: string): Promise<ChangeSetRow> {
    const changeSetResult = await sql<ChangeSetRow>`
      select
        id,
        knowledge_base_id,
        base_version_id,
        target_version_id,
        status,
        trigger_type,
        title,
        description,
        diff,
        metadata,
        created_at,
        applied_at,
        discarded_at
      from change_sets
      where id = ${changeSetId}
    `.execute(this.db);
    const changeSet = changeSetResult.rows[0];

    if (changeSet === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.change_set_not_found",
      });
    }

    return {
      ...changeSet,
      diff: normalizeJsonObject(changeSet.diff),
      metadata: normalizeJsonObject(changeSet.metadata),
    };
  }

  private async getKnowledgeBaseScope(knowledgeBaseId: string): Promise<KnowledgeBaseScopeContext> {
    const result = await sql<{
      cleanup_operation_id: string | null;
      cleanup_status: string | null;
      deleted_at: Date | string | null;
      knowledge_base_type: string;
      status: string;
      upstream_knowledge_base_id: string | null;
      upstream_synced_version_id: string | null;
    }>`
      select
        knowledge_bases.status,
        knowledge_bases.deleted_at,
        knowledge_bases.knowledge_base_type,
        knowledge_bases.upstream_knowledge_base_id,
        knowledge_bases.upstream_synced_version_id,
        latest_cleanup.id as cleanup_operation_id,
        latest_cleanup.status as cleanup_status
      from knowledge_bases
      left join lateral (
        select id, status
        from deletion_cleanup_operations
        where target_type = 'knowledge_base'
          and target_id = ${knowledgeBaseId}
        order by created_at desc
        limit 1
      ) latest_cleanup on true
      where knowledge_bases.id = ${knowledgeBaseId}
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      throw new ApiError("knowledge_base_not_found");
    }
    if (row.status === "deleted" || row.deleted_at !== null) {
      throw new ApiError("resource_deleted", {
        messageKey: "api.validation.knowledge_base_deleted",
        details: {
          target_type: "knowledge_base",
          target_id: knowledgeBaseId,
          cleanup_operation_id: row.cleanup_operation_id,
          cleanup_status: row.cleanup_status,
          guidance: "reload_resource_list",
        },
      });
    }

    return {
      knowledgeBaseType: row.knowledge_base_type === "fork" ? "fork" : "canonical",
      upstreamKnowledgeBaseId: row.upstream_knowledge_base_id,
      upstreamSyncedVersionId: row.upstream_synced_version_id,
    };
  }

  private async createWriteVisibilityMetadata(knowledgeBaseId: string): Promise<{
    ownerKnowledgeBaseId: string | null;
    visibilityOrigin: RetrievalVisibilityOrigin;
  }> {
    const scope = await this.getKnowledgeBaseScope(knowledgeBaseId);

    if (scope.knowledgeBaseType === "fork") {
      return {
        ownerKnowledgeBaseId: knowledgeBaseId,
        visibilityOrigin: "fork_owned",
      };
    }

    return {
      ownerKnowledgeBaseId: null,
      visibilityOrigin: "canonical",
    };
  }

  private async createChangeSetWriteVisibilityMetadata(changeSetId: string): Promise<{
    ownerKnowledgeBaseId: string | null;
    visibilityOrigin: RetrievalVisibilityOrigin;
  }> {
    const result = await sql<{ knowledge_base_id: string }>`
      select knowledge_base_id
      from change_sets
      where id = ${changeSetId}
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      return {
        ownerKnowledgeBaseId: null,
        visibilityOrigin: "canonical",
      };
    }

    return this.createWriteVisibilityMetadata(row.knowledge_base_id);
  }

  private async assertKnowledgeBaseLive(knowledgeBaseId: string): Promise<void> {
    await this.getKnowledgeBaseScope(knowledgeBaseId);
  }

  private async applyWikiDraftChangeSet(changeSet: ChangeSetRow, now: string): Promise<void> {
    const draft = readWikiDraftChangeContent(changeSet.diff);

    if (draft === null) {
      return;
    }

    const sourceDocumentId = await this.findChangeSetSourceDocumentId(
      changeSet.knowledge_base_id,
      changeSet.id,
    );
    const sourceDocumentIds = sourceDocumentId === null ? [] : [sourceDocumentId];
    const slug = createDraftPageSlug(sourceDocumentId ?? changeSet.id);
    const pageId = await this.resolveDraftPageId(changeSet.knowledge_base_id, slug);
    const pageVersionId = createResourceId("pageVersion");
    const knowledgeVersionId = createResourceId("knowledgeVersion");
    const pageVersionNumber = await this.nextPageVersionNumber(pageId);
    const knowledgeVersionNumber = await this.nextKnowledgeVersionNumber(
      changeSet.knowledge_base_id,
    );
    const frontmatter = {
      type: "page",
      tags: draft.tags,
      source: "wiki_draft",
    };
    const visibility = await this.createWriteVisibilityMetadata(changeSet.knowledge_base_id);

    await sql`
      insert into wiki_pages (
        id,
        knowledge_base_id,
        slug,
        title,
        page_type,
        status,
        current_version_id,
        markdown,
        frontmatter,
        source_document_ids,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        updated_at
      )
      values (
        ${pageId},
        ${changeSet.knowledge_base_id},
        ${slug},
        ${draft.title},
        'page',
        'ready',
        ${pageVersionId},
        ${draft.markdown},
        ${JSON.stringify(frontmatter)}::jsonb,
        ${toPostgresTextArray(sourceDocumentIds)},
        ${JSON.stringify({
          change_set_id: changeSet.id,
          source: "wiki_draft",
          ...draft.metadata,
        })}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${now},
        ${now}
      )
      on conflict (knowledge_base_id, slug) do update set
        title = excluded.title,
        status = excluded.status,
        current_version_id = excluded.current_version_id,
        markdown = excluded.markdown,
        frontmatter = excluded.frontmatter,
        source_document_ids = excluded.source_document_ids,
        metadata = excluded.metadata,
        owner_knowledge_base_id = excluded.owner_knowledge_base_id,
        visibility_origin = excluded.visibility_origin,
        upstream_resource_id = excluded.upstream_resource_id,
        fork_tombstoned_at = excluded.fork_tombstoned_at,
        updated_at = excluded.updated_at
    `.execute(this.db);

    await this.insertPageVersion({
      id: pageVersionId,
      pageId,
      knowledgeBaseId: changeSet.knowledge_base_id,
      knowledgeVersionId,
      versionNumber: pageVersionNumber,
      title: draft.title,
      markdown: draft.markdown,
      frontmatter,
      sourceSnapshot: [
        ...draft.sources,
        ...(sourceDocumentId === null
          ? []
          : [
              {
                document_id: sourceDocumentId,
              },
            ]),
      ],
      createdBy: "wiki_draft",
      now,
    });
    await this.insertKnowledgeVersion({
      id: knowledgeVersionId,
      knowledgeBaseId: changeSet.knowledge_base_id,
      versionNumber: knowledgeVersionNumber,
      summary: `Applied ${draft.title}.`,
      changeSetId: changeSet.id,
      createdBy: "wiki_draft",
      now,
    });
    await sql`
      update change_sets
      set status = 'applied',
          target_version_id = ${knowledgeVersionId},
          applied_at = coalesce(applied_at, ${now})
      where id = ${changeSet.id}
    `.execute(this.db);
    await this.insertChangeSetItem(changeSet.id, "wiki_page", pageId, "create", {
      after: {
        page_id: pageId,
        page_version_id: pageVersionId,
        title: draft.title,
      },
    });
    await this.updateKnowledgeBaseVersion(changeSet.knowledge_base_id, knowledgeVersionId, now);
  }

  private async findChangeSetSourceDocumentId(
    knowledgeBaseId: string,
    changeSetId: string,
  ): Promise<string | null> {
    const result = await sql<{ id: string }>`
      select id
      from source_documents
      where knowledge_base_id = ${knowledgeBaseId}
        and metadata ->> 'change_set_id' = ${changeSetId}
      order by created_at asc
      limit 1
    `.execute(this.db);

    return result.rows[0]?.id ?? null;
  }

  private async resolveDraftPageId(knowledgeBaseId: string, slug: string): Promise<string> {
    const result = await sql<{ id: string }>`
      select id
      from wiki_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and slug = ${slug}
    `.execute(this.db);

    return result.rows[0]?.id ?? createResourceId("wikiPage");
  }

  private async listChangeSetItems(changeSetId: string): Promise<Record<string, unknown>[]> {
    const result = await sql<Record<string, unknown>>`
      select
        id,
        change_set_id,
        object_type,
        object_id,
        operation,
        before_data,
        after_data,
        diff,
        created_at
      from change_set_items
      where change_set_id = ${changeSetId}
      order by created_at asc
    `.execute(this.db);

    return result.rows;
  }

  private async currentKnowledgeVersionId(knowledgeBaseId: string): Promise<string | null> {
    const result = await sql<{ currentVersionId: string | null }>`
      select current_version_id as "currentVersionId"
      from knowledge_bases
      where id = ${knowledgeBaseId}
    `.execute(this.db);

    return result.rows[0]?.currentVersionId ?? null;
  }

  private async nextPageVersionNumber(pageId: string): Promise<number> {
    const result = await sql<{ nextVersion: number }>`
      select coalesce(max(version_number), 0) + 1 as "nextVersion"
      from wiki_page_versions
      where page_id = ${pageId}
    `.execute(this.db);

    return Number(result.rows[0]?.nextVersion ?? 1);
  }

  private async nextKnowledgeVersionNumber(knowledgeBaseId: string): Promise<number> {
    const result = await sql<{ nextVersion: number }>`
      select coalesce(max(version_number), 0) + 1 as "nextVersion"
      from knowledge_versions
      where knowledge_base_id = ${knowledgeBaseId}
    `.execute(this.db);

    return Number(result.rows[0]?.nextVersion ?? 1);
  }

  private async createAppliedChangeSet(input: {
    id: string;
    knowledgeBaseId: string;
    baseVersionId: string | null;
    targetVersionId: string;
    title: string;
    description: string;
    diff: Record<string, unknown>;
    now: string;
  }): Promise<void> {
    const visibility = await this.createWriteVisibilityMetadata(input.knowledgeBaseId);

    await sql`
      insert into change_sets (
        id,
        knowledge_base_id,
        base_version_id,
        target_version_id,
        status,
        trigger_type,
        title,
        description,
        diff,
        metadata,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at,
        applied_at
      )
      values (
        ${input.id},
        ${input.knowledgeBaseId},
        ${input.baseVersionId},
        ${input.targetVersionId},
        'applied',
        'manual_edit',
        ${input.title},
        ${input.description},
        ${JSON.stringify(input.diff)}::jsonb,
        '{}'::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${input.now},
        ${input.now}
      )
    `.execute(this.db);
  }

  private async recordGraphInsightRefresh(
    knowledgeBaseId: string,
    changeSetId: string,
    now: string,
  ): Promise<void> {
    const jobId = createResourceId("ingestJob");

    await sql`
      insert into jobs (
        id,
        tenant_id,
        project_id,
        knowledge_base_id,
        source_document_id,
        job_type,
        status,
        stage,
        progress,
        progress_message,
        result,
        metadata,
        queued_at,
        started_at,
        finished_at,
        updated_at
      )
      values (
        ${jobId},
        (select tenant_id from knowledge_bases where id = ${knowledgeBaseId}),
        (select project_id from knowledge_bases where id = ${knowledgeBaseId}),
        ${knowledgeBaseId},
        null,
        'graph.insights.refresh',
        'completed',
        'indexing',
        100,
        'Graph insights ready.',
        ${JSON.stringify({ status: "ready", change_set_id: changeSetId })}::jsonb,
        ${JSON.stringify({
          change_set_id: changeSetId,
          refresh_kind: "graph_insights",
        })}::jsonb,
        ${now},
        ${now},
        ${now},
        ${now}
      )
    `.execute(this.db);

    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.queued",
      "Queued graph insight recomputation.",
      {
        change_set_id: changeSetId,
        stage: "indexing",
        status: "queued",
      },
      now,
    );
    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.running",
      "Updating graph insights.",
      {
        change_set_id: changeSetId,
        stage: "indexing",
        status: "updating",
      },
      now,
    );
    await this.insertGraphInsightRefreshEvent(
      jobId,
      "job.completed",
      "Graph insights ready.",
      {
        change_set_id: changeSetId,
        stage: "indexing",
        status: "ready",
      },
      now,
    );
  }

  private async insertGraphInsightRefreshEvent(
    jobId: string,
    eventType: string,
    message: string,
    metadata: Record<string, unknown>,
    now: string,
  ): Promise<void> {
    await sql`
      insert into job_events (
        id,
        tenant_id,
        project_id,
        job_id,
        event_type,
        message,
        metadata,
        created_at
      )
      values (
        ${`${jobId}:${eventType}:${now}`},
        (select tenant_id from jobs where id = ${jobId}),
        (select project_id from jobs where id = ${jobId}),
        ${jobId},
        ${eventType},
        ${message},
        ${JSON.stringify(metadata)}::jsonb,
        ${now}
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async insertPageVersion(input: {
    id: string;
    pageId: string;
    knowledgeBaseId: string;
    knowledgeVersionId: string;
    versionNumber: number;
    title: string;
    markdown: string;
    frontmatter: Record<string, unknown>;
    sourceSnapshot?: readonly Record<string, unknown>[];
    createdBy: string;
    now: string;
  }): Promise<void> {
    const visibility = await this.createWriteVisibilityMetadata(input.knowledgeBaseId);

    await sql`
      insert into wiki_page_versions (
        id,
        page_id,
        knowledge_version_id,
        version_number,
        title,
        markdown,
        frontmatter,
        source_snapshot,
        created_by,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${input.id},
        ${input.pageId},
        ${input.knowledgeVersionId},
        ${input.versionNumber},
        ${input.title},
        ${input.markdown},
        ${JSON.stringify(input.frontmatter)}::jsonb,
        ${JSON.stringify(input.sourceSnapshot ?? [])}::jsonb,
        ${input.createdBy},
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${input.now}
      )
    `.execute(this.db);
  }

  private async insertKnowledgeVersion(input: {
    id: string;
    knowledgeBaseId: string;
    versionNumber: number;
    summary: string;
    changeSetId: string;
    createdBy: string;
    now: string;
  }): Promise<void> {
    const visibility = await this.createWriteVisibilityMetadata(input.knowledgeBaseId);

    await sql`
      insert into knowledge_versions (
        id,
        knowledge_base_id,
        version_number,
        status,
        summary,
        change_set_id,
        created_by,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at,
        created_at
      )
      values (
        ${input.id},
        ${input.knowledgeBaseId},
        ${input.versionNumber},
        'active',
        ${input.summary},
        ${input.changeSetId},
        ${input.createdBy},
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null,
        ${input.now}
      )
    `.execute(this.db);
  }

  private async insertChangeSetItem(
    changeSetId: string,
    objectType: string,
    objectId: string,
    operation: string,
    diff: Record<string, unknown>,
  ): Promise<void> {
    const visibility = await this.createChangeSetWriteVisibilityMetadata(changeSetId);

    await sql`
      insert into change_set_items (
        id,
        change_set_id,
        object_type,
        object_id,
        operation,
        diff,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at
      )
      values (
        ${`${changeSetId}:${objectId}`},
        ${changeSetId},
        ${objectType},
        ${objectId},
        ${operation},
        ${JSON.stringify(diff)}::jsonb,
        ${visibility.ownerKnowledgeBaseId},
        ${visibility.visibilityOrigin},
        null,
        null
      )
      on conflict (id) do nothing
    `.execute(this.db);
  }

  private async updateKnowledgeBaseVersion(
    knowledgeBaseId: string,
    versionId: string,
    now: string,
  ): Promise<void> {
    await sql`
      update knowledge_bases
      set current_version_id = ${versionId}, updated_at = ${now}
      where id = ${knowledgeBaseId}
    `.execute(this.db);
  }

  private async requireKnowledgeVersion(versionId: string): Promise<Record<string, unknown>> {
    const result = await sql<Record<string, unknown>>`
      select *
      from knowledge_versions
      where id = ${versionId}
    `.execute(this.db);
    const version = result.rows[0];

    if (version === undefined) {
      throw new ApiError("version_not_found");
    }

    return version;
  }

  private async requirePageVersion(versionId: string): Promise<Record<string, unknown>> {
    const result = await sql<Record<string, unknown>>`
      select *
      from wiki_page_versions
      where id = ${versionId}
    `.execute(this.db);
    const version = result.rows[0];

    if (version === undefined) {
      throw new ApiError("version_not_found");
    }

    return version;
  }
}

function normalizePageRow(row: WikiPageApiRecord): WikiPageApiRecord {
  return {
    ...row,
    frontmatter: normalizeJsonObject(row.frontmatter),
    metadata: normalizeJsonObject(row.metadata),
    source_document_ids: row.source_document_ids ?? [],
    source_refs: normalizeRecordArray(row.source_refs),
    visibility_origin: readVisibilityOrigin(row.visibility_origin),
    owner_knowledge_base_id: row.owner_knowledge_base_id ?? null,
    upstream_resource_id: row.upstream_resource_id ?? null,
    fork_tombstoned_at: row.fork_tombstoned_at ?? null,
  };
}

function toSystemPageRecord(row: SystemPageRow): SystemPageRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    type: readSystemPageType(row.page_type),
    title: row.title,
    markdown: row.markdown,
    createdAt: normalizeIsoTimestamp(row.created_at),
    updatedAt: normalizeIsoTimestamp(row.updated_at),
  };
}

function readSqlCount(value: string | number | bigint | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }

  return 0;
}

function decodeWikiCursor(
  value: string | undefined,
  expectedSortKey: WikiCursorSortKey,
): WikiKeysetCursor | null {
  if (value === undefined) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const sortKey = payload.sort_key;
    const sortValue = payload.sort_value;
    const id = payload.id;

    if (
      (sortKey !== "created_at" && sortKey !== "updated_at") ||
      sortKey !== expectedSortKey ||
      typeof sortValue !== "string" ||
      typeof id !== "string"
    ) {
      throw new Error("Invalid cursor payload.");
    }

    return {
      id,
      sortKey,
      sortValue: normalizeCursorTimestamp(sortValue),
    };
  } catch (error) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.pagination_invalid",
      details: {
        fields: ["cursor"],
      },
      cause: error,
    });
  }
}

function encodeWikiCursor(row: unknown, sortKey: WikiCursorSortKey): string | null {
  if (row === undefined) {
    return null;
  }

  if (typeof row !== "object" || row === null) {
    throw new Error("Invalid cursor row.");
  }

  const record = row as Record<string, unknown>;
  const id = readRequiredCursorString(record.id, "id");
  const sortValue = normalizeCursorTimestamp(record[sortKey]);

  return Buffer.from(
    JSON.stringify({
      id,
      sort_key: sortKey,
      sort_value: sortValue,
    }),
    "utf8",
  ).toString("base64url");
}

function buildWikiCursorPage<TItem>(
  rows: readonly TItem[],
  input: WikiPaginationInput,
  sortKey: WikiCursorSortKey,
): WikiCursorPage<TItem> {
  const items = rows.slice(0, input.pageSize);
  const hasMore = rows.length > input.pageSize;

  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeWikiCursor(items.at(-1), sortKey) : null,
  };
}

function normalizeCursorTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  throw new Error("Invalid cursor timestamp.");
}

function readRequiredCursorString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`Missing cursor field: ${field}.`);
}

function normalizeIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.length > 0) {
    return new Date(value).toISOString();
  }

  return new Date(0).toISOString();
}

interface SystemPageRow {
  id: string;
  knowledge_base_id: string;
  page_type: string;
  title: string;
  markdown: string;
  created_at: unknown;
  updated_at: unknown;
}

function readVisibilityOrigin(value: unknown): RetrievalVisibilityOrigin {
  if (value === "canonical" || value === "upstream_inherited" || value === "fork_owned") {
    return value;
  }

  return "canonical";
}

function readSystemPageType(value: unknown): SystemPageType {
  if (
    value === "index" ||
    value === "overview" ||
    value === "log" ||
    value === "purpose" ||
    value === "schema"
  ) {
    return value;
  }

  return "overview";
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function normalizePageSourceRefs(page: WikiPageApiRecord): RetrievalSourceRef[] {
  const sourceRefs = normalizeRecordArray(page.source_refs).flatMap(toRetrievalSourceRef);

  return sourceRefs.length > 0
    ? sourceRefs
    : page.source_document_ids.map((documentId) => ({
        document_id: documentId,
      }));
}

export function enrichSourceRefsWithDocumentMetadata(
  sourceRefs: readonly RetrievalSourceRef[],
  sourceDocumentsById: ReadonlyMap<string, RetrievalSourceDocumentMetadata>,
): RetrievalSourceRef[] {
  return sourceRefs.map((sourceRef) => {
    const sourceDocument = sourceDocumentsById.get(sourceRef.document_id);

    if (sourceDocument === undefined) {
      return sourceRef;
    }

    const name =
      sourceRef.name ?? readString(sourceDocument.metadata.display_name) ?? sourceDocument.name;
    const virtualPath =
      sourceRef.virtual_path ??
      readString(sourceDocument.metadata.source_path) ??
      readString(sourceDocument.metadata.source_url) ??
      readString(sourceDocument.metadata.path) ??
      readString(sourceDocument.metadata.file_path);
    const summary =
      sourceRef.summary ??
      readString(sourceDocument.metadata.source_summary) ??
      readString(sourceDocument.metadata.summary);

    return {
      ...sourceRef,
      ...(name === undefined ? {} : { name }),
      ...(virtualPath === null || virtualPath === undefined ? {} : { virtual_path: virtualPath }),
      ...(summary === null || summary === undefined ? {} : { summary }),
    };
  });
}

function toRetrievalSourceRef(value: Record<string, unknown>): RetrievalSourceRef[] {
  const documentId = readString(value.document_id);

  if (documentId === null) {
    return [];
  }

  const sourceRef: RetrievalSourceRef = {
    document_id: documentId,
  };
  const parsedContentId = readString(value.parsed_content_id);
  const sourceAnchorId = readString(value.source_anchor_id);
  const locator = readString(value.locator);
  const locatorStatus = readLocatorStatus(value.locator_status);
  const warningCodes = readStringArray(value.warning_codes);
  const mediaAssetId = readString(value.media_asset_id);
  const evidenceKind = readEvidenceKind(value.evidence_kind);
  const visibilityOrigin = readVisibilityOrigin(value.visibility_origin);

  if (parsedContentId !== null) {
    sourceRef.parsed_content_id = parsedContentId;
  }
  if (sourceAnchorId !== null) {
    sourceRef.source_anchor_id = sourceAnchorId;
  }
  if (locator !== null) {
    sourceRef.locator = locator;
  }
  sourceRef.locator_status = locatorStatus ?? (locator === null ? "not_provided" : "not_found");
  sourceRef.warning_codes = normalizeSourceRefWarningCodes(warningCodes, locatorStatus, locator);
  if (mediaAssetId !== null) {
    sourceRef.media_asset_id = mediaAssetId;
  }
  if (evidenceKind !== null) {
    sourceRef.evidence_kind = evidenceKind;
  }
  sourceRef.visibility_origin = visibilityOrigin;

  return [sourceRef];
}

function normalizeSourceRefWarningCodes(
  warningCodes: readonly string[],
  locatorStatus: RetrievalSourceRef["locator_status"] | null,
  locator: string | null,
): string[] {
  const next = new Set(warningCodes);

  if (locatorStatus === null) {
    next.add("source_ref_locator_status_missing");
  }
  if (locatorStatus === null && locator === null) {
    next.add("source_ref_locator_not_specific");
  }

  return [...next];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readEvidenceKind(value: unknown): "text" | "image_caption" | "ocr" | null {
  return value === "text" || value === "image_caption" || value === "ocr" ? value : null;
}

function readLocatorStatus(
  value: unknown,
): "resolved" | "not_provided" | "not_found" | "ambiguous" | "unsupported" | null {
  return value === "resolved" ||
    value === "not_provided" ||
    value === "not_found" ||
    value === "ambiguous" ||
    value === "unsupported"
    ? value
    : null;
}

function readWikiDraftChangeContent(diff: Record<string, unknown>): WikiDraftChangeContent | null {
  const after = normalizeJsonObject(diff.after);
  const title = readNonEmptyString(after.title);
  const markdown = readNonEmptyString(after.markdown);

  if (title === null || markdown === null) {
    return null;
  }

  return {
    title,
    markdown,
    tags: readStringArray(after.tags),
    sources: readObjectArray(after.sources),
    metadata: normalizeJsonObject(after.metadata),
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function readObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeJsonObject).filter((item) => Object.keys(item).length > 0);
}

function createDraftPageSlug(sourceId: string): string {
  return `draft-${sourceId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function toPostgresTextArray(values: readonly string[]) {
  return values.length === 0 ? sql`array[]::text[]` : sql`array[${sql.join(values)}]::text[]`;
}

function formatPgVector(vector: readonly number[]): string {
  return `[${vector.map((value) => Number(value)).join(",")}]`;
}

function createDefaultGraphInsightStatus(): GraphInsightStatus {
  return {
    failure_reason: null,
    source_job_id: null,
    started_at: null,
    state: "ready",
    updated_at: null,
  };
}

function toGraphInsightStatusState(
  status: string,
  input: {
    currentKnowledgeVersionId: string | null;
    metadata: Record<string, unknown> | null;
    result: Record<string, unknown> | null;
  },
): GraphInsightStatus["state"] {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "updating";
  }
  if (status === "failed" || status === "canceled") {
    return "failed";
  }
  if (status === "completed") {
    const result = normalizeJsonObject(input.result);
    const materializedInsights = normalizeJsonObject(result.graph_insights);

    if (materializedInsights.knowledge_base_id === undefined) {
      return "partial";
    }

    const metadata = normalizeJsonObject(input.metadata);
    const resultKnowledgeVersionId = readString(result.knowledge_version_id);
    const metadataKnowledgeVersionId = readString(metadata.knowledge_version_id);
    const graphKnowledgeVersionId = resultKnowledgeVersionId ?? metadataKnowledgeVersionId;

    if (
      input.currentKnowledgeVersionId !== null &&
      graphKnowledgeVersionId !== null &&
      graphKnowledgeVersionId !== input.currentKnowledgeVersionId
    ) {
      return "stale";
    }
  }

  return "ready";
}

function readFailureReason(
  error: Record<string, unknown> | null,
  progressMessage: string | null,
): string | null {
  if (error !== null && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return progressMessage;
}

function createKnowledgeCheckPageScopePredicate(input: KnowledgeCheckPageScopeInput) {
  const pageIds = input.pageIds ?? [];
  const sourceDocumentIds = input.sourceDocumentIds ?? [];

  return sql`
    (cardinality(${pageIds}::text[]) = 0 or id = any(${pageIds}::text[]))
    and (
      cardinality(${sourceDocumentIds}::text[]) = 0
      or source_document_ids && ${sourceDocumentIds}::text[]
    )
  `;
}

function createVisibleKnowledgeCheckPagesSql(knowledgeBaseId: string) {
  return sql`
    with kb_scope as (
      select knowledge_base_type, upstream_knowledge_base_id
      from knowledge_bases
      where id = ${knowledgeBaseId}
      limit 1
    ),
    fork_page_tombstones as (
      select upstream_resource_id
      from wiki_pages
      where owner_knowledge_base_id = ${knowledgeBaseId}
        and fork_tombstoned_at is not null
        and upstream_resource_id is not null
    )
    select
      wiki_pages.id,
      ${knowledgeBaseId}::text as knowledge_base_id,
      wiki_pages.slug,
      wiki_pages.title,
      wiki_pages.page_type as "type",
      wiki_pages.status,
      wiki_pages.current_version_id,
      wiki_pages.markdown,
      wiki_pages.frontmatter,
      wiki_pages.source_document_ids,
      coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
      wiki_pages.metadata,
      'canonical'::text as visibility_origin,
      null::text as owner_knowledge_base_id,
      null::text as upstream_resource_id,
      null::timestamptz as fork_tombstoned_at,
      wiki_pages.created_at,
      wiki_pages.updated_at
    from wiki_pages
    left join wiki_page_versions current_page_version
      on current_page_version.id = wiki_pages.current_version_id
    cross join kb_scope
    where kb_scope.knowledge_base_type <> 'fork'
      and wiki_pages.knowledge_base_id = ${knowledgeBaseId}
      and wiki_pages.owner_knowledge_base_id is null
      and wiki_pages.deleted_at is null
      and wiki_pages.fork_tombstoned_at is null
    union all
    select
      wiki_pages.id,
      ${knowledgeBaseId}::text as knowledge_base_id,
      wiki_pages.slug,
      wiki_pages.title,
      wiki_pages.page_type as "type",
      wiki_pages.status,
      wiki_pages.current_version_id,
      wiki_pages.markdown,
      wiki_pages.frontmatter,
      wiki_pages.source_document_ids,
      coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
      wiki_pages.metadata,
      'upstream_inherited'::text as visibility_origin,
      ${knowledgeBaseId}::text as owner_knowledge_base_id,
      wiki_pages.id as upstream_resource_id,
      null::timestamptz as fork_tombstoned_at,
      wiki_pages.created_at,
      wiki_pages.updated_at
    from wiki_pages
    left join wiki_page_versions current_page_version
      on current_page_version.id = wiki_pages.current_version_id
    cross join kb_scope
    where kb_scope.knowledge_base_type = 'fork'
      and wiki_pages.knowledge_base_id = kb_scope.upstream_knowledge_base_id
      and wiki_pages.owner_knowledge_base_id is null
      and wiki_pages.deleted_at is null
      and wiki_pages.fork_tombstoned_at is null
      and not exists (
        select 1
        from fork_page_tombstones
        where fork_page_tombstones.upstream_resource_id = wiki_pages.id
      )
    union all
    select
      wiki_pages.id,
      ${knowledgeBaseId}::text as knowledge_base_id,
      wiki_pages.slug,
      wiki_pages.title,
      wiki_pages.page_type as "type",
      wiki_pages.status,
      wiki_pages.current_version_id,
      wiki_pages.markdown,
      wiki_pages.frontmatter,
      wiki_pages.source_document_ids,
      coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
      wiki_pages.metadata,
      'fork_owned'::text as visibility_origin,
      ${knowledgeBaseId}::text as owner_knowledge_base_id,
      wiki_pages.upstream_resource_id,
      wiki_pages.fork_tombstoned_at,
      wiki_pages.created_at,
      wiki_pages.updated_at
    from wiki_pages
    left join wiki_page_versions current_page_version
      on current_page_version.id = wiki_pages.current_version_id
    cross join kb_scope
    where kb_scope.knowledge_base_type = 'fork'
      and wiki_pages.knowledge_base_id = ${knowledgeBaseId}
      and wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId}
      and wiki_pages.deleted_at is null
      and wiki_pages.fork_tombstoned_at is null
  `;
}

function readRequired(value: string | undefined, field: string): string {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.required_field",
      messageParams: {
        field,
      },
      details: { fields: [field] },
    });
  }

  return normalized;
}

function cryptoSafeId(): string {
  return createResourceId("changeSet").replace(/^cs_/u, "");
}
