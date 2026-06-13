create table if not exists upload_batches (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_type text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  total_items integer not null default 0,
  accepted_items integer not null default 0,
  skipped_items integer not null default 0,
  validation_error_count integer not null default 0,
  completed_items integer not null default 0,
  failed_items integer not null default 0,
  enqueue_cursor integer not null default 0,
  retry_cursor integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists upload_batch_items (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  batch_id text not null references upload_batches(id) on delete cascade,
  item_index integer not null,
  source_type text not null,
  external_id text,
  idempotency_key text,
  status text not null check (
    status in (
      'accepted',
      'validation_failed',
      'skipped',
      'created',
      'failed'
    )
  ),
  source_document_id text references source_documents(id) on delete set null,
  ingest_job_id text references jobs(id) on delete set null,
  safe_error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, item_index)
);

create index if not exists upload_batches_scope_status_updated_idx
  on upload_batches(tenant_id, project_id, knowledge_base_id, status, updated_at desc, id desc);

create index if not exists upload_batch_items_batch_index_idx
  on upload_batch_items(batch_id, item_index asc, id asc);

create index if not exists upload_batch_items_batch_status_idx
  on upload_batch_items(batch_id, status, updated_at desc, id desc);
