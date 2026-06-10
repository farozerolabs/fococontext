import { sql, type Kysely } from "kysely";
import { requireKnowledgeBaseTenantProject, type DatabaseSchema } from "@fococontext/db";
import {
  BoundedRetrievalIndexUnavailableError,
  scoreBoundedLexicalCandidatePage,
  tokenizeLexicalQuery,
  type BoundedGraphCandidate,
  type BoundedGraphCandidateInput,
  type BoundedLexicalCandidate,
  type BoundedLexicalCandidateInput,
  type BoundedMediaEvidenceCandidate,
  type BoundedMediaEvidenceCandidateInput,
  type BoundedRetrievalRepository,
  type BoundedSemanticCandidate,
  type BoundedSemanticCandidateInput,
  type BoundedSystemPageCandidate,
  type BoundedSystemPageCandidateInput,
  type BoundedCitationCandidate,
  type BoundedCitationCandidateInput,
  type RetrievalCitationLocatorStatus,
  type RetrievalEmbeddingObjectType,
  type RetrievalEmbeddingRecord,
  type RetrievalEdgeRecord,
  type RetrievalKnowledgeBaseScopeRecord,
  type RetrievalPageRecord,
  type RetrievalRelationType,
  type RetrievalSourceRef,
  type RetrievalTraceRecord,
  type RetrievalVisibilityOrigin,
} from "@fococontext/retrieval";

interface SearchablePageRow {
  id: string;
  knowledge_base_id: string;
  slug: string;
  title: string;
  type: string;
  current_version_id: string | null;
  markdown: string;
  frontmatter: unknown;
  source_document_ids: unknown;
  source_refs: unknown;
  metadata: unknown;
  visibility_origin: RetrievalVisibilityOrigin;
  owner_knowledge_base_id: string | null;
  upstream_resource_id: string | null;
  fork_tombstoned_at: string | null;
}

interface SourceDocumentMetadataRow {
  id: string;
  metadata: unknown;
  name: string;
}

interface SemanticCandidateRow extends SearchablePageRow {
  embedding_id: string;
  embedding_page_id: string | null;
  embedding_page_version_id: string | null;
  object_type: string;
  object_id: string;
  model: string;
  dimensions: number;
  vector: string | null;
  embedding_metadata: unknown;
  score: string | number;
}

interface GraphCandidateRow {
  edge_id: string;
  edge_knowledge_base_id: string;
  edge_from_page_id: string;
  edge_to_page_id: string;
  edge_relation_type: string;
  edge_weight: string | number;
  edge_explanation: string | null;
  edge_source_document_ids: unknown;
  edge_visibility_origin: RetrievalVisibilityOrigin;
  edge_owner_knowledge_base_id: string | null;
  edge_upstream_resource_id: string | null;
  edge_fork_tombstoned_at: string | null;
  source_id: string;
  source_knowledge_base_id: string;
  source_slug: string;
  source_title: string;
  source_type: string;
  source_current_version_id: string | null;
  source_markdown: string;
  source_frontmatter: unknown;
  source_document_ids: unknown;
  source_refs: unknown;
  source_metadata: unknown;
  source_visibility_origin: RetrievalVisibilityOrigin;
  source_owner_knowledge_base_id: string | null;
  source_upstream_resource_id: string | null;
  source_fork_tombstoned_at: string | null;
  target_id: string;
  target_knowledge_base_id: string;
  target_slug: string;
  target_title: string;
  target_type: string;
  target_current_version_id: string | null;
  target_markdown: string;
  target_frontmatter: unknown;
  target_document_ids: unknown;
  target_refs: unknown;
  target_metadata: unknown;
  target_visibility_origin: RetrievalVisibilityOrigin;
  target_owner_knowledge_base_id: string | null;
  target_upstream_resource_id: string | null;
  target_fork_tombstoned_at: string | null;
  traversal_depth: number;
  traversal_path: string[] | null;
  traversal_seed_edge_id: string | null;
  traversal_seed_page_id: string | null;
}

export function createPostgresBoundedRetrievalRepository(
  db: Kysely<DatabaseSchema>,
): BoundedRetrievalRepository {
  return new PostgresBoundedRetrievalRepository(db);
}

