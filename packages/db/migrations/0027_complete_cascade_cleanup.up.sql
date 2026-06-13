alter table deletion_cleanup_operations
  add column if not exists redis_key_count integer not null default 0;

alter table deletion_cleanup_operations
  drop constraint if exists deletion_cleanup_operations_target_type_check;

alter table deletion_cleanup_operations
  add constraint deletion_cleanup_operations_target_type_check
  check (
    target_type in (
      'knowledge_base',
      'source_document',
      'wiki_page',
      'wiki_page_version',
      'wiki_edge',
      'job',
      'job_artifact',
      'source_watch_rule',
      'webhook',
      'import_preview',
      'retrieval_trace'
    )
  );

alter table deletion_cleanup_operations
  drop constraint if exists deletion_cleanup_operations_phase_check;

alter table deletion_cleanup_operations
  add constraint deletion_cleanup_operations_phase_check
  check (
    phase in (
      'queued',
      'manifest',
      'fencing',
      'object_cleanup',
      'redis_cleanup',
      'database_cleanup',
      'retention',
      'completed',
      'failed',
      'canceled'
    )
  );

alter table deletion_cleanup_items
  drop constraint if exists deletion_cleanup_items_item_type_check;

alter table deletion_cleanup_items
  add constraint deletion_cleanup_items_item_type_check
  check (item_type in ('object', 'database_row', 'redis_key', 'reference', 'audit'));

alter table deletion_cleanup_items
  drop constraint if exists deletion_cleanup_items_phase_check;

alter table deletion_cleanup_items
  add constraint deletion_cleanup_items_phase_check
  check (
    phase in (
      'queued',
      'manifest',
      'fencing',
      'object_cleanup',
      'redis_cleanup',
      'database_cleanup',
      'retention',
      'completed',
      'failed',
      'canceled'
    )
  );

create index if not exists deletion_cleanup_items_redis_key_idx
  on deletion_cleanup_items(resource_id)
  where item_type = 'redis_key' and resource_id is not null;

create index if not exists jobs_source_document_idx
  on jobs(source_document_id, queued_at desc, id desc)
  where source_document_id is not null;

create index if not exists model_calls_source_document_idx
  on model_calls(source_document_id, created_at desc, id desc)
  where source_document_id is not null;

create index if not exists wiki_analysis_results_source_document_idx
  on wiki_analysis_results(source_document_id, created_at desc, id desc);

create index if not exists compile_stage_executions_source_document_idx
  on compile_stage_executions(source_document_id, created_at desc, id desc)
  where source_document_id is not null;

create index if not exists delete_impact_previews_source_document_idx
  on delete_impact_previews(source_document_id, created_at desc, id desc);
