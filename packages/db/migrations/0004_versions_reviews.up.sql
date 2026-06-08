create table if not exists knowledge_versions (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  version_number integer not null,
  status text not null default 'active',
  summary text,
  change_set_id text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (knowledge_base_id, version_number)
);

create table if not exists change_sets (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  base_version_id text references knowledge_versions(id) on delete set null,
  target_version_id text references knowledge_versions(id) on delete set null,
  status text not null default 'draft',
  trigger_type text not null,
  title text not null,
  description text,
  diff jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  discarded_at timestamptz
);

create table if not exists change_set_items (
  id text primary key,
  change_set_id text not null references change_sets(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  operation text not null,
  before_data jsonb,
  after_data jsonb,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rollback_records (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_version_id text references knowledge_versions(id) on delete set null,
  target_version_id text references knowledge_versions(id) on delete set null,
  change_set_id text references change_sets(id) on delete set null,
  rollback_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists page_merge_records (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  change_set_id text references change_sets(id) on delete set null,
  source_page_id text references wiki_pages(id) on delete set null,
  target_page_id text references wiki_pages(id) on delete set null,
  result_page_id text references wiki_pages(id) on delete set null,
  merge_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_checks (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  status text not null default 'queued',
  progress integer not null default 0,
  findings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists duplicate_decisions (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_page_id text references wiki_pages(id) on delete set null,
  target_page_id text references wiki_pages(id) on delete set null,
  decision text not null,
  reason text,
  decided_by text,
  decided_at timestamptz not null default now()
);

create table if not exists delete_impact_previews (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  status text not null default 'pending',
  impact jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_versions_kb_idx on knowledge_versions(knowledge_base_id, version_number desc);
create index if not exists change_sets_kb_status_idx on change_sets(knowledge_base_id, status);
create index if not exists change_set_items_change_set_idx on change_set_items(change_set_id);
create index if not exists knowledge_checks_kb_status_idx on knowledge_checks(knowledge_base_id, status);