class PostgresBoundedRetrievalRepository implements BoundedRetrievalRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async findKnowledgeBaseScope(
    knowledgeBaseId: string,
  ): Promise<RetrievalKnowledgeBaseScopeRecord | undefined> {
    const result = await sql<{
      id: string;
      knowledge_base_type: string;
      upstream_knowledge_base_id: string | null;
      upstream_synced_version_id: string | null;
    }>`
      select
        id,
        knowledge_base_type,
        upstream_knowledge_base_id,
        upstream_synced_version_id
      from knowledge_bases
      where id = ${knowledgeBaseId}
        and deleted_at is null
        and status <> 'deleted'
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      return undefined;
    }

    return {
      knowledge_base_id: row.id,
      knowledge_base_type: row.knowledge_base_type === "fork" ? "fork" : "canonical",
      upstream_knowledge_base_id: row.upstream_knowledge_base_id,
      upstream_synced_version_id: row.upstream_synced_version_id,
    };
  }

  async searchLexicalCandidates(
    input: BoundedLexicalCandidateInput,
  ): Promise<readonly BoundedLexicalCandidate[]> {
    const scope = await this.findKnowledgeBaseScope(input.knowledge_base_id);

    if (scope === undefined) {
      return [];
    }

    const searchTerms = normalizeSearchTerms(input.query);

    if (searchTerms.length === 0) {
      return [];
    }

    const rows = await this.selectSearchablePages(input, scope, searchTerms);
    const sourceMetadata = await this.loadSourceDocumentMetadata(collectSourceDocumentIds(rows));
    const candidates = rows
      .map((row) => toRetrievalPageRecord(row, sourceMetadata))
      .map((page, index) =>
        scoreBoundedLexicalCandidatePage(page, {
          query: input.query,
          rank: index + 1,
        }),
      )
      .filter((candidate): candidate is BoundedLexicalCandidate => candidate !== null)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.page.title.localeCompare(right.page.title);
      })
      .slice(0, normalizeLimit(input.limit))
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      }));

    return candidates;
  }

  async searchSemanticCandidates(
    input: BoundedSemanticCandidateInput,
  ): Promise<readonly BoundedSemanticCandidate[]> {
    if (input.query_vector.length === 0) {
      return [];
    }

    const scope = await this.findKnowledgeBaseScope(input.knowledge_base_id);

    if (scope === undefined) {
      return [];
    }

    try {
      const rows = await this.selectSemanticRows(input, scope);
      const sourceMetadata = await this.loadSourceDocumentMetadata(collectSourceDocumentIds(rows));
      const bestByPage = new Map<string, BoundedSemanticCandidate>();

      for (const row of rows) {
        const embedding = toRetrievalEmbeddingRecord(row);

        if (embedding === null) {
          continue;
        }

        const page = toRetrievalPageRecord(row, sourceMetadata);
        const score = Number(row.score);

        if (!Number.isFinite(score) || score <= 0) {
          continue;
        }

        const candidate: BoundedSemanticCandidate = {
          embedding,
          page,
          rank: 1,
          score,
        };
        const previous = bestByPage.get(page.page_id);

        if (previous === undefined || candidate.score > previous.score) {
          bestByPage.set(page.page_id, candidate);
        }
      }

      return [...bestByPage.values()]
        .sort((left, right) => right.score - left.score)
        .slice(0, normalizeLimit(input.limit))
        .map((candidate, index) => ({
          ...candidate,
          rank: index + 1,
        }));
    } catch (error) {
      if (isPgVectorUnavailableError(error)) {
        throw new BoundedRetrievalIndexUnavailableError(
          "Semantic vector index is unavailable.",
          "retrieve.index.semantic_unavailable",
        );
      }

      throw error;
    }
  }

  async listGraphCandidates(
    input: BoundedGraphCandidateInput,
  ): Promise<readonly BoundedGraphCandidate[]> {
    const scope = await this.findKnowledgeBaseScope(input.knowledge_base_id);

    if (scope === undefined) {
      return [];
    }

    const rows = await this.selectGraphRows(input, scope);
    const sourceMetadata = await this.loadSourceDocumentMetadata(
      collectGraphSourceDocumentIds(rows),
    );

    return rows.flatMap((row) => {
      const edge = toRetrievalEdgeRecord(row);

      if (edge === null) {
        return [];
      }

      return [
        {
          edge,
          source_page: toGraphRetrievalPageRecord(row, "source", sourceMetadata),
          target_page: toGraphRetrievalPageRecord(row, "target", sourceMetadata),
          traversal: {
            depth: Number(row.traversal_depth),
            path: row.traversal_path ?? [row.edge_from_page_id, row.edge_to_page_id],
            seed_edge_id: row.traversal_seed_edge_id ?? row.edge_id,
            seed_page_id: row.traversal_seed_page_id ?? row.edge_from_page_id,
          },
        },
      ];
    });
  }

  async listSystemPageCandidates(
    _input: BoundedSystemPageCandidateInput,
  ): Promise<readonly BoundedSystemPageCandidate[]> {
    void _input;
    return [];
  }

  async listCitationCandidates(
    _input: BoundedCitationCandidateInput,
  ): Promise<readonly BoundedCitationCandidate[]> {
    void _input;
    return [];
  }

  async listMediaEvidenceCandidates(
    _input: BoundedMediaEvidenceCandidateInput,
  ): Promise<readonly BoundedMediaEvidenceCandidate[]> {
    void _input;
    return [];
  }

  async saveTrace(record: RetrievalTraceRecord): Promise<void> {
    const scope = await requireKnowledgeBaseTenantProject(this.db, record.knowledge_base_id);

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
        ${record.id},
        ${scope.tenantId},
        ${scope.projectId},
        ${record.knowledge_base_id},
        ${record.query},
        ${JSON.stringify(record.request)}::jsonb,
        ${JSON.stringify(record.results)}::jsonb,
        ${JSON.stringify(record.graph_expansions)}::jsonb,
        ${JSON.stringify(record.context_pack ?? {})}::jsonb,
        ${JSON.stringify(record.warnings)}::jsonb,
        ${JSON.stringify({ answerability: record.answerability, stages: record.stages })}::jsonb,
        ${record.created_at}::timestamptz
      )
    `.execute(this.db);
  }

  private async selectSearchablePages(
    input: BoundedLexicalCandidateInput,
    scope: RetrievalKnowledgeBaseScopeRecord,
    searchTerms: readonly string[],
  ): Promise<SearchablePageRow[]> {
    const candidateLimit = normalizeCandidateLimit(input.limit);
    const pageTypeCondition = createPageTypeCondition(input.filters?.page_types);
    const sourceCondition = createSourceCondition(input.filters?.source_ids);
    const searchCondition = createLexicalSearchCondition(input.query, searchTerms);

    if (scope.knowledge_base_type === "fork" && scope.upstream_knowledge_base_id !== null) {
      const result = await sql<SearchablePageRow>`
        with fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${input.knowledge_base_id}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_pages as (
          select
            wiki_pages.id,
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'upstream_inherited'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_pages.id as upstream_resource_id,
            null::timestamptz as fork_tombstoned_at,
            wiki_pages.updated_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where wiki_pages.knowledge_base_id = ${scope.upstream_knowledge_base_id}
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
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'fork_owned'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_pages.upstream_resource_id,
            wiki_pages.fork_tombstoned_at,
            wiki_pages.updated_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where (wiki_pages.knowledge_base_id = ${input.knowledge_base_id}
              or wiki_pages.owner_knowledge_base_id = ${input.knowledge_base_id})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        )
        select *
        from visible_pages
        where ${pageTypeCondition}
          and ${sourceCondition}
          and ${searchCondition}
        order by updated_at desc, id desc
        limit ${candidateLimit}
      `.execute(this.db);

      return result.rows;
    }

    const result = await sql<SearchablePageRow>`
      with visible_pages as (
        select
          wiki_pages.id,
          wiki_pages.knowledge_base_id,
          wiki_pages.slug,
          wiki_pages.title,
          wiki_pages.page_type as "type",
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
          wiki_pages.updated_at
        from wiki_pages
        left join wiki_page_versions current_page_version
          on current_page_version.id = wiki_pages.current_version_id
        where wiki_pages.knowledge_base_id = ${input.knowledge_base_id}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
      )
      select *
      from visible_pages
      where ${pageTypeCondition}
        and ${sourceCondition}
        and ${searchCondition}
      order by updated_at desc, id desc
      limit ${candidateLimit}
    `.execute(this.db);

    return result.rows;
  }

  private async selectSemanticRows(
    input: BoundedSemanticCandidateInput,
    scope: RetrievalKnowledgeBaseScopeRecord,
  ): Promise<SemanticCandidateRow[]> {
    const candidateLimit = normalizeCandidateLimit(input.limit);
    const pageTypeCondition = createPageTypeCondition(input.filters?.page_types);
    const sourceCondition = createSourceCondition(input.filters?.source_ids);
    const queryVector = formatPgVector(input.query_vector);
    const dimensions = input.query_vector.length;

    if (scope.knowledge_base_type === "fork" && scope.upstream_knowledge_base_id !== null) {
      const result = await sql<SemanticCandidateRow>`
        with fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${input.knowledge_base_id}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        fork_embedding_tombstones as (
          select upstream_resource_id
          from page_embeddings
          where owner_knowledge_base_id = ${input.knowledge_base_id}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_pages as (
          select
            wiki_pages.id,
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'upstream_inherited'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_pages.id as upstream_resource_id,
            null::timestamptz as fork_tombstoned_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where wiki_pages.knowledge_base_id = ${scope.upstream_knowledge_base_id}
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
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'fork_owned'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_pages.upstream_resource_id,
            wiki_pages.fork_tombstoned_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where (wiki_pages.knowledge_base_id = ${input.knowledge_base_id}
              or wiki_pages.owner_knowledge_base_id = ${input.knowledge_base_id})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        ),
        visible_embeddings as (
          select
            page_embeddings.id as embedding_id,
            page_embeddings.page_id as embedding_page_id,
            page_embeddings.page_version_id as embedding_page_version_id,
            page_embeddings.object_type,
            page_embeddings.object_id,
            page_embeddings.model,
            page_embeddings.dimensions,
            page_embeddings.embedding::text as vector,
            page_embeddings.metadata as embedding_metadata,
            visible_pages.*,
            ((1 - (page_embeddings.embedding <=> ${queryVector}::vector)) *
              case
                when page_embeddings.object_type = 'page_section' then 1.05
                when page_embeddings.object_type = 'system_page' then 0.95
                else 1
              end
            ) as score
          from page_embeddings
          join visible_pages on visible_pages.id = page_embeddings.page_id
          where page_embeddings.model = ${input.model}
            and page_embeddings.dimensions = ${dimensions}
            and page_embeddings.embedding is not null
            and page_embeddings.fork_tombstoned_at is null
            and (
              (
                page_embeddings.knowledge_base_id = ${scope.upstream_knowledge_base_id}
                and page_embeddings.owner_knowledge_base_id is null
                and not exists (
                  select 1
                  from fork_embedding_tombstones
                  where fork_embedding_tombstones.upstream_resource_id = page_embeddings.id
                )
              )
              or page_embeddings.knowledge_base_id = ${input.knowledge_base_id}
              or page_embeddings.owner_knowledge_base_id = ${input.knowledge_base_id}
            )
        )
        select *
        from visible_embeddings
        where ${pageTypeCondition}
          and ${sourceCondition}
        order by score desc, embedding_id asc
        limit ${candidateLimit}
      `.execute(this.db);

      return result.rows;
    }

    const result = await sql<SemanticCandidateRow>`
      with visible_pages as (
        select
          wiki_pages.id,
          wiki_pages.knowledge_base_id,
          wiki_pages.slug,
          wiki_pages.title,
          wiki_pages.page_type as "type",
          wiki_pages.current_version_id,
          wiki_pages.markdown,
          wiki_pages.frontmatter,
          wiki_pages.source_document_ids,
          coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
          wiki_pages.metadata,
          'canonical'::text as visibility_origin,
          null::text as owner_knowledge_base_id,
          null::text as upstream_resource_id,
          null::timestamptz as fork_tombstoned_at
        from wiki_pages
        left join wiki_page_versions current_page_version
          on current_page_version.id = wiki_pages.current_version_id
        where wiki_pages.knowledge_base_id = ${input.knowledge_base_id}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
      ),
      visible_embeddings as (
        select
          page_embeddings.id as embedding_id,
          page_embeddings.page_id as embedding_page_id,
          page_embeddings.page_version_id as embedding_page_version_id,
          page_embeddings.object_type,
          page_embeddings.object_id,
          page_embeddings.model,
          page_embeddings.dimensions,
          page_embeddings.embedding::text as vector,
          page_embeddings.metadata as embedding_metadata,
          visible_pages.*,
          ((1 - (page_embeddings.embedding <=> ${queryVector}::vector)) *
            case
              when page_embeddings.object_type = 'page_section' then 1.05
              when page_embeddings.object_type = 'system_page' then 0.95
              else 1
            end
          ) as score
        from page_embeddings
        join visible_pages on visible_pages.id = page_embeddings.page_id
        where page_embeddings.knowledge_base_id = ${input.knowledge_base_id}
          and page_embeddings.owner_knowledge_base_id is null
          and page_embeddings.fork_tombstoned_at is null
          and page_embeddings.model = ${input.model}
          and page_embeddings.dimensions = ${dimensions}
          and page_embeddings.embedding is not null
      )
      select *
      from visible_embeddings
      where ${pageTypeCondition}
        and ${sourceCondition}
      order by score desc, embedding_id asc
      limit ${candidateLimit}
    `.execute(this.db);

    return result.rows;
  }

  private async selectGraphRows(
    input: BoundedGraphCandidateInput,
    scope: RetrievalKnowledgeBaseScopeRecord,
  ): Promise<GraphCandidateRow[]> {
    const seedPageIds = normalizeFilterValues(input.seed_page_ids);
    const seedEdgeIds = normalizeFilterValues(input.seed_edge_ids);
    const hasExplicitSeeds = seedPageIds.length > 0 || seedEdgeIds.length > 0;
    const depth = hasExplicitSeeds ? normalizeGraphDepth(input.depth) : 1;
    const limit = normalizeGraphCandidateLimit(input.limit);
    const relationCondition = createGraphRelationCondition(input.relation_types);
    const versionCondition = createGraphVersionCondition(input.version_id);
    const excludeCondition = createGraphExcludeCondition(input.exclude_page_ids);
    const baseCondition = createGraphSeedCondition(seedPageIds, seedEdgeIds);
    const pageTypeCondition = createGraphPageTypeCondition(input.filters?.page_types);

    if (scope.knowledge_base_type === "fork" && scope.upstream_knowledge_base_id !== null) {
      const result = await sql<GraphCandidateRow>`
        with recursive fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${input.knowledge_base_id}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_pages as (
          select
            wiki_pages.id,
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'upstream_inherited'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_pages.id as upstream_resource_id,
            null::timestamptz as fork_tombstoned_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where wiki_pages.knowledge_base_id = ${scope.upstream_knowledge_base_id}
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
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_pages.slug,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'fork_owned'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_pages.upstream_resource_id,
            wiki_pages.fork_tombstoned_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where (wiki_pages.knowledge_base_id = ${input.knowledge_base_id}
              or wiki_pages.owner_knowledge_base_id = ${input.knowledge_base_id})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        ),
        visible_edges as (
          select
            wiki_edges.id as edge_id,
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_edges.from_page_id,
            wiki_edges.to_page_id,
            wiki_edges.relation_type,
            wiki_edges.weight,
            wiki_edges.explanation,
            wiki_edges.source_document_ids,
            'upstream_inherited'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_edges.id as upstream_resource_id,
            null::timestamptz as fork_tombstoned_at,
            wiki_edges.updated_at
          from wiki_edges
          where wiki_edges.knowledge_base_id = ${scope.upstream_knowledge_base_id}
            and wiki_edges.owner_knowledge_base_id is null
            and wiki_edges.fork_tombstoned_at is null
            and not exists (
              select 1
              from wiki_edges fork_edges
              where fork_edges.owner_knowledge_base_id = ${input.knowledge_base_id}
                and fork_edges.upstream_resource_id = wiki_edges.id
            )
            and ${relationCondition}
            and ${versionCondition}
            and ${excludeCondition}
          union all
          select
            wiki_edges.id as edge_id,
            ${input.knowledge_base_id}::text as knowledge_base_id,
            wiki_edges.from_page_id,
            wiki_edges.to_page_id,
            wiki_edges.relation_type,
            wiki_edges.weight,
            wiki_edges.explanation,
            wiki_edges.source_document_ids,
            'fork_owned'::text as visibility_origin,
            ${input.knowledge_base_id}::text as owner_knowledge_base_id,
            wiki_edges.upstream_resource_id,
            wiki_edges.fork_tombstoned_at,
            wiki_edges.updated_at
          from wiki_edges
          where (wiki_edges.knowledge_base_id = ${input.knowledge_base_id}
              or wiki_edges.owner_knowledge_base_id = ${input.knowledge_base_id})
            and wiki_edges.fork_tombstoned_at is null
            and ${relationCondition}
            and ${versionCondition}
            and ${excludeCondition}
        ),
        traversal as (
          select
            visible_edges.*,
            1::int as traversal_depth,
            visible_edges.from_page_id as traversal_seed_page_id,
            case
              when visible_edges.edge_id = any(${formatTextArray(seedEdgeIds)})
                then visible_edges.edge_id
              else null
            end as traversal_seed_edge_id,
            array[visible_edges.from_page_id, visible_edges.to_page_id]::text[] as traversal_path
          from visible_edges
          where ${baseCondition}
          union all
          select
            next_edges.*,
            traversal.traversal_depth + 1 as traversal_depth,
            traversal.traversal_seed_page_id,
            traversal.traversal_seed_edge_id,
            traversal.traversal_path || next_edges.to_page_id
          from traversal
          join visible_edges next_edges on next_edges.from_page_id = traversal.to_page_id
          where traversal.traversal_depth < ${depth}
            and next_edges.to_page_id <> all(traversal.traversal_path)
        )
        ${selectGraphRowsSql(pageTypeCondition, limit)}
      `.execute(this.db);

      return result.rows;
    }

    const result = await sql<GraphCandidateRow>`
      with recursive visible_pages as (
        select
          wiki_pages.id,
          wiki_pages.knowledge_base_id,
          wiki_pages.slug,
          wiki_pages.title,
          wiki_pages.page_type as "type",
          wiki_pages.current_version_id,
          wiki_pages.markdown,
          wiki_pages.frontmatter,
          wiki_pages.source_document_ids,
          coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
          wiki_pages.metadata,
          'canonical'::text as visibility_origin,
          null::text as owner_knowledge_base_id,
          null::text as upstream_resource_id,
          null::timestamptz as fork_tombstoned_at
        from wiki_pages
        left join wiki_page_versions current_page_version
          on current_page_version.id = wiki_pages.current_version_id
        where wiki_pages.knowledge_base_id = ${input.knowledge_base_id}
          and wiki_pages.owner_knowledge_base_id is null
          and wiki_pages.fork_tombstoned_at is null
          and wiki_pages.deleted_at is null
      ),
      visible_edges as (
        select
          wiki_edges.id as edge_id,
          wiki_edges.knowledge_base_id,
          wiki_edges.from_page_id,
          wiki_edges.to_page_id,
          wiki_edges.relation_type,
          wiki_edges.weight,
          wiki_edges.explanation,
          wiki_edges.source_document_ids,
          'canonical'::text as visibility_origin,
          null::text as owner_knowledge_base_id,
          null::text as upstream_resource_id,
          null::timestamptz as fork_tombstoned_at,
          wiki_edges.updated_at
        from wiki_edges
        where wiki_edges.knowledge_base_id = ${input.knowledge_base_id}
          and wiki_edges.owner_knowledge_base_id is null
          and wiki_edges.fork_tombstoned_at is null
          and ${relationCondition}
          and ${versionCondition}
          and ${excludeCondition}
      ),
      traversal as (
        select
          visible_edges.*,
          1::int as traversal_depth,
          visible_edges.from_page_id as traversal_seed_page_id,
          case
            when visible_edges.edge_id = any(${formatTextArray(seedEdgeIds)})
              then visible_edges.edge_id
            else null
          end as traversal_seed_edge_id,
          array[visible_edges.from_page_id, visible_edges.to_page_id]::text[] as traversal_path
        from visible_edges
        where ${baseCondition}
        union all
        select
          next_edges.*,
          traversal.traversal_depth + 1 as traversal_depth,
          traversal.traversal_seed_page_id,
          traversal.traversal_seed_edge_id,
          traversal.traversal_path || next_edges.to_page_id
        from traversal
        join visible_edges next_edges on next_edges.from_page_id = traversal.to_page_id
        where traversal.traversal_depth < ${depth}
          and next_edges.to_page_id <> all(traversal.traversal_path)
      )
      ${selectGraphRowsSql(pageTypeCondition, limit)}
    `.execute(this.db);

    return result.rows;
  }

  private async loadSourceDocumentMetadata(
    documentIds: readonly string[],
  ): Promise<Map<string, SourceDocumentMetadataRow>> {
    const uniqueIds = [...new Set(documentIds)].filter((documentId) => documentId.length > 0);

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const result = await sql<SourceDocumentMetadataRow>`
      select
        id,
        name,
        metadata
      from source_documents
      where id = any(${formatTextArray(uniqueIds)})
    `.execute(this.db);

    return new Map(result.rows.map((row) => [row.id, row]));
  }
}

