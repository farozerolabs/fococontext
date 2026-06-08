import { Injectable } from "@nestjs/common";

import type {
  DocumentKnowledgeBaseScopeRecord,
  JobEventRecord,
  JobRecord,
  MediaAssetRecord,
  ParsedContentRecord,
  SourceDocumentRecord,
  SourceVisibilityOrigin,
  UploadSessionRecord,
} from "./document.types.js";

@Injectable()
export class DocumentRepository {
  private readonly knowledgeBaseScopes = new Map<string, DocumentKnowledgeBaseScopeRecord>();
  private readonly documents = new Map<string, SourceDocumentRecord>();
  private readonly jobs = new Map<string, JobRecord>();
  private readonly jobEvents = new Map<string, JobEventRecord[]>();
  private readonly parsedContents = new Map<string, ParsedContentRecord>();
  private readonly mediaAssets = new Map<string, MediaAssetRecord>();
  private readonly uploadSessions = new Map<string, UploadSessionRecord>();

  createDocument(record: SourceDocumentRecord): SourceDocumentRecord {
    this.documents.set(record.id, cloneDocument(record));

    return cloneDocument(record);
  }

  upsertKnowledgeBaseScope(record: DocumentKnowledgeBaseScopeRecord): void {
    this.knowledgeBaseScopes.set(record.knowledgeBaseId, { ...record });
  }

  replaceKnowledgeBaseScopes(records: readonly DocumentKnowledgeBaseScopeRecord[]): void {
    this.knowledgeBaseScopes.clear();

    for (const record of records) {
      this.upsertKnowledgeBaseScope(record);
    }
  }

  updateDocument(record: SourceDocumentRecord): SourceDocumentRecord {
    this.documents.set(record.id, cloneDocument(record));

    return cloneDocument(record);
  }

  listDocuments(knowledgeBaseId: string): SourceDocumentRecord[] {
    return [...this.documents.values()]
      .filter((record) => record.knowledgeBaseId === knowledgeBaseId)
      .map((record) => cloneDocument(record));
  }

  listVisibleDocuments(knowledgeBaseId: string): SourceDocumentRecord[] {
    const scope = this.knowledgeBaseScopes.get(knowledgeBaseId);

    if (scope?.knowledgeBaseType !== "fork" || scope.upstreamKnowledgeBaseId === null) {
      return [...this.documents.values()]
        .filter((record) => isCanonicalDocument(record, knowledgeBaseId))
        .map((record) => normalizeVisibleDocument(record, knowledgeBaseId, "canonical"));
    }

    const tombstonedUpstreamIds = new Set(
      [...this.documents.values()]
        .filter((record) => record.ownerKnowledgeBaseId === knowledgeBaseId)
        .filter((record) => record.forkTombstonedAt != null)
        .flatMap((record) =>
          record.upstreamResourceId === undefined || record.upstreamResourceId === null
            ? []
            : [record.upstreamResourceId],
        ),
    );
    const visibleByKey = new Map<string, SourceDocumentRecord>();

    for (const record of this.documents.values()) {
      if (
        isCanonicalDocument(record, scope.upstreamKnowledgeBaseId) &&
        !tombstonedUpstreamIds.has(record.id)
      ) {
        visibleByKey.set(
          record.id,
          normalizeVisibleDocument(record, knowledgeBaseId, "upstream_inherited", record.id),
        );
      }
    }

    for (const record of this.documents.values()) {
      if (
        isForkOwnedDocument(record, knowledgeBaseId) &&
        record.forkTombstonedAt == null &&
        record.status !== "deleted"
      ) {
        visibleByKey.set(
          record.upstreamResourceId ?? record.id,
          normalizeVisibleDocument(record, knowledgeBaseId, "fork_owned"),
        );
      }
    }

    return [...visibleByKey.values()].map((record) => cloneDocument(record));
  }

  findDocumentById(id: string): SourceDocumentRecord | undefined {
    const record = this.documents.get(id);

    return record === undefined ? undefined : cloneDocument(record);
  }

  createUploadSession(record: UploadSessionRecord): UploadSessionRecord {
    this.uploadSessions.set(record.id, cloneUploadSession(record));

    return cloneUploadSession(record);
  }

  updateUploadSession(record: UploadSessionRecord): UploadSessionRecord {
    this.uploadSessions.set(record.id, cloneUploadSession(record));

    return cloneUploadSession(record);
  }

