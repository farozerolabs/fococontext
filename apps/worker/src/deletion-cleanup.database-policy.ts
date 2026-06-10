export interface CleanupDatabaseItemPolicyInput {
  resourceType: string | null;
  tableName: string | null;
}

export function getDatabaseCleanupPriority(tableName: string | null): number {
  if (tableName === null) {
    return 10_000;
  }

  return databaseCleanupTablePriority.get(tableName) ?? 1_000;
}

export function listDatabaseCleanupPriorityEntries(): readonly (readonly [string, number])[] {
  return [...databaseCleanupTablePriority.entries()];
}

export function isCleanupEnabledDatabaseTable(tableName: string): boolean {
  return deletableDatabaseTables.has(tableName);
}

export function isScopedCleanupTable(tableName: string): boolean {
  return scopedCleanupTables.has(tableName);
}

export function isTenantProjectScopedDatabaseTable(tableName: string): boolean {
  return tenantProjectScopedDatabaseTables.has(tableName);
}

export function getScopedCleanupColumn(item: CleanupDatabaseItemPolicyInput): string | null {
  if (item.resourceType === `${item.tableName}.owner_knowledge_base_id`) {
    return "owner_knowledge_base_id";
  }
  if (item.resourceType === `${item.tableName}.knowledge_base_id`) {
    return "knowledge_base_id";
  }

  return null;
}

const databaseCleanupTablePriority = new Map<string, number>([
  ["webhook_deliveries", 10],
  ["scheduled_import_jobs", 20],
  ["import_previews", 30],
  ["page_embeddings", 40],
  ["retrieval_traces", 50],
  ["wiki_edge_sources", 60],
  ["wiki_edges", 70],
  ["duplicate_decisions", 80],
  ["knowledge_checks", 90],
  ["page_merge_records", 110],
  ["rollback_records", 120],
  ["change_set_items", 130],
  ["change_sets", 140],
  ["wiki_draft_candidates", 150],
  ["wiki_analysis_results", 160],
  ["model_calls", 170],
  ["compile_stage_executions", 180],
  ["ocr_blocks", 190],
  ["ocr_artifacts", 200],
  ["ocr_page_statuses", 210],
  ["media_assets", 220],
  ["parsed_contents", 230],
  ["job_events", 240],
  ["jobs", 250],
  ["source_documents", 260],
  ["system_pages", 270],
  ["wiki_page_versions", 280],
  ["wiki_pages", 290],
  ["knowledge_versions", 300],
  ["source_watch_rules", 310],
  ["webhooks", 320],
  ["knowledge_base_dataset_configuration_snapshots", 330],
  ["knowledge_base_dataset_configurations", 340],
  ["knowledge_base_settings", 350],
  ["knowledge_bases", 360],
]);

const deletableDatabaseTables = new Set(
  [...databaseCleanupTablePriority.keys()].filter(
    (tableName) =>
      tableName !== "knowledge_bases" &&
      tableName !== "source_documents" &&
      tableName !== "job_events",
  ),
);

const tenantProjectScopedDatabaseTables = new Set([
  "api_keys",
  "knowledge_bases",
  "jobs",
  "job_events",
  "source_watch_rules",
  "scheduled_import_jobs",
  "import_previews",
  "webhooks",
  "webhook_deliveries",
  "retrieval_traces",
  "deletion_cleanup_operations",
  "deletion_cleanup_items",
]);

const scopedCleanupTables = new Set([
  "source_documents",
  "parsed_contents",
  "media_assets",
  "ocr_page_statuses",
  "ocr_blocks",
  "ocr_artifacts",
  "media_caption_cache",
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
  "page_embeddings",
  "retrieval_traces",
]);
