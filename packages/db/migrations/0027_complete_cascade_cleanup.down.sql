drop index if exists delete_impact_previews_source_document_idx;
drop index if exists compile_stage_executions_source_document_idx;
drop index if exists wiki_analysis_results_source_document_idx;
drop index if exists model_calls_source_document_idx;
drop index if exists jobs_source_document_idx;
drop index if exists deletion_cleanup_items_redis_key_idx;

alter table deletion_cleanup_items
  drop constraint if exists deletion_cleanup_items_item_type_check;

alter table deletion_cleanup_items
  add constraint deletion_cleanup_items_item_type_check
  check (item_type in ('object', 'database_row', 'reference', 'audit'));

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
      'database_cleanup',
      'retention',
      'completed',
      'failed',
      'canceled'
    )
  );

alter table deletion_cleanup_operations
  drop constraint if exists deletion_cleanup_operations_target_type_check;

alter table deletion_cleanup_operations
  add constraint deletion_cleanup_operations_target_type_check
  check (
    target_type in (
      'knowledge_base',
      'source_document',
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
      'database_cleanup',
      'retention',
      'completed',
      'failed',
      'canceled'
    )
  );

alter table deletion_cleanup_operations
  drop column if exists redis_key_count;
