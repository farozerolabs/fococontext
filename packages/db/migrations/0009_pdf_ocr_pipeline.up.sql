create table if not exists ocr_artifacts (
  id text primary key,
  source_document_id text not null references source_documents(id) on delete cascade,
  parsed_content_id text references parsed_contents(id) on delete set null,
  job_id text references jobs(id) on delete set null,
  page_number integer not null,
  artifact_kind text not null,
  object_key text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ocr_page_statuses (
  id text primary key,
  source_document_id text not null references source_documents(id) on delete cascade,
  parsed_content_id text references parsed_contents(id) on delete set null,
  job_id text references jobs(id) on delete set null,
  page_number integer not null,
  status text not null,
  reason text,
  provider_name text,
  engine text,
  model_version text,
  confidence_avg numeric,
  block_count integer not null default 0,
  attempt_count integer not null default 0,
  retryable boolean not null default false,
  error jsonb,
  warnings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, page_number)
);

create table if not exists ocr_blocks (
  id text primary key,
  ocr_page_status_id text references ocr_page_statuses(id) on delete cascade,
  source_document_id text not null references source_documents(id) on delete cascade,
  parsed_content_id text references parsed_contents(id) on delete set null,
  source_artifact_id text references ocr_artifacts(id) on delete set null,
  page_number integer not null,
  block_index integer not null,
  text text not null,
  confidence numeric,
  bbox jsonb,
  language text,
  provider_name text,
  engine text,
  model_version text,
  locator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_document_id, page_number, block_index)
);

alter table parsed_contents
  add column if not exists ocr_status text,
  add column if not exists ocr_summary jsonb not null default '{}'::jsonb,
  add column if not exists ocr_warnings jsonb not null default '[]'::jsonb,
  add column if not exists ocr_provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists ocr_page_count integer not null default 0,
  add column if not exists ocr_block_count integer not null default 0,
  add column if not exists ocr_derived_segment_count integer not null default 0,
  add column if not exists ocr_completed_at timestamptz;

alter table source_documents
  add column if not exists ocr_status text,
  add column if not exists ocr_summary jsonb not null default '{}'::jsonb;

create index if not exists ocr_page_statuses_document_page_idx
  on ocr_page_statuses(source_document_id, page_number);

create index if not exists ocr_page_statuses_status_idx
  on ocr_page_statuses(status, updated_at desc);

create index if not exists ocr_blocks_document_page_idx
  on ocr_blocks(source_document_id, page_number, block_index);

create index if not exists ocr_artifacts_document_page_idx
  on ocr_artifacts(source_document_id, page_number);

update parsed_contents
set
  ocr_status = coalesce(ocr_status, 'not_required'),
  ocr_summary = coalesce(ocr_summary, '{}'::jsonb),
  ocr_warnings = coalesce(ocr_warnings, '[]'::jsonb),
  ocr_provider_metadata = coalesce(ocr_provider_metadata, '{}'::jsonb),
  ocr_page_count = coalesce(ocr_page_count, 0),
  ocr_block_count = coalesce(ocr_block_count, 0),
  ocr_derived_segment_count = coalesce(ocr_derived_segment_count, 0);

update source_documents
set
  ocr_status = coalesce(ocr_status, 'not_required'),
  ocr_summary = coalesce(ocr_summary, '{}'::jsonb);
