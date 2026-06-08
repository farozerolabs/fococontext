drop index if exists webhook_deliveries_next_attempt_idx;

alter table webhook_deliveries
  drop column if exists last_attempt_at,
  drop column if exists signing,
  drop column if exists max_attempts;

alter table webhooks
  drop column if exists secret_ciphertext;
