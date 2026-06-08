import { sql, type Kysely } from "kysely";

import type { DatabaseSchema } from "./index.js";

export interface TenantProjectScope {
  tenantId: string;
  projectId: string;
}

export interface CleanupOperationScopeInput {
  knowledgeBaseId: string | null;
  targetId: string;
  targetType: string;
}

export interface CleanupItemScopeInput {
  knowledgeBaseId: string | null;
  operationId: string;
  sourceDocumentId: string | null;
}

export async function requireKnowledgeBaseTenantProject(
  db: Kysely<DatabaseSchema>,
  knowledgeBaseId: string,
): Promise<TenantProjectScope> {
  const result = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from knowledge_bases
    where id = ${knowledgeBaseId}
    limit 1
  `.execute(db);

  return requireScopeRow(result.rows[0], "Knowledge base scope was not found.");
}

export async function requireJobTenantProject(
  db: Kysely<DatabaseSchema>,
  jobId: string,
): Promise<TenantProjectScope> {
  const result = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from jobs
    where id = ${jobId}
    limit 1
  `.execute(db);

  return requireScopeRow(result.rows[0], "Job scope was not found.");
}

export async function requireWebhookTenantProject(
  db: Kysely<DatabaseSchema>,
  webhookId: string,
): Promise<TenantProjectScope> {
  const result = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from webhooks
    where id = ${webhookId}
    limit 1
  `.execute(db);

  return requireScopeRow(result.rows[0], "Webhook scope was not found.");
}

export async function requireCleanupOperationTenantProject(
  db: Kysely<DatabaseSchema>,
  input: CleanupOperationScopeInput,
): Promise<TenantProjectScope> {
  if (input.knowledgeBaseId !== null) {
    return requireKnowledgeBaseTenantProject(db, input.knowledgeBaseId);
  }

  const result = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from (
      select knowledge_bases.tenant_id, knowledge_bases.project_id
      from knowledge_bases
      where ${input.targetType} = 'knowledge_base'
        and knowledge_bases.id = ${input.targetId}
      union all
      select knowledge_bases.tenant_id, knowledge_bases.project_id
      from source_documents
      inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
      where ${input.targetType} = 'source_document'
        and source_documents.id = ${input.targetId}
      union all
      select source_watch_rules.tenant_id, source_watch_rules.project_id
      from source_watch_rules
      where ${input.targetType} = 'source_watch_rule'
        and source_watch_rules.id = ${input.targetId}
      union all
      select webhooks.tenant_id, webhooks.project_id
      from webhooks
      where ${input.targetType} = 'webhook'
        and webhooks.id = ${input.targetId}
      union all
      select import_previews.tenant_id, import_previews.project_id
      from import_previews
      where ${input.targetType} = 'import_preview'
        and import_previews.id = ${input.targetId}
      union all
      select retrieval_traces.tenant_id, retrieval_traces.project_id
      from retrieval_traces
      where ${input.targetType} = 'retrieval_trace'
        and retrieval_traces.id = ${input.targetId}
    ) cleanup_scope
    limit 1
  `.execute(db);

  return requireScopeRow(result.rows[0], "Cleanup operation scope was not found.");
}

export async function requireCleanupItemTenantProject(
  db: Kysely<DatabaseSchema>,
  input: CleanupItemScopeInput,
): Promise<TenantProjectScope> {
  const operationResult = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from deletion_cleanup_operations
    where id = ${input.operationId}
    limit 1
  `.execute(db);
  const operationScope = operationResult.rows[0];

  if (operationScope !== undefined) {
    return toScope(operationScope);
  }

  if (input.knowledgeBaseId !== null) {
    return requireKnowledgeBaseTenantProject(db, input.knowledgeBaseId);
  }

  if (input.sourceDocumentId !== null) {
    const sourceResult = await sql<{ tenant_id: string; project_id: string }>`
      select knowledge_bases.tenant_id, knowledge_bases.project_id
      from source_documents
      inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
      where source_documents.id = ${input.sourceDocumentId}
      limit 1
    `.execute(db);

    if (sourceResult.rows[0] !== undefined) {
      return toScope(sourceResult.rows[0]);
    }
  }

  throw new Error("Cleanup item scope was not found.");
}

export async function requirePersistedCleanupOperationTenantProject(
  db: Kysely<DatabaseSchema>,
  operationId: string,
): Promise<TenantProjectScope> {
  const result = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from deletion_cleanup_operations
    where id = ${operationId}
    limit 1
  `.execute(db);

  return requireScopeRow(result.rows[0], "Persisted cleanup operation scope was not found.");
}

export async function requirePersistedCleanupItemTenantProject(
  db: Kysely<DatabaseSchema>,
  itemId: string,
): Promise<TenantProjectScope> {
  const result = await sql<{ tenant_id: string; project_id: string }>`
    select tenant_id, project_id
    from deletion_cleanup_items
    where id = ${itemId}
    limit 1
  `.execute(db);

  return requireScopeRow(result.rows[0], "Persisted cleanup item scope was not found.");
}

function requireScopeRow(
  row: { tenant_id: string; project_id: string } | undefined,
  message: string,
): TenantProjectScope {
  if (row === undefined) {
    throw new Error(message);
  }

  return toScope(row);
}

function toScope(row: { tenant_id: string; project_id: string }): TenantProjectScope {
  return {
    tenantId: row.tenant_id,
    projectId: row.project_id,
  };
}
