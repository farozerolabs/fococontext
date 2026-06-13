import { sql, type Kysely } from "kysely";
import { writeIdempotentBatches, type DatabaseSchema } from "@fococontext/db";
import type { OcrBoundingBox, ParserWarning, PdfOcrBlock } from "@fococontext/parsers";

import type {
  SourceOcrArtifactWrite,
  SourceOcrPageProgressInput,
  SourceOcrPageWrite,
  SourceOcrParsedContentContext,
  SourceOcrRepository,
  SourceOcrReusablePageInput,
  SourceOcrSaveResultInput,
} from "./source-ocr.worker.js";

export class PostgresSourceOcrRepository implements SourceOcrRepository {
  private readonly writeBatchSize: number;

  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    options: { writeBatchSize?: number } = {},
  ) {
    this.writeBatchSize = Math.max(1, Math.floor(options.writeBatchSize ?? 100));
  }

  async getParsedContentContext(
    parsedContentId: string,
  ): Promise<SourceOcrParsedContentContext | null> {
    const parsed = await sql<{
      normalized_markdown_object_key: string;
      parser_name: string;
      parser_version: string;
    }>`
      select
        normalized_markdown_object_key,
        parser_name,
        parser_version
      from parsed_contents
      where id = ${parsedContentId}
    `.execute(this.db);
    const row = parsed.rows[0];

    if (row === undefined) {
      return null;
    }

    const mediaAssets = await sql<{ id: string }>`
      select id
      from media_assets
      where parsed_content_id = ${parsedContentId}
        and caption_status in ('pending', 'failed')
      order by id
    `.execute(this.db);

    return {
      mediaAssetIds: mediaAssets.rows.map((asset) => asset.id),
      normalizedMarkdownObjectKey: row.normalized_markdown_object_key,
      parserName: row.parser_name,
      parserVersion: row.parser_version,
    };
  }

  async listReusableOcrPages(input: SourceOcrReusablePageInput): Promise<SourceOcrPageWrite[]> {
    if (input.pageNumbers.length === 0) {
      return [];
    }

    const pagesResult = await sql<OcrPageStatusRow>`
      select
        page_number,
        status,
        reason,
        provider_name,
        engine,
        model_version,
        confidence_avg,
        attempt_count,
        retryable,
        error,
        warnings,
        metadata
      from ocr_page_statuses
      where source_document_id = ${input.documentId}
        and parsed_content_id = ${input.parsedContentId}
        and page_number in (${sql.join(input.pageNumbers)})
        and status in ('succeeded', 'skipped', 'failed')
      order by page_number asc
    `.execute(this.db);
    const blocksResult = await sql<OcrBlockRow>`
      select
        page_number,
        block_index,
        text,
        confidence,
        bbox,
        language,
        provider_name,
        engine,
        model_version,
        source_artifact_id
      from ocr_blocks
      where source_document_id = ${input.documentId}
        and parsed_content_id = ${input.parsedContentId}
        and page_number in (${sql.join(input.pageNumbers)})
      order by page_number asc, block_index asc
    `.execute(this.db);
    const blocksByPage = new Map<number, PdfOcrBlock[]>();

    for (const row of blocksResult.rows) {
      const pageNumber = row.page_number;
      const existing = blocksByPage.get(pageNumber) ?? [];
      existing.push(toPersistedPdfOcrBlock(row));
      blocksByPage.set(pageNumber, existing);
    }

    return pagesResult.rows.map((row) => ({
      artifactId: readOcrSourceArtifactId(row.metadata, blocksResult.rows, row.page_number),
      attemptCount: row.attempt_count,
      blocks: blocksByPage.get(row.page_number) ?? [],
      confidenceAvg: readOptionalNumber(row.confidence_avg),
      error: readOptionalRecord(row.error),
      engine: row.engine,
      modelVersion: row.model_version,
      pageNumber: row.page_number,
      providerName: row.provider_name,
      reason: row.reason,
      retryable: row.retryable,
      status:
        row.status === "skipped" ? "skipped" : row.status === "failed" ? "failed" : "succeeded",
      warnings: readWarnings(row.warnings),
    }));
  }

  async saveOcrPageWindow(input: SourceOcrPageProgressInput): Promise<void> {
    const pageNumbers = input.pages.map((page) => page.pageNumber);

    if (pageNumbers.length > 0) {
      await sql`
        delete from ocr_blocks
        where source_document_id = ${input.documentId}
          and page_number in (${sql.join(pageNumbers)})
      `.execute(this.db);
    }

    await writeIdempotentBatches({
      batchSize: this.writeBatchSize,
      getIdempotencyKey: (artifact) => artifact.id,
      items: input.artifacts,
      writeBatch: async (artifacts) => {
        for (const artifact of artifacts) {
          await this.upsertOcrArtifact(input, artifact);
        }

        return { written: artifacts.length };
      },
    });

    await writeIdempotentBatches({
      batchSize: this.writeBatchSize,
      getIdempotencyKey: (page) => String(page.pageNumber),
      items: input.pages,
      writeBatch: async (pages) => {
        for (const page of pages) {
          await this.upsertOcrPage(input, page);
        }

        return { written: pages.length };
      },
    });
  }

  async saveOcrResult(input: SourceOcrSaveResultInput): Promise<void> {
    await this.saveOcrPageWindow({
      artifacts: input.artifacts,
      completedAt: input.completedAt,
      documentId: input.documentId,
      jobId: input.jobId,
      pages: input.pages,
      parsedContentId: input.parsedContentId,
    });

    await sql`
      update parsed_contents
      set
        normalized_markdown_object_key = ${input.normalizedMarkdownObjectKey},
        locators = ${JSON.stringify(input.locators)}::jsonb,
        ocr_status = ${input.ocrStatus},
        ocr_summary = ${JSON.stringify(input.summary)}::jsonb,
        ocr_warnings = ${JSON.stringify(input.warnings)}::jsonb,
        ocr_provider_metadata = ${JSON.stringify(input.providerMetadata)}::jsonb,
        ocr_page_count = ${input.pages.length},
        ocr_block_count = ${input.blockCount},
        ocr_derived_segment_count = ${input.blockCount},
        ocr_completed_at = ${input.completedAt}
      where id = ${input.parsedContentId}
    `.execute(this.db);
    await sql`
      update source_documents
      set
        ocr_status = ${input.ocrStatus},
        ocr_summary = ${JSON.stringify(input.summary)}::jsonb,
        updated_at = ${input.completedAt}
      where id = ${input.documentId}
    `.execute(this.db);
  }

  private async upsertOcrArtifact(
    input: SourceOcrPageProgressInput,
    artifact: SourceOcrArtifactWrite,
  ): Promise<void> {
    await sql`
      insert into ocr_artifacts (
        id,
        source_document_id,
        parsed_content_id,
        job_id,
        page_number,
        artifact_kind,
        object_key,
        mime_type,
        size_bytes,
        sha256,
        metadata
      )
      values (
        ${artifact.id},
        ${input.documentId},
        ${input.parsedContentId},
        ${input.jobId},
        ${artifact.pageNumber},
        'rendered_page_image',
        ${artifact.objectKey},
        ${artifact.mimeType},
        ${artifact.sizeBytes},
        ${artifact.sha256},
        '{}'::jsonb
      )
      on conflict (id) do update set
        object_key = excluded.object_key,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        sha256 = excluded.sha256,
        metadata = excluded.metadata
    `.execute(this.db);
  }

  private async upsertOcrPage(
    input: SourceOcrPageProgressInput,
    page: SourceOcrPageWrite,
  ): Promise<void> {
    const pageStatusId = createOcrPageStatusId(input.documentId, page.pageNumber);

    await sql`
      insert into ocr_page_statuses (
        id,
        source_document_id,
        parsed_content_id,
        job_id,
        page_number,
        status,
        reason,
        provider_name,
        engine,
        model_version,
        confidence_avg,
        block_count,
        attempt_count,
        retryable,
        error,
        warnings,
        metadata,
        updated_at
      )
      values (
        ${pageStatusId},
        ${input.documentId},
        ${input.parsedContentId},
        ${input.jobId},
        ${page.pageNumber},
        ${page.status},
        ${page.reason},
        ${page.providerName},
        ${page.engine},
        ${page.modelVersion},
        ${page.confidenceAvg},
        ${page.blocks.length},
        ${page.attemptCount},
        ${page.retryable},
        ${page.error === null ? null : JSON.stringify(page.error)}::jsonb,
        ${JSON.stringify(page.warnings)}::jsonb,
        ${JSON.stringify({ source_artifact_id: page.artifactId ?? null })}::jsonb,
        ${input.completedAt}
      )
      on conflict (source_document_id, page_number) do update set
        parsed_content_id = excluded.parsed_content_id,
        job_id = excluded.job_id,
        status = excluded.status,
        reason = excluded.reason,
        provider_name = excluded.provider_name,
        engine = excluded.engine,
        model_version = excluded.model_version,
        confidence_avg = excluded.confidence_avg,
        block_count = excluded.block_count,
        attempt_count = excluded.attempt_count,
        retryable = excluded.retryable,
        error = excluded.error,
        warnings = excluded.warnings,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `.execute(this.db);

    for (const block of page.blocks) {
      const blockId = createOcrBlockId(input.documentId, page.pageNumber, block.blockIndex);

      await sql`
        insert into ocr_blocks (
          id,
          ocr_page_status_id,
          source_document_id,
          parsed_content_id,
          source_artifact_id,
          page_number,
          block_index,
          text,
          confidence,
          bbox,
          language,
          provider_name,
          engine,
          model_version,
          locator
        )
        values (
          ${blockId},
          ${pageStatusId},
          ${input.documentId},
          ${input.parsedContentId},
          ${page.artifactId ?? null},
          ${page.pageNumber},
          ${block.blockIndex},
          ${block.text},
          ${block.confidence ?? null},
          ${block.bbox === undefined ? null : JSON.stringify(block.bbox)}::jsonb,
          ${block.language ?? null},
          ${block.provider},
          ${block.engine},
          ${block.modelVersion ?? null},
          ${JSON.stringify({
            block_id: blockId,
            block_index: block.blockIndex,
            kind: "page",
            origin: "ocr",
            page_number: page.pageNumber,
            source_artifact_id: page.artifactId ?? null,
            value: String(page.pageNumber),
          })}::jsonb
        )
        on conflict (source_document_id, page_number, block_index) do update set
          ocr_page_status_id = excluded.ocr_page_status_id,
          parsed_content_id = excluded.parsed_content_id,
          source_artifact_id = excluded.source_artifact_id,
          text = excluded.text,
          confidence = excluded.confidence,
          bbox = excluded.bbox,
          language = excluded.language,
          provider_name = excluded.provider_name,
          engine = excluded.engine,
          model_version = excluded.model_version,
          locator = excluded.locator
      `.execute(this.db);
    }
  }
}

