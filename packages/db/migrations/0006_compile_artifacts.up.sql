create table if not exists model_calls (
  id text primary key,
  knowledge_base_id text references knowledge_bases(id) on delete cascade,
  source_document_id text references source_documents(id) on delete set null,
  parsed_content_id text references parsed_contents(id) on delete set null,
  job_id text references jobs(id) on delete set null,
  change_set_id text references change_sets(id) on delete set null,
  provider_name text not null,
  model text not null,
  prompt_version_id text not null,
  workflow_kind text not null,
  output_status text not null,
  input_summary text not null default '',
  output_summary text,
  usage jsonb not null default '{}'::jsonb,
  cost_estimate_usd numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists wiki_analysis_results (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  parsed_content_id text not null references parsed_contents(id) on delete cascade,
  job_id text references jobs(id) on delete set null,
  model_call_id text references model_calls(id) on delete set null,
  prompt_version_id text not null,
  input_snapshot_id text not null,
  content_hash text,
  entities jsonb not null default '[]'::jsonb,
  concepts jsonb not null default '[]'::jsonb,
  claims jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  relationships jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  locator_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wiki_draft_candidates (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  analysis_result_id text not null references wiki_analysis_results(id) on delete cascade,
  job_id text references jobs(id) on delete set null,
  model_call_id text references model_calls(id) on delete set null,
  prompt_version_id text not null,
  input_snapshot_id text not null,
  source_document_ids text[] not null default '{}',
  page_type text not null,
  title text not null,
  slug text,
  markdown text not null,
  frontmatter jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  locator_refs jsonb not null default '[]'::jsonb,
  relationship_candidates jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),
  status text not null default 'draft',
  target_page_id text references wiki_pages(id) on delete set null,
  change_set_id text references change_sets(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compile_stage_executions (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  stage text not null,
  status text not null default 'queued',
  queue_name text not null,
  queue_job_id text,
  input_snapshot_id text not null,
  source_document_id text references source_documents(id) on delete set null,
  parsed_content_id text references parsed_contents(id) on delete set null,
  analysis_result_id text references wiki_analysis_results(id) on delete set null,
  draft_candidate_id text references wiki_draft_candidates(id) on delete set null,
  error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists model_calls_job_idx on model_calls(job_id, created_at);
create index if not exists model_calls_change_set_idx on model_calls(change_set_id, created_at);
create index if not exists model_calls_kb_workflow_idx on model_calls(knowledge_base_id, workflow_kind, created_at desc);
create index if not exists wiki_analysis_results_job_idx on wiki_analysis_results(job_id, created_at);
create index if not exists wiki_analysis_results_parsed_content_idx on wiki_analysis_results(parsed_content_id);
create index if not exists wiki_draft_candidates_analysis_idx on wiki_draft_candidates(analysis_result_id, status);
create index if not exists wiki_draft_candidates_kb_status_idx on wiki_draft_candidates(knowledge_base_id, status);
create index if not exists compile_stage_executions_job_stage_idx on compile_stage_executions(job_id, stage, created_at);
create index if not exists compile_stage_executions_kb_status_idx on compile_stage_executions(knowledge_base_id, status);