function createLexicalSearchCondition(query: string, searchTerms: readonly string[]) {
  const terms = formatTextArray(searchTerms);

  return sql`(
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(slug, '') || ' ' ||
      coalesce(markdown, '') || ' ' ||
      coalesce(metadata::text, '') || ' ' ||
      coalesce(source_refs::text, '')
    ) @@ plainto_tsquery('simple', ${query})
    or exists (
      select 1
      from unnest(${terms}) as lexical_terms(term)
      where position(
        lexical_terms.term in lower(
          coalesce(title, '') || ' ' ||
          coalesce(slug, '') || ' ' ||
          coalesce(markdown, '') || ' ' ||
          coalesce(metadata::text, '') || ' ' ||
          coalesce(source_refs::text, '')
        )
      ) > 0
    )
  )`;
}

function createPageTypeCondition(pageTypes: readonly string[] | undefined) {
  const values = normalizeFilterValues(pageTypes);

  return values.length === 0 ? sql`true` : sql`"type" = any(${formatTextArray(values)})`;
}

function createSourceCondition(sourceIds: readonly string[] | undefined) {
  const values = normalizeFilterValues(sourceIds);

  return values.length === 0
    ? sql`true`
    : sql`(
        source_document_ids && ${formatTextArray(values)}
        or exists (
          select 1
          from jsonb_array_elements(source_refs) as source_ref(value)
          where source_ref.value->>'document_id' = any(${formatTextArray(values)})
        )
      )`;
}

