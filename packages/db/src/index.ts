import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Kysely, PostgresDialect, sql } from "kysely";
import {
  type Migration,
  type MigrationProvider,
  Migrator,
  type MigrationResultSet,
} from "kysely/migration";
import { Pool } from "pg";

export * from "./tenant-project-scope.js";
export { sql };

export const expectedSchemaTables = [
  "tenants",
  "accounts",
  "projects",
  "api_keys",
  "knowledge_bases",
  "knowledge_base_settings",
  "knowledge_base_dataset_configurations",
  "knowledge_base_dataset_configuration_snapshots",
  "source_documents",
  "upload_sessions",
  "parsed_contents",
  "media_assets",
  "ocr_page_statuses",
  "ocr_blocks",
  "ocr_artifacts",
  "media_caption_cache",
  "jobs",
  "job_events",
  "model_calls",
  "wiki_pages",
  "wiki_page_versions",
  "system_pages",
  "wiki_edges",
  "wiki_edge_sources",
  "wiki_analysis_results",
  "wiki_draft_candidates",
  "compile_stage_executions",
  "knowledge_versions",
  "change_sets",
  "change_set_items",
  "rollback_records",
  "page_merge_records",
  "knowledge_checks",
  "duplicate_decisions",
  "delete_impact_previews",
  "source_watch_rules",
  "scheduled_import_jobs",
  "import_previews",
  "webhooks",
  "webhook_deliveries",
  "page_embeddings",
  "retrieval_traces",
  "deletion_cleanup_operations",
  "deletion_cleanup_items",
] as const;

export interface DatabaseSchema {
  [tableName: string]: unknown;
}

export interface SqlMigration {
  name: string;
  upSql: string;
  downSql: string;
}

export interface MigrationLogOptions {
  logger?: Pick<Console, "info">;
  serviceName?: string;
}

export type DefaultIdentityScope = "tenant" | "account" | "project";

export interface DefaultTenantSeed {
  id: string;
  name: string;
  slug: string;
}

export interface DefaultAccountSeed {
  id: string;
  tenantId: string;
  username: string;
  displayName: string;
  role: "admin";
}

export interface DefaultProjectSeed {
  id: string;
  tenantId: string;
  ownerAccountId: string;
  name: string;
  slug: string;
}

export interface DefaultIdentitySeed {
  tenant: DefaultTenantSeed;
  account: DefaultAccountSeed;
  project: DefaultProjectSeed;
}

export interface DefaultIdentitySeedInput {
  adminUsername: string;
  idFactory?: (scope: DefaultIdentityScope) => string;
}

const internalIdentityIdPrefixes = {
  tenant: "tenant_",
  account: "account_",
  project: "project_",
} as const;

const defaultIdentityName = {
  tenant: "Default tenant",
  project: "Default project",
} as const;

const defaultIdentitySlug = "default";

