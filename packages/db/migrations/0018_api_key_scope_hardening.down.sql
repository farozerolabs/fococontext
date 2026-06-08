drop index if exists knowledge_bases_active_fork_owner_unique;

create unique index if not exists knowledge_bases_active_fork_owner_unique
  on knowledge_bases (upstream_knowledge_base_id, fork_owner_type, fork_owner_external_id)
  where deleted_at is null
    and knowledge_base_type = 'fork';

drop index if exists webhooks_tenant_project_status_idx;
drop index if exists deletion_cleanup_items_tenant_project_status_idx;
drop index if exists deletion_cleanup_operations_tenant_project_status_idx;
drop index if exists retrieval_traces_tenant_project_created_idx;
drop index if exists webhook_deliveries_tenant_project_status_idx;
drop index if exists import_previews_tenant_project_status_idx;
drop index if exists scheduled_import_jobs_tenant_project_status_idx;
drop index if exists source_watch_rules_tenant_project_status_idx;
drop index if exists job_events_tenant_project_created_idx;
drop index if exists jobs_tenant_project_status_idx;

alter table deletion_cleanup_items
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table deletion_cleanup_operations
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table retrieval_traces
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table webhook_deliveries
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table import_previews
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table scheduled_import_jobs
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table source_watch_rules
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table job_events
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table jobs
  drop column if exists project_id,
  drop column if exists tenant_id;

alter table webhooks
  drop constraint if exists webhooks_project_id_fkey,
  drop constraint if exists webhooks_tenant_id_fkey,
  drop column if exists project_id,
  drop column if exists tenant_id;

drop index if exists api_keys_key_prefix_idx;
drop index if exists api_keys_tenant_project_status_idx;
drop index if exists api_keys_key_hash_unique;
drop table if exists api_keys;
