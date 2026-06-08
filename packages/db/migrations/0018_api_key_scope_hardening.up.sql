create table if not exists api_keys (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  account_id text references accounts(id) on delete set null,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  permissions text[] not null default '{}',
  status text not null default 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists api_keys_key_hash_unique
  on api_keys(key_hash);

create index if not exists api_keys_tenant_project_status_idx
  on api_keys(tenant_id, project_id, status, created_at desc);

create index if not exists api_keys_key_prefix_idx
  on api_keys(key_prefix);

alter table webhooks
  add column if not exists tenant_id text,
  add column if not exists project_id text;

update webhooks
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where webhooks.knowledge_base_id = knowledge_bases.id
  and (webhooks.tenant_id is null or webhooks.project_id is null);

update webhooks
set
  tenant_id = default_project.tenant_id,
  project_id = default_project.id
from (
  select projects.id, projects.tenant_id
  from projects
  inner join tenants on tenants.id = projects.tenant_id
  where tenants.slug = 'default'
    and projects.slug = 'default'
  order by projects.created_at asc, projects.id asc
  limit 1
) as default_project
where webhooks.knowledge_base_id is null
  and (webhooks.tenant_id is null or webhooks.project_id is null);

do $$
begin
  if exists (
    select 1
    from webhooks
    where tenant_id is null
      or project_id is null
  ) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: webhooks without resolvable tenant/project scope exist.';
  end if;
end
$$;

alter table webhooks
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table jobs
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table job_events
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table source_watch_rules
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table scheduled_import_jobs
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table import_previews
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table webhook_deliveries
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table retrieval_traces
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table deletion_cleanup_operations
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

alter table deletion_cleanup_items
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

update jobs
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where jobs.knowledge_base_id = knowledge_bases.id
  and (jobs.tenant_id is null or jobs.project_id is null);

update jobs
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from source_documents
inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
where jobs.source_document_id = source_documents.id
  and (jobs.tenant_id is null or jobs.project_id is null);

update job_events
set
  tenant_id = jobs.tenant_id,
  project_id = jobs.project_id
from jobs
where job_events.job_id = jobs.id
  and (job_events.tenant_id is null or job_events.project_id is null);

update source_watch_rules
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where source_watch_rules.knowledge_base_id = knowledge_bases.id
  and (source_watch_rules.tenant_id is null or source_watch_rules.project_id is null);

update scheduled_import_jobs
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where scheduled_import_jobs.knowledge_base_id = knowledge_bases.id
  and (scheduled_import_jobs.tenant_id is null or scheduled_import_jobs.project_id is null);

update scheduled_import_jobs
set
  tenant_id = source_watch_rules.tenant_id,
  project_id = source_watch_rules.project_id
from source_watch_rules
where scheduled_import_jobs.source_watch_rule_id = source_watch_rules.id
  and (scheduled_import_jobs.tenant_id is null or scheduled_import_jobs.project_id is null);

update import_previews
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where import_previews.knowledge_base_id = knowledge_bases.id
  and (import_previews.tenant_id is null or import_previews.project_id is null);

update webhook_deliveries
set
  tenant_id = webhooks.tenant_id,
  project_id = webhooks.project_id
from webhooks
where webhook_deliveries.webhook_id = webhooks.id
  and (webhook_deliveries.tenant_id is null or webhook_deliveries.project_id is null);

update webhook_deliveries
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where webhook_deliveries.knowledge_base_id = knowledge_bases.id
  and (webhook_deliveries.tenant_id is null or webhook_deliveries.project_id is null);

update retrieval_traces
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where retrieval_traces.knowledge_base_id = knowledge_bases.id
  and (retrieval_traces.tenant_id is null or retrieval_traces.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where deletion_cleanup_operations.knowledge_base_id = knowledge_bases.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where deletion_cleanup_operations.target_type = 'knowledge_base'
  and deletion_cleanup_operations.target_id = knowledge_bases.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from source_documents
inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
where deletion_cleanup_operations.target_type = 'source_document'
  and deletion_cleanup_operations.target_id = source_documents.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = source_watch_rules.tenant_id,
  project_id = source_watch_rules.project_id
from source_watch_rules
where deletion_cleanup_operations.target_type = 'source_watch_rule'
  and deletion_cleanup_operations.target_id = source_watch_rules.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = webhooks.tenant_id,
  project_id = webhooks.project_id
from webhooks
where deletion_cleanup_operations.target_type = 'webhook'
  and deletion_cleanup_operations.target_id = webhooks.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = import_previews.tenant_id,
  project_id = import_previews.project_id
from import_previews
where deletion_cleanup_operations.target_type = 'import_preview'
  and deletion_cleanup_operations.target_id = import_previews.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_operations
set
  tenant_id = retrieval_traces.tenant_id,
  project_id = retrieval_traces.project_id
from retrieval_traces
where deletion_cleanup_operations.target_type = 'retrieval_trace'
  and deletion_cleanup_operations.target_id = retrieval_traces.id
  and (deletion_cleanup_operations.tenant_id is null or deletion_cleanup_operations.project_id is null);

update deletion_cleanup_items
set
  tenant_id = deletion_cleanup_operations.tenant_id,
  project_id = deletion_cleanup_operations.project_id
from deletion_cleanup_operations
where deletion_cleanup_items.operation_id = deletion_cleanup_operations.id
  and (deletion_cleanup_items.tenant_id is null or deletion_cleanup_items.project_id is null);

update deletion_cleanup_items
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where deletion_cleanup_items.knowledge_base_id = knowledge_bases.id
  and (deletion_cleanup_items.tenant_id is null or deletion_cleanup_items.project_id is null);

update deletion_cleanup_items
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from source_documents
inner join knowledge_bases on knowledge_bases.id = source_documents.knowledge_base_id
where deletion_cleanup_items.source_document_id = source_documents.id
  and (deletion_cleanup_items.tenant_id is null or deletion_cleanup_items.project_id is null);

do $$
begin
  if exists (select 1 from jobs where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: jobs without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from job_events where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: job events without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from source_watch_rules where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: source watch rules without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from scheduled_import_jobs where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: scheduled import jobs without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from import_previews where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: import previews without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from webhook_deliveries where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: webhook deliveries without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from retrieval_traces where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: retrieval traces without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from deletion_cleanup_operations where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: cleanup operations without resolvable tenant/project scope exist.';
  end if;
  if exists (select 1 from deletion_cleanup_items where tenant_id is null or project_id is null) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: cleanup items without resolvable tenant/project scope exist.';
  end if;
end
$$;

alter table jobs
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table job_events
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table source_watch_rules
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table scheduled_import_jobs
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table import_previews
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table webhook_deliveries
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table retrieval_traces
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table deletion_cleanup_operations
  alter column tenant_id set not null,
  alter column project_id set not null;

alter table deletion_cleanup_items
  alter column tenant_id set not null,
  alter column project_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhooks_tenant_id_fkey'
  ) then
    alter table webhooks
      add constraint webhooks_tenant_id_fkey
      foreign key (tenant_id) references tenants(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhooks_project_id_fkey'
  ) then
    alter table webhooks
      add constraint webhooks_project_id_fkey
      foreign key (project_id) references projects(id) on delete cascade;
  end if;
end
$$;

create index if not exists webhooks_tenant_project_status_idx
  on webhooks(tenant_id, project_id, status, created_at desc);

create index if not exists jobs_tenant_project_status_idx
  on jobs(tenant_id, project_id, status, updated_at desc);

create index if not exists job_events_tenant_project_created_idx
  on job_events(tenant_id, project_id, created_at desc);

create index if not exists source_watch_rules_tenant_project_status_idx
  on source_watch_rules(tenant_id, project_id, status, updated_at desc);

create index if not exists scheduled_import_jobs_tenant_project_status_idx
  on scheduled_import_jobs(tenant_id, project_id, status, created_at desc);

create index if not exists import_previews_tenant_project_status_idx
  on import_previews(tenant_id, project_id, status, created_at desc);

create index if not exists webhook_deliveries_tenant_project_status_idx
  on webhook_deliveries(tenant_id, project_id, status, created_at desc);

create index if not exists retrieval_traces_tenant_project_created_idx
  on retrieval_traces(tenant_id, project_id, created_at desc);

create index if not exists deletion_cleanup_operations_tenant_project_status_idx
  on deletion_cleanup_operations(tenant_id, project_id, status, updated_at desc);

create index if not exists deletion_cleanup_items_tenant_project_status_idx
  on deletion_cleanup_items(tenant_id, project_id, status, updated_at desc);

do $$
begin
  if exists (
    select 1
    from knowledge_bases
    where deleted_at is null
      and knowledge_base_type = 'fork'
    group by project_id, upstream_knowledge_base_id, fork_owner_type, fork_owner_external_id
    having count(*) > 1
  ) then
    raise exception 'Cannot apply 0018_api_key_scope_hardening: duplicate active fork owner identities exist.';
  end if;
end
$$;

drop index if exists knowledge_bases_active_fork_owner_unique;

create unique index if not exists knowledge_bases_active_fork_owner_unique
  on knowledge_bases (project_id, upstream_knowledge_base_id, fork_owner_type, fork_owner_external_id)
  where deleted_at is null
    and knowledge_base_type = 'fork';