const operationalListIndexSql = String.raw`
create index if not exists jobs_kb_visible_updated_idx
  on jobs(knowledge_base_id, updated_at desc, id desc)
  where coalesce(job_type, '') <> 'graph.insights.refresh';

create index if not exists jobs_kb_visible_status_updated_idx
  on jobs(knowledge_base_id, status, updated_at desc, id desc)
  where coalesce(job_type, '') <> 'graph.insights.refresh';

create index if not exists jobs_kb_visible_stage_updated_idx
  on jobs(knowledge_base_id, stage, updated_at desc, id desc)
  where coalesce(job_type, '') <> 'graph.insights.refresh';

create index if not exists jobs_kb_visible_queued_idx
  on jobs(knowledge_base_id, queued_at desc, id desc)
  where coalesce(job_type, '') <> 'graph.insights.refresh';

create index if not exists job_events_job_created_id_idx
  on job_events(job_id, created_at asc, id asc);

create index if not exists knowledge_bases_scope_active_updated_idx
  on knowledge_bases(tenant_id, project_id, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted';

create index if not exists knowledge_bases_scope_status_updated_idx
  on knowledge_bases(tenant_id, project_id, status, updated_at desc, id desc)
  where deleted_at is null;

create index if not exists knowledge_bases_scope_upstream_fork_updated_idx
  on knowledge_bases(tenant_id, project_id, upstream_knowledge_base_id, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted' and knowledge_base_type = 'fork';

create index if not exists source_documents_kb_visible_updated_idx
  on source_documents(knowledge_base_id, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted';

create index if not exists source_documents_kb_owner_visible_updated_idx
  on source_documents(knowledge_base_id, owner_knowledge_base_id, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted' and fork_tombstoned_at is null;

create index if not exists source_documents_kb_visible_status_updated_idx
  on source_documents(knowledge_base_id, status, updated_at desc, id desc)
  where deleted_at is null;

create index if not exists source_documents_kb_visible_type_updated_idx
  on source_documents(knowledge_base_id, source_type, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted';

create index if not exists source_documents_kb_source_path_updated_idx
  on source_documents(knowledge_base_id, lower((metadata->>'source_path')), updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted' and fork_tombstoned_at is null;

create index if not exists source_documents_kb_hash_updated_idx
  on source_documents(knowledge_base_id, content_hash, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted' and content_hash is not null;

create index if not exists parsed_contents_document_created_id_idx
  on parsed_contents(source_document_id, created_at desc, id desc)
  where fork_tombstoned_at is null;

create index if not exists media_assets_document_created_id_idx
  on media_assets(source_document_id, created_at desc, id desc)
  where fork_tombstoned_at is null;

create index if not exists wiki_pages_kb_visible_updated_idx
  on wiki_pages(knowledge_base_id, updated_at desc, id desc)
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_pages_owner_visible_updated_idx
  on wiki_pages(owner_knowledge_base_id, updated_at desc, id desc)
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_pages_kb_slug_visible_idx
  on wiki_pages(knowledge_base_id, slug, updated_at desc, id desc)
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_pages_kb_status_visible_updated_idx
  on wiki_pages(knowledge_base_id, status, updated_at desc, id desc)
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_pages_kb_type_visible_updated_idx
  on wiki_pages(knowledge_base_id, page_type, updated_at desc, id desc)
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_pages_kb_lexical_simple_idx
  on wiki_pages using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(slug, '') || ' ' ||
      coalesce(markdown, '') || ' ' ||
      coalesce(metadata::text, '')
    )
  )
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_pages_source_document_ids_gin_idx
  on wiki_pages using gin (source_document_ids)
  where deleted_at is null and fork_tombstoned_at is null;

create index if not exists wiki_page_versions_source_snapshot_lexical_simple_idx
  on wiki_page_versions using gin (
    to_tsvector('simple', coalesce(source_snapshot::text, ''))
  );

create index if not exists system_pages_kb_updated_idx
  on system_pages(knowledge_base_id, updated_at desc, id desc);

create index if not exists system_pages_kb_key_updated_idx
  on system_pages(knowledge_base_id, system_key, updated_at desc, id desc);

create index if not exists knowledge_versions_kb_created_idx
  on knowledge_versions(knowledge_base_id, created_at desc, id desc);

create index if not exists change_sets_kb_created_idx
  on change_sets(knowledge_base_id, created_at desc, id desc);

create index if not exists change_sets_kb_status_created_idx
  on change_sets(knowledge_base_id, status, created_at desc, id desc);

create index if not exists wiki_page_versions_page_created_idx
  on wiki_page_versions(page_id, created_at desc, id desc);

create index if not exists wiki_edges_kb_from_relation_updated_idx
  on wiki_edges(knowledge_base_id, from_page_id, relation_type, updated_at desc, id desc)
  where fork_tombstoned_at is null;

create index if not exists wiki_edges_kb_to_relation_updated_idx
  on wiki_edges(knowledge_base_id, to_page_id, relation_type, updated_at desc, id desc)
  where fork_tombstoned_at is null;

create index if not exists wiki_edges_kb_version_updated_idx
  on wiki_edges(knowledge_base_id, knowledge_version_id, updated_at desc, id desc)
  where fork_tombstoned_at is null and knowledge_version_id is not null;

create index if not exists wiki_edges_owner_from_relation_updated_idx
  on wiki_edges(owner_knowledge_base_id, from_page_id, relation_type, updated_at desc, id desc)
  where fork_tombstoned_at is null;

create index if not exists wiki_edge_sources_source_document_created_idx
  on wiki_edge_sources(source_document_id, created_at desc, id desc)
  where source_document_id is not null and fork_tombstoned_at is null;

create index if not exists page_embeddings_kb_model_dimensions_idx
  on page_embeddings(knowledge_base_id, model, dimensions, created_at desc, id desc)
  where embedding is not null and fork_tombstoned_at is null;

create index if not exists page_embeddings_owner_model_dimensions_idx
  on page_embeddings(owner_knowledge_base_id, model, dimensions, created_at desc, id desc)
  where embedding is not null and fork_tombstoned_at is null;

create index if not exists source_watch_rules_kb_updated_idx
  on source_watch_rules(knowledge_base_id, updated_at desc, id desc);

create index if not exists scheduled_import_jobs_rule_updated_idx
  on scheduled_import_jobs(source_watch_rule_id, updated_at desc, id desc);

create index if not exists scheduled_import_jobs_kb_updated_idx
  on scheduled_import_jobs(knowledge_base_id, updated_at desc, id desc);

create index if not exists webhooks_kb_updated_idx
  on webhooks(knowledge_base_id, updated_at desc, id desc);

create index if not exists webhook_deliveries_webhook_created_idx
  on webhook_deliveries(webhook_id, created_at desc, id desc);

create index if not exists deletion_cleanup_operations_scope_updated_idx
  on deletion_cleanup_operations(tenant_id, project_id, updated_at desc, id desc);

create index if not exists deletion_cleanup_operations_scope_kb_status_updated_idx
  on deletion_cleanup_operations(tenant_id, project_id, knowledge_base_id, status, updated_at desc, id desc);

create index if not exists deletion_cleanup_items_operation_created_idx
  on deletion_cleanup_items(operation_id, created_at asc, id asc);

create index if not exists deletion_cleanup_items_operation_retryable_type_idx
  on deletion_cleanup_items(operation_id, item_type, status, created_at asc, id asc)
  where status in ('pending', 'failed') and attempt_count < max_attempts;

create index if not exists knowledge_checks_kb_updated_idx
  on knowledge_checks(knowledge_base_id, updated_at desc, id desc);
`;

