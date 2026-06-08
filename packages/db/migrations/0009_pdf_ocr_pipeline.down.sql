drop index if exists ocr_artifacts_document_page_idx;
drop index if exists ocr_blocks_document_page_idx;
drop index if exists ocr_page_statuses_status_idx;
drop index if exists ocr_page_statuses_document_page_idx;

alter table source_documents
  drop column if exists ocr_summary,
  drop column if exists ocr_status;

alter table parsed_contents
  drop column if exists ocr_completed_at,
  drop column if exists ocr_derived_segment_count,
  drop column if exists ocr_block_count,
  drop column if exists ocr_page_count,
  drop column if exists ocr_provider_metadata,
  drop column if exists ocr_warnings,
  drop column if exists ocr_summary,
  drop column if exists ocr_status;

drop table if exists ocr_blocks;
drop table if exists ocr_page_statuses;
drop table if exists ocr_artifacts;
