import { Injectable } from "@nestjs/common";

import type {
  DeletionCleanupItemRecord,
  DeletionCleanupItemType,
  DeletionCleanupOperationRecord,
} from "./deletion-cleanup.types.js";
import { DocumentRepository } from "../documents/document.repository.js";
import type {
  JobEventRecord,
  JobRecord,
  MediaAssetRecord,
  ParsedContentRecord,
  SourceDocumentRecord,
  UploadSessionRecord,
} from "../documents/document.types.js";

export interface DeletionCleanupManifestResult {
  manifest: Record<string, unknown>;
  items: DeletionCleanupItemRecord[];
}

export interface CollectManifestInput {
  operationId: string;
  now: string;
  maxAttempts: number;
  retainedUntil: string | null;
}

export interface CollectKnowledgeBaseManifestInput extends CollectManifestInput {
  knowledgeBaseId: string;
  knowledgeBaseType?: "canonical" | "fork";
}

export interface CollectSourceDocumentManifestInput extends CollectManifestInput {
  knowledgeBaseId: string;
  documentId: string;
}

export interface CollectSourceDocumentManifestRecordsInput extends CollectManifestInput {
  knowledgeBaseId: string;
  document: SourceDocumentRecord;
  parsedContent: ParsedContentRecord | null;
  mediaAssets: readonly MediaAssetRecord[];
  jobs: readonly JobRecord[];
  jobEventsByJobId: ReadonlyMap<string, readonly JobEventRecord[]>;
  activeObjectKeys: ReadonlySet<string>;
}

export interface CollectUploadSessionManifestInput extends CollectManifestInput {
  session: UploadSessionRecord;
}

export function collectSourceDocumentObjectKeysFromRecords(input: {
  document: SourceDocumentRecord;
  parsedContent: ParsedContentRecord | null;
  mediaAssets: readonly MediaAssetRecord[];
}): string[] {
  return uniqueObjectEntries(collectDocumentEntriesFromRecords(input)).map(
    (entry) => entry.objectKey,
  );
}

export function collectSourceDocumentManifestFromRecords(
  input: CollectSourceDocumentManifestRecordsInput,
): DeletionCleanupManifestResult {
  if (input.document.knowledgeBaseId !== input.knowledgeBaseId) {
    return createManifestResult({
      input,
      targetType: "source_document",
      targetId: input.document.id,
      knowledgeBaseId: input.knowledgeBaseId,
      objectEntries: [],
      rowRefs: [],
    });
  }

  const objectEntries = uniqueObjectEntries(
    collectDocumentEntriesFromRecords({
      document: input.document,
      parsedContent: input.parsedContent,
      mediaAssets: input.mediaAssets,
    }),
  ).map((entry) => {
    if (input.activeObjectKeys.has(entry.objectKey)) {
      return {
        ...entry,
        status: "skipped" as const,
        skipReason: "object_key_referenced_by_active_resource",
        itemType: "reference" as const,
      };
    }

    return {
      ...entry,
      status: "pending" as const,
    };
  });

  return createManifestResult({
    input,
    targetType: "source_document",
    targetId: input.document.id,
    knowledgeBaseId: input.document.knowledgeBaseId,
    objectEntries,
    rowRefs: collectDocumentRowRefsFromRecords({
      document: input.document,
      parsedContent: input.parsedContent,
      mediaAssets: input.mediaAssets,
      jobs: input.jobs,
      jobEventsByJobId: input.jobEventsByJobId,
    }),
  });
}

@Injectable()
export class DeletionCleanupManifestCollector {
  constructor(private readonly documentRepository: DocumentRepository) {}