function selectGraphRowsSql(pageTypeCondition: ReturnType<typeof sql>, limit: number) {
  return sql`
    select
      traversal.edge_id,
      traversal.knowledge_base_id as edge_knowledge_base_id,
      traversal.from_page_id as edge_from_page_id,
      traversal.to_page_id as edge_to_page_id,
      traversal.relation_type as edge_relation_type,
      traversal.weight as edge_weight,
      traversal.explanation as edge_explanation,
      traversal.source_document_ids as edge_source_document_ids,
      traversal.visibility_origin as edge_visibility_origin,
      traversal.owner_knowledge_base_id as edge_owner_knowledge_base_id,
      traversal.upstream_resource_id as edge_upstream_resource_id,
      traversal.fork_tombstoned_at as edge_fork_tombstoned_at,
      source_page.id as source_id,
      source_page.knowledge_base_id as source_knowledge_base_id,
      source_page.slug as source_slug,
      source_page.title as source_title,
      source_page."type" as source_type,
      source_page.current_version_id as source_current_version_id,
      source_page.markdown as source_markdown,
      source_page.frontmatter as source_frontmatter,
      source_page.source_document_ids as source_document_ids,
      source_page.source_refs as source_refs,
      source_page.metadata as source_metadata,
      source_page.visibility_origin as source_visibility_origin,
      source_page.owner_knowledge_base_id as source_owner_knowledge_base_id,
      source_page.upstream_resource_id as source_upstream_resource_id,
      source_page.fork_tombstoned_at as source_fork_tombstoned_at,
      target_page.id as target_id,
      target_page.knowledge_base_id as target_knowledge_base_id,
      target_page.slug as target_slug,
      target_page.title as target_title,
      target_page."type" as target_type,
      target_page.current_version_id as target_current_version_id,
      target_page.markdown as target_markdown,
      target_page.frontmatter as target_frontmatter,
      target_page.source_document_ids as target_document_ids,
      target_page.source_refs as target_refs,
      target_page.metadata as target_metadata,
      target_page.visibility_origin as target_visibility_origin,
      target_page.owner_knowledge_base_id as target_owner_knowledge_base_id,
      target_page.upstream_resource_id as target_upstream_resource_id,
      target_page.fork_tombstoned_at as target_fork_tombstoned_at,
      traversal.traversal_depth,
      traversal.traversal_path,
      traversal.traversal_seed_edge_id,
      traversal.traversal_seed_page_id
    from traversal
    join visible_pages source_page on source_page.id = traversal.from_page_id
    join visible_pages target_page on target_page.id = traversal.to_page_id
    where ${pageTypeCondition}
    order by traversal.traversal_depth asc, traversal.weight desc, traversal.edge_id asc
    limit ${limit}
  `;
}

