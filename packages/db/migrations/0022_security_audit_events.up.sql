create table if not exists security_audit_events (
  id text primary key,
  tenant_id text,
  project_id text,
  account_id text,
  api_key_id text,
  actor_type text not null,
  username text,
  event_type text not null,
  route_group text not null,
  outcome text not null,
  reason_code text not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_created_idx
  on security_audit_events(created_at desc, id desc);

create index if not exists security_audit_events_scope_created_idx
  on security_audit_events(tenant_id, project_id, created_at desc, id desc);

create index if not exists security_audit_events_event_created_idx
  on security_audit_events(event_type, outcome, created_at desc, id desc);

create index if not exists security_audit_events_route_created_idx
  on security_audit_events(route_group, reason_code, created_at desc, id desc);