export function getDefaultMigrationDirectory(): string {
  return fileURLToPath(new URL("../migrations", import.meta.url));
}

export function getOrderedSqlMigrations(
  migrationDirectory = getDefaultMigrationDirectory(),
): SqlMigration[] {
  const upFiles = readdirSync(migrationDirectory)
    .filter((fileName) => fileName.endsWith(".up.sql"))
    .sort();

  return upFiles.map((upFileName) => {
    const name = upFileName.slice(0, -".up.sql".length);
    const downFileName = `${name}.down.sql`;
    const upPath = join(migrationDirectory, upFileName);
    const downPath = join(migrationDirectory, downFileName);

    if (!existsSync(downPath)) {
      throw new Error(`Missing down SQL migration for ${name}.`);
    }

    return {
      name,
      upSql: readFileSync(upPath, "utf8"),
      downSql: readFileSync(downPath, "utf8"),
    };
  });
}

export function createPostgresDatabase(databaseUrl: string): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
      }),
    }),
  });
}

export function createSqlMigrationProvider(
  migrations: readonly SqlMigration[] = getOrderedSqlMigrations(),
): MigrationProvider {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      return Object.fromEntries(
        migrations.map((migration) => [
          migration.name,
          {
            up: async (db) => {
              await sql.raw(migration.upSql).execute(db);
            },
            down: async (db) => {
              await sql.raw(migration.downSql).execute(db);
            },
          },
        ]),
      );
    },
  };
}

export function getOperationalListIndexSql(): string {
  return operationalListIndexSql;
}

export async function ensureOperationalListIndexes(
  db: Kysely<DatabaseSchema>,
  options: MigrationLogOptions = {},
): Promise<void> {
  await sql.raw(operationalListIndexSql).execute(db);
  options.logger?.info(formatOperationalIndexLogMessage(options.serviceName));
}

export function createInternalIdentityId(scope: DefaultIdentityScope): string {
  return `${internalIdentityIdPrefixes[scope]}${randomUUID().replaceAll("-", "")}`;
}

export function createDefaultIdentitySeed(input: DefaultIdentitySeedInput): DefaultIdentitySeed {
  const adminUsername = input.adminUsername.trim();

  if (adminUsername.length === 0) {
    throw new Error("Admin username is required to seed the default account.");
  }

  const idFactory = input.idFactory ?? createInternalIdentityId;
  const tenantId = idFactory("tenant");
  const accountId = idFactory("account");
  const projectId = idFactory("project");

  return {
    tenant: {
      id: tenantId,
      name: defaultIdentityName.tenant,
      slug: defaultIdentitySlug,
    },
    account: {
      id: accountId,
      tenantId,
      username: adminUsername,
      displayName: adminUsername,
      role: "admin",
    },
    project: {
      id: projectId,
      tenantId,
      ownerAccountId: accountId,
      name: defaultIdentityName.project,
      slug: defaultIdentitySlug,
    },
  };
}

export async function seedDefaultIdentity(
  db: Kysely<DatabaseSchema>,
  input: DefaultIdentitySeedInput,
): Promise<DefaultIdentitySeed> {
  const planned = createDefaultIdentitySeed(input);
  const tenant = await upsertDefaultTenant(db, planned.tenant);
  const account = await upsertDefaultAccount(db, {
    ...planned.account,
    tenantId: tenant.id,
  });
  const project = await upsertDefaultProject(db, {
    ...planned.project,
    tenantId: tenant.id,
    ownerAccountId: account.id,
  });

  return {
    tenant,
    account,
    project,
  };
}

export async function seedDefaultIdentityForDatabase(
  databaseUrl: string,
  input: DefaultIdentitySeedInput,
): Promise<DefaultIdentitySeed> {
  const db = createPostgresDatabase(databaseUrl);

  try {
    return await seedDefaultIdentity(db, input);
  } finally {
    await db.destroy();
  }
}

export function createMigrator(db: Kysely<DatabaseSchema>): Migrator {
  return new Migrator({
    db,
    provider: createSqlMigrationProvider(),
  });
}

export async function migrateToLatest(databaseUrl: string, options: MigrationLogOptions = {}) {
  const db = createPostgresDatabase(databaseUrl);

  try {
    const result = await createMigrator(db).migrateToLatest();

    if (result.error !== undefined) {
      throw result.error;
    }

    options.logger?.info(formatMigrationLogMessage(result, options.serviceName));
    await ensureOperationalListIndexes(db, options);

    return result;
  } finally {
    await db.destroy();
  }
}

export function describeMigrationResult(result: MigrationResultSet): string {
  const appliedMigrations =
    result.results
      ?.filter((migration) => migration.status === "Success")
      .map((migration) => migration.migrationName) ?? [];

  if (appliedMigrations.length === 0) {
    return "Database migrations are already up to date.";
  }

  return `Applied database migrations (${appliedMigrations.length}): ${appliedMigrations.join(", ")}.`;
}

function formatMigrationLogMessage(
  result: MigrationResultSet,
  serviceName: string | undefined,
): string {
  const message = describeMigrationResult(result);
  const trimmedServiceName = serviceName?.trim();

  if (trimmedServiceName === undefined || trimmedServiceName.length === 0) {
    return message;
  }

  return `[${trimmedServiceName}] ${message}`;
}

