create table if not exists wiki_pages (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  slug text not null,
  title text not null,
  page_type text not null default 'page',
  status text not null default 'ready',
  current_version_id text,
  markdown text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  source_document_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (knowledge_base_id, slug)
);

create table if not exists wiki_page_versions (
  id text primary key,
  page_id text not null references wiki_pages(id) on delete cascade,
  knowledge_version_id text,
  version_number integer not null,
  title text not null,
  markdown text not null,
  frontmatter jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '[]'::jsonb,
  prompt_version text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (page_id, version_number)
);

create table if not exists system_pages (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  page_id text references wiki_pages(id) on delete set null,
  system_key text not null,
  title text not null,
  markdown text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_base_id, system_key)
);

create table if not exists wiki_edges (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  from_page_id text not null references wiki_pages(id) on delete cascade,
  to_page_id text not null references wiki_pages(id) on delete cascade,
  relation_type text not null,
  weight numeric(8, 4) not null default 1,
  explanation text,
  source_document_ids text[] not null default '{}',
  change_set_id text,
  knowledge_version_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wiki_edge_sources (
  id text primary key,
  edge_id text not null references wiki_edges(id) on delete cascade,
  source_document_id text references source_documents(id) on delete set null,
  page_version_id text references wiki_page_versions(id) on delete set null,
  locator jsonb not null default '{}'::jsonb,
  evidence text,
  created_at timestamptz not null default now()
);

create index if not exists wiki_pages_kb_type_idx on wiki_pages(knowledge_base_id, page_type);
create index if not exists wiki_page_versions_page_idx on wiki_page_versions(page_id, version_number desc);
create index if not exists wiki_edges_from_idx on wiki_edges(knowledge_base_id, from_page_id);
create index if not exists wiki_edges_to_idx on wiki_edges(knowledge_base_id, to_page_id);
create index if not exists wiki_edge_sources_edge_idx on wiki_edge_sources(edge_id);
