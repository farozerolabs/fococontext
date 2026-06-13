alter table upload_sessions
  add column if not exists tenant_id text,
  add column if not exists project_id text,
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists actor_source text,
  add column if not exists actor_account_id text;

update upload_sessions
set
  tenant_id = coalesce(upload_sessions.tenant_id, knowledge_bases.tenant_id),
  project_id = coalesce(upload_sessions.project_id, knowledge_bases.project_id),
  actor_type = coalesce(upload_sessions.actor_type, 'unknown'),
  actor_id = coalesce(upload_sessions.actor_id, 'unknown'),
  actor_source = coalesce(upload_sessions.actor_source, 'unknown')
from knowledge_bases
where upload_sessions.knowledge_base_id = knowledge_bases.id;

alter table upload_sessions
  alter column tenant_id set not null,
  alter column project_id set not null,
  alter column actor_type set not null,
  alter column actor_id set not null,
  alter column actor_source set not null;

drop index if exists upload_sessions_kb_idempotency_idx;

create unique index if not exists upload_sessions_scope_actor_idempotency_idx
  on upload_sessions(tenant_id, project_id, knowledge_base_id, actor_type, actor_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists upload_sessions_scope_status_idx
  on upload_sessions(tenant_id, project_id, knowledge_base_id, status);
