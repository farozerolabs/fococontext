import { createHash } from "node:crypto";

import { Worker } from "bullmq";
import { sql, type Kysely } from "kysely";
import { createBackgroundOperationDedupeKey, type RuntimeConfig } from "@fococontext/core";
import {
  backgroundOperationIdPrefix,
  createDescendingStableIdTimeCursorPredicate,
  createStableIdTimeCheckpointCursor,
  createStableIdTimeCursor,
  readStableIdTimeCheckpointCursor,
  requireKnowledgeBaseTenantProject,
  writeIdempotentBatches,
  type BackgroundOperationCheckpointRecord,
  type BackgroundOperationCheckpointRepository,
  type DatabaseSchema,
  type StableIdTimeCursor,
} from "@fococontext/db";
import {
  createEmbeddingUnits,
  createOpenAICompatibleRetrievalEmbeddingProvider,
  type RetrievalEmbeddingProvider,
  type RetrievalEmbeddingRecord,
  type RetrievalPageRecord,
  type RetrievalSourceRef,
  type RetrievalVisibilityOrigin,
} from "@fococontext/retrieval";

import type {
  WorkerJobProgressWriter,
  WorkerJobStateGuard,
} from "./job-progress.postgres-writer.js";

export const reindexQueueName = "retrieval.reindex";
export const reindexJobName = "retrieval.reindex.run";

const reindexRunningBaseProgress = 5;
const reindexProgressSpan = 90;

export interface ReindexPayload {
  job_id: string;
  knowledge_base_id: string;
  requested_knowledge_version_id: string | null;
}

export interface ReindexQueueJob {
  name: string;
  data: ReindexPayload;
}

export interface ReindexProcessorResult {
  status: "completed";
  knowledge_base_id: string;
  job_id: string;
  indexed_edge_count: number;
  indexed_embedding_count: number;
  indexed_page_count: number;
}

interface ReindexVisiblePageRow {
  id: string;
  knowledge_base_id: string;
  title: string;
  type: string;
  current_version_id: string | null;
  markdown: string;
  frontmatter: unknown;
  source_document_ids: string[] | null;
  source_refs: unknown;
  metadata: unknown;
  visibility_origin: string;
  owner_knowledge_base_id: string | null;
  upstream_resource_id: string | null;
  fork_tombstoned_at: string | null;
  updated_at: Date | string;
}

