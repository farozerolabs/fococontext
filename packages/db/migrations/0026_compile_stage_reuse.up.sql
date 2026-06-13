alter table wiki_analysis_results
  add column if not exists reuse_key text;

alter table wiki_draft_candidates
  add column if not exists reuse_key text;

create index if not exists wiki_analysis_results_reuse_key_idx
  on wiki_analysis_results(knowledge_base_id, reuse_key, created_at desc)
  where reuse_key is not null;

create index if not exists wiki_draft_candidates_reuse_key_idx
  on wiki_draft_candidates(knowledge_base_id, reuse_key, created_at desc)
  where reuse_key is not null;

create index if not exists compile_stage_executions_job_stage_finished_idx
  on compile_stage_executions(job_id, stage, finished_at desc)
  where finished_at is not null;
