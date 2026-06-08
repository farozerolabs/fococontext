create table if not exists media_caption_cache (
  id text primary key,
  image_hash text not null,
  provider_name text not null,
  model text not null,
  prompt_version text not null,
  caption text not null,
  mime_type text,
  usage jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists media_caption_cache_lookup_idx
  on media_caption_cache(image_hash, provider_name, model, prompt_version);

alter table parsed_contents
  add column if not exists captioned_markdown_object_key text,
  add column if not exists captioned_at timestamptz;

alter table media_assets
  add column if not exists caption_provider_name text,
  add column if not exists caption_model text,
  add column if not exists caption_prompt_version text,
  add column if not exists caption_model_call_id text references model_calls(id) on delete set null,
  add column if not exists caption_cache_hit boolean not null default false,
  add column if not exists caption_attempt_count integer not null default 0,
  add column if not exists caption_error jsonb,
  add column if not exists caption_generated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists media_assets_caption_status_idx
  on media_assets(caption_status, updated_at desc);

create index if not exists media_assets_caption_model_call_idx
  on media_assets(caption_model_call_id);

update media_assets
set
  caption_status = coalesce(nullif(caption_status, ''), 'not_configured'),
  caption_cache_hit = coalesce(caption_cache_hit, false),
  caption_attempt_count = coalesce(caption_attempt_count, 0),
  updated_at = coalesce(updated_at, created_at, now());
