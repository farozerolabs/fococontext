drop index if exists page_embeddings_owner_visibility_idx;
drop index if exists wiki_edges_owner_visibility_idx;
drop index if exists system_pages_owner_visibility_idx;
drop index if exists wiki_pages_owner_visibility_idx;
drop index if exists source_documents_owner_visibility_idx;

alter table retrieval_traces
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table page_embeddings
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table delete_impact_previews
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table duplicate_decisions
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table knowledge_checks
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table page_merge_records
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table rollback_records
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table change_set_items
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table change_sets
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table knowledge_versions
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table compile_stage_executions
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table wiki_draft_candidates
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table wiki_analysis_results
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table wiki_edge_sources
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table wiki_edges
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table system_pages
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table wiki_page_versions
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table wiki_pages
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table media_caption_cache
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table ocr_artifacts
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table ocr_blocks
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table ocr_page_statuses
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table media_assets
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table parsed_contents
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

alter table source_documents
  drop column if exists fork_tombstoned_at,
  drop column if exists upstream_resource_id,
  drop column if exists visibility_origin,
  drop column if exists owner_knowledge_base_id;

drop index if exists knowledge_bases_upstream_idx;
drop index if exists knowledge_bases_type_status_idx;
drop index if exists knowledge_bases_active_fork_owner_unique;

alter table knowledge_bases
  drop column if exists sync_status,
  drop column if exists fork_owner_display_name,
  drop column if exists fork_owner_external_id,
  drop column if exists fork_owner_type,
  drop column if exists upstream_synced_version_id,
  drop column if exists upstream_base_version_id,
  drop column if exists upstream_knowledge_base_id,
  drop column if exists knowledge_base_type;
