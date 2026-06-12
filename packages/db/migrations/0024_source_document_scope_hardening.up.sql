alter table source_documents
  add column if not exists tenant_id text references tenants(id) on delete cascade,
  add column if not exists project_id text references projects(id) on delete cascade;

update source_documents
set
  tenant_id = knowledge_bases.tenant_id,
  project_id = knowledge_bases.project_id
from knowledge_bases
where source_documents.knowledge_base_id = knowledge_bases.id
  and (source_documents.tenant_id is null or source_documents.project_id is null);

do $$
begin
  if exists (
    select 1
    from source_documents
    where tenant_id is null
      or project_id is null
  ) then
    raise exception 'Cannot apply 0024_source_document_scope_hardening: source documents without resolvable tenant/project scope exist.';
  end if;
end
$$;

alter table source_documents
  alter column tenant_id set not null,
  alter column project_id set not null;

create index if not exists source_documents_scope_visible_updated_idx
  on source_documents(tenant_id, project_id, knowledge_base_id, updated_at desc, id desc)
  where deleted_at is null and status <> 'deleted';
