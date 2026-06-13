import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import { DocumentService } from "../documents/document.service.js";
import { sourceTypes, type SourceType } from "../documents/document.types.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { mapWithConcurrency } from "../utils/bounded-concurrency.js";
import type {
  BatchImportItemInput,
  BatchImportItemRecord,
  BatchImportItemResponse,
  BatchImportSkippedItem,
  BatchImportStatusResponse,
  BatchImportValidationError,
  CreateBatchImportInput,
  CreateBatchImportResponse,
  BatchImportRecord,
} from "./batch-import.types.js";

@Injectable()
export class BatchImportService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly documentService: DocumentService,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
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
    const now = new Date().toISOString();
    const initialBatch = createBatchImportRecord({
      acceptedItems: 0,
      id: importJobId,
      knowledgeBaseId,
      metadata: {
        auto_ingest: input.options?.auto_ingest ?? true,
        request_source: "api",
        skipped,
        validation_errors: validationErrors,
      },
      now,
      ...(scope === undefined ? {} : { scope }),
      skippedItems: skipped.length,
      sourceType,
      totalItems: items.length,
      validationErrorCount: validationErrors.length,
    });
    const initialItems = items.map((item, index) =>
      createBatchImportItemRecord({
        batchId: importJobId,
        item,
        index,
        invalid: invalidIndexes.has(index),
        knowledgeBaseId,
        ...(scope === undefined ? {} : { scope }),
        skipped: skippedIndexes.has(index),
        sourceType,
        timestamp: now,
      }),
    );

    await this.databaseMirror.saveBatchImport(initialBatch);
    await this.databaseMirror.saveBatchImportItems(initialItems);

    let failedItemCount = 0;
    const created = await mapWithConcurrency(
      items,
      this.config.limits.apiFanOut.batchImportConcurrency,
      async (item, index) => {
        if (invalidIndexes.has(index) || skippedIndexes.has(index)) {
          return null;
        }

        try {
          return await this.createSourceFromItem(
            knowledgeBaseId,
            importJobId,
            sourceType,
            item,
            index,
            scope,
          );
        } catch (error) {
          const failedAt = new Date().toISOString();
          const currentItem = initialItems[index];

          if (currentItem !== undefined) {
            await this.databaseMirror.updateBatchImportItem({
              ...currentItem,
              safeError: toSafeBatchImportError(error),
              status: "failed",
              updatedAt: failedAt,
            });
          }

          failedItemCount += 1;
          return null;
        }
      },
    );
    const createdResults = created.filter((item) => item !== null);
    const autoIngest = input.options?.auto_ingest ?? true;
    const updatedAt = new Date().toISOString();
    const createdByIndex = new Map(
      createdResults.map((result) => [
        Number(result.document.metadata.batch_import_index ?? -1),
        result,
      ]),
    );

    for (const itemRecord of initialItems) {
      const result = createdByIndex.get(itemRecord.itemIndex);

      if (result === undefined) {
        continue;
      }

      await this.databaseMirror.updateBatchImportItem({
        ...itemRecord,
        ingestJobId: result.job.id,
        sourceDocumentId: result.document.id,
        status: "created",
        updatedAt,
      });
    }

    const acceptedItems = createdResults.length;
    const terminalBatch: BatchImportRecord = {
      ...initialBatch,
      acceptedItems,
      completedItems: acceptedItems,
      enqueueCursor: items.length,
      failedItems: failedItemCount,
      status: acceptedItems > 0 ? "queued" : "failed",
      updatedAt,
    };

    await this.databaseMirror.updateBatchImport(terminalBatch);

    return {
      import_job: {
        id: importJobId,
        knowledge_base_id: knowledgeBaseId,
        status: terminalBatch.status,
        source_type: sourceType,
        total_items: items.length,
        accepted_items: createdResults.length,
        skipped_items: skipped.length,
        validation_error_count: validationErrors.length,
        completed_items: terminalBatch.completedItems,
        failed_items: terminalBatch.failedItems,
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

  async getStatus(
    knowledgeBaseId: string,
    importJobId: string,
    input: { page: number; pageSize: number },
    scope?: ApiResourceScope,
  ): Promise<BatchImportStatusResponse> {
    const batch = await this.operationalReadStore.getBatchImportById(importJobId);

    if (batch === null) {
      throw new ApiError("job_not_found", {
        details: {
          import_job_id: importJobId,
        },
      });
    }

    if (batch.knowledgeBaseId !== knowledgeBaseId) {
      throw new ApiError("job_not_found", {
        details: {
          import_job_id: importJobId,
        },
      });
    }

    await this.knowledgeBaseService.get(batch.knowledgeBaseId, scope);

    const items = await this.operationalReadStore.listBatchImportItems(importJobId, input);

    if (items === null) {
      throw new ApiError("internal_error");
    }

    return {
      import_job: toBatchImportJobResponse(batch),
      items: items.items.map(toBatchImportItemResponse),
      pagination: {
        has_more: items.hasMore,
        page: input.page,
        page_size: input.pageSize,
        total: items.total,
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

function createBatchImportRecord(input: {
  acceptedItems: number;
  id: string;
  knowledgeBaseId: string;
  metadata: Record<string, unknown>;
  now: string;
  scope?: ApiResourceScope;
  skippedItems: number;
  sourceType: SourceType;
  totalItems: number;
  validationErrorCount: number;
}): BatchImportRecord {
  return {
    id: input.id,
    tenantId: input.scope?.tenantId ?? "tenant_default",
    projectId: input.scope?.projectId ?? "project_default",
    knowledgeBaseId: input.knowledgeBaseId,
    sourceType: input.sourceType,
    status: "queued",
    totalItems: input.totalItems,
    acceptedItems: input.acceptedItems,
    skippedItems: input.skippedItems,
    validationErrorCount: input.validationErrorCount,
    completedItems: 0,
    failedItems: 0,
    enqueueCursor: 0,
    retryCursor: 0,
    metadata: input.metadata,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function createBatchImportItemRecord(input: {
  batchId: string;
  item: BatchImportItemInput;
  index: number;
  invalid: boolean;
  knowledgeBaseId: string;
  scope?: ApiResourceScope;
  skipped: boolean;
  sourceType: SourceType;
  timestamp: string;
}): BatchImportItemRecord {
  const idempotencyKey = readBatchItemIdempotencyKey(
    input.knowledgeBaseId,
    input.sourceType,
    input.item,
  );
  const status = input.invalid
    ? "validation_failed"
    : input.skipped
      ? "skipped"
      : ("accepted" as const);

  return {
    id: `${input.batchId}:item:${input.index}`,
    tenantId: input.scope?.tenantId ?? "tenant_default",
    projectId: input.scope?.projectId ?? "project_default",
    knowledgeBaseId: input.knowledgeBaseId,
    batchId: input.batchId,
    itemIndex: input.index,
    sourceType: input.sourceType,
    externalId: input.item.external_id ?? null,
    idempotencyKey,
    status,
    sourceDocumentId: null,
    ingestJobId: null,
    safeError: null,
    metadata: {
      ...(input.item.metadata ?? {}),
      ...(input.invalid ? { validation_failed: true } : {}),
      ...(input.skipped ? { skipped: true } : {}),
      ...(input.item.source_path === undefined ? {} : { source_path: input.item.source_path }),
      ...(input.item.name === undefined ? {} : { name: input.item.name }),
    },
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

function readBatchItemIdempotencyKey(
  knowledgeBaseId: string,
  sourceType: SourceType,
  item: BatchImportItemInput,
): string | null {
  return item.external_id === undefined
    ? null
    : `batch-import:${knowledgeBaseId}:${sourceType}:${item.external_id}`;
}

function toBatchImportJobResponse(
  record: BatchImportRecord,
): CreateBatchImportResponse["import_job"] {
  const metadata = record.metadata;

  return {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    status: record.status,
    source_type: record.sourceType,
    total_items: record.totalItems,
    accepted_items: record.acceptedItems,
    skipped_items: record.skippedItems,
    validation_error_count: record.validationErrorCount,
    completed_items: record.completedItems,
    failed_items: record.failedItems,
    source_document_ids: [],
    ingest_job_ids: [],
    skipped: Array.isArray(metadata.skipped) ? (metadata.skipped as BatchImportSkippedItem[]) : [],
    validation_errors: Array.isArray(metadata.validation_errors)
      ? (metadata.validation_errors as BatchImportValidationError[])
      : [],
    metadata: {
      auto_ingest: metadata.auto_ingest === false ? false : true,
      request_source: "api",
    },
    created_at: record.createdAt,
  };
}

function toBatchImportItemResponse(record: BatchImportItemRecord): BatchImportItemResponse {
  return {
    id: record.id,
    index: record.itemIndex,
    status: record.status,
    ...(record.externalId === null ? {} : { external_id: record.externalId }),
    ...(record.sourceDocumentId === null ? {} : { source_document_id: record.sourceDocumentId }),
    ...(record.ingestJobId === null ? {} : { ingest_job_id: record.ingestJobId }),
    ...(record.safeError === null ? {} : { error: record.safeError }),
    metadata: record.metadata,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toSafeBatchImportError(error: unknown): Record<string, unknown> {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "internal_error",
      message: error.message,
    };
  }

  return {
    code: "internal_error",
  };
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