  collectKnowledgeBaseManifest(
    input: CollectKnowledgeBaseManifestInput,
  ): DeletionCleanupManifestResult {
    const documents = this.documentRepository.listDocuments(input.knowledgeBaseId);
    const entries = documents.flatMap((document) => this.collectDocumentEntries(document));
    const documentRowRefs = documents.flatMap((document) => this.collectDocumentRowRefs(document));
    const rowRefs: DatabaseRowRef[] = [
      { tableName: "knowledge_bases", resourceId: input.knowledgeBaseId },
      ...documentRowRefs,
      ...this.collectKnowledgeBaseJobRowRefs(input.knowledgeBaseId, documentRowRefs),
      ...(input.knowledgeBaseType === "fork"
        ? createForkOwnedScopedRowRefs(input.knowledgeBaseId)
        : []),
    ];

    return createManifestResult({
      input,
      targetType: "knowledge_base",
      targetId: input.knowledgeBaseId,
      knowledgeBaseId: input.knowledgeBaseId,
      objectEntries: uniqueObjectEntries(entries).map((entry) => ({
        ...entry,
        status: "pending",
      })),
      rowRefs,
    });
  }

  collectSourceDocumentManifest(
    input: CollectSourceDocumentManifestInput,
  ): DeletionCleanupManifestResult {
    const document = this.documentRepository.findDocumentById(input.documentId);

    if (document === undefined) {
      return createManifestResult({
        input,
        targetType: "source_document",
        targetId: input.documentId,
        knowledgeBaseId: input.knowledgeBaseId,
        objectEntries: [],
        rowRefs: [],
      });
    }

    if (document.knowledgeBaseId !== input.knowledgeBaseId) {
      return createManifestResult({
        input,
        targetType: "source_document",
        targetId: input.documentId,
        knowledgeBaseId: input.knowledgeBaseId,
        objectEntries: [],
        rowRefs: [],
      });
    }

    const jobs = this.documentRepository
      .listJobs(document.knowledgeBaseId)
      .filter((job) => job.documentId === document.id);
    const jobEventsByJobId = new Map(
      jobs.map((job) => [job.id, this.documentRepository.listJobEvents(job.id)]),
    );

    return collectSourceDocumentManifestFromRecords({
      operationId: input.operationId,
      now: input.now,
      maxAttempts: input.maxAttempts,
      retainedUntil: input.retainedUntil,
      knowledgeBaseId: input.knowledgeBaseId,
      document,
      parsedContent: this.documentRepository.findParsedContentByDocumentId(document.id) ?? null,
      mediaAssets: this.documentRepository.listMediaAssetsByDocumentId(document.id),
      jobs,
      jobEventsByJobId,
      activeObjectKeys: this.collectActiveObjectKeysForOtherSources(document),
    });
  }

  collectUploadSessionManifest(
    input: CollectUploadSessionManifestInput,
  ): DeletionCleanupManifestResult {
    return createManifestResult({
      input,
      targetType: "source_document",
      targetId: input.session.documentId,
      knowledgeBaseId: input.session.knowledgeBaseId,
      objectEntries: [
        {
          objectKey: input.session.objectKey,
          resourceType: "upload_sessions",
          resourceId: input.session.id,
          status: "pending",
        },
      ],
      rowRefs: [],
    });
  }

  private collectDocumentEntries(document: SourceDocumentRecord): ObjectEntry[] {
    return collectDocumentEntriesFromRecords({
      document,
      parsedContent: this.documentRepository.findParsedContentByDocumentId(document.id) ?? null,
      mediaAssets: this.documentRepository.listMediaAssetsByDocumentId(document.id),
    });
  }

  private collectDocumentRowRefs(document: SourceDocumentRecord): DatabaseRowRef[] {
    const parsedContent = this.documentRepository.findParsedContentByDocumentId(document.id);
    const mediaAssets = this.documentRepository.listMediaAssetsByDocumentId(document.id);
    const jobs = this.documentRepository
      .listJobs(document.knowledgeBaseId)
      .filter((job) => job.documentId === document.id);
    const jobEventsByJobId = new Map(
      jobs.map((job) => [job.id, this.documentRepository.listJobEvents(job.id)]),
    );

    return collectDocumentRowRefsFromRecords({
      document,
      parsedContent: parsedContent ?? null,
      mediaAssets,
      jobs,
      jobEventsByJobId,
    });
  }

