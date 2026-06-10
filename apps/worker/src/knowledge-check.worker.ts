import { randomUUID } from "node:crypto";

import { Worker } from "bullmq";
import { sql, type Kysely } from "kysely";
import type { RuntimeConfig } from "@fococontext/core";
import type { DatabaseSchema } from "@fococontext/db";

import type { WorkerWebhookEventEmitter } from "./webhook-dispatch.worker.js";

export const knowledgeCheckQueueName = "knowledge.check";
export const knowledgeCheckJobName = "knowledge.check.run";

const knowledgeCheckBatchSize = 250;
const knowledgeCheckRunningBaseProgress = 5;
const knowledgeCheckProgressSpan = 90;
const graphCheckTypes = new Set<WorkerKnowledgeCheckType>([
  "orphan_pages",
  "sparse_communities",
  "bridge_pages",
  "missing_context",
]);
const semanticCheckTypes = new Set<WorkerKnowledgeCheckType>(["semantic_consistency"]);

const workerKnowledgeCheckTypes = [
  "orphan_pages",
  "broken_wikilinks",
  "missing_pages",
  "missing_sources",
  "duplicate_candidates",
  "contradiction_candidates",
  "sparse_communities",
  "bridge_pages",
  "weak_evidence",
  "missing_context",
  "semantic_consistency",
] as const;

type WorkerKnowledgeCheckType = (typeof workerKnowledgeCheckTypes)[number];
type WorkerKnowledgeCheckStatus = "queued" | "running" | "completed" | "failed";
type WorkerKnowledgeCheckSeverity = "low" | "medium" | "high";

export interface KnowledgeCheckPayload {
  check_id: string;
}

export interface WorkerKnowledgeCheckFinding {
  affected_object_ids?: string[];
  confidence?: number;
  evidence?: Record<string, unknown>[];
  finding_id?: string;
  type: WorkerKnowledgeCheckType;
  severity: WorkerKnowledgeCheckSeverity;
  page_id: string | null;
  message: string;
  source_refs?: Record<string, unknown>[];
  suggested_action?: Record<string, unknown>;
}

export interface WorkerKnowledgeCheckSemanticRun {
  failure_reason?: string;
  findings_count: number;
  repair_attempts: number;
  status: "skipped" | "completed" | "partial" | "failed";
  trace?: Record<string, unknown>;
}

