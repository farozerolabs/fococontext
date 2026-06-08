drop index if exists media_assets_caption_model_call_idx;
drop index if exists media_assets_caption_status_idx;
drop index if exists media_caption_cache_lookup_idx;

alter table media_assets
  drop column if exists updated_at,
  drop column if exists caption_generated_at,
  drop column if exists caption_error,
  drop column if exists caption_attempt_count,
  drop column if exists caption_cache_hit,
  drop column if exists caption_model_call_id,
  drop column if exists caption_prompt_version,
  drop column if exists caption_model,
  drop column if exists caption_provider_name;

alter table parsed_contents
  drop column if exists captioned_at,
  drop column if exists captioned_markdown_object_key;

drop table if exists media_caption_cache;