function createGraphSeedCondition(seedPageIds: readonly string[], seedEdgeIds: readonly string[]) {
  if (seedPageIds.length === 0 && seedEdgeIds.length === 0) {
    return sql`true`;
  }

  if (seedPageIds.length === 0) {
    return sql`visible_edges.edge_id = any(${formatTextArray(seedEdgeIds)})`;
  }

  if (seedEdgeIds.length === 0) {
    return sql`visible_edges.from_page_id = any(${formatTextArray(seedPageIds)})`;
  }

  return sql`(
    visible_edges.from_page_id = any(${formatTextArray(seedPageIds)})
    or visible_edges.edge_id = any(${formatTextArray(seedEdgeIds)})
  )`;
}

function createGraphRelationCondition(relationTypes: readonly string[] | undefined) {
  const values = normalizeFilterValues(relationTypes);

  return values.length === 0
    ? sql`true`
    : sql`wiki_edges.relation_type = any(${formatTextArray(values)})`;
}

function createGraphVersionCondition(versionId: string | undefined) {
  return versionId === undefined || versionId.trim().length === 0
    ? sql`true`
    : sql`wiki_edges.knowledge_version_id = ${versionId}`;
}

function createGraphExcludeCondition(excludePageIds: readonly string[] | undefined) {
  const values = normalizeFilterValues(excludePageIds);

  return values.length === 0
    ? sql`true`
    : sql`wiki_edges.to_page_id <> all(${formatTextArray(values)})`;
}

