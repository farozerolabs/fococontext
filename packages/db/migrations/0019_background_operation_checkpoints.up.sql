create table if not exists background_operations (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text references knowledge_bases(id) on delete cascade,
  job_id text,
  operation_kind text not null check (
    operation_kind in (
      'retrieval_reindex',
      'graph_signal_refresh',
      'graph_insight_refresh',
      'knowledge_check',
      'source_watch_scan',
      'source_ocr',
      'media_caption',
      'deletion_cleanup'
    )
  ),
  stage text not null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'completed', 'failed', 'canceled')
  ),
  cursor jsonb not null default '{}'::jsonb,
  processed_count bigint not null default 0,
  failed_count bigint not null default 0,
  total_count bigint,
  last_item_id text,
  safe_error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  lock_key text,
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists background_operations_scope_kind_status_updated_idx
  on background_operations(tenant_id, project_id, knowledge_base_id, operation_kind, status, updated_at desc, id desc);

create index if not exists background_operations_job_stage_idx
  on background_operations(job_id, stage, updated_at desc, id desc)
  where job_id is not null;

create index if not exists background_operations_lock_active_idx
  on background_operations(lock_key, status, updated_at desc)
  where lock_key is not null and status in ('queued', 'running');
