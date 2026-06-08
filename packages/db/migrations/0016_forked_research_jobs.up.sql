alter table knowledge_bases
  add column if not exists knowledge_base_type text not null default 'canonical',
  add column if not exists upstream_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists upstream_base_version_id text,
  add column if not exists upstream_synced_version_id text,
  add column if not exists fork_owner_type text,
  add column if not exists fork_owner_external_id text,
  add column if not exists fork_owner_display_name text,
  add column if not exists sync_status text not null default 'not_applicable';

create unique index if not exists knowledge_bases_active_fork_owner_unique
  on knowledge_bases (upstream_knowledge_base_id, fork_owner_type, fork_owner_external_id)
  where deleted_at is null
    and knowledge_base_type = 'fork';

create index if not exists knowledge_bases_type_status_idx
  on knowledge_bases (knowledge_base_type, status, created_at desc);

create index if not exists knowledge_bases_upstream_idx
  on knowledge_bases (upstream_knowledge_base_id, updated_at desc)
  where upstream_knowledge_base_id is not null;

alter table source_documents
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table parsed_contents
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table media_assets
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table ocr_page_statuses
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table ocr_blocks
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table ocr_artifacts
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table media_caption_cache
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table wiki_pages
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table wiki_page_versions
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table system_pages
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table wiki_edges
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table wiki_edge_sources
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table wiki_analysis_results
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table wiki_draft_candidates
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table compile_stage_executions
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table knowledge_versions
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table change_sets
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table change_set_items
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table rollback_records
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table page_merge_records
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table knowledge_checks
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table duplicate_decisions
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table delete_impact_previews
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table page_embeddings
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

alter table retrieval_traces
  add column if not exists owner_knowledge_base_id text references knowledge_bases(id) on delete cascade,
  add column if not exists visibility_origin text not null default 'canonical',
  add column if not exists upstream_resource_id text,
  add column if not exists fork_tombstoned_at timestamptz;

create index if not exists source_documents_owner_visibility_idx
  on source_documents (owner_knowledge_base_id, visibility_origin, created_at desc);

create index if not exists wiki_pages_owner_visibility_idx
  on wiki_pages (owner_knowledge_base_id, visibility_origin, updated_at desc);

create index if not exists system_pages_owner_visibility_idx
  on system_pages (owner_knowledge_base_id, visibility_origin, updated_at desc);

create index if not exists wiki_edges_owner_visibility_idx
  on wiki_edges (owner_knowledge_base_id, visibility_origin, updated_at desc);

create index if not exists page_embeddings_owner_visibility_idx
  on page_embeddings (owner_knowledge_base_id, visibility_origin, created_at desc);