function createGraphPageTypeCondition(pageTypes: readonly string[] | undefined) {
  const values = normalizeFilterValues(pageTypes);

  return values.length === 0
    ? sql`true`
    : sql`(
        source_page."type" = any(${formatTextArray(values)})
        or target_page."type" = any(${formatTextArray(values)})
      )`;
}

function normalizeSearchTerms(query: string): string[] {
  const phrase = query.trim().toLowerCase();

  return [
    ...new Set(
      [phrase, ...tokenizeLexicalQuery(query)]
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length > 1)
        .slice(0, 32),
    ),
  ];
}

function normalizeFilterValues(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, 100),
    ),
  ];
}

function normalizeLimit(value: number): number {
  return Math.max(1, Math.min(Math.trunc(value), 50));
}

function normalizeCandidateLimit(value: number): number {
  return Math.max(50, Math.min(normalizeLimit(value) * 25, 500));
}

function normalizeGraphDepth(value: number): number {
  return Math.max(1, Math.min(Math.trunc(value), 5));
}

function normalizeGraphCandidateLimit(value: number): number {
  return Math.max(1, Math.min(Math.trunc(value), 500));
}

function formatTextArray(values: readonly string[]) {
  return values.length === 0 ? sql`array[]::text[]` : sql`array[${sql.join(values)}]::text[]`;
}

