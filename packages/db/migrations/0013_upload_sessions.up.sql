create table if not exists upload_sessions (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  document_id text not null,
  object_key text not null,
  file_name text not null,
  display_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  content_hash text,
  source_path text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  idempotency_key text,
  finalize_idempotency_key text,
  finalized_document_id text,
  finalized_job_id text,
  cleanup_operation_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists upload_sessions_kb_idempotency_idx
  on upload_sessions(knowledge_base_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists upload_sessions_kb_status_idx
  on upload_sessions(knowledge_base_id, status);

create index if not exists upload_sessions_expiry_idx
  on upload_sessions(status, expires_at);
