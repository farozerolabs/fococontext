import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { DocumentService } from "../documents/document.service.js";
import { sourceTypes, type SourceType } from "../documents/document.types.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { mapWithConcurrency } from "../utils/bounded-concurrency.js";
import type {
  BatchImportItemInput,
  BatchImportSkippedItem,
  BatchImportValidationError,
  CreateBatchImportInput,
  CreateBatchImportResponse,
} from "./batch-import.types.js";

@Injectable()
export class BatchImportService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly documentService: DocumentService,
    @Inject(runtimeConfigToken) private readonly config: RuntimeConfig,
  ) {}

  async create(
    knowledgeBaseId: string,
    input: CreateBatchImportInput,
    scope?: ApiResourceScope,
  ): Promise<CreateBatchImportResponse> {
    await this.knowledgeBaseService.get(knowledgeBaseId, scope);

    const importJobId = createResourceId("ingestJob");
    const sourceType = readSourceType(input.source_type);
    const items = readItems(input.items);
    const validationErrors = items.flatMap((item, index) =>
      validateImportItem(sourceType, item, index),
    );
    const invalidIndexes = new Set(validationErrors.map((error) => error.index));
    const skipped = createUnsupportedSourceTypeSkips(sourceType, items, invalidIndexes);
    const skippedIndexes = new Set(skipped.map((item) => item.index));
    const created = await mapWithConcurrency(
      items,
      this.config.limits.apiFanOut.batchImportConcurrency,
      async (item, index) => {
        if (invalidIndexes.has(index) || skippedIndexes.has(index)) {
          return null;
        }

        return this.createSourceFromItem(
          knowledgeBaseId,
          importJobId,
          sourceType,
          item,
          index,
          scope,
        );
      },
    );
    const createdResults = created.filter((item) => item !== null);
    const autoIngest = input.options?.auto_ingest ?? true;

    return {
      import_job: {
        id: importJobId,
        knowledge_base_id: knowledgeBaseId,
        status: createdResults.length > 0 ? "queued" : "failed",
        source_type: sourceType,
        total_items: items.length,
        accepted_items: createdResults.length,
        skipped_items: skipped.length,
        validation_error_count: validationErrors.length,
        source_document_ids: createdResults.map((result) => result.document.id),
        ingest_job_ids: createdResults.map((result) => result.job.id),
        skipped,
        validation_errors: validationErrors,
        metadata: {
          auto_ingest: autoIngest,
          request_source: "api",
        },
        created_at: new Date().toISOString(),
      },
    };
  }

  private async createSourceFromItem(
    knowledgeBaseId: string,
    importJobId: string,
    sourceType: SourceType,
    item: BatchImportItemInput,
    index: number,
    scope?: ApiResourceScope,
  ) {
    const metadata = {
      ...item.metadata,
      ...(item.external_id === undefined ? {} : { external_id: item.external_id }),
      batch_import_id: importJobId,
      batch_import_index: index,
    };
    const idempotencyKey =
      item.external_id === undefined
        ? undefined
        : `batch-import:${knowledgeBaseId}:${sourceType}:${item.external_id}`;

    if (sourceType === "url") {
      return this.documentService.createUrlSource(
        knowledgeBaseId,
        {
          metadata,
          ...(item.name === undefined ? {} : { name: item.name }),
          ...(item.source_path === undefined ? {} : { source_path: item.source_path }),
          ...(item.url === undefined ? {} : { url: item.url }),
        },
        idempotencyKey,
        scope,
      );
    }

    if (sourceType === "text") {
      return this.documentService.createTextSource(
        knowledgeBaseId,
        {
          metadata,
          ...(item.name === undefined ? {} : { name: item.name }),
          ...(item.source_path === undefined ? {} : { source_path: item.source_path }),
          ...(item.text === undefined ? {} : { text: item.text }),
        },
        idempotencyKey,
        scope,
      );
    }

    throw new ApiError("invalid_request", {
      messageKey: "api.validation.batch_import_json_source_type_not_executable",
      details: {
        fields: ["source_type"],
      },
    });
  }
}

function readSourceType(value: SourceType | undefined): SourceType {
  if (value !== undefined && sourceTypes.includes(value)) {
    return value;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.batch_import_source_type_invalid",
    details: {
      fields: ["source_type"],
    },
  });
}

function readItems(value: BatchImportItemInput[] | undefined): BatchImportItemInput[] {
  if (!Array.isArray(value)) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.batch_import_items_required",
      details: {
        fields: ["items"],
      },
    });
  }

  return value;
}

function validateImportItem(
  sourceType: SourceType,
  item: BatchImportItemInput,
  index: number,
): BatchImportValidationError[] {
  if (sourceType === "url") {
    return validateUrlImportItem(item, index);
  }
  if (sourceType === "text") {
    return validateTextImportItem(item, index);
  }

  return [];
}

function createUnsupportedSourceTypeSkips(
  sourceType: SourceType,
  items: BatchImportItemInput[],
  invalidIndexes: ReadonlySet<number>,
): BatchImportSkippedItem[] {
  if (sourceType === "url" || sourceType === "text") {
    return [];
  }

  return items
    .map((item, index) => ({
      index,
      reason: "batch_import_json_items_support_text_and_url_sources",
      ...(item.external_id === undefined ? {} : { external_id: item.external_id }),
    }))
    .filter((item) => !invalidIndexes.has(item.index));
}

function validateUrlImportItem(
  item: BatchImportItemInput,
  index: number,
): BatchImportValidationError[] {
  if (typeof item.url !== "string" || item.url.trim().length === 0) {
    return [
      {
        index,
        field: `items[${index}].url`,
        code: "required",
        message: "api.validation.batch_import_url_required",
      },
    ];
  }

  try {
    new URL(item.url);
  } catch {
    return [
      {
        index,
        field: `items[${index}].url`,
        code: "invalid",
        message: "api.validation.batch_import_url_invalid",
      },
    ];
  }

  return [];
}

function validateTextImportItem(
  item: BatchImportItemInput,
  index: number,
): BatchImportValidationError[] {
  if (typeof item.text !== "string" || item.text.trim().length === 0) {
    return [
      {
        index,
        field: `items[${index}].text`,
        code: "required",
        message: "api.validation.batch_import_text_required",
      },
    ];
  }

  return [];
}
