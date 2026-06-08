alter table parsed_contents
  drop column if exists markdown_preview_truncated,
  drop column if exists markdown_preview_object_key,
  drop column if exists markdown_preview;