function toPersistedPdfOcrBlock(row: OcrBlockRow): PdfOcrBlock {
  const bbox = readOptionalBoundingBox(row.bbox);
  const confidence = readOptionalNumber(row.confidence);

  return {
    pageNumber: row.page_number,
    blockIndex: row.block_index,
    text: row.text,
    ...(confidence === null ? {} : { confidence }),
    ...(bbox === undefined ? {} : { bbox }),
    ...(row.language === null ? {} : { language: row.language }),
    provider: row.provider_name,
    engine: row.engine,
    ...(row.model_version === null ? {} : { modelVersion: row.model_version }),
  };
}

function readOcrSourceArtifactId(
  metadata: unknown,
  blockRows: readonly OcrBlockRow[],
  pageNumber: number,
): string | null {
  const metadataRecord = readOptionalRecord(metadata);
  const metadataArtifactId =
    typeof metadataRecord?.source_artifact_id === "string"
      ? metadataRecord.source_artifact_id
      : null;

  if (metadataArtifactId !== null) {
    return metadataArtifactId;
  }

  return blockRows.find((row) => row.page_number === pageNumber)?.source_artifact_id ?? null;
}

function readOptionalBoundingBox(value: unknown): OcrBoundingBox | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value as OcrBoundingBox;
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readWarnings(value: unknown): ParserWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ParserWarning => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const warning = item as Partial<ParserWarning>;

    return typeof warning.kind === "string" && typeof warning.message === "string";
  });
}

function createOcrPageStatusId(documentId: string, pageNumber: number) {
  return `ocrpg_${sanitizeIdSegment(documentId)}_${pageNumber}`;
}

function createOcrBlockId(documentId: string, pageNumber: number, blockIndex: number) {
  return `ocrblk_${sanitizeIdSegment(documentId)}_${pageNumber}_${blockIndex}`;
}

function sanitizeIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "_");
}

interface OcrPageStatusRow {
  page_number: number;
  status: string;
  reason: string | null;
  provider_name: string | null;
  engine: string | null;
  model_version: string | null;
  confidence_avg: string | number | null;
  attempt_count: number;
  retryable: boolean;
  error: unknown;
  warnings: unknown;
  metadata: unknown;
}

interface OcrBlockRow {
  page_number: number;
  block_index: number;
  text: string;
  confidence: string | number | null;
  bbox: unknown;
  language: string | null;
  provider_name: string;
  engine: string;
  model_version: string | null;
  source_artifact_id: string | null;
}
