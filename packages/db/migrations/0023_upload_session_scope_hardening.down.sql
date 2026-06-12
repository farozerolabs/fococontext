drop index if exists upload_sessions_scope_status_idx;
drop index if exists upload_sessions_scope_actor_idempotency_idx;

create unique index if not exists upload_sessions_kb_idempotency_idx
  on upload_sessions(knowledge_base_id, idempotency_key)
  where idempotency_key is not null;

alter table upload_sessions
  drop column if exists actor_account_id,
  drop column if exists actor_source,
  drop column if exists actor_id,
  drop column if exists actor_type,
  drop column if exists project_id,
  drop column if exists tenant_id;
