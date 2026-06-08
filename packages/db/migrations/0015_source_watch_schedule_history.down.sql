drop index if exists source_watch_rules_schedule_idx;
drop index if exists scheduled_import_jobs_rule_created_at_idx;

alter table if exists scheduled_import_jobs
  drop column if exists metadata,
  drop column if exists scheduled_for,
  drop column if exists error,
  drop column if exists next_retry_at,
  drop column if exists retryable,
  drop column if exists retry_count,
  drop column if exists duration_ms,
  drop column if exists finished_at,
  drop column if exists started_at,
  drop column if exists trigger_type;

alter table if exists source_watch_rules
  drop column if exists schedule;