export class PostgresReindexProcessor {
  private readonly provider: RetrievalEmbeddingProvider;

  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly options: {
      batchSize: number;
      checkpointRepository: BackgroundOperationCheckpointRepository;
      jobGuard: WorkerJobStateGuard;
      jobProgress: WorkerJobProgressWriter;
      now?: () => string;
      writeBatchSize: number;
    },
    provider: RetrievalEmbeddingProvider,
  ) {
    this.provider = provider;
  }

  async process(payload: ReindexPayload): Promise<ReindexProcessorResult> {
    const inputSnapshotId = payload.requested_knowledge_version_id ?? payload.knowledge_base_id;
    const guard = await this.options.jobGuard.canContinueJob({
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      inputSnapshotId,
    });

    if (!guard.canContinue) {
      throw new Error(`Retrieval reindex job cannot continue: ${guard.reason ?? "unknown"}.`);
    }

    const totalPages = await this.countVisiblePages(payload.knowledge_base_id);
    const checkpoint = await this.createOrReuseCheckpoint(payload, totalPages);
    const resumeState = readStableIdTimeCheckpointCursor(checkpoint.cursor);

    if (checkpoint.status === "completed") {
      const indexedEdgeCount = await this.countVisibleEdges(payload.knowledge_base_id);
      await this.updateJobCompleted(payload, inputSnapshotId, {
        indexedEdgeCount,
        indexedEmbeddingCount: checkpoint.processedCount,
        indexedPageCount: checkpoint.totalCount ?? checkpoint.processedCount,
        operationId: checkpoint.id,
      });

      return {
        status: "completed",
        knowledge_base_id: payload.knowledge_base_id,
        job_id: payload.job_id,
        indexed_edge_count: indexedEdgeCount,
        indexed_embedding_count: checkpoint.processedCount,
        indexed_page_count: checkpoint.totalCount ?? checkpoint.processedCount,
      };
    }

    await this.options.checkpointRepository.markRunning({
      id: checkpoint.id,
      now: this.now(),
      stage: "indexing",
    });
    await this.updateJobRunning(payload, inputSnapshotId, {
      operationId: checkpoint.id,
      processedCount: checkpoint.processedCount,
      totalPages,
    });

    let cursor = resumeState.cursor;
    let indexedPageCount = Math.max(checkpoint.processedCount, resumeState.processedCount);
    let indexedEmbeddingCount = readIndexedEmbeddingCount(checkpoint.metadata);

    if (indexedPageCount === 0 && cursor === null) {
      await this.deleteEmbeddingsForKnowledgeBase(payload.knowledge_base_id);
    }

    try {
      for (;;) {
        const batch = await this.listVisiblePages({
          cursor,
          knowledgeBaseId: payload.knowledge_base_id,
          limit: this.options.batchSize,
        });

        if (batch.items.length === 0) {
          break;
        }

        const embeddings = await this.createEmbeddingBatch(batch.items);
        await this.insertEmbeddingBatch(embeddings);

        indexedPageCount += batch.items.length;
        indexedEmbeddingCount += embeddings.length;
        cursor = batch.nextCursor;

        await this.options.checkpointRepository.saveProgress({
          id: checkpoint.id,
          cursor: createStableIdTimeCheckpointCursor({
            cursor,
            processedCount: indexedPageCount,
          }),
          lastItemId: batch.items.at(-1)?.id ?? null,
          metadata: {
            indexed_embedding_count: indexedEmbeddingCount,
            job_id: payload.job_id,
          },
          now: this.now(),
          processedCount: indexedPageCount,
          stage: "indexing",
          totalCount: totalPages,
        });
        await this.updateJobRunning(payload, inputSnapshotId, {
          operationId: checkpoint.id,
          processedCount: indexedPageCount,
          totalPages,
        });

        if (cursor === null) {
          break;
        }
      }

      const indexedEdgeCount = await this.countVisibleEdges(payload.knowledge_base_id);
      await this.options.checkpointRepository.markCompleted({
        id: checkpoint.id,
        lastItemId: null,
        metadata: {
          indexed_edge_count: indexedEdgeCount,
          indexed_embedding_count: indexedEmbeddingCount,
          indexed_page_count: indexedPageCount,
          job_id: payload.job_id,
        },
        now: this.now(),
        processedCount: indexedPageCount,
        stage: "ready",
        totalCount: totalPages,
      });
      await this.updateJobCompleted(payload, inputSnapshotId, {
        indexedEdgeCount,
        indexedEmbeddingCount,
        indexedPageCount,
        operationId: checkpoint.id,
      });

      return {
        status: "completed",
        knowledge_base_id: payload.knowledge_base_id,
        job_id: payload.job_id,
        indexed_edge_count: indexedEdgeCount,
        indexed_embedding_count: indexedEmbeddingCount,
        indexed_page_count: indexedPageCount,
      };
    } catch (error) {
      await this.options.checkpointRepository.markFailed({
        id: checkpoint.id,
        failedCount: 1,
        metadata: {
          indexed_embedding_count: indexedEmbeddingCount,
          indexed_page_count: indexedPageCount,
          job_id: payload.job_id,
        },
        now: this.now(),
        processedCount: indexedPageCount,
        safeError: {
          message: error instanceof Error ? error.message : "Retrieval reindex failed.",
        },
        stage: "failed",
        totalCount: totalPages,
      });
      await this.options.jobProgress.updateJobProgress({
        error: {
          code: "retrieval_reindex_failed",
          message: error instanceof Error ? error.message : "Retrieval reindex failed.",
          retryable: true,
        },
        inputSnapshotId,
        jobId: payload.job_id,
        knowledgeBaseId: payload.knowledge_base_id,
        message: "Retrieval index rebuild failed.",
        metadata: {
          operation_id: checkpoint.id,
        },
        progress: calculateProgress(indexedPageCount, totalPages),
        stage: "indexing",
        status: "failed",
      });
      throw error;
    }
  }

  private async createOrReuseCheckpoint(
    payload: ReindexPayload,
    totalPages: number,
  ): Promise<BackgroundOperationCheckpointRecord> {
    const checkpointId = createStableReindexOperationId(payload);
    const scope = await requireKnowledgeBaseTenantProject(this.db, payload.knowledge_base_id);

    return this.options.checkpointRepository.createOrReuse({
      id: checkpointId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      knowledgeBaseId: payload.knowledge_base_id,
      jobId: payload.job_id,
      operationKind: "retrieval_reindex",
      stage: "queued",
      lockKey: createBackgroundOperationDedupeKey({
        operationId: checkpointId,
        operationKind: "retrieval_reindex",
        scopeId: payload.knowledge_base_id,
      }),
      metadata: {
        requested_knowledge_version_id: payload.requested_knowledge_version_id,
      },
      now: this.now(),
      totalCount: totalPages,
    });
  }

  private async countVisiblePages(knowledgeBaseId: string): Promise<number> {
    const knowledgeScope = await this.readKnowledgeBaseScope(knowledgeBaseId);

    if (
      knowledgeScope.knowledgeBaseType === "fork" &&
      knowledgeScope.upstreamKnowledgeBaseId !== null
    ) {
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
          where wiki_pages.knowledge_base_id = ${knowledgeScope.upstreamKnowledgeBaseId}
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
      `.execute(this.db);

      return readSqlCount(result.rows[0]?.total);
    }

    const result = await sql<{ total: string | number | bigint }>`
      select count(*) as total
      from wiki_pages
      where knowledge_base_id = ${knowledgeBaseId}
        and owner_knowledge_base_id is null
        and fork_tombstoned_at is null
        and deleted_at is null
    `.execute(this.db);

    return readSqlCount(result.rows[0]?.total);
  }

  private async listVisiblePages(input: {
    knowledgeBaseId: string;
    cursor: StableIdTimeCursor | null;
    limit: number;
  }): Promise<{
    items: ReindexVisiblePageRow[];
    nextCursor: StableIdTimeCursor | null;
  }> {
    const knowledgeScope = await this.readKnowledgeBaseScope(input.knowledgeBaseId);
    const rowLimit = input.limit + 1;
    const visibleCursorCondition = createDescendingStableIdTimeCursorPredicate({
      cursor: input.cursor,
      idExpression: sql.ref("id"),
      timestampExpression: sql.ref("updated_at"),
    });
    const canonicalCursorCondition = createDescendingStableIdTimeCursorPredicate({
      cursor: input.cursor,
      idExpression: sql.ref("wiki_pages.id"),
      timestampExpression: sql.ref("wiki_pages.updated_at"),
    });

    if (
      knowledgeScope.knowledgeBaseType === "fork" &&
      knowledgeScope.upstreamKnowledgeBaseId !== null
    ) {
      const result = await sql<ReindexVisiblePageRow>`
        with fork_page_tombstones as (
          select upstream_resource_id
          from wiki_pages
          where owner_knowledge_base_id = ${input.knowledgeBaseId}
            and fork_tombstoned_at is not null
            and upstream_resource_id is not null
        ),
        visible_pages as (
          select
            wiki_pages.id,
            ${input.knowledgeBaseId}::text as knowledge_base_id,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'upstream_inherited'::text as visibility_origin,
            ${input.knowledgeBaseId}::text as owner_knowledge_base_id,
            wiki_pages.id as upstream_resource_id,
            null::timestamptz as fork_tombstoned_at,
            wiki_pages.updated_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where wiki_pages.knowledge_base_id = ${knowledgeScope.upstreamKnowledgeBaseId}
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
            ${input.knowledgeBaseId}::text as knowledge_base_id,
            wiki_pages.title,
            wiki_pages.page_type as "type",
            wiki_pages.current_version_id,
            wiki_pages.markdown,
            wiki_pages.frontmatter,
            wiki_pages.source_document_ids,
            coalesce(current_page_version.source_snapshot, '[]'::jsonb) as source_refs,
            wiki_pages.metadata,
            'fork_owned'::text as visibility_origin,
            ${input.knowledgeBaseId}::text as owner_knowledge_base_id,
            wiki_pages.upstream_resource_id,
            wiki_pages.fork_tombstoned_at,
            wiki_pages.updated_at
          from wiki_pages
          left join wiki_page_versions current_page_version
            on current_page_version.id = wiki_pages.current_version_id
          where (wiki_pages.knowledge_base_id = ${input.knowledgeBaseId}
              or wiki_pages.owner_knowledge_base_id = ${input.knowledgeBaseId})
            and wiki_pages.deleted_at is null
            and wiki_pages.fork_tombstoned_at is null
        )
        select *
        from visible_pages
        where ${visibleCursorCondition}
        order by updated_at desc, id desc
        limit ${rowLimit}
      `.execute(this.db);

      return buildStablePageBatch(result.rows, input.limit);
    }

    const result = await sql<ReindexVisiblePageRow>`
      select
        wiki_pages.id,
        wiki_pages.knowledge_base_id,
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
      where wiki_pages.knowledge_base_id = ${input.knowledgeBaseId}
        and wiki_pages.owner_knowledge_base_id is null
        and wiki_pages.fork_tombstoned_at is null
        and wiki_pages.deleted_at is null
        and ${canonicalCursorCondition}
      order by wiki_pages.updated_at desc, wiki_pages.id desc
      limit ${rowLimit}
    `.execute(this.db);

    return buildStablePageBatch(result.rows, input.limit);
  }

  private async createEmbeddingBatch(
    rows: readonly ReindexVisiblePageRow[],
  ): Promise<RetrievalEmbeddingRecord[]> {
    const records: RetrievalEmbeddingRecord[] = [];

    for (const row of rows) {
      const retrievalPage = toRetrievalPageRecord(row);
      const units = createEmbeddingUnits(retrievalPage);
      const embeddingResult = await this.provider.embed({
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
          model: this.provider.model,
          dimensions: this.provider.dimensions,
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

  private async insertEmbeddingBatch(
    embeddings: readonly RetrievalEmbeddingRecord[],
  ): Promise<void> {
    await writeIdempotentBatches({
      batchSize: this.options.writeBatchSize,
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

  private async deleteEmbeddingsForKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    await sql`
      delete from page_embeddings
      where knowledge_base_id = ${knowledgeBaseId}
    `.execute(this.db);
  }

  private async countVisibleEdges(knowledgeBaseId: string): Promise<number> {
    const knowledgeScope = await this.readKnowledgeBaseScope(knowledgeBaseId);

    if (
      knowledgeScope.knowledgeBaseType === "fork" &&
      knowledgeScope.upstreamKnowledgeBaseId !== null
    ) {
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
          where wiki_pages.knowledge_base_id = ${knowledgeScope.upstreamKnowledgeBaseId}
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
          where wiki_edges.knowledge_base_id = ${knowledgeScope.upstreamKnowledgeBaseId}
            and wiki_edges.owner_knowledge_base_id is null
            and wiki_edges.fork_tombstoned_at is null
            and exists (select 1 from visible_pages where visible_pages.id = wiki_edges.from_page_id)
            and exists (select 1 from visible_pages where visible_pages.id = wiki_edges.to_page_id)
            and not exists (
              select 1
              from fork_edge_tombstones
              where fork_edge_tombstones.upstream_resource_id = wiki_edges.id
            )
          union all
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

  private async readKnowledgeBaseScope(knowledgeBaseId: string): Promise<{
    knowledgeBaseType: "canonical" | "fork";
    upstreamKnowledgeBaseId: string | null;
  }> {
    const result = await sql<{
      knowledge_base_type: string | null;
      upstream_knowledge_base_id: string | null;
    }>`
      select knowledge_base_type, upstream_knowledge_base_id
      from knowledge_bases
      where id = ${knowledgeBaseId}
        and deleted_at is null
        and status <> 'deleted'
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error(`Knowledge Base not found for reindex: ${knowledgeBaseId}`);
    }

    return {
      knowledgeBaseType: row.knowledge_base_type === "fork" ? "fork" : "canonical",
      upstreamKnowledgeBaseId: row.upstream_knowledge_base_id,
    };
  }

  private async updateJobRunning(
    payload: ReindexPayload,
    inputSnapshotId: string,
    input: {
      operationId: string;
      processedCount: number;
      totalPages: number;
    },
  ): Promise<void> {
    await this.options.jobProgress.updateJobProgress({
      inputSnapshotId,
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      message: "Rebuilding retrieval index.",
      metadata: {
        operation_id: input.operationId,
        processed_count: input.processedCount,
        total_pages: input.totalPages,
      },
      progress: calculateProgress(input.processedCount, input.totalPages),
      stage: "indexing",
      status: "running",
    });
  }

  private async updateJobCompleted(
    payload: ReindexPayload,
    inputSnapshotId: string,
    input: {
      indexedEdgeCount: number;
      indexedEmbeddingCount: number;
      indexedPageCount: number;
      operationId: string;
    },
  ): Promise<void> {
    await this.options.jobProgress.updateJobProgress({
      inputSnapshotId,
      jobId: payload.job_id,
      knowledgeBaseId: payload.knowledge_base_id,
      message: "Retrieval index rebuilt.",
      metadata: {
        indexed_edge_count: input.indexedEdgeCount,
        indexed_embedding_count: input.indexedEmbeddingCount,
        indexed_page_count: input.indexedPageCount,
        operation_id: input.operationId,
      },
      progress: 100,
      stage: "indexing",
      status: "completed",
    });
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }
}