  private collectKnowledgeBaseJobRowRefs(
    knowledgeBaseId: string,
    existingRows: readonly DatabaseRowRef[],
  ): DatabaseRowRef[] {
    const existingJobIds = new Set(
      existingRows.flatMap((row) => (row.tableName === "jobs" ? [row.resourceId] : [])),
    );
    const jobs = this.documentRepository
      .listJobs(knowledgeBaseId)
      .filter((job) => !existingJobIds.has(job.id));
    const jobEvents = jobs.flatMap((job) =>
      this.documentRepository.listJobEvents(job.id).map((event) => ({ job, event })),
    );

    return [
      ...jobs.map((job) => ({ tableName: "jobs", resourceId: job.id })),
      ...jobEvents.map(({ job, event }) => ({
        tableName: "job_events",
        resourceId: createJobEventResourceId(job, event),
      })),
    ];
  }

  private collectActiveObjectKeysForOtherSources(document: SourceDocumentRecord): Set<string> {
    const activeDocuments = this.documentRepository
      .listDocuments(document.knowledgeBaseId)
      .filter((candidate) => candidate.id !== document.id)
      .filter((candidate) => candidate.status !== "deleted");

    return new Set(
      activeDocuments.flatMap((candidate) =>
        this.collectDocumentEntries(candidate).map((entry) => entry.objectKey),
      ),
    );
  }
}

export function applyManifestToOperation(
  operation: DeletionCleanupOperationRecord,
  result: DeletionCleanupManifestResult,
): DeletionCleanupOperationRecord {
  const counts = countCleanupItems(result.items);

  return {
    ...operation,
    manifest: result.manifest,
    ...counts,
    updatedAt: operation.updatedAt,
  };
}

export function extractKnownObjectKeys(value: unknown): string[] {
  const keys = new Set<string>();
  collectKnownObjectKeys(value, keys);

  return [...keys].sort();
}

interface ObjectEntry {
  objectKey: string;
  resourceType: string;
  resourceId: string;
}

interface ManifestObjectEntry extends ObjectEntry {
  status: "pending" | "skipped";
  itemType?: "object" | "reference";
  skipReason?: string;
}

interface DatabaseRowRef {
  tableName: string;
  resourceId: string;
  scope?: "id" | "owner_knowledge_base_id" | "knowledge_base_id";
}

function collectParsedContentObjectEntries(record: ParsedContentRecord): ObjectEntry[] {
  return [
    createObjectEntry(record.captionedMarkdownObjectKey, "parsed_contents", record.id),
    createObjectEntry(record.normalizedMarkdownObjectKey, "parsed_contents", record.id),
    createObjectEntry(record.plainTextObjectKey, "parsed_contents", record.id),
    ...extractKnownObjectKeys(record.ocrSummary).map((objectKey) =>
      createObjectEntry(objectKey, "parsed_contents.ocr_summary", record.id),
    ),
    ...extractKnownObjectKeys(record.ocrProviderMetadata).map((objectKey) =>
      createObjectEntry(objectKey, "parsed_contents.ocr_provider_metadata", record.id),
    ),
  ].filter(isObjectEntry);
}

function collectDocumentEntriesFromRecords(input: {
  document: SourceDocumentRecord;
  parsedContent: ParsedContentRecord | null;
  mediaAssets: readonly MediaAssetRecord[];
}): ObjectEntry[] {
  return [
    createObjectEntry(input.document.objectKey, "source_documents", input.document.id),
    ...extractKnownObjectKeys(input.document.metadata).map((objectKey) =>
      createObjectEntry(objectKey, "source_documents.metadata", input.document.id),
    ),
    ...(input.parsedContent === null ? [] : collectParsedContentObjectEntries(input.parsedContent)),
    ...input.mediaAssets.map((asset) =>
      createObjectEntry(asset.objectKey, "media_assets", asset.id),
    ),
  ].filter(isObjectEntry);
}

