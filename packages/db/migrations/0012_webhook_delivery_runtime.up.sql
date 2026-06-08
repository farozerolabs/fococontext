alter table webhooks
  add column if not exists secret_ciphertext text;

alter table webhook_deliveries
  add column if not exists max_attempts integer not null default 1,
  add column if not exists signing jsonb not null default '{}'::jsonb,
  add column if not exists last_attempt_at timestamptz;

create index if not exists webhook_deliveries_next_attempt_idx
  on webhook_deliveries(status, next_attempt_at);
