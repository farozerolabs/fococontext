create table if not exists document_processing_units (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  parsed_content_id text references parsed_contents(id) on delete set null,
  stage text not null check (
    stage in (
      'parsing',
      'ocr',
      'media_extraction',
      'captioning',
      'parsed_artifact'
    )
  ),
  unit_type text not null,
  unit_key text not null,
  unit_index integer,
  attempt_scope text not null default 'default',
  status text not null check (
    status in (
      'pending',
      'running',
      'succeeded',
      'failed',
      'skipped',
      'canceled'
    )
  ),
  content_hash text,
  config_hash text,
  parser_name text,
  parser_version text,
  provider_name text,
  model text,
  prompt_version text,
  policy_hash text,
  dedupe_key text not null,
  object_key text,
  object_refs jsonb not null default '[]'::jsonb,
  locator jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  safe_error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  retry_eligible boolean not null default false,
  retained_until timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, stage, attempt_scope, dedupe_key)
);

create index if not exists document_processing_units_scope_stage_status_idx
  on document_processing_units(
    tenant_id,
    project_id,
    knowledge_base_id,
    source_document_id,
    job_id,
    stage,
    status,
    updated_at desc,
    id desc
  );

create index if not exists document_processing_units_parsed_stage_idx
  on document_processing_units(parsed_content_id, stage, status, updated_at desc, id desc)
  where parsed_content_id is not null;

create index if not exists document_processing_units_terminal_dedupe_idx
  on document_processing_units(source_document_id, job_id, stage, attempt_scope, dedupe_key)
  where status in ('succeeded', 'failed', 'skipped', 'canceled');

create index if not exists document_processing_units_retention_idx
  on document_processing_units(retained_until asc, id asc)
  where retained_until is not null;

create table if not exists document_processing_checkpoints (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  parsed_content_id text references parsed_contents(id) on delete set null,
  stage text not null check (
    stage in (
      'parsing',
      'ocr',
      'media_extraction',
      'captioning',
      'parsed_artifact'
    )
  ),
  checkpoint_key text not null,
  attempt_scope text not null default 'default',
  status text not null check (
    status in ('queued', 'running', 'completed', 'failed', 'canceled')
  ),
  cursor jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  config_hash text,
  safe_error jsonb,
  retained_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(job_id, stage, attempt_scope, checkpoint_key)
);

create index if not exists document_processing_checkpoints_scope_stage_status_idx
  on document_processing_checkpoints(
    tenant_id,
    project_id,
    knowledge_base_id,
    source_document_id,
    job_id,
    stage,
    status,
    updated_at desc,
    id desc
  );

create index if not exists document_processing_checkpoints_parsed_stage_idx
  on document_processing_checkpoints(parsed_content_id, stage, status, updated_at desc, id desc)
  where parsed_content_id is not null;

create index if not exists document_processing_checkpoints_retention_idx
  on document_processing_checkpoints(retained_until asc, id asc)
  where retained_until is not null;
