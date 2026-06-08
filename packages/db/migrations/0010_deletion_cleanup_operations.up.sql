create table if not exists deletion_cleanup_operations (
  id text primary key,
  target_type text not null check (
    target_type in (
      'knowledge_base',
      'source_document',
      'source_watch_rule',
      'webhook',
      'import_preview',
      'retrieval_trace'
    )
  ),
  target_id text not null,
  knowledge_base_id text references knowledge_bases(id) on delete set null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'completed', 'failed', 'canceled')
  ),
  phase text not null default 'queued' check (
    phase in (
      'queued',
      'manifest',
      'fencing',
      'object_cleanup',
      'database_cleanup',
      'retention',
      'completed',
      'failed',
      'canceled'
    )
  ),
  requested_by text,
  request_id text,
  queue_job_id text,
  manifest jsonb not null default '{}'::jsonb,
  total_item_count integer not null default 0,
  pending_item_count integer not null default 0,
  deleted_item_count integer not null default 0,
  skipped_item_count integer not null default 0,
  failed_item_count integer not null default 0,
  object_key_count integer not null default 0,
  database_row_count integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  retry_after timestamptz,
  retryable boolean not null default true,
  last_error jsonb,
  retention_expires_at timestamptz,
  item_retention_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deletion_cleanup_items (
  id text primary key,
  operation_id text not null references deletion_cleanup_operations(id) on delete cascade,
  item_type text not null check (
    item_type in ('object', 'database_row', 'reference', 'audit')
  ),
  resource_type text,
  resource_id text,
  object_key text,
  table_name text,
  knowledge_base_id text references knowledge_bases(id) on delete set null,
  source_document_id text references source_documents(id) on delete set null,
  status text not null default 'pending' check (
    status in ('pending', 'running', 'deleted', 'skipped', 'failed')
  ),
  phase text not null default 'queued' check (
    phase in (
      'queued',
      'manifest',
      'fencing',
      'object_cleanup',
      'database_cleanup',
      'retention',
      'completed',
      'failed',
      'canceled'
    )
  ),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error jsonb,
  skip_reason text,
  retry_after timestamptz,
  retained_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    object_key is not null
    or (table_name is not null and resource_id is not null)
    or resource_id is not null
  )
);

create index if not exists deletion_cleanup_operations_target_idx
  on deletion_cleanup_operations(target_type, target_id);

create index if not exists deletion_cleanup_operations_kb_status_idx
  on deletion_cleanup_operations(knowledge_base_id, status, updated_at desc);

create index if not exists deletion_cleanup_operations_status_phase_idx
  on deletion_cleanup_operations(status, phase, updated_at desc);

create index if not exists deletion_cleanup_operations_retryable_failed_idx
  on deletion_cleanup_operations(updated_at desc)
  where status = 'failed' and retryable = true;

create index if not exists deletion_cleanup_operations_retention_idx
  on deletion_cleanup_operations(retention_expires_at)
  where retention_expires_at is not null;

create index if not exists deletion_cleanup_items_operation_status_idx
  on deletion_cleanup_items(operation_id, status, updated_at desc);

create index if not exists deletion_cleanup_items_object_key_idx
  on deletion_cleanup_items(object_key)
  where object_key is not null;

create index if not exists deletion_cleanup_items_resource_idx
  on deletion_cleanup_items(table_name, resource_id)
  where table_name is not null and resource_id is not null;

create index if not exists deletion_cleanup_items_retryable_failed_idx
  on deletion_cleanup_items(operation_id, updated_at desc)
  where status = 'failed' and attempt_count < max_attempts;

create index if not exists deletion_cleanup_items_retention_idx
  on deletion_cleanup_items(retained_until)
  where retained_until is not null;