  findUploadSessionById(id: string): UploadSessionRecord | undefined {
    const record = this.uploadSessions.get(id);

    return record === undefined ? undefined : cloneUploadSession(record);
  }

  findUploadSessionByIdempotencyKey(
    knowledgeBaseId: string,
    idempotencyKey: string,
  ): UploadSessionRecord | undefined {
    const record = [...this.uploadSessions.values()].find(
      (item) => item.knowledgeBaseId === knowledgeBaseId && item.idempotencyKey === idempotencyKey,
    );

    return record === undefined ? undefined : cloneUploadSession(record);
  }

  listUploadSessions(knowledgeBaseId?: string): UploadSessionRecord[] {
    return [...this.uploadSessions.values()]
      .filter(
        (record) => knowledgeBaseId === undefined || record.knowledgeBaseId === knowledgeBaseId,
      )
      .map((record) => cloneUploadSession(record));
  }

  createJob(record: JobRecord): JobRecord {
    this.jobs.set(record.id, cloneJob(record));
    this.appendJobEvent({
      jobId: record.id,
      type: toInitialJobEventType(record.status),
      stage: record.stage,
      status: record.status,
      message: record.progressMessage,
      metadata: {},
      createdAt: record.createdAt,
    });

    return cloneJob(record);
  }

  findJobById(id: string): JobRecord | undefined {
    const record = this.jobs.get(id);

    return record === undefined ? undefined : cloneJob(record);
  }

  listJobs(knowledgeBaseId: string): JobRecord[] {
    return [...this.jobs.values()]
      .filter((record) => record.knowledgeBaseId === knowledgeBaseId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => cloneJob(record));
  }

  listAllJobs(): JobRecord[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => cloneJob(record));
  }

  findJobByIdempotencyKey(knowledgeBaseId: string, idempotencyKey: string): JobRecord | undefined {
    const record = [...this.jobs.values()].find(
      (item) => item.knowledgeBaseId === knowledgeBaseId && item.idempotencyKey === idempotencyKey,
    );

    return record === undefined ? undefined : cloneJob(record);
  }

  findLatestJobByDocumentId(documentId: string): JobRecord | undefined {
    const jobs = [...this.jobs.values()]
      .filter((record) => record.documentId === documentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return jobs[0] === undefined ? undefined : cloneJob(jobs[0]);
  }

  updateJob(record: JobRecord): JobRecord {
    this.jobs.set(record.id, cloneJob(record));

    return cloneJob(record);
  }

  appendJobEvent(record: JobEventRecord): JobEventRecord {
    const events = this.jobEvents.get(record.jobId) ?? [];
    events.push(cloneJobEvent(record));
    this.jobEvents.set(record.jobId, events);

    return cloneJobEvent(record);
  }

  replaceJobEvents(jobId: string, records: readonly JobEventRecord[]): JobEventRecord[] {
    this.jobEvents.set(
      jobId,
      records.map((record) => cloneJobEvent(record)),
    );

    return this.listJobEvents(jobId);
  }

  listJobEvents(jobId: string): JobEventRecord[] {
    return (this.jobEvents.get(jobId) ?? []).map((record) => cloneJobEvent(record));
  }

  listAllJobEvents(): JobEventRecord[] {
    return [...this.jobEvents.values()]
      .flatMap((records) => records)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => cloneJobEvent(record));
  }

  findParsedContentByDocumentId(documentId: string): ParsedContentRecord | undefined {
    const record = [...this.parsedContents.values()].find((item) => item.documentId === documentId);

    return record === undefined ? undefined : cloneParsedContent(record);
  }

  listMediaAssetsByDocumentId(documentId: string): MediaAssetRecord[] {
    return [...this.mediaAssets.values()]
      .filter((record) => record.documentId === documentId)
      .map((record) => cloneMediaAsset(record));
  }

  findMediaAssetById(id: string): MediaAssetRecord | undefined {
    const record = this.mediaAssets.get(id);

    return record === undefined ? undefined : cloneMediaAsset(record);
  }

  replaceSnapshot(input: {
    documents: readonly SourceDocumentRecord[];
    uploadSessions?: readonly UploadSessionRecord[];
    jobs: readonly JobRecord[];
    jobEvents: readonly JobEventRecord[];
    parsedContents: readonly ParsedContentRecord[];
    mediaAssets: readonly MediaAssetRecord[];
  }): void {
    this.documents.clear();
    this.jobs.clear();
    this.jobEvents.clear();
    this.parsedContents.clear();
    this.mediaAssets.clear();
    this.uploadSessions.clear();

    for (const document of input.documents) {
      this.documents.set(document.id, cloneDocument(document));
    }
    for (const uploadSession of input.uploadSessions ?? []) {
      this.uploadSessions.set(uploadSession.id, cloneUploadSession(uploadSession));
    }
    for (const job of input.jobs) {
      this.jobs.set(job.id, cloneJob(job));
    }
    for (const event of input.jobEvents) {
      const events = this.jobEvents.get(event.jobId) ?? [];
      events.push(cloneJobEvent(event));
      this.jobEvents.set(event.jobId, events);
    }
    for (const parsedContent of input.parsedContents) {
      this.parsedContents.set(parsedContent.id, cloneParsedContent(parsedContent));
    }
    for (const mediaAsset of input.mediaAssets) {
      this.mediaAssets.set(mediaAsset.id, cloneMediaAsset(mediaAsset));
    }
  }
}