function collectDocumentRowRefsFromRecords(input: {
  document: SourceDocumentRecord;
  parsedContent: ParsedContentRecord | null;
  mediaAssets: readonly MediaAssetRecord[];
  jobs: readonly JobRecord[];
  jobEventsByJobId: ReadonlyMap<string, readonly JobEventRecord[]>;
}): DatabaseRowRef[] {
  const jobEvents = input.jobs.flatMap((job) =>
    (input.jobEventsByJobId.get(job.id) ?? []).map((event) => ({ job, event })),
  );

  return [
    { tableName: "source_documents", resourceId: input.document.id },
    ...(input.parsedContent === null
      ? []
      : [{ tableName: "parsed_contents", resourceId: input.parsedContent.id }]),
    ...input.mediaAssets.map((asset) => ({ tableName: "media_assets", resourceId: asset.id })),
    ...input.jobs.map((job) => ({ tableName: "jobs", resourceId: job.id })),
    ...jobEvents.map(({ job, event }) => ({
      tableName: "job_events",
      resourceId: createJobEventResourceId(job, event),
    })),
  ];
}

function createManifestResult(input: {
  input: CollectManifestInput;
  targetType: "knowledge_base" | "source_document";
  targetId: string;
  knowledgeBaseId: string | null;
  objectEntries: ManifestObjectEntry[];
  rowRefs: DatabaseRowRef[];
}): DeletionCleanupManifestResult {
  const objectItems = input.objectEntries.map((entry, index) =>
    createCleanupItem({
      operationId: input.input.operationId,
      index,
      itemType: entry.itemType ?? "object",
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      objectKey: entry.objectKey,
      tableName: null,
      knowledgeBaseId: input.knowledgeBaseId,
      sourceDocumentId: input.targetType === "source_document" ? input.targetId : null,
      status: entry.status,
      skipReason: entry.skipReason ?? null,
      phase: entry.status === "skipped" ? "object_cleanup" : "queued",
      now: input.input.now,
      maxAttempts: input.input.maxAttempts,
      retainedUntil: input.input.retainedUntil,
    }),
  );
  const databaseItems = input.rowRefs.sort(compareDatabaseRowRefs).map((row, index) =>
    createCleanupItem({
      operationId: input.input.operationId,
      index: objectItems.length + index,
      itemType: "database_row",
      resourceType:
        row.scope === undefined || row.scope === "id"
          ? row.tableName
          : `${row.tableName}.${row.scope}`,
      resourceId: row.resourceId,
      objectKey: null,
      tableName: row.tableName,
      knowledgeBaseId: input.knowledgeBaseId,
      sourceDocumentId: input.targetType === "source_document" ? input.targetId : null,
      status: "pending",
      skipReason: null,
      phase: "queued",
      now: input.input.now,
      maxAttempts: input.input.maxAttempts,
      retainedUntil: input.input.retainedUntil,
    }),
  );
  const items = [...objectItems, ...databaseItems];
  const objectItemCount = objectItems.filter((item) => item.itemType === "object").length;
  const skippedReferenceCount = objectItems.filter((item) => item.itemType === "reference").length;

  return {
    manifest: {
      target_type: input.targetType,
      target_id: input.targetId,
      knowledge_base_id: input.knowledgeBaseId,
      object_key_count: objectItemCount,
      database_row_count: databaseItems.length,
      skipped_reference_count: skippedReferenceCount,
      total_item_count: items.length,
      item_page_size: items.length,
      item_page_count: items.length === 0 ? 0 : 1,
    },
    items,
  };
}

function createObjectEntry(
  objectKey: string | undefined,
  resourceType: string,
  resourceId: string,
): ObjectEntry | undefined {
  return objectKey === undefined || objectKey.trim().length === 0
    ? undefined
    : {
        objectKey,
        resourceType,
        resourceId,
      };
}

function isObjectEntry(entry: ObjectEntry | undefined): entry is ObjectEntry {
  return entry !== undefined;
}

function uniqueObjectEntries(entries: readonly ObjectEntry[]): ObjectEntry[] {
  const deduped = new Map<string, ObjectEntry>();

  for (const entry of entries) {
    const existing = deduped.get(entry.objectKey);

    if (existing === undefined) {
      deduped.set(entry.objectKey, entry);
    }
  }

  return [...deduped.values()].sort((a, b) => a.objectKey.localeCompare(b.objectKey));
}

