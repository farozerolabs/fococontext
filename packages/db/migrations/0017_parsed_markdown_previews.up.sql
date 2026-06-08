alter table parsed_contents
  add column if not exists markdown_preview text,
  add column if not exists markdown_preview_object_key text,
  add column if not exists markdown_preview_truncated boolean not null default false;