export interface WorkerKnowledgeCheckRecord {
  id: string;
  knowledgeBaseId: string;
  status: WorkerKnowledgeCheckStatus;
  progress: number;
  checks: WorkerKnowledgeCheckType[];
  pageIds: string[];
  sourceDocumentIds: string[];
  findings: WorkerKnowledgeCheckFinding[];
  semanticRun: WorkerKnowledgeCheckSemanticRun;
  configurationSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerKnowledgeCheckPage {
  id: string;
  slug: string;
  title: string;
  type: string;
  markdown: string;
  metadata: Record<string, unknown>;
  sourceDocumentIds: string[];
  sourceRefs: Record<string, unknown>[];
  updatedAt: string;
}

export interface WorkerKnowledgeCheckPageCursor {
  id: string;
  updatedAt: string;
}

export interface WorkerKnowledgeCheckPageBatch {
  items: WorkerKnowledgeCheckPage[];
  nextCursor: WorkerKnowledgeCheckPageCursor | null;
}

export interface WorkerKnowledgeCheckRelatedSummary {
  pageId: string;
  outgoingCount: number;
  incomingCount: number;
  relationTypes: string[];
}

export interface ListKnowledgeCheckPagesInput {
  check: WorkerKnowledgeCheckRecord;
  cursor: WorkerKnowledgeCheckPageCursor | null;
  limit: number;
}

export interface KnowledgeCheckStore {
  findCheckById(checkId: string): Promise<WorkerKnowledgeCheckRecord | undefined>;
  markCheckRunning(input: {
    check: WorkerKnowledgeCheckRecord;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord>;
  updateCheckProgress(input: {
    check: WorkerKnowledgeCheckRecord;
    findings: readonly WorkerKnowledgeCheckFinding[];
    progress: number;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord>;
  markCheckCompleted(input: {
    check: WorkerKnowledgeCheckRecord;
    findings: readonly WorkerKnowledgeCheckFinding[];
    semanticRun: WorkerKnowledgeCheckSemanticRun;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord>;
  markCheckFailed(input: {
    check: WorkerKnowledgeCheckRecord;
    error: unknown;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord>;
  countTargetPages(check: WorkerKnowledgeCheckRecord): Promise<number>;
  listTargetPages(input: ListKnowledgeCheckPagesInput): Promise<WorkerKnowledgeCheckPageBatch>;
  listExistingPageKeys(
    knowledgeBaseId: string,
    normalizedKeys: readonly string[],
  ): Promise<Set<string>>;
  listRelatedSummaries(
    knowledgeBaseId: string,
    pageIds: readonly string[],
  ): Promise<Map<string, WorkerKnowledgeCheckRelatedSummary>>;
  listDuplicateTitleFindings(
    check: WorkerKnowledgeCheckRecord,
  ): Promise<WorkerKnowledgeCheckFinding[]>;
}

export class BullMqKnowledgeCheckWorker {
  private readonly worker: Worker<KnowledgeCheckPayload>;

  constructor(config: RuntimeConfig, processor: KnowledgeCheckProcessor) {
    this.worker = new Worker<KnowledgeCheckPayload>(
      knowledgeCheckQueueName,
      async (job) => processor.process(job.data),
      createKnowledgeCheckWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createKnowledgeCheckWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: 1,
    connection: {
      url: config.redis.url,
    },
  };
}

export class KnowledgeCheckProcessor {
  constructor(
    private readonly store: KnowledgeCheckStore,
    private readonly options: {
      batchSize?: number;
      now?: () => Date;
      webhookEvents?: WorkerWebhookEventEmitter;
    } = {},
  ) {}

  async process(payload: KnowledgeCheckPayload): Promise<WorkerKnowledgeCheckRecord> {
    const initial = await this.store.findCheckById(payload.check_id);

    if (initial === undefined) {
      throw new Error(`Knowledge Check not found: ${payload.check_id}`);
    }
    if (initial.status === "completed") {
      return initial;
    }

    const running = await this.store.markCheckRunning({
      check: initial,
      now: this.now(),
    });

    try {
      const total = await this.store.countTargetPages(running);
      const findings: WorkerKnowledgeCheckFinding[] = [
        ...(running.checks.includes("duplicate_candidates")
          ? await this.store.listDuplicateTitleFindings(running)
          : []),
      ];
      let processed = 0;
      let cursor: WorkerKnowledgeCheckPageCursor | null = null;

      do {
        const batch = await this.store.listTargetPages({
          check: running,
          cursor,
          limit: this.options.batchSize ?? knowledgeCheckBatchSize,
        });
        const relatedSummaries = needsGraphData(running.checks)
          ? await this.store.listRelatedSummaries(
              running.knowledgeBaseId,
              batch.items.map((page) => page.id),
            )
          : new Map<string, WorkerKnowledgeCheckRelatedSummary>();
        const existingPageKeys = running.checks.includes("broken_wikilinks")
          ? await this.store.listExistingPageKeys(
              running.knowledgeBaseId,
              collectWikilinkKeys(batch.items),
            )
          : new Set<string>();

        findings.push(
          ...createStructuralFindings({
            checks: running.checks,
            existingPageKeys,
            pages: batch.items,
            relatedSummaries,
          }),
        );
        processed += batch.items.length;

        await this.store.updateCheckProgress({
          check: running,
          findings,
          now: this.now(),
          progress: calculateProgress(processed, total),
        });

        cursor = batch.nextCursor;
      } while (cursor !== null);

      const completed = await this.store.markCheckCompleted({
        check: running,
        findings,
        now: this.now(),
        semanticRun: createWorkerSemanticRun(running.checks, findings.length),
      });

      await this.options.webhookEvents?.emit({
        eventType: "knowledge_check.completed",
        knowledgeBaseId: completed.knowledgeBaseId,
        payload: {
          check_id: completed.id,
          finding_count: completed.findings.length,
          semantic_status: completed.semanticRun.status,
          status: completed.status,
        },
        requestTrace: {
          event_source: "knowledge_check.worker",
        },
      });

      return completed;
    } catch (error) {
      await this.store.markCheckFailed({
        check: running,
        error,
        now: this.now(),
      });
      throw error;
    }
  }

  private now(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }
}

export class PostgresKnowledgeCheckStore implements KnowledgeCheckStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async findCheckById(checkId: string): Promise<WorkerKnowledgeCheckRecord | undefined> {
    const result = await sql<KnowledgeCheckRow>`
      select id, knowledge_base_id, status, progress, findings, metadata, created_at, updated_at
      from knowledge_checks
      where id = ${checkId}
      limit 1
    `.execute(this.db);
    const row = result.rows[0];

    return row === undefined ? undefined : toWorkerKnowledgeCheckRecord(row);
  }

  async markCheckRunning(input: {
    check: WorkerKnowledgeCheckRecord;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord> {
    return this.saveCheck({
      ...input.check,
      status: "running",
      progress: Math.max(input.check.progress, knowledgeCheckRunningBaseProgress),
      updatedAt: input.now,
    });
  }

  async updateCheckProgress(input: {
    check: WorkerKnowledgeCheckRecord;
    findings: readonly WorkerKnowledgeCheckFinding[];
    progress: number;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord> {
    return this.saveCheck({
      ...input.check,
      status: "running",
      progress: input.progress,
      findings: [...input.findings],
      updatedAt: input.now,
    });
  }

  async markCheckCompleted(input: {
    check: WorkerKnowledgeCheckRecord;
    findings: readonly WorkerKnowledgeCheckFinding[];
    semanticRun: WorkerKnowledgeCheckSemanticRun;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord> {
    return this.saveCheck({
      ...input.check,
      status: "completed",
      progress: 100,
      findings: [...input.findings],
      semanticRun: input.semanticRun,
      updatedAt: input.now,
    });
  }

  async markCheckFailed(input: {
    check: WorkerKnowledgeCheckRecord;
    error: unknown;
    now: string;
  }): Promise<WorkerKnowledgeCheckRecord> {
    return this.saveCheck({
      ...input.check,
      status: "failed",
      progress: 100,
      semanticRun: {
        findings_count: 0,
        repair_attempts: 0,
        status: "failed",
        failure_reason: summarizeWorkerError(input.error),
        trace: {
          worker_status: "failed",
        },
      },
      updatedAt: input.now,
    });
  }

  async countTargetPages(check: WorkerKnowledgeCheckRecord): Promise<number> {
    const result = await sql<{ total: string | number | bigint }>`
      with visible_pages as (
        ${createVisiblePagesSql(check.knowledgeBaseId)}
      )
      select count(*) as total
      from visible_pages
      where ${createTargetPagePredicate(check)}
    `.execute(this.db);

    return readCount(result.rows[0]?.total);
  }

  async listTargetPages(
    input: ListKnowledgeCheckPagesInput,
  ): Promise<WorkerKnowledgeCheckPageBatch> {
    const limit = Math.max(1, input.limit);
    const cursor = input.cursor;
    const cursorPredicate =
      cursor === null
        ? sql`true`
        : sql`(
            updated_at < ${cursor.updatedAt}::timestamptz
            or (updated_at = ${cursor.updatedAt}::timestamptz and id < ${cursor.id})
          )`;
    const result = await sql<KnowledgeCheckPageRow>`
      with visible_pages as (
        ${createVisiblePagesSql(input.check.knowledgeBaseId)}
      )
      select *
      from visible_pages
      where ${createTargetPagePredicate(input.check)}
        and ${cursorPredicate}
      order by updated_at desc, id desc
      limit ${limit + 1}
    `.execute(this.db);
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);

    return {
      items: rows.map(toWorkerKnowledgeCheckPage),
      nextCursor:
        result.rows.length > limit && last !== undefined
          ? {
              id: last.id,
              updatedAt: normalizeTimestamp(last.updated_at),
            }
          : null,
    };
  }

  async listExistingPageKeys(
    knowledgeBaseId: string,
    normalizedKeys: readonly string[],
  ): Promise<Set<string>> {
    if (normalizedKeys.length === 0) {
      return new Set();
    }
    const keys = [...new Set(normalizedKeys)];
    const result = await sql<{ key: string }>`
      with visible_pages as (
        ${createVisiblePagesSql(knowledgeBaseId)}
      ),
      page_keys as (
        select lower(id) as key from visible_pages
        union
        select lower(slug) as key from visible_pages
        union
        select regexp_replace(lower(title), '\s+', '-', 'g') as key from visible_pages
      )
      select key
      from page_keys
      where key = any(${keys}::text[])
    `.execute(this.db);

    return new Set(result.rows.map((row) => row.key));
  }

  async listRelatedSummaries(
    knowledgeBaseId: string,
    pageIds: readonly string[],
  ): Promise<Map<string, WorkerKnowledgeCheckRelatedSummary>> {
    const summaries = new Map<string, WorkerKnowledgeCheckRelatedSummary>();

    for (const pageId of pageIds) {
      summaries.set(pageId, {
        incomingCount: 0,
        outgoingCount: 0,
        pageId,
        relationTypes: [],
      });
    }
    if (pageIds.length === 0) {
      return summaries;
    }

    const result = await sql<{
      page_id: string;
      outgoing_count: string | number | bigint;
      incoming_count: string | number | bigint;
      relation_types: string[] | null;
    }>`
      with target_pages as (
        select unnest(${pageIds}::text[]) as page_id
      ),
      outgoing_edges as (
        select from_page_id as page_id, count(*) as outgoing_count, array_agg(distinct relation_type) as relation_types
        from wiki_edges
        where knowledge_base_id = ${knowledgeBaseId}
          and fork_tombstoned_at is null
          and from_page_id = any(${pageIds}::text[])
        group by from_page_id
      ),
      incoming_edges as (
        select to_page_id as page_id, count(*) as incoming_count
        from wiki_edges
        where knowledge_base_id = ${knowledgeBaseId}
          and fork_tombstoned_at is null
          and to_page_id = any(${pageIds}::text[])
        group by to_page_id
      )
      select
        target_pages.page_id,
        coalesce(outgoing_edges.outgoing_count, 0) as outgoing_count,
        coalesce(incoming_edges.incoming_count, 0) as incoming_count,
        coalesce(outgoing_edges.relation_types, '{}'::text[]) as relation_types
      from target_pages
      left join outgoing_edges on outgoing_edges.page_id = target_pages.page_id
      left join incoming_edges on incoming_edges.page_id = target_pages.page_id
    `.execute(this.db);

    for (const row of result.rows) {
      summaries.set(row.page_id, {
        incomingCount: readCount(row.incoming_count),
        outgoingCount: readCount(row.outgoing_count),
        pageId: row.page_id,
        relationTypes: Array.isArray(row.relation_types) ? row.relation_types : [],
      });
    }

    return summaries;
  }

  async listDuplicateTitleFindings(
    check: WorkerKnowledgeCheckRecord,
  ): Promise<WorkerKnowledgeCheckFinding[]> {
    const result = await sql<{
      page_id: string;
      title: string;
      duplicate_ids: string[];
      duplicate_titles: string[];
    }>`
      with visible_pages as (
        ${createVisiblePagesSql(check.knowledgeBaseId)}
      ),
      target_pages as (
        select *
        from visible_pages
        where ${createTargetPagePredicate(check)}
      ),
      duplicate_groups as (
        select regexp_replace(lower(title), '\s+', '-', 'g') as title_key
        from target_pages
        group by regexp_replace(lower(title), '\s+', '-', 'g')
        having count(*) > 1
      )
      select
        target_pages.id as page_id,
        target_pages.title,
        array_agg(candidate.id order by candidate.title asc, candidate.id asc) as duplicate_ids,
        array_agg(candidate.title order by candidate.title asc, candidate.id asc) as duplicate_titles
      from target_pages
      join duplicate_groups
        on duplicate_groups.title_key = regexp_replace(lower(target_pages.title), '\s+', '-', 'g')
      join target_pages candidate
        on regexp_replace(lower(candidate.title), '\s+', '-', 'g') = duplicate_groups.title_key
      group by target_pages.id, target_pages.title
    `.execute(this.db);

    return result.rows.map((row) =>
      createFinding({
        type: "duplicate_candidates",
        severity: "medium",
        page_id: row.page_id,
        message: "api.knowledge_check.finding.duplicate_title",
        evidence: row.duplicate_ids.map((id, index) => ({
          object_type: "wiki_page",
          object_id: id,
          title: row.duplicate_titles[index] ?? id,
        })),
        suggested_action: {
          action: "merge_or_mark_not_duplicate",
        },
      }),
    );
  }

  private async saveCheck(record: WorkerKnowledgeCheckRecord): Promise<WorkerKnowledgeCheckRecord> {
    await sql`
      update knowledge_checks
      set
        status = ${record.status},
        progress = ${record.progress},
        findings = ${JSON.stringify(record.findings)}::jsonb,
        metadata = ${JSON.stringify({
          checks: record.checks,
          configuration_snapshot: record.configurationSnapshot,
          page_ids: record.pageIds,
          source_document_ids: record.sourceDocumentIds,
          semantic_run: record.semanticRun,
        })}::jsonb,
        updated_at = ${record.updatedAt}
      where id = ${record.id}
    `.execute(this.db);

    return record;
  }
}

interface StructuralFindingsInput {
  checks: readonly WorkerKnowledgeCheckType[];
  existingPageKeys: ReadonlySet<string>;
  pages: readonly WorkerKnowledgeCheckPage[];
  relatedSummaries: ReadonlyMap<string, WorkerKnowledgeCheckRelatedSummary>;
}

function createStructuralFindings(input: StructuralFindingsInput): WorkerKnowledgeCheckFinding[] {
  const findings: WorkerKnowledgeCheckFinding[] = [];

  for (const page of input.pages) {
    const related = input.relatedSummaries.get(page.id);
    const outgoingCount = related?.outgoingCount ?? 0;
    const incomingCount = related?.incomingCount ?? 0;

    if (input.checks.includes("missing_sources") && page.sourceDocumentIds.length === 0) {
      findings.push(
        createFinding({
          type: "missing_sources",
          severity: "medium",
          page_id: page.id,
          message: "api.knowledge_check.finding.missing_source_evidence",
          evidence: [{ object_type: "wiki_page", object_id: page.id }],
          suggested_action: { action: "add_source_evidence" },
        }),
      );
    }
    if (input.checks.includes("weak_evidence") && page.sourceDocumentIds.length > 0) {
      if (page.sourceRefs.length === 0) {
        findings.push(
          createFinding({
            type: "weak_evidence",
            severity: "medium",
            page_id: page.id,
            message: "api.knowledge_check.finding.weak_evidence",
            evidence: [
              {
                object_type: "wiki_page",
                object_id: page.id,
                reason: "document_level_source_only",
                source_document_ids: [...page.sourceDocumentIds],
              },
            ],
            suggested_action: { action: "add_locator_level_source_refs" },
          }),
        );
      }
    }
    if (input.checks.includes("broken_wikilinks")) {
      for (const target of extractWikilinks(page.markdown)) {
        if (!input.existingPageKeys.has(normalizePageKey(target))) {
          findings.push(
            createFinding({
              type: "broken_wikilinks",
              severity: "medium",
              page_id: page.id,
              message: "api.knowledge_check.finding.broken_wikilink",
              evidence: [
                {
                  object_type: "wikilink",
                  source_page_id: page.id,
                  target_title: target,
                },
              ],
              suggested_action: { action: "create_missing_page_or_remove_link" },
            }),
          );
        }
      }
    }
    if (input.checks.includes("missing_pages")) {
      for (const target of readStringArray(page.metadata.missing_pages)) {
        if (!input.existingPageKeys.has(normalizePageKey(target))) {
          findings.push(
            createFinding({
              type: "missing_pages",
              severity: "medium",
              page_id: page.id,
              message: "api.knowledge_check.finding.missing_page",
              evidence: [
                {
                  object_type: "missing_page_candidate",
                  source_page_id: page.id,
                  target_title: target,
                },
              ],
              suggested_action: { action: "create_missing_page_or_mark_not_needed" },
            }),
          );
        }
      }
    }
    if (input.checks.includes("contradiction_candidates")) {
      for (const candidate of readStringArray(page.metadata.contradiction_candidates)) {
        findings.push(
          createFinding({
            type: "contradiction_candidates",
            severity: "high",
            page_id: page.id,
            message: "api.knowledge_check.finding.contradiction_candidate",
            evidence: [
              {
                object_type: "wiki_page",
                object_id: page.id,
                candidate,
              },
            ],
            suggested_action: { action: "add_source_evidence" },
          }),
        );
      }
    }
    if (input.checks.includes("orphan_pages") && outgoingCount === 0 && incomingCount === 0) {
      findings.push(
        createFinding({
          type: "orphan_pages",
          severity: "low",
          page_id: page.id,
          message: "api.knowledge_check.finding.orphan_page",
          evidence: [{ object_type: "wiki_page", object_id: page.id, graph_degree: 0 }],
          suggested_action: { action: "link_or_confirm_isolated_page" },
        }),
      );
    }
    if (input.checks.includes("sparse_communities") && outgoingCount + incomingCount === 0) {
      findings.push(
        createFinding({
          type: "sparse_communities",
          severity: "low",
          page_id: page.id,
          message: "api.knowledge_check.finding.sparse_community",
          evidence: [
            {
              object_type: "graph_scope",
              page_id: page.id,
              relationship_count: 0,
            },
          ],
          suggested_action: { action: "inspect_graph_neighbors" },
        }),
      );
    }
    if (input.checks.includes("bridge_pages") && (related?.relationTypes.length ?? 0) > 1) {
      findings.push(
        createFinding({
          type: "bridge_pages",
          severity: "low",
          page_id: page.id,
          message: "api.knowledge_check.finding.bridge_page",
          evidence: [
            {
              object_type: "graph_scope",
              page_id: page.id,
              relationship_types: related?.relationTypes ?? [],
            },
          ],
          suggested_action: { action: "inspect_bridge_page" },
        }),
      );
    }
    if (
      input.checks.includes("missing_context") &&
      page.markdown.trim().length < 80 &&
      outgoingCount === 0 &&
      incomingCount === 0
    ) {
      findings.push(
        createFinding({
          type: "missing_context",
          severity: "low",
          page_id: page.id,
          message: "api.knowledge_check.finding.missing_context",
          evidence: [
            {
              object_type: "wiki_page",
              object_id: page.id,
              graph_degree: 0,
              markdown_length: page.markdown.trim().length,
            },
          ],
          suggested_action: { action: "expand_context_or_link_related_pages" },
        }),
      );
    }
  }

  return findings;
}

function createWorkerSemanticRun(
  checks: readonly WorkerKnowledgeCheckType[],
  findingsCount: number,
): WorkerKnowledgeCheckSemanticRun {
  if (!checks.some((check) => semanticCheckTypes.has(check))) {
    return {
      findings_count: 0,
      repair_attempts: 0,
      status: "skipped",
    };
  }

  return {
    findings_count: 0,
    repair_attempts: 0,
    status: "partial",
    failure_reason: "Large-scope semantic model checks require a bounded semantic batch runner.",
    trace: {
      structural_findings_count: findingsCount,
      semantic_batching: "deferred",
      worker_status: "completed_with_structural_findings",
    },
  };
}

function calculateProgress(processed: number, total: number): number {
  if (total <= 0) {
    return knowledgeCheckRunningBaseProgress + knowledgeCheckProgressSpan;
  }

  const ratio = Math.min(1, processed / total);

  return Math.min(
    99,
    knowledgeCheckRunningBaseProgress + Math.floor(ratio * knowledgeCheckProgressSpan),
  );
}

function needsGraphData(checks: readonly WorkerKnowledgeCheckType[]): boolean {
  return checks.some((check) => graphCheckTypes.has(check));
}

function collectWikilinkKeys(pages: readonly WorkerKnowledgeCheckPage[]): string[] {
  return [
    ...new Set(
      pages.flatMap((page) => [
        ...extractWikilinks(page.markdown),
        ...readStringArray(page.metadata.missing_pages),
      ]),
    ),
  ].map(normalizePageKey);
}

function extractWikilinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function normalizePageKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, "-");
}

function createFinding(input: WorkerKnowledgeCheckFinding): WorkerKnowledgeCheckFinding {
  return {
    ...input,
    affected_object_ids:
      input.affected_object_ids ?? (input.page_id === null ? [] : [input.page_id]),
    evidence: input.evidence ?? [{ ...input }],
    finding_id: input.finding_id ?? `finding_${randomUUID().replaceAll("-", "")}`,
    source_refs: input.source_refs ?? [],
    suggested_action: input.suggested_action ?? { action: "inspect_finding" },
  };
}

interface KnowledgeCheckRow {
  id: string;
  knowledge_base_id: string;
  status: string;
  progress: number;
  findings: unknown;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

interface KnowledgeCheckPageRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  markdown: string;
  source_document_ids: string[];
  source_refs: unknown;
  metadata: unknown;
  updated_at: string | Date;
}

function toWorkerKnowledgeCheckRecord(row: KnowledgeCheckRow): WorkerKnowledgeCheckRecord {
  const metadata = normalizeRecord(row.metadata);

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    status: readKnowledgeCheckStatus(row.status),
    progress: row.progress,
    checks: readKnowledgeCheckArray(metadata.checks),
    pageIds: readStringArray(metadata.page_ids),
    sourceDocumentIds: readStringArray(metadata.source_document_ids),
    findings: readRecordArray(row.findings) as unknown as WorkerKnowledgeCheckFinding[],
    semanticRun: readSemanticRun(metadata.semantic_run),
    configurationSnapshot: normalizeRecord(metadata.configuration_snapshot),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function toWorkerKnowledgeCheckPage(row: KnowledgeCheckPageRow): WorkerKnowledgeCheckPage {
  return {
    id: row.id,
    markdown: row.markdown,
    metadata: normalizeRecord(row.metadata),
    slug: row.slug,
    sourceDocumentIds: Array.isArray(row.source_document_ids) ? row.source_document_ids : [],
    sourceRefs: readRecordArray(row.source_refs),
    title: row.title,
    type: row.type,
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function readKnowledgeCheckStatus(value: string): WorkerKnowledgeCheckStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed"
    ? value
    : "failed";
}

function readKnowledgeCheckArray(value: unknown): WorkerKnowledgeCheckType[] {
  return readStringArray(value).filter((check): check is WorkerKnowledgeCheckType =>
    workerKnowledgeCheckTypes.includes(check as WorkerKnowledgeCheckType),
  );
}

function readSemanticRun(value: unknown): WorkerKnowledgeCheckSemanticRun {
  const record = normalizeRecord(value);
  const status = record.status;

  return {
    findings_count: readNumber(record.findings_count),
    repair_attempts: readNumber(record.repair_attempts),
    status:
      status === "skipped" || status === "completed" || status === "partial" || status === "failed"
        ? status
        : "skipped",
    ...(typeof record.failure_reason === "string" ? { failure_reason: record.failure_reason } : {}),
    ...(typeof record.trace === "object" && record.trace !== null && !Array.isArray(record.trace)
      ? { trace: record.trace as Record<string, unknown> }
      : {}),
  };
}

function createTargetPagePredicate(check: WorkerKnowledgeCheckRecord) {
  const pageIds = check.pageIds;
  const sourceDocumentIds = check.sourceDocumentIds;

  return sql`
    (cardinality(${pageIds}::text[]) = 0 or id = any(${pageIds}::text[]))
    and (
      cardinality(${sourceDocumentIds}::text[]) = 0
      or source_document_ids && ${sourceDocumentIds}::text[]
    )
  `;
}

function createVisiblePagesSql(knowledgeBaseId: string) {
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
      wiki_pages.slug,
      wiki_pages.title,
      wiki_pages.page_type as "type",
      wiki_pages.markdown,
      wiki_pages.source_document_ids,
      coalesce(wiki_page_versions.source_snapshot, '[]'::jsonb) as source_refs,
      wiki_pages.metadata,
      wiki_pages.updated_at
    from wiki_pages
    left join wiki_page_versions on wiki_page_versions.id = wiki_pages.current_version_id
    cross join kb_scope
    where kb_scope.knowledge_base_type <> 'fork'
      and wiki_pages.knowledge_base_id = ${knowledgeBaseId}
      and wiki_pages.owner_knowledge_base_id is null
      and wiki_pages.deleted_at is null
      and wiki_pages.fork_tombstoned_at is null
    union all
    select
      wiki_pages.id,
      wiki_pages.slug,
      wiki_pages.title,
      wiki_pages.page_type as "type",
      wiki_pages.markdown,
      wiki_pages.source_document_ids,
      coalesce(wiki_page_versions.source_snapshot, '[]'::jsonb) as source_refs,
      wiki_pages.metadata,
      wiki_pages.updated_at
    from wiki_pages
    left join wiki_page_versions on wiki_page_versions.id = wiki_pages.current_version_id
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
      wiki_pages.slug,
      wiki_pages.title,
      wiki_pages.page_type as "type",
      wiki_pages.markdown,
      wiki_pages.source_document_ids,
      coalesce(wiki_page_versions.source_snapshot, '[]'::jsonb) as source_refs,
      wiki_pages.metadata,
      wiki_pages.updated_at
    from wiki_pages
    left join wiki_page_versions on wiki_page_versions.id = wiki_pages.current_version_id
    cross join kb_scope
    where kb_scope.knowledge_base_type = 'fork'
      and wiki_pages.knowledge_base_id = ${knowledgeBaseId}
      and wiki_pages.owner_knowledge_base_id = ${knowledgeBaseId}
      and wiki_pages.deleted_at is null
      and wiki_pages.fork_tombstoned_at is null
  `;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readCount(value: string | number | bigint | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value ?? "0", 10) || 0;
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function summarizeWorkerError(error: unknown): string {
  return error instanceof Error ? error.message : "Knowledge Check worker failed.";
}
