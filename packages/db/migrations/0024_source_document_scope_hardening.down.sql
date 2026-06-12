drop index if exists source_documents_scope_visible_updated_idx;

alter table source_documents
  drop column if exists project_id,
  drop column if exists tenant_id;