function createCleanupItem(input: {
  operationId: string;
  index: number;
  itemType: DeletionCleanupItemType;
  resourceType: string | null;
  resourceId: string | null;
  objectKey: string | null;
  tableName: string | null;
  knowledgeBaseId: string | null;
  sourceDocumentId: string | null;
  status: DeletionCleanupItemRecord["status"];
  skipReason: string | null;
  phase: DeletionCleanupItemRecord["phase"];
  now: string;
  maxAttempts: number;
  retainedUntil: string | null;
}): DeletionCleanupItemRecord {
  return {
    id: `${input.operationId}_item_${String(input.index + 1).padStart(6, "0")}`,
    operationId: input.operationId,
    itemType: input.itemType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    objectKey: input.objectKey,
    tableName: input.tableName,
    knowledgeBaseId: input.knowledgeBaseId,
    sourceDocumentId: input.sourceDocumentId,
    status: input.status,
    phase: input.phase,
    attemptCount: 0,
    maxAttempts: input.maxAttempts,
    lastError: null,
    skipReason: input.skipReason,
    retryAfter: null,
    retainedUntil: input.retainedUntil,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: input.status === "skipped" ? input.now : null,
  };
}

function createForkOwnedScopedRowRefs(knowledgeBaseId: string): DatabaseRowRef[] {
  return forkOwnedOverlayTables.map((tableName) => ({
    tableName,
    resourceId: knowledgeBaseId,
    scope: "owner_knowledge_base_id" as const,
  }));
}

function countCleanupItems(items: readonly DeletionCleanupItemRecord[]) {
  return {
    totalItemCount: items.length,
    pendingItemCount: items.filter((item) => item.status === "pending" || item.status === "running")
      .length,
    deletedItemCount: items.filter((item) => item.status === "deleted").length,
    skippedItemCount: items.filter((item) => item.status === "skipped").length,
    failedItemCount: items.filter((item) => item.status === "failed").length,
    objectKeyCount: items.filter((item) => item.itemType === "object" && item.objectKey !== null)
      .length,
    databaseRowCount: items.filter((item) => item.itemType === "database_row").length,
  };
}

const forkOwnedOverlayTables = [
  "source_documents",
  "parsed_contents",
  "media_assets",
  "ocr_page_statuses",
  "ocr_blocks",
  "ocr_artifacts",
  "media_caption_cache",
  "wiki_pages",
  "wiki_page_versions",
  "system_pages",
  "wiki_edges",
  "wiki_edge_sources",
  "wiki_analysis_results",
  "wiki_draft_candidates",
  "compile_stage_executions",
  "knowledge_versions",
  "change_sets",
  "change_set_items",
  "rollback_records",
  "page_merge_records",
  "knowledge_checks",
  "duplicate_decisions",
  "delete_impact_previews",
  "page_embeddings",
  "retrieval_traces",
] as const;

const knownObjectKeyFields = new Set([
  "object_key",
  "objectKey",
  "object_keys",
  "objectKeys",
  "normalized_markdown_object_key",
  "plain_text_object_key",
  "captioned_markdown_object_key",
  "ocr_artifact_object_key",
  "ocr_artifact_object_keys",
  "page_image_object_key",
  "page_image_object_keys",
  "export_object_key",
  "export_object_keys",
  "diff_object_key",
  "diff_object_keys",
  "compile_object_key",
  "compile_object_keys",
]);

function collectKnownObjectKeys(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKnownObjectKeys(item, output);
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (knownObjectKeyFields.has(key)) {
      collectObjectKeyValue(nested, output);
      continue;
    }
    if (typeof nested === "object" && nested !== null) {
      collectKnownObjectKeys(nested, output);
    }
  }
}

function collectObjectKeyValue(value: unknown, output: Set<string>): void {
  if (typeof value === "string" && value.trim().length > 0) {
    output.add(value.trim());
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeyValue(item, output);
    }
  }
}

function compareDatabaseRowRefs(left: DatabaseRowRef, right: DatabaseRowRef): number {
  const tableComparison = left.tableName.localeCompare(right.tableName);

  return tableComparison === 0 ? left.resourceId.localeCompare(right.resourceId) : tableComparison;
}

function createJobEventResourceId(job: JobRecord, event: JobEventRecord): string {
  return `${job.id}:${event.createdAt}:${event.type}`;
}
