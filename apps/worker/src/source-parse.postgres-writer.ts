import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "@fococontext/db";

import type {
  ParsedContentWrite,
  SourceParseMediaAssetWrite,
  SourceParseWriter,
} from "./source-parse.worker.js";

export class PostgresSourceParseWriter implements SourceParseWriter {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async saveParsedContent(record: ParsedContentWrite): Promise<void> {
    await sql`
      insert into parsed_contents (
        id,
        source_document_id,
        content_hash,
        parser_name,
        parser_version,
        normalized_markdown_object_key,
        markdown_preview,
        markdown_preview_object_key,
        markdown_preview_truncated,
        locators,
        tables,
        warnings,
        ocr_status,
        ocr_summary,
        ocr_warnings,
        ocr_provider_metadata,
        ocr_page_count,
        ocr_block_count,
        ocr_derived_segment_count,
        ocr_completed_at,
        error,
        owner_knowledge_base_id,
        visibility_origin,
        upstream_resource_id,
        fork_tombstoned_at
      )
      select
        ${record.id},
        ${record.document_id},
        source_documents.content_hash,
        ${record.parser_name},
        ${record.parser_version},
        ${record.normalized_markdown_object_key},
        ${record.markdown_preview},
        ${record.markdown_preview_object_key},
        ${record.markdown_preview_truncated},
        ${JSON.stringify(record.locators)}::jsonb,
        ${JSON.stringify(record.tables)}::jsonb,
        ${JSON.stringify(record.warnings)}::jsonb,
        'not_required',
        '{}'::jsonb,
        '[]'::jsonb,
        '{}'::jsonb,
        0,
        0,
        0,
        null,
        ${record.error === null ? null : JSON.stringify(record.error)}::jsonb,
        source_documents.owner_knowledge_base_id,
        source_documents.visibility_origin,
        source_documents.upstream_resource_id,
        source_documents.fork_tombstoned_at
      from source_documents
      where source_documents.id = ${record.document_id}
      on conflict (id) do update set
        parser_name = excluded.parser_name,
        parser_version = excluded.parser_version,
        normalized_markdown_object_key = excluded.normalized_markdown_object_key,
        markdown_preview = excluded.markdown_preview,
        markdown_preview_object_key = excluded.markdown_preview_object_key,
        markdown_preview_truncated = excluded.markdown_preview_truncated,
        locators = excluded.locators,
        tables = excluded.tables,
        warnings = excluded.warnings,
        ocr_status = excluded.ocr_status,
        ocr_summary = excluded.ocr_summary,
        ocr_warnings = excluded.ocr_warnings,
        ocr_provider_metadata = excluded.ocr_provider_metadata,
        ocr_page_count = excluded.ocr_page_count,
        ocr_block_count = excluded.ocr_block_count,
        ocr_derived_segment_count = excluded.ocr_derived_segment_count,
        ocr_completed_at = excluded.ocr_completed_at,
        error = excluded.error,
        owner_knowledge_base_id = excluded.owner_knowledge_base_id,
        visibility_origin = excluded.visibility_origin,
        upstream_resource_id = excluded.upstream_resource_id,
        fork_tombstoned_at = excluded.fork_tombstoned_at
    `.execute(this.db);
  }

  async saveMediaAssets(records: SourceParseMediaAssetWrite[]): Promise<void> {
    for (const record of records) {
      await sql`
        insert into media_assets (
          id,
          source_document_id,
          parsed_content_id,
          mime_type,
          object_key,
          hash,
          locator,
          width,
          height,
          caption_status,
          owner_knowledge_base_id,
          visibility_origin,
          upstream_resource_id,
          fork_tombstoned_at
        )
        select
          ${record.id},
          ${record.document_id},
          ${record.parsed_content_id},
          ${record.mime_type},
          ${record.object_key},
          ${record.sha256},
          ${JSON.stringify(record.locator)}::jsonb,
          ${record.width},
          ${record.height},
          ${record.caption_status},
          source_documents.owner_knowledge_base_id,
          source_documents.visibility_origin,
          source_documents.upstream_resource_id,
          source_documents.fork_tombstoned_at
        from source_documents
        where source_documents.id = ${record.document_id}
        on conflict (id) do update set
          parsed_content_id = excluded.parsed_content_id,
          mime_type = excluded.mime_type,
          object_key = excluded.object_key,
          hash = excluded.hash,
          locator = excluded.locator,
          width = excluded.width,
          height = excluded.height,
          caption_status = excluded.caption_status,
          caption = null,
          caption_provider_name = null,
          caption_model = null,
          caption_prompt_version = null,
          caption_model_call_id = null,
          caption_cache_hit = false,
          caption_attempt_count = 0,
          caption_error = null,
          caption_generated_at = null,
          owner_knowledge_base_id = excluded.owner_knowledge_base_id,
          visibility_origin = excluded.visibility_origin,
          upstream_resource_id = excluded.upstream_resource_id,
          fork_tombstoned_at = excluded.fork_tombstoned_at,
          updated_at = now()
      `.execute(this.db);
    }
  }
}