function collectSourceDocumentIds(rows: readonly SearchablePageRow[]): string[] {
  return [
    ...new Set(
      rows.flatMap((row) => [
        ...readStringArray(row.source_document_ids),
        ...normalizeRecordArray(row.source_refs)
          .map((sourceRef) => readString(sourceRef.document_id))
          .filter((documentId): documentId is string => documentId !== null),
      ]),
    ),
  ];
}

function collectGraphSourceDocumentIds(rows: readonly GraphCandidateRow[]): string[] {
  return [
    ...new Set(
      rows.flatMap((row) => [
        ...readStringArray(row.edge_source_document_ids),
        ...readStringArray(row.source_document_ids),
        ...readStringArray(row.target_document_ids),
        ...normalizeRecordArray(row.source_refs)
          .map((sourceRef) => readString(sourceRef.document_id))
          .filter((documentId): documentId is string => documentId !== null),
        ...normalizeRecordArray(row.target_refs)
          .map((sourceRef) => readString(sourceRef.document_id))
          .filter((documentId): documentId is string => documentId !== null),
      ]),
    ),
  ];
}

function toRetrievalPageRecord(
  row: SearchablePageRow,
  sourceDocumentsById: ReadonlyMap<string, SourceDocumentMetadataRow>,
): RetrievalPageRecord {
  const sourceRefs = normalizePageSourceRefs(row);

  return {
    knowledge_base_id: row.knowledge_base_id,
    page_id: row.id,
    page_version_id: row.current_version_id ?? row.id,
    title: row.title,
    type: row.type,
    markdown: row.markdown,
    frontmatter: normalizeJsonObject(row.frontmatter),
    is_system_page: false,
    system_page_key: null,
    source_refs: enrichSourceRefs(sourceRefs, sourceDocumentsById),
    metadata: normalizeJsonObject(row.metadata),
    visibility_origin: row.visibility_origin,
    owner_knowledge_base_id: row.owner_knowledge_base_id,
    upstream_resource_id: row.upstream_resource_id,
    fork_tombstoned_at: row.fork_tombstoned_at,
  };
}

function toGraphRetrievalPageRecord(
  row: GraphCandidateRow,
  side: "source" | "target",
  sourceDocumentsById: ReadonlyMap<string, SourceDocumentMetadataRow>,
): RetrievalPageRecord {
  const pageRow: SearchablePageRow =
    side === "source"
      ? {
          id: row.source_id,
          knowledge_base_id: row.source_knowledge_base_id,
          slug: row.source_slug,
          title: row.source_title,
          type: row.source_type,
          current_version_id: row.source_current_version_id,
          markdown: row.source_markdown,
          frontmatter: row.source_frontmatter,
          source_document_ids: row.source_document_ids,
          source_refs: row.source_refs,
          metadata: row.source_metadata,
          visibility_origin: row.source_visibility_origin,
          owner_knowledge_base_id: row.source_owner_knowledge_base_id,
          upstream_resource_id: row.source_upstream_resource_id,
          fork_tombstoned_at: row.source_fork_tombstoned_at,
        }
      : {
          id: row.target_id,
          knowledge_base_id: row.target_knowledge_base_id,
          slug: row.target_slug,
          title: row.target_title,
          type: row.target_type,
          current_version_id: row.target_current_version_id,
          markdown: row.target_markdown,
          frontmatter: row.target_frontmatter,
          source_document_ids: row.target_document_ids,
          source_refs: row.target_refs,
          metadata: row.target_metadata,
          visibility_origin: row.target_visibility_origin,
          owner_knowledge_base_id: row.target_owner_knowledge_base_id,
          upstream_resource_id: row.target_upstream_resource_id,
          fork_tombstoned_at: row.target_fork_tombstoned_at,
        };

  return toRetrievalPageRecord(pageRow, sourceDocumentsById);
}

