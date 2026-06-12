create table if not exists knowledge_check_findings (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  check_id text not null references knowledge_checks(id) on delete cascade,
  finding_type text not null,
  severity text not null,
  page_id text,
  affected_object_ids text[] not null default '{}',
  message text not null,
  confidence double precision,
  evidence jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  suggested_action jsonb not null default '{}'::jsonb,
  finding jsonb not null,
  stage text not null default 'structural',
  status text not null default 'active',
  model_trace jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  retained_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(check_id, dedupe_key)
);

create index if not exists knowledge_check_findings_scope_status_idx
  on knowledge_check_findings(tenant_id, project_id, knowledge_base_id, check_id, status, updated_at desc, id desc);

create index if not exists knowledge_check_findings_check_stage_idx
  on knowledge_check_findings(check_id, stage, updated_at desc, id desc);

create index if not exists knowledge_check_findings_retention_idx
  on knowledge_check_findings(retained_until asc, id asc)
  where retained_until is not null;

create table if not exists knowledge_check_window_checkpoints (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  check_id text not null references knowledge_checks(id) on delete cascade,
  stage text not null,
  window_key text not null,
  cursor jsonb not null default '{}'::jsonb,
  prompt_config_hash text,
  provider_metadata jsonb not null default '{}'::jsonb,
  structured_output_mode text,
  attempt_summary jsonb not null default '{}'::jsonb,
  status text not null,
  retry_eligible boolean not null default false,
  safe_error jsonb,
  retained_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(check_id, stage, window_key)
);

create index if not exists knowledge_check_window_checkpoints_scope_status_idx
  on knowledge_check_window_checkpoints(tenant_id, project_id, knowledge_base_id, check_id, status, updated_at desc, id desc);

create index if not exists knowledge_check_window_checkpoints_retention_idx
  on knowledge_check_window_checkpoints(retained_until asc, id asc)
  where retained_until is not null;

create table if not exists source_watch_scan_items (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_watch_rule_id text not null references source_watch_rules(id) on delete cascade,
  scheduled_import_job_id text not null references scheduled_import_jobs(id) on delete cascade,
  adapter_kind text not null,
  item_kind text not null check (
    item_kind in (
      'discovered',
      'skipped',
      'new',
      'changed',
      'unchanged',
      'delete_candidate',
      'failed'
    )
  ),
  source_identity text not null,
  source_path text,
  source_url text,
  content_hash text,
  comparison_status text,
  cursor jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  safe_error jsonb,
  dedupe_key text not null,
  retained_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scheduled_import_job_id, item_kind, dedupe_key)
);

create index if not exists source_watch_scan_items_scope_kind_idx
  on source_watch_scan_items(
    tenant_id,
    project_id,
    knowledge_base_id,
    source_watch_rule_id,
    scheduled_import_job_id,
    item_kind,
    updated_at desc,
    id desc
  );

create index if not exists source_watch_scan_items_source_identity_idx
  on source_watch_scan_items(source_watch_rule_id, scheduled_import_job_id, source_identity, item_kind);

create index if not exists source_watch_scan_items_retention_idx
  on source_watch_scan_items(retained_until asc, id asc)
  where retained_until is not null;
