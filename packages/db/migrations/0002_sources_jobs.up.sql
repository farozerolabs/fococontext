create table if not exists source_documents (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_type text not null,
  name text not null,
  status text not null default 'uploaded',
  content_hash text,
  object_key text,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  lifecycle_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists parsed_contents (
  id text primary key,
  source_document_id text not null references source_documents(id) on delete cascade,
  content_hash text not null,
  parser_name text not null,
  parser_version text not null,
  normalized_markdown_object_key text not null,
  plain_text_object_key text,
  locators jsonb not null default '[]'::jsonb,
  tables jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create table if not exists media_assets (
  id text primary key,
  source_document_id text not null references source_documents(id) on delete cascade,
  parsed_content_id text references parsed_contents(id) on delete set null,
  mime_type text not null,
  object_key text not null,
  hash text,
  locator jsonb not null default '{}'::jsonb,
  width integer,
  height integer,
  caption_status text not null default 'not_configured',
  caption text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key,
  knowledge_base_id text references knowledge_bases(id) on delete cascade,
  source_document_id text references source_documents(id) on delete set null,
  job_type text not null,
  status text not null default 'queued',
  stage text,
  progress integer not null default 0,
  progress_message text,
  idempotency_key text,
  dedupe_key text,
  result jsonb,
  error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists job_events (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists source_documents_kb_status_idx on source_documents(knowledge_base_id, status);
create index if not exists parsed_contents_document_idx on parsed_contents(source_document_id);
create index if not exists media_assets_document_idx on media_assets(source_document_id);
create index if not exists jobs_kb_status_idx on jobs(knowledge_base_id, status);
create index if not exists job_events_job_created_idx on job_events(job_id, created_at);