function toRetrievalEdgeRecord(row: GraphCandidateRow): RetrievalEdgeRecord | null {
  const relationType = readRelationType(row.edge_relation_type);

  if (relationType === null) {
    return null;
  }

  return {
    knowledge_base_id: row.edge_knowledge_base_id,
    edge_id: row.edge_id,
    from_page_id: row.edge_from_page_id,
    to_page_id: row.edge_to_page_id,
    relation_type: relationType,
    weight: Number(row.edge_weight),
    explanation: row.edge_explanation ?? `${row.edge_relation_type} relation`,
    source_document_ids: readStringArray(row.edge_source_document_ids),
    visibility_origin: row.edge_visibility_origin,
    owner_knowledge_base_id: row.edge_owner_knowledge_base_id,
    upstream_resource_id: row.edge_upstream_resource_id,
    fork_tombstoned_at: row.edge_fork_tombstoned_at,
  };
}

function toRetrievalEmbeddingRecord(row: SemanticCandidateRow): RetrievalEmbeddingRecord | null {
  const objectType = readEmbeddingObjectType(row.object_type);
  const text = readMetadataText(row.embedding_metadata);

  if (
    objectType === null ||
    row.embedding_page_id === null ||
    row.embedding_page_version_id === null ||
    text === null
  ) {
    return null;
  }

  return {
    id: row.embedding_id,
    knowledge_base_id: row.knowledge_base_id,
    page_id: row.embedding_page_id,
    page_version_id: row.embedding_page_version_id,
    object_type: objectType,
    object_id: row.object_id,
    text,
    model: row.model,
    dimensions: Number(row.dimensions),
    vector: parsePgVector(row.vector),
    metadata: removeMetadataText(normalizeJsonObject(row.embedding_metadata)),
    visibility_origin: row.visibility_origin,
    owner_knowledge_base_id: row.owner_knowledge_base_id,
    upstream_resource_id: row.upstream_resource_id,
    fork_tombstoned_at: row.fork_tombstoned_at,
  };
}

function normalizePageSourceRefs(row: SearchablePageRow): RetrievalSourceRef[] {
  const sourceRefs = normalizeRecordArray(row.source_refs).flatMap(toRetrievalSourceRef);

  return sourceRefs.length > 0
    ? sourceRefs
    : readStringArray(row.source_document_ids).map((documentId) => ({
        document_id: documentId,
      }));
}

function enrichSourceRefs(
  sourceRefs: readonly RetrievalSourceRef[],
  sourceDocumentsById: ReadonlyMap<string, SourceDocumentMetadataRow>,
): RetrievalSourceRef[] {
  return sourceRefs.map((sourceRef) => {
    const sourceDocument = sourceDocumentsById.get(sourceRef.document_id);

    if (sourceDocument === undefined) {
      return sourceRef;
    }

    const metadata = normalizeJsonObject(sourceDocument.metadata);
    const name =
      sourceRef.name ??
      readString(metadata.display_name) ??
      readString(metadata.name) ??
      sourceDocument.name;
    const virtualPath =
      sourceRef.virtual_path ??
      readString(metadata.source_path) ??
      readString(metadata.source_url) ??
      readString(metadata.path) ??
      readString(metadata.file_path);
    const summary =
      sourceRef.summary ?? readString(metadata.source_summary) ?? readString(metadata.summary);

    return {
      ...sourceRef,
      ...(name === null ? {} : { name }),
      ...(virtualPath === null ? {} : { virtual_path: virtualPath }),
      ...(summary === null ? {} : { summary }),
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

  return [sourceRef];
}

function normalizeSourceRefWarningCodes(
  warningCodes: readonly string[],
  locatorStatus: RetrievalCitationLocatorStatus | null,
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function readLocatorStatus(value: unknown): RetrievalCitationLocatorStatus | null {
  return value === "resolved" ||
    value === "not_provided" ||
    value === "not_found" ||
    value === "ambiguous" ||
    value === "unsupported"
    ? value
    : null;
}

function readEvidenceKind(value: unknown): "text" | "image_caption" | "ocr" | null {
  return value === "text" || value === "image_caption" || value === "ocr" ? value : null;
}

function readEmbeddingObjectType(value: unknown): RetrievalEmbeddingObjectType | null {
  return value === "page" || value === "page_section" || value === "system_page" ? value : null;
}

function readRelationType(value: unknown): RetrievalRelationType | null {
  return value === "wikilink" ||
    value === "shared_source" ||
    value === "common_neighbor" ||
    value === "type_affinity" ||
    value === "generated_relationship" ||
    value === "evidence_relationship" ||
    value === "manual"
    ? value
    : null;
}

function readMetadataText(value: unknown): string | null {
  const metadata = normalizeJsonObject(value);
  const text = metadata.text;

  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

function removeMetadataText(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };

  delete next.text;

  return next;
}

function formatPgVector(vector: readonly number[]): string {
  return `[${vector.map((value) => Number(value)).join(",")}]`;
}

function parsePgVector(value: string | null): number[] {
  if (value === null) {
    return [];
  }

  return value
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function isPgVectorUnavailableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return code === "42704" || code === "42883" || code === "58P01";
}