function formatOperationalIndexLogMessage(serviceName: string | undefined): string {
  const message = "Operational list indexes are ensured.";
  const trimmedServiceName = serviceName?.trim();

  if (trimmedServiceName === undefined || trimmedServiceName.length === 0) {
    return message;
  }

  return `[${trimmedServiceName}] ${message}`;
}

export function assertSafeLocalResetDatabaseUrl(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const isPostgres = parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);

  if (!isPostgres) {
    throw new Error("Local database reset requires a PostgreSQL database URL.");
  }

  if (!isLocal) {
    throw new Error("Local database reset requires a local database host.");
  }

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error("Local database reset requires a test database name.");
  }
}

export async function resetLocalDatabase(databaseUrl: string): Promise<void> {
  assertSafeLocalResetDatabaseUrl(databaseUrl);
  const db = createPostgresDatabase(databaseUrl);

  try {
    await sql`drop schema if exists public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    await sql`grant all on schema public to public`.execute(db);
  } finally {
    await db.destroy();
  }
}

export type CompileWorkflowKind =
  | "analysis"
  | "generation"
  | "merge"
  | "vision_caption"
  | "knowledge_check"
  | "wiki_draft";

export type CompileStageName = "analyzing" | "generating" | "merging" | "indexing";
export type CompileStageExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface PersistedModelCallRecord {
  id: string;
  knowledgeBaseId: string | null;
  sourceDocumentId: string | null;
  parsedContentId: string | null;
  jobId: string | null;
  changeSetId: string | null;
  providerName: string;
  model: string;
  promptVersionId: string;
  workflowKind: CompileWorkflowKind;
  outputStatus: "succeeded" | "failed" | "cancelled";
  inputSummary: string;
  outputSummary: string | null;
  usage: Record<string, unknown>;
  costEstimateUsd: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WikiAnalysisResultRecord {
  id: string;
  knowledgeBaseId: string;
  sourceDocumentId: string;
  parsedContentId: string;
  jobId: string | null;
  modelCallId: string | null;
  promptVersionId: string;
  inputSnapshotId: string;
  contentHash: string | null;
  entities: readonly Record<string, unknown>[];
  concepts: readonly Record<string, unknown>[];
  claims: readonly Record<string, unknown>[];
  contradictions: readonly Record<string, unknown>[];
  relationships: readonly Record<string, unknown>[];
  sourceRefs: readonly Record<string, unknown>[];
  locatorRefs: readonly Record<string, unknown>[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WikiDraftCandidateRecord {
  id: string;
  knowledgeBaseId: string;
  analysisResultId: string;
  jobId: string | null;
  modelCallId: string | null;
  promptVersionId: string;
  inputSnapshotId: string;
  sourceDocumentIds: readonly string[];
  pageType: string;
  title: string;
  slug: string | null;
  markdown: string;
  frontmatter: Record<string, unknown>;
  sourceRefs: readonly Record<string, unknown>[];
  locatorRefs: readonly Record<string, unknown>[];
  relationshipCandidates: readonly Record<string, unknown>[];
  confidence: number | null;
  status: string;
  targetPageId: string | null;
  changeSetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompileStageExecutionRecord {
  id: string;
  knowledgeBaseId: string;
  jobId: string;
  stage: CompileStageName;
  status: CompileStageExecutionStatus;
  queueName: string;
  queueJobId: string | null;
  inputSnapshotId: string;
  sourceDocumentId: string | null;
  parsedContentId: string | null;
  analysisResultId: string | null;
  draftCandidateId: string | null;
  error: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreatePersistedModelCallInput = Omit<PersistedModelCallRecord, "createdAt"> & {
  createdAt?: string;
};

export type SaveWikiAnalysisResultInput = Omit<
  WikiAnalysisResultRecord,
  "createdAt" | "updatedAt"
> & {
  createdAt?: string;
  updatedAt?: string;
};

export type SaveWikiDraftCandidateInput = Omit<
  WikiDraftCandidateRecord,
  "createdAt" | "updatedAt"
> & {
  createdAt?: string;
  updatedAt?: string;
};

export type SaveCompileStageExecutionInput = Omit<
  CompileStageExecutionRecord,
  "createdAt" | "updatedAt"
> & {
  createdAt?: string;
  updatedAt?: string;
};

export interface CompileArtifactRepository {
  recordModelCall(input: CreatePersistedModelCallInput): Promise<PersistedModelCallRecord>;
  findModelCallById(id: string): Promise<PersistedModelCallRecord | null>;
  listModelCallsByJob(jobId: string): Promise<PersistedModelCallRecord[]>;
  listModelCallsByChangeSet(changeSetId: string): Promise<PersistedModelCallRecord[]>;
  saveAnalysisResult(input: SaveWikiAnalysisResultInput): Promise<WikiAnalysisResultRecord>;
  findAnalysisResultById(id: string): Promise<WikiAnalysisResultRecord | null>;
  listAnalysisResultsByJob(jobId: string): Promise<WikiAnalysisResultRecord[]>;
  listAnalysisResultsByParsedContent(parsedContentId: string): Promise<WikiAnalysisResultRecord[]>;
  saveDraftCandidate(input: SaveWikiDraftCandidateInput): Promise<WikiDraftCandidateRecord>;
  findDraftCandidateById(id: string): Promise<WikiDraftCandidateRecord | null>;
  listDraftCandidatesByAnalysisResult(
    analysisResultId: string,
  ): Promise<WikiDraftCandidateRecord[]>;
  listDraftCandidatesByJob(jobId: string): Promise<WikiDraftCandidateRecord[]>;
  listDraftCandidatesByChangeSet(changeSetId: string): Promise<WikiDraftCandidateRecord[]>;
  saveStageExecution(input: SaveCompileStageExecutionInput): Promise<CompileStageExecutionRecord>;
  updateStageExecution(
    id: string,
    patch: Partial<
      Pick<
        CompileStageExecutionRecord,
        | "status"
        | "queueJobId"
        | "error"
        | "metadata"
        | "startedAt"
        | "finishedAt"
        | "analysisResultId"
        | "draftCandidateId"
      >
    >,
  ): Promise<CompileStageExecutionRecord | null>;
  listStageExecutionsByJob(jobId: string): Promise<CompileStageExecutionRecord[]>;
}

export function createPostgresCompileArtifactRepository(
  db: Kysely<DatabaseSchema>,
): CompileArtifactRepository {
  return new PostgresCompileArtifactRepository(db);
}

class PostgresCompileArtifactRepository implements CompileArtifactRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async recordModelCall(input: CreatePersistedModelCallInput): Promise<PersistedModelCallRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const result = await sql<ModelCallRow>`
      insert into model_calls (
        id,
        knowledge_base_id,
        source_document_id,
        parsed_content_id,
        job_id,
        change_set_id,
        provider_name,
        model,
        prompt_version_id,
        workflow_kind,
        output_status,
        input_summary,
        output_summary,
        usage,
        cost_estimate_usd,
        metadata,
        created_at
      )
      values (
        ${input.id},
        ${input.knowledgeBaseId},
        ${input.sourceDocumentId},
        ${input.parsedContentId},
        ${input.jobId},
        ${input.changeSetId},
        ${input.providerName},
        ${input.model},
        ${input.promptVersionId},
        ${input.workflowKind},
        ${input.outputStatus},
        ${input.inputSummary},
        ${input.outputSummary},
        ${JSON.stringify(input.usage)}::jsonb,
        ${input.costEstimateUsd},
        ${JSON.stringify(input.metadata)}::jsonb,
        ${createdAt}
      )
      on conflict (id) do update set
        knowledge_base_id = excluded.knowledge_base_id,
        source_document_id = excluded.source_document_id,
        parsed_content_id = excluded.parsed_content_id,
        job_id = excluded.job_id,
        change_set_id = excluded.change_set_id,
        provider_name = excluded.provider_name,
        model = excluded.model,
        prompt_version_id = excluded.prompt_version_id,
        workflow_kind = excluded.workflow_kind,
        output_status = excluded.output_status,
        input_summary = excluded.input_summary,
        output_summary = excluded.output_summary,
        usage = excluded.usage,
        cost_estimate_usd = excluded.cost_estimate_usd,
        metadata = excluded.metadata
      returning *
    `.execute(this.db);

    return toModelCallRecord(requireSingleRow(result.rows, "Failed to record model call."));
  }

  async findModelCallById(id: string): Promise<PersistedModelCallRecord | null> {
    const result = await sql<ModelCallRow>`
      select *
      from model_calls
      where id = ${id}
    `.execute(this.db);

    return result.rows[0] === undefined ? null : toModelCallRecord(result.rows[0]);
  }

  async listModelCallsByJob(jobId: string): Promise<PersistedModelCallRecord[]> {
    const result = await sql<ModelCallRow>`
      select *
      from model_calls
      where job_id = ${jobId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toModelCallRecord);
  }

  async listModelCallsByChangeSet(changeSetId: string): Promise<PersistedModelCallRecord[]> {
    const result = await sql<ModelCallRow>`
      select *
      from model_calls
      where change_set_id = ${changeSetId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toModelCallRecord);
  }

  async saveAnalysisResult(input: SaveWikiAnalysisResultInput): Promise<WikiAnalysisResultRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    const result = await sql<WikiAnalysisResultRow>`
      insert into wiki_analysis_results (
        id,
        knowledge_base_id,
        source_document_id,
        parsed_content_id,
        job_id,
        model_call_id,
        prompt_version_id,
        input_snapshot_id,
        content_hash,
        entities,
        concepts,
        claims,
        contradictions,
        relationships,
        source_refs,
        locator_refs,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${input.id},
        ${input.knowledgeBaseId},
        ${input.sourceDocumentId},
        ${input.parsedContentId},
        ${input.jobId},
        ${input.modelCallId},
        ${input.promptVersionId},
        ${input.inputSnapshotId},
        ${input.contentHash},
        ${JSON.stringify(input.entities)}::jsonb,
        ${JSON.stringify(input.concepts)}::jsonb,
        ${JSON.stringify(input.claims)}::jsonb,
        ${JSON.stringify(input.contradictions)}::jsonb,
        ${JSON.stringify(input.relationships)}::jsonb,
        ${JSON.stringify(input.sourceRefs)}::jsonb,
        ${JSON.stringify(input.locatorRefs)}::jsonb,
        ${JSON.stringify(input.metadata)}::jsonb,
        ${createdAt},
        ${updatedAt}
      )
      on conflict (id) do update set
        entities = excluded.entities,
        concepts = excluded.concepts,
        claims = excluded.claims,
        contradictions = excluded.contradictions,
        relationships = excluded.relationships,
        source_refs = excluded.source_refs,
        locator_refs = excluded.locator_refs,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      returning *
    `.execute(this.db);

    return toWikiAnalysisResultRecord(
      requireSingleRow(result.rows, "Failed to save analysis result."),
    );
  }

  async findAnalysisResultById(id: string): Promise<WikiAnalysisResultRecord | null> {
    const result = await sql<WikiAnalysisResultRow>`
      select *
      from wiki_analysis_results
      where id = ${id}
    `.execute(this.db);

    return result.rows[0] === undefined ? null : toWikiAnalysisResultRecord(result.rows[0]);
  }

  async listAnalysisResultsByJob(jobId: string): Promise<WikiAnalysisResultRecord[]> {
    const result = await sql<WikiAnalysisResultRow>`
      select *
      from wiki_analysis_results
      where job_id = ${jobId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toWikiAnalysisResultRecord);
  }

  async listAnalysisResultsByParsedContent(
    parsedContentId: string,
  ): Promise<WikiAnalysisResultRecord[]> {
    const result = await sql<WikiAnalysisResultRow>`
      select *
      from wiki_analysis_results
      where parsed_content_id = ${parsedContentId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toWikiAnalysisResultRecord);
  }

  async saveDraftCandidate(input: SaveWikiDraftCandidateInput): Promise<WikiDraftCandidateRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    const result = await sql<WikiDraftCandidateRow>`
      insert into wiki_draft_candidates (
        id,
        knowledge_base_id,
        analysis_result_id,
        job_id,
        model_call_id,
        prompt_version_id,
        input_snapshot_id,
        source_document_ids,
        page_type,
        title,
        slug,
        markdown,
        frontmatter,
        source_refs,
        locator_refs,
        relationship_candidates,
        confidence,
        status,
        target_page_id,
        change_set_id,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${input.id},
        ${input.knowledgeBaseId},
        ${input.analysisResultId},
        ${input.jobId},
        ${input.modelCallId},
        ${input.promptVersionId},
        ${input.inputSnapshotId},
        ${toPostgresTextArray(input.sourceDocumentIds)},
        ${input.pageType},
        ${input.title},
        ${input.slug},
        ${input.markdown},
        ${JSON.stringify(input.frontmatter)}::jsonb,
        ${JSON.stringify(input.sourceRefs)}::jsonb,
        ${JSON.stringify(input.locatorRefs)}::jsonb,
        ${JSON.stringify(input.relationshipCandidates)}::jsonb,
        ${input.confidence},
        ${input.status},
        ${input.targetPageId},
        ${input.changeSetId},
        ${JSON.stringify(input.metadata)}::jsonb,
        ${createdAt},
        ${updatedAt}
      )
      on conflict (id) do update set
        model_call_id = excluded.model_call_id,
        markdown = excluded.markdown,
        frontmatter = excluded.frontmatter,
        source_refs = excluded.source_refs,
        locator_refs = excluded.locator_refs,
        relationship_candidates = excluded.relationship_candidates,
        confidence = excluded.confidence,
        status = excluded.status,
        target_page_id = excluded.target_page_id,
        change_set_id = excluded.change_set_id,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      returning *
    `.execute(this.db);

    return toWikiDraftCandidateRecord(
      requireSingleRow(result.rows, "Failed to save draft candidate."),
    );
  }

  async listDraftCandidatesByAnalysisResult(
    analysisResultId: string,
  ): Promise<WikiDraftCandidateRecord[]> {
    const result = await sql<WikiDraftCandidateRow>`
      select *
      from wiki_draft_candidates
      where analysis_result_id = ${analysisResultId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toWikiDraftCandidateRecord);
  }

  async findDraftCandidateById(id: string): Promise<WikiDraftCandidateRecord | null> {
    const result = await sql<WikiDraftCandidateRow>`
      select *
      from wiki_draft_candidates
      where id = ${id}
    `.execute(this.db);

    return result.rows[0] === undefined ? null : toWikiDraftCandidateRecord(result.rows[0]);
  }

  async listDraftCandidatesByJob(jobId: string): Promise<WikiDraftCandidateRecord[]> {
    const result = await sql<WikiDraftCandidateRow>`
      select *
      from wiki_draft_candidates
      where job_id = ${jobId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toWikiDraftCandidateRecord);
  }

  async listDraftCandidatesByChangeSet(changeSetId: string): Promise<WikiDraftCandidateRecord[]> {
    const result = await sql<WikiDraftCandidateRow>`
      select *
      from wiki_draft_candidates
      where change_set_id = ${changeSetId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toWikiDraftCandidateRecord);
  }

  async saveStageExecution(
    input: SaveCompileStageExecutionInput,
  ): Promise<CompileStageExecutionRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    const result = await sql<CompileStageExecutionRow>`
      insert into compile_stage_executions (
        id,
        knowledge_base_id,
        job_id,
        stage,
        status,
        queue_name,
        queue_job_id,
        input_snapshot_id,
        source_document_id,
        parsed_content_id,
        analysis_result_id,
        draft_candidate_id,
        error,
        metadata,
        started_at,
        finished_at,
        created_at,
        updated_at
      )
      values (
        ${input.id},
        ${input.knowledgeBaseId},
        ${input.jobId},
        ${input.stage},
        ${input.status},
        ${input.queueName},
        ${input.queueJobId},
        ${input.inputSnapshotId},
        ${input.sourceDocumentId},
        ${input.parsedContentId},
        ${input.analysisResultId},
        ${input.draftCandidateId},
        ${input.error === null ? null : JSON.stringify(input.error)}::jsonb,
        ${JSON.stringify(input.metadata)}::jsonb,
        ${input.startedAt},
        ${input.finishedAt},
        ${createdAt},
        ${updatedAt}
      )
      on conflict (id) do update set
        status = excluded.status,
        queue_job_id = excluded.queue_job_id,
        analysis_result_id = excluded.analysis_result_id,
        draft_candidate_id = excluded.draft_candidate_id,
        error = excluded.error,
        metadata = excluded.metadata,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        updated_at = excluded.updated_at
      returning *
    `.execute(this.db);

    return toCompileStageExecutionRecord(
      requireSingleRow(result.rows, "Failed to save compile stage execution."),
    );
  }

  async updateStageExecution(
    id: string,
    patch: Partial<
      Pick<
        CompileStageExecutionRecord,
        "status" | "queueJobId" | "error" | "metadata" | "startedAt" | "finishedAt"
      >
    >,
  ): Promise<CompileStageExecutionRecord | null> {
    const current = await this.findStageExecutionById(id);

    if (current === null) {
      return null;
    }

    return this.saveStageExecution({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async listStageExecutionsByJob(jobId: string): Promise<CompileStageExecutionRecord[]> {
    const result = await sql<CompileStageExecutionRow>`
      select *
      from compile_stage_executions
      where job_id = ${jobId}
      order by created_at asc, id asc
    `.execute(this.db);

    return result.rows.map(toCompileStageExecutionRecord);
  }

  private async findStageExecutionById(id: string): Promise<CompileStageExecutionRecord | null> {
    const result = await sql<CompileStageExecutionRow>`
      select *
      from compile_stage_executions
      where id = ${id}
    `.execute(this.db);

    return result.rows[0] === undefined ? null : toCompileStageExecutionRecord(result.rows[0]);
  }
}

interface ModelCallRow {
  id: string;
  knowledge_base_id: string | null;
  source_document_id: string | null;
  parsed_content_id: string | null;
  job_id: string | null;
  change_set_id: string | null;
  provider_name: string;
  model: string;
  prompt_version_id: string;
  workflow_kind: string;
  output_status: string;
  input_summary: string;
  output_summary: string | null;
  usage: unknown;
  cost_estimate_usd: string | number | null;
  metadata: unknown;
  created_at: string | Date;
}

interface WikiAnalysisResultRow {
  id: string;
  knowledge_base_id: string;
  source_document_id: string;
  parsed_content_id: string;
  job_id: string | null;
  model_call_id: string | null;
  prompt_version_id: string;
  input_snapshot_id: string;
  content_hash: string | null;
  entities: unknown;
  concepts: unknown;
  claims: unknown;
  contradictions: unknown;
  relationships: unknown;
  source_refs: unknown;
  locator_refs: unknown;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

interface WikiDraftCandidateRow {
  id: string;
  knowledge_base_id: string;
  analysis_result_id: string;
  job_id: string | null;
  model_call_id: string | null;
  prompt_version_id: string;
  input_snapshot_id: string;
  source_document_ids: string[];
  page_type: string;
  title: string;
  slug: string | null;
  markdown: string;
  frontmatter: unknown;
  source_refs: unknown;
  locator_refs: unknown;
  relationship_candidates: unknown;
  confidence: string | number | null;
  status: string;
  target_page_id: string | null;
  change_set_id: string | null;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CompileStageExecutionRow {
  id: string;
  knowledge_base_id: string;
  job_id: string;
  stage: string;
  status: string;
  queue_name: string;
  queue_job_id: string | null;
  input_snapshot_id: string;
  source_document_id: string | null;
  parsed_content_id: string | null;
  analysis_result_id: string | null;
  draft_candidate_id: string | null;
  error: unknown;
  metadata: unknown;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function toModelCallRecord(row: ModelCallRow): PersistedModelCallRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    sourceDocumentId: row.source_document_id,
    parsedContentId: row.parsed_content_id,
    jobId: row.job_id,
    changeSetId: row.change_set_id,
    providerName: row.provider_name,
    model: row.model,
    promptVersionId: row.prompt_version_id,
    workflowKind: row.workflow_kind as CompileWorkflowKind,
    outputStatus: row.output_status as PersistedModelCallRecord["outputStatus"],
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    usage: normalizeJsonObject(row.usage),
    costEstimateUsd: row.cost_estimate_usd === null ? null : Number(row.cost_estimate_usd),
    metadata: normalizeJsonObject(row.metadata),
    createdAt: normalizeDate(row.created_at),
  };
}

function toWikiAnalysisResultRecord(row: WikiAnalysisResultRow): WikiAnalysisResultRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    sourceDocumentId: row.source_document_id,
    parsedContentId: row.parsed_content_id,
    jobId: row.job_id,
    modelCallId: row.model_call_id,
    promptVersionId: row.prompt_version_id,
    inputSnapshotId: row.input_snapshot_id,
    contentHash: row.content_hash,
    entities: normalizeJsonObjectArray(row.entities),
    concepts: normalizeJsonObjectArray(row.concepts),
    claims: normalizeJsonObjectArray(row.claims),
    contradictions: normalizeJsonObjectArray(row.contradictions),
    relationships: normalizeJsonObjectArray(row.relationships),
    sourceRefs: normalizeJsonObjectArray(row.source_refs),
    locatorRefs: normalizeJsonObjectArray(row.locator_refs),
    metadata: normalizeJsonObject(row.metadata),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

function toWikiDraftCandidateRecord(row: WikiDraftCandidateRow): WikiDraftCandidateRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    analysisResultId: row.analysis_result_id,
    jobId: row.job_id,
    modelCallId: row.model_call_id,
    promptVersionId: row.prompt_version_id,
    inputSnapshotId: row.input_snapshot_id,
    sourceDocumentIds: [...row.source_document_ids],
    pageType: row.page_type,
    title: row.title,
    slug: row.slug,
    markdown: row.markdown,
    frontmatter: normalizeJsonObject(row.frontmatter),
    sourceRefs: normalizeJsonObjectArray(row.source_refs),
    locatorRefs: normalizeJsonObjectArray(row.locator_refs),
    relationshipCandidates: normalizeJsonObjectArray(row.relationship_candidates),
    confidence: row.confidence === null ? null : Number(row.confidence),
    status: row.status,
    targetPageId: row.target_page_id,
    changeSetId: row.change_set_id,
    metadata: normalizeJsonObject(row.metadata),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

function toCompileStageExecutionRecord(row: CompileStageExecutionRow): CompileStageExecutionRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    jobId: row.job_id,
    stage: row.stage as CompileStageName,
    status: row.status as CompileStageExecutionStatus,
    queueName: row.queue_name,
    queueJobId: row.queue_job_id,
    inputSnapshotId: row.input_snapshot_id,
    sourceDocumentId: row.source_document_id,
    parsedContentId: row.parsed_content_id,
    analysisResultId: row.analysis_result_id,
    draftCandidateId: row.draft_candidate_id,
    error: row.error === null ? null : normalizeJsonObject(row.error),
    metadata: normalizeJsonObject(row.metadata),
    startedAt: row.started_at === null ? null : normalizeDate(row.started_at),
    finishedAt: row.finished_at === null ? null : normalizeDate(row.finished_at),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeJsonObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? [JSON.parse(JSON.stringify(item)) as Record<string, unknown>]
      : [],
  );
}

function normalizeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toPostgresTextArray(values: readonly string[]): string[] {
  return [...values];
}

async function upsertDefaultTenant(
  db: Kysely<DatabaseSchema>,
  seed: DefaultTenantSeed,
): Promise<DefaultTenantSeed> {
  const result = await sql<DefaultTenantSeed>`
    insert into tenants (id, name, slug)
    values (${seed.id}, ${seed.name}, ${seed.slug})
    on conflict (slug)
    do update set
      name = excluded.name,
      updated_at = now()
    returning id, name, slug
  `.execute(db);

  return requireSingleRow(result.rows, "Failed to seed the default tenant.");
}

async function upsertDefaultAccount(
  db: Kysely<DatabaseSchema>,
  seed: DefaultAccountSeed,
): Promise<DefaultAccountSeed> {
  const result = await sql<DefaultAccountSeed>`
    insert into accounts (id, tenant_id, username, display_name, role)
    values (${seed.id}, ${seed.tenantId}, ${seed.username}, ${seed.displayName}, ${seed.role})
    on conflict (tenant_id, username)
    do update set
      display_name = excluded.display_name,
      role = excluded.role,
      updated_at = now()
    returning
      id,
      tenant_id as "tenantId",
      username,
      display_name as "displayName",
      role
  `.execute(db);

  return requireSingleRow(result.rows, "Failed to seed the default account.");
}

async function upsertDefaultProject(
  db: Kysely<DatabaseSchema>,
  seed: DefaultProjectSeed,
): Promise<DefaultProjectSeed> {
  const result = await sql<DefaultProjectSeed>`
    insert into projects (id, tenant_id, owner_account_id, name, slug)
    values (${seed.id}, ${seed.tenantId}, ${seed.ownerAccountId}, ${seed.name}, ${seed.slug})
    on conflict (tenant_id, slug)
    do update set
      owner_account_id = excluded.owner_account_id,
      name = excluded.name,
      updated_at = now()
    returning
      id,
      tenant_id as "tenantId",
      owner_account_id as "ownerAccountId",
      name,
      slug
  `.execute(db);

  return requireSingleRow(result.rows, "Failed to seed the default project.");
}

function requireSingleRow<TRow>(rows: readonly TRow[], message: string): TRow {
  const row = rows[0];

  if (row === undefined) {
    throw new Error(message);
  }

  return row;
}
