create extension if not exists vector;

create table if not exists source_watch_rules (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  name text not null,
  source_type text not null,
  location text not null,
  auto_ingest_enabled boolean not null default false,
  include_patterns text[] not null default '{}',
  exclude_patterns text[] not null default '{}',
  status text not null default 'disabled',
  latest_scan_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scheduled_import_jobs (
  id text primary key,
  source_watch_rule_id text references source_watch_rules(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  status text not null default 'scheduled',
  scan_result jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists import_previews (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_watch_rule_id text references source_watch_rules(id) on delete set null,
  scheduled_import_job_id text references scheduled_import_jobs(id) on delete set null,
  status text not null default 'pending',
  new_sources jsonb not null default '[]'::jsonb,
  changed_sources jsonb not null default '[]'::jsonb,
  deleted_sources jsonb not null default '[]'::jsonb,
  skipped_sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists webhooks (
  id text primary key,
  knowledge_base_id text references knowledge_bases(id) on delete cascade,
  target_url text not null,
  event_types text[] not null,
  status text not null default 'disabled',
  secret_configured boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id text primary key,
  webhook_id text references webhooks(id) on delete cascade,
  knowledge_base_id text references knowledge_bases(id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'queued',
  request_trace jsonb not null default '{}'::jsonb,
  response_status integer,
  response_body text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists page_embeddings (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  page_id text references wiki_pages(id) on delete cascade,
  page_version_id text references wiki_page_versions(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  model text not null,
  dimensions integer not null,
  embedding vector,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists retrieval_traces (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  query text not null,
  request jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  graph_expansions jsonb not null default '[]'::jsonb,
  context_pack jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists source_watch_rules_kb_status_idx on source_watch_rules(knowledge_base_id, status);
create index if not exists scheduled_import_jobs_rule_status_idx on scheduled_import_jobs(source_watch_rule_id, status);
create index if not exists import_previews_kb_status_idx on import_previews(knowledge_base_id, status);
create index if not exists webhooks_kb_status_idx on webhooks(knowledge_base_id, status);
create index if not exists webhook_deliveries_webhook_status_idx on webhook_deliveries(webhook_id, status);
create index if not exists page_embeddings_object_idx on page_embeddings(knowledge_base_id, object_type, object_id);
create index if not exists retrieval_traces_kb_created_idx on retrieval_traces(knowledge_base_id, created_at desc);
