drop index if exists compile_stage_executions_job_stage_finished_idx;
drop index if exists wiki_draft_candidates_reuse_key_idx;
drop index if exists wiki_analysis_results_reuse_key_idx;

alter table wiki_draft_candidates
  drop column if exists reuse_key;

alter table wiki_analysis_results
  drop column if exists reuse_key;
