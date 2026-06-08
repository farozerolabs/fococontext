alter table if exists source_watch_rules
  add column if not exists schedule jsonb not null default '{}'::jsonb;

alter table if exists scheduled_import_jobs
  add column if not exists trigger_type text not null default 'manual',
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists duration_ms integer,
  add column if not exists retry_count integer not null default 0,
  add column if not exists retryable boolean not null default false,
  add column if not exists next_retry_at timestamptz,
  add column if not exists error jsonb,
  add column if not exists scheduled_for timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists scheduled_import_jobs_rule_created_at_idx
  on scheduled_import_jobs(source_watch_rule_id, created_at desc);

create index if not exists source_watch_rules_schedule_idx
  on source_watch_rules using gin(schedule);
