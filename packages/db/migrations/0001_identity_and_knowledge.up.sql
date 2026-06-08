create table if not exists tenants (
  id text primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  username text not null,
  display_name text,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, username)
);

create table if not exists projects (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  owner_account_id text references accounts(id) on delete set null,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists knowledge_bases (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  template text not null,
  output_language text not null,
  status text not null default 'ready',
  current_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, slug)
);

create table if not exists knowledge_base_settings (
  id text primary key,
  knowledge_base_id text not null unique references knowledge_bases(id) on delete cascade,
  purpose jsonb not null default '{}'::jsonb,
  wiki_schema jsonb not null default '{}'::jsonb,
  retrieval_settings jsonb not null default '{}'::jsonb,
  markdown_contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_tenant_id_idx on accounts(tenant_id);
create index if not exists projects_tenant_id_idx on projects(tenant_id);
create index if not exists knowledge_bases_tenant_project_idx on knowledge_bases(tenant_id, project_id);
