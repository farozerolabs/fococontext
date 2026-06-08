create table if not exists knowledge_base_dataset_configurations (
  id text primary key,
  knowledge_base_id text not null unique references knowledge_bases(id) on delete cascade,
  preset_id text not null,
  status text not null default 'active',
  version integer not null default 1,
  values jsonb not null default '{}'::jsonb,
  latest_snapshot_id text,
  updated_by text references accounts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_base_dataset_configuration_snapshots (
  id text primary key,
  configuration_id text not null references knowledge_base_dataset_configurations(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  preset_id text not null,
  version integer not null,
  values jsonb not null default '{}'::jsonb,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by text references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (configuration_id, version)
);

insert into knowledge_base_dataset_configurations (
  id,
  knowledge_base_id,
  preset_id,
  status,
  version,
  values,
  latest_snapshot_id,
  metadata,
  created_at,
  updated_at
)
select
  knowledge_bases.id || ':dataset_configuration',
  knowledge_bases.id,
  knowledge_bases.template,
  'active',
  1,
  jsonb_build_object(
    'purpose', coalesce(knowledge_base_settings.purpose ->> 'text', ''),
    'schema', coalesce(knowledge_base_settings.wiki_schema, '{}'::jsonb),
    'markdown_contract', coalesce(knowledge_base_settings.markdown_contract, '{}'::jsonb),
    'output_language', knowledge_bases.output_language,
    'retrieval', coalesce(knowledge_base_settings.retrieval_settings, '{}'::jsonb),
    'source_lifecycle', jsonb_build_object(
      'delete_policy', 'preview_required',
      'reingest_policy', 'new_snapshot'
    ),
    'knowledge_check', jsonb_build_object(
      'default_checks', jsonb_build_array('missing_source_refs', 'dead_wikilinks')
    ),
    'source_watch', jsonb_build_object(
      'supported_kinds', jsonb_build_array('mounted_directory'),
      'default_kind', 'mounted_directory',
      'unsupported_kinds', jsonb_build_array('s3_prefix', 'url_list', 'git_repo')
    )
  ),
  knowledge_bases.id || ':dataset_configuration_snapshot:1',
  jsonb_build_object('backfill_status', 'active_backfill'),
  knowledge_bases.created_at,
  knowledge_bases.updated_at
from knowledge_bases
left join knowledge_base_settings
  on knowledge_base_settings.knowledge_base_id = knowledge_bases.id
on conflict (knowledge_base_id) do nothing;

insert into knowledge_base_dataset_configuration_snapshots (
  id,
  configuration_id,
  knowledge_base_id,
  preset_id,
  version,
  values,
  reason,
  metadata,
  created_at
)
select
  latest_snapshot_id,
  id,
  knowledge_base_id,
  preset_id,
  version,
  values,
  'migration_backfill',
  metadata,
  updated_at
from knowledge_base_dataset_configurations
on conflict (id) do nothing;

create index if not exists kb_dataset_config_kb_idx
  on knowledge_base_dataset_configurations(knowledge_base_id);

create index if not exists kb_dataset_config_snapshots_kb_idx
  on knowledge_base_dataset_configuration_snapshots(knowledge_base_id, version);