function isCanonicalDocument(record: SourceDocumentRecord, knowledgeBaseId: string): boolean {
  return (
    record.knowledgeBaseId === knowledgeBaseId &&
    record.ownerKnowledgeBaseId == null &&
    record.forkTombstonedAt == null
  );
}

function isForkOwnedDocument(record: SourceDocumentRecord, knowledgeBaseId: string): boolean {
  return (
    record.knowledgeBaseId === knowledgeBaseId || record.ownerKnowledgeBaseId === knowledgeBaseId
  );
}

function normalizeVisibleDocument(
  record: SourceDocumentRecord,
  ownerKnowledgeBaseId: string,
  visibilityOrigin: SourceVisibilityOrigin,
  upstreamResourceId: string | null = record.upstreamResourceId ?? null,
): SourceDocumentRecord {
  return {
    ...record,
    knowledgeBaseId: ownerKnowledgeBaseId,
    visibilityOrigin,
    ownerKnowledgeBaseId: visibilityOrigin === "canonical" ? null : ownerKnowledgeBaseId,
    upstreamResourceId,
    forkTombstonedAt: null,
  };
}

function cloneDocument(record: SourceDocumentRecord): SourceDocumentRecord {
  return {
    ...record,
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
    ...(record.ocrSummary === undefined
      ? {}
      : { ocrSummary: JSON.parse(JSON.stringify(record.ocrSummary)) as Record<string, unknown> }),
  };
}

function cloneUploadSession(record: UploadSessionRecord): UploadSessionRecord {
  return {
    ...record,
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
  };
}

function cloneJob(record: JobRecord): JobRecord {
  return {
    ...record,
    error:
      record.error === null
        ? null
        : (JSON.parse(JSON.stringify(record.error)) as Record<string, unknown>),
  };
}

function toInitialJobEventType(status: JobRecord["status"]): JobEventRecord["type"] {
  if (status === "running") {
    return "job.running";
  }
  if (status === "completed") {
    return "job.completed";
  }
  if (status === "failed") {
    return "job.failed";
  }
  if (status === "canceled") {
    return "job.canceled";
  }

  return "job.queued";
}

function cloneJobEvent(record: JobEventRecord): JobEventRecord {
  return {
    ...record,
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
  };
}

function cloneParsedContent(record: ParsedContentRecord): ParsedContentRecord {
  const cloned: ParsedContentRecord = {
    ...record,
    locators: cloneJsonArray(record.locators),
    tables: cloneJsonArray(record.tables),
    warnings: cloneJsonArray(record.warnings),
    ocrSummary: JSON.parse(JSON.stringify(record.ocrSummary)) as Record<string, unknown>,
    ocrWarnings: cloneJsonArray(record.ocrWarnings),
    ocrProviderMetadata: JSON.parse(JSON.stringify(record.ocrProviderMetadata)) as Record<
      string,
      unknown
    >,
    ocrBlocks: cloneJsonArray(record.ocrBlocks),
    error:
      record.error === null
        ? null
        : (JSON.parse(JSON.stringify(record.error)) as Record<string, unknown>),
  };

  return cloned;
}

function cloneMediaAsset(record: MediaAssetRecord): MediaAssetRecord {
  return {
    ...record,
    locator: JSON.parse(JSON.stringify(record.locator)) as Record<string, unknown>,
    captionError:
      record.captionError === null
        ? null
        : (JSON.parse(JSON.stringify(record.captionError)) as Record<string, unknown>),
  };
}

function cloneJsonArray(
  value: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return JSON.parse(JSON.stringify(value)) as readonly Record<string, unknown>[];
}