export class BullMqReindexWorker {
  private readonly worker: Worker<ReindexPayload>;

  constructor(config: RuntimeConfig, processor: PostgresReindexProcessor) {
    this.worker = new Worker<ReindexPayload>(
      reindexQueueName,
      createReindexJobProcessor(processor),
      {
        concurrency: config.limits.backgroundJobs.reindex.concurrency,
        connection: {
          url: config.redis.url,
        },
      },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createPostgresReindexProcessor(input: {
  checkpointRepository: BackgroundOperationCheckpointRepository;
  config: RuntimeConfig;
  db: Kysely<DatabaseSchema>;
  jobGuard: WorkerJobStateGuard;
  jobProgress: WorkerJobProgressWriter;
}): PostgresReindexProcessor {
  return new PostgresReindexProcessor(
    input.db,
    {
      batchSize: input.config.limits.backgroundJobs.reindex.batchSize,
      checkpointRepository: input.checkpointRepository,
      jobGuard: input.jobGuard,
      jobProgress: input.jobProgress,
      writeBatchSize: input.config.limits.backgroundJobs.reindex.batchSize,
    },
    createOpenAICompatibleRetrievalEmbeddingProvider(input.config.models.embedding),
  );
}

export function createReindexJobProcessor(
  processor: PostgresReindexProcessor,
): (job: ReindexQueueJob) => Promise<ReindexProcessorResult> {
  return async (job) => {
    if (job.name !== reindexJobName) {
      throw new Error(`Unsupported retrieval.reindex job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

function createStableReindexOperationId(payload: ReindexPayload): string {
  const digest = createHash("sha256")
    .update(`${payload.knowledge_base_id}:${payload.job_id}`)
    .digest("hex")
    .slice(0, 32);

  return `${backgroundOperationIdPrefix}reindex_${digest}`;
}

function buildStablePageBatch(
  rows: readonly ReindexVisiblePageRow[],
  limit: number,
): {
  items: ReindexVisiblePageRow[];
  nextCursor: StableIdTimeCursor | null;
} {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last !== undefined
        ? createStableIdTimeCursor({
            id: last.id,
            timestamp: last.updated_at,
          })
        : null,
  };
}

function toRetrievalPageRecord(row: ReindexVisiblePageRow): RetrievalPageRecord {
  const sourceDocumentIds = normalizeStringArray(row.source_document_ids);
  const page: RetrievalPageRecord = {
    knowledge_base_id: row.knowledge_base_id,
    page_id: row.id,
    page_version_id: row.current_version_id ?? row.id,
    title: row.title,
    type: row.type,
    markdown: row.markdown,
    frontmatter: normalizeJsonObject(row.frontmatter),
    is_system_page: false,
    system_page_key: null,
    source_refs: normalizePageSourceRefs(row.source_refs, sourceDocumentIds),
    metadata: normalizeJsonObject(row.metadata),
    visibility_origin: readVisibilityOrigin(row.visibility_origin),
    owner_knowledge_base_id: row.owner_knowledge_base_id,
    upstream_resource_id: row.upstream_resource_id,
    fork_tombstoned_at: row.fork_tombstoned_at,
  };

  return page;
}

function normalizePageSourceRefs(
  value: unknown,
  sourceDocumentIds: readonly string[],
): RetrievalSourceRef[] {
  const sourceRefs = normalizeRecordArray(value).flatMap(toRetrievalSourceRef);

  return sourceRefs.length > 0
    ? sourceRefs
    : sourceDocumentIds.map((documentId) => ({
        document_id: documentId,
      }));
}

function toRetrievalSourceRef(value: Record<string, unknown>): RetrievalSourceRef[] {
  const documentId = readString(value.document_id);

  if (documentId === null) {
    return [];
  }

  return [
    {
      document_id: documentId,
      ...(readString(value.parsed_content_id) === null
        ? {}
        : { parsed_content_id: readString(value.parsed_content_id) as string }),
      ...(readString(value.source_anchor_id) === null
        ? {}
        : { source_anchor_id: readString(value.source_anchor_id) as string }),
      ...(readString(value.name) === null ? {} : { name: readString(value.name) as string }),
      ...(readString(value.locator) === null
        ? {}
        : { locator: readString(value.locator) as string }),
      ...(readString(value.summary) === null
        ? {}
        : { summary: readString(value.summary) as string }),
      ...(readString(value.virtual_path) === null
        ? {}
        : { virtual_path: readString(value.virtual_path) as string }),
      ...(readString(value.media_asset_id) === null
        ? {}
        : { media_asset_id: readString(value.media_asset_id) as string }),
    },
  ];
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

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readVisibilityOrigin(value: unknown): RetrievalVisibilityOrigin {
  if (value === "upstream_inherited" || value === "fork_owned") {
    return value;
  }

  return "canonical";
}

function readSqlCount(value: string | number | bigint | null | undefined): number {
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

function readIndexedEmbeddingCount(value: Record<string, unknown>): number {
  const count = value.indexed_embedding_count;

  return typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function calculateProgress(processedCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 95;
  }

  return Math.min(
    95,
    reindexRunningBaseProgress +
      Math.floor((Math.max(0, processedCount) / totalCount) * reindexProgressSpan),
  );
}

function formatPgVector(vector: readonly number[]): string {
  return `[${vector.map((value) => Number(value).toString()).join(",")}]`;
}
