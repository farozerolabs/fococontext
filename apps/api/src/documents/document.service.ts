import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import { Transform } from "node:stream";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId, resolveJobProgressState } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";
import type { ObjectStorageAdapter } from "@fococontext/storage";

import type {
  DatasetConfigurationResponse,
  KnowledgeBaseResponse,
} from "../knowledge-bases/knowledge-base.types.js";
import {
  defaultApiResourceScope,
  type ApiKeyScope,
  type ApiResourceScope,
} from "../auth/api-key.guard.js";
import { objectStorageToken } from "../object-storage.provider.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  createQueuedDeletionCleanupOperation,
  toDeletionCleanupOperationSummaryResponse,
} from "../deletion-cleanup/deletion-cleanup.response.js";
import {
  applyManifestToOperation,
  collectSourceDocumentManifestFromRecords,
  collectSourceDocumentObjectKeysFromRecords,
  DeletionCleanupManifestCollector,
} from "../deletion-cleanup/deletion-cleanup.manifest.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import {
  sourceParseQueueToken,
  type SourceParseQueue,
  type SourceParseQueuePayload,
} from "../queues/source-parse.queue.js";
import { mediaCaptionQueueToken, type MediaCaptionQueue } from "../queues/media-caption.queue.js";
import {
  sourceOcrQueueToken,
  type SourceOcrQueue,
  type SourceOcrQueuePayload,
} from "../queues/source-ocr.queue.js";
import {
  deletionCleanupQueueToken,
  type DeletionCleanupQueue,
} from "../queues/deletion-cleanup.queue.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import { wikiStoreToken, type WikiStore } from "../wiki/wiki-store.js";
import {
  createRemoteSourceSecurityPolicy,
  validateRemoteSourceUrl,
} from "../source-watch/remote-source-security.js";
import type { DeletionCleanupOperationRecord } from "../deletion-cleanup/deletion-cleanup.types.js";
import { sourceEvidenceKinds } from "./document.types.js";
import type {
  DocumentParsedContentResponse,
  DocumentUploadResponse,
  CreateUploadSessionResponse,
  DeleteImpactPreviewResponse,
  DocumentProcessingStage,
  DocumentProcessingUnitRecord,
  DocumentProcessingUnitResponse,
  DocumentProcessingUnitStatus,
  JobRecord,
  JobResponse,
  ListMediaAssetsInput,
  ListMediaAssetsResult,
  ListSourceDocumentsInput,
  ListSourceDocumentsResult,
  MediaAssetRecord,
  MediaAssetPreviewEnvelope,
  MediaAssetResponse,
  ParsedContentRecord,
  ParsedContentResponse,
  SourceEvidenceBatchInput,
  SourceEvidenceBatchResponse,
  SourceEvidenceInput,
  SourceEvidenceKind,
  SourceEvidenceResponse,
  SourceEvidenceWarningResponse,
  SourceDocumentDeleteResponse,
  SourceDocumentDetailResponse,
  SourceDocumentRecord,
  SourceDocumentResponse,
  UploadSessionRecord,
  UploadSessionResponse,
} from "./document.types.js";
import { UploadAdmissionService } from "./upload-admission.service.js";

interface MultipartFilePart {
  type: "file";
  fieldname: string;
  filename: string;
  mimetype: string;
  file: NodeJS.ReadableStream & {
    truncated?: boolean;
  };
}

interface MultipartFieldPart {
  type: "field";
  fieldname: string;
  value: unknown;
}

type MultipartPart = MultipartFilePart | MultipartFieldPart;

const parsedMarkdownPreviewMaxChars = 200_000;
const parsedContentMediaAssetPreviewLimit = 100;
const documentDetailRelatedPageLimit = 100;
const documentDetailPageVersionLimit = 200;
const sourceDocumentDeletionMediaAssetLimit = 10_000;
const expiredUploadSessionSweepLimit = 500;

interface ParsedMarkdownPreviewOptions {
  enabled: boolean;
  maxChars: number;
}

export interface MultipartRequest {
  raw?: Pick<IncomingMessage, "aborted" | "destroyed" | "on" | "off">;
  parts(): AsyncIterable<MultipartPart>;
}

interface UploadDataField {
  display_name?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface UploadedFile {
  documentId: string;
  objectKey: string;
  name: string;
  mimeType: string;
  size: number;
  contentHash: string;
}

interface CreateTextSourceInput {
  name?: string;
  text?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface CreateUrlSourceInput {
  url?: string;
  name?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface CreateFileSourceInput {
  content?: Buffer;
  file_path?: string;
  metadata?: Record<string, unknown>;
  mime_type?: string;
  name?: string;
  source_path?: string;
}

interface CreateUploadSessionInput {
  file_name?: string;
  display_name?: string;
  mime_type?: string;
  size?: number;
  content_hash?: string;
  source_path?: string;
  metadata?: Record<string, unknown>;
}

interface FinalizeUploadSessionInput {
  content_hash?: string;
}

interface UploadSessionActorScope {
  actorAccountId: string | null;
  actorId: string;
  actorSource: string;
  actorType: UploadSessionRecord["actorType"];
  projectId: string;
  tenantId: string;
}

interface RetryOcrInput {
  mode?: string;
  page_numbers?: unknown;
}

interface NormalizedSourceEvidenceInput {
  documentId: string;
  knowledgeBaseId?: string;
  locator?: string;
  mediaAssetId?: string;
  parsedContentId?: string;
  sourceAnchorId?: string;
  evidenceKind: SourceEvidenceKind;
  maxChars: number;
  contextChars: number;
  allowFallback: boolean;
}

interface TextEvidenceRange {
  start: number;
  end: number;
  status: "resolved" | "not_provided" | "not_found";
  warnings: SourceEvidenceWarningResponse[];
}

interface SourceEvidenceExcerpt {
  text: string;
  textTruncated: boolean;
  contextBefore: string;
  contextAfter: string;
  contextTruncated: boolean;
}

@Injectable()
export class DocumentService {
  constructor(
    @Inject(objectStorageToken) private readonly objectStorage: ObjectStorageAdapter,
    @Inject(sourceParseQueueToken) private readonly sourceParseQueue: SourceParseQueue,
    @Inject(mediaCaptionQueueToken) private readonly mediaCaptionQueue: MediaCaptionQueue,
    @Inject(sourceOcrQueueToken) private readonly sourceOcrQueue: SourceOcrQueue,
    @Inject(deletionCleanupQueueToken)
    private readonly deletionCleanupQueue: DeletionCleanupQueue,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
    @Inject(wikiStoreToken) private readonly wikiStore: WikiStore,
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
    private readonly deletionCleanupManifestCollector: DeletionCleanupManifestCollector,
    private readonly webhookService: WebhookService,
    private readonly uploadAdmissionService: UploadAdmissionService,
  ) {}

  private createParsedMarkdownPreviewOptions(): ParsedMarkdownPreviewOptions {
    return {
      enabled: this.runtimeConfig.limits.objectStorageOperations.previewCacheEnabled,
      maxChars:
        this.runtimeConfig.limits.objectStorageOperations.previewMaxChars ||
        parsedMarkdownPreviewMaxChars,
    };
  }

  async uploadMultipart(
    knowledgeBaseId: string,
    request: MultipartRequest,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentUploadResponse> {
    if (this.runtimeConfig.limits.upload.multipartFallbackMode === "disabled") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.multipart_upload_disabled",
      });
    }

    const uploadLease = this.uploadAdmissionService.acquireMultipartUpload();
    const abortController = new AbortController();
    const removeAbortWatcher = bindMultipartRequestAbort(request, abortController);

    try {
      return await this.runWithUploadTimeout(
        () =>
          this.createMultipartUpload(
            knowledgeBaseId,
            request,
            idempotencyKey,
            scope,
            abortController.signal,
          ),
        abortController,
      );
    } finally {
      removeAbortWatcher();
      uploadLease.release();
    }
  }

  private async createMultipartUpload(
    knowledgeBaseId: string,
    request: MultipartRequest,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
    signal?: AbortSignal,
  ): Promise<DocumentUploadResponse> {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);

    const replayed = await this.findUploadByIdempotencyKey(knowledgeBaseId, idempotencyKey);

    if (replayed !== undefined) {
      return replayed;
    }

    let uploadData: UploadDataField = {};
    let uploadedFile: UploadedFile | undefined;

    for await (const part of request.parts()) {
      if (part.type === "field" && part.fieldname === "data") {
        uploadData = parseUploadData(part.value);
      }
      if (part.type === "file" && part.fieldname === "file") {
        if (uploadedFile !== undefined) {
          throw new ApiError("invalid_request", {
            messageKey: "api.validation.only_one_file",
          });
        }

        uploadedFile = await this.uploadFilePart(knowledgeBaseId, part, signal);
      }
    }

    if (uploadedFile === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.multipart_file_required",
        details: {
          fields: ["file"],
        },
      });
    }

    const now = new Date().toISOString();
    const document = createSourceDocumentRecord(
      knowledgeBaseId,
      uploadedFile,
      uploadData,
      now,
      createSourceVisibilityMetadata(knowledgeBase),
    );
    const job = createParseJobRecord(knowledgeBaseId, uploadedFile, now, idempotencyKey);
    await this.persistCreatedSource(document, job);
    await this.enqueueSourceParse(document, job, scope);

    return createDocumentUploadResponse(document, job);
  }

  async createUploadSession(
    knowledgeBaseId: string,
    input: CreateUploadSessionInput,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<CreateUploadSessionResponse> {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    await this.expireCreatedUploadSessions(new Date().toISOString());

    if (!this.runtimeConfig.limits.upload.directUploadEnabled) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.direct_upload_disabled",
      });
    }

    const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
    const replayed =
      normalizedKey === undefined
        ? undefined
        : await this.findUploadSessionByIdempotencyKey(knowledgeBaseId, normalizedKey, scope);

    if (replayed !== undefined) {
      return this.createUploadSessionResponse(replayed);
    }

    const fileName = readRequiredString(input.file_name, "file_name");
    const mimeType = readRequiredString(input.mime_type, "mime_type");
    const size = readPositiveInteger(input.size, "size");
    const contentHash =
      input.content_hash === undefined ? null : readSha256ContentHash(input.content_hash);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const expiresAt = new Date(
      nowDate.getTime() + this.runtimeConfig.limits.upload.uploadSessionExpiresSeconds * 1000,
    ).toISOString();
    const documentId = createResourceId("sourceDocument");
    const objectKey = `sources/${knowledgeBaseId}/${documentId}/${sanitizeObjectKeySegment(
      fileName,
    )}`;
    const session: UploadSessionRecord = {
      id: createResourceId("uploadSession"),
      ...createUploadSessionActorScope(scope),
      knowledgeBaseId,
      documentId,
      objectKey,
      fileName,
      displayName: input.display_name?.trim() || fileName,
      mimeType,
      size,
      contentHash,
      ...(input.source_path === undefined ? {} : { sourcePath: input.source_path }),
      metadata: input.metadata ?? {},
      status: "created",
      idempotencyKey: normalizedKey ?? null,
      finalizeIdempotencyKey: null,
      finalizedDocumentId: null,
      finalizedJobId: null,
      cleanupOperationId: null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    await this.databaseMirror.saveUploadSession(session);

    return this.createUploadSessionResponse(session);
  }

  async finalizeUploadSession(
    knowledgeBaseId: string,
    uploadSessionId: string,
    input: FinalizeUploadSessionInput,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentUploadResponse> {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);
    await this.expireCreatedUploadSessions(new Date().toISOString());

    const session = await this.requireUploadSession(knowledgeBaseId, uploadSessionId, scope);
    const replayed = await this.findFinalizedUploadSessionResult(session);

    if (replayed !== undefined) {
      return replayed;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.expireUploadSession(session, new Date().toISOString());

      throw new ApiError("invalid_request", {
        messageKey: "api.validation.upload_session_expired",
      });
    }

    const contentHash =
      input.content_hash === undefined
        ? session.contentHash
        : readSha256ContentHash(input.content_hash);

    if (contentHash === null) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.content_hash_invalid",
        details: {
          fields: ["content_hash"],
        },
      });
    }

    const objectMetadata = await this.objectStorage.headObject({
      key: session.objectKey,
    });

    if (!objectMetadata.exists) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.upload_session_object_missing",
        details: {
          fields: ["object_key"],
        },
      });
    }
    if (
      objectMetadata.contentLength !== undefined &&
      objectMetadata.contentLength !== session.size
    ) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.upload_session_size_mismatch",
        details: {
          expected_size: session.size,
          actual_size: objectMetadata.contentLength,
        },
      });
    }
    const objectContentHash = readObjectContentHash(objectMetadata.metadata);

    if (objectContentHash !== null && objectContentHash !== contentHash) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.upload_session_checksum_mismatch",
        details: {
          expected_content_hash: contentHash,
          actual_content_hash: objectContentHash,
        },
      });
    }
    const objectStorageValidation = createObjectStorageValidationMetadata({
      contentHash,
      contentLength: objectMetadata.contentLength,
      contentType: objectMetadata.contentType,
      etag: objectMetadata.etag,
      metadataContentHash: objectContentHash,
      objectKey: session.objectKey,
      validatedAt: new Date().toISOString(),
    });
    const finalizedMetadata = {
      ...session.metadata,
      object_storage_validation: objectStorageValidation,
    };

    const uploadedFile: UploadedFile = {
      documentId: session.documentId,
      objectKey: session.objectKey,
      name: session.fileName,
      mimeType: session.mimeType,
      size: session.size,
      contentHash,
    };
    const now = new Date().toISOString();
    const document = createSourceDocumentRecord(
      knowledgeBaseId,
      uploadedFile,
      {
        display_name: session.displayName,
        ...(session.sourcePath === undefined ? {} : { source_path: session.sourcePath }),
        metadata: finalizedMetadata,
      },
      now,
      createSourceVisibilityMetadata(knowledgeBase),
    );
    const job = createParseJobRecord(knowledgeBaseId, uploadedFile, now, idempotencyKey);

    const finalizedSession: UploadSessionRecord = {
      ...session,
      status: "finalized",
      contentHash,
      finalizeIdempotencyKey: normalizeIdempotencyKey(idempotencyKey) ?? null,
      finalizedDocumentId: document.id,
      finalizedJobId: job.id,
      metadata: finalizedMetadata,
      updatedAt: now,
    };
    await this.persistCreatedSource(document, job);
    await this.databaseMirror.updateUploadSession(finalizedSession);
    await this.enqueueSourceParse(document, job, scope);

    return createDocumentUploadResponse(document, job);
  }

  async createTextSource(
    knowledgeBaseId: string,
    input: CreateTextSourceInput,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentUploadResponse> {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);

    const replayed = await this.findUploadByIdempotencyKey(knowledgeBaseId, idempotencyKey);

    if (replayed !== undefined) {
      return replayed;
    }

    const name = readRequiredString(input.name, "name");
    const text = readRequiredString(input.text, "text");
    const uploadedFile = await this.uploadBuffer(knowledgeBaseId, {
      name,
      mimeType: "text/plain",
      content: Buffer.from(text),
      objectKeyName: "text.txt",
    });
    const now = new Date().toISOString();
    const document = createSourceDocumentRecord(
      knowledgeBaseId,
      uploadedFile,
      createUploadDataField(name, input.source_path, input.metadata),
      now,
      createSourceVisibilityMetadata(knowledgeBase),
      "text",
    );
    const job = createParseJobRecord(knowledgeBaseId, uploadedFile, now, idempotencyKey);
    await this.persistCreatedSource(document, job);
    await this.enqueueSourceParse(document, job, scope);

    return createDocumentUploadResponse(document, job);
  }

  async createUrlSource(
    knowledgeBaseId: string,
    input: CreateUrlSourceInput,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentUploadResponse> {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);

    const replayed = await this.findUploadByIdempotencyKey(knowledgeBaseId, idempotencyKey);

    if (replayed !== undefined) {
      return replayed;
    }

    const sourceUrl = readValidUrl(input.url, this.runtimeConfig);
    const name = input.name?.trim() || sourceUrl;
    const uploadedFile = await this.uploadBuffer(knowledgeBaseId, {
      name,
      mimeType: "text/uri-list",
      content: Buffer.from(sourceUrl),
      objectKeyName: "source.url",
    });
    const now = new Date().toISOString();
    const document = createSourceDocumentRecord(
      knowledgeBaseId,
      uploadedFile,
      createUploadDataField(name, input.source_path, input.metadata),
      now,
      createSourceVisibilityMetadata(knowledgeBase),
      "url",
      sourceUrl,
    );
    const job = createParseJobRecord(knowledgeBaseId, uploadedFile, now, idempotencyKey);
    await this.persistCreatedSource(document, job);
    await this.enqueueSourceParse(document, job, scope);

    return createDocumentUploadResponse(document, job);
  }

  async createFileSource(
    knowledgeBaseId: string,
    input: CreateFileSourceInput,
    idempotencyKey?: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentUploadResponse> {
    const knowledgeBase = await this.getReadableKnowledgeBase(knowledgeBaseId, scope);

    const replayed = await this.findUploadByIdempotencyKey(knowledgeBaseId, idempotencyKey);

    if (replayed !== undefined) {
      return replayed;
    }

    const name = readRequiredString(input.name, "name");
    const content =
      input.content ??
      (input.file_path === undefined ? undefined : await readFile(input.file_path));

    if (content === undefined) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.file_content_required",
        details: {
          fields: ["content"],
        },
      });
    }

    const uploadedFile = await this.uploadBuffer(knowledgeBaseId, {
      name,
      mimeType: input.mime_type ?? "application/octet-stream",
      content,
      objectKeyName: sanitizeObjectKeySegment(name),
    });
    const now = new Date().toISOString();
    const document = createSourceDocumentRecord(
      knowledgeBaseId,
      uploadedFile,
      createUploadDataField(name, input.source_path, input.metadata),
      now,
      createSourceVisibilityMetadata(knowledgeBase),
    );
    const job = createParseJobRecord(knowledgeBaseId, uploadedFile, now, idempotencyKey);
    await this.persistCreatedSource(document, job);
    await this.enqueueSourceParse(document, job, scope);

    return createDocumentUploadResponse(document, job);
  }

  async reingestDocument(
    documentId: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentUploadResponse> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const previousJob = await this.operationalReadStore.getLatestJobByDocumentId(documentId);
    const now = new Date().toISOString();
    const updatedDocument: SourceDocumentRecord = {
      ...document,
      status: "queued",
      metadata: {
        ...document.metadata,
        lifecycle_history: [
          ...readLifecycleHistory(document.metadata.lifecycle_history),
          {
            type: "reingest_requested",
            previous_job_id: previousJob?.id ?? null,
          },
        ],
      },
      updatedAt: now,
    };
    const job: JobRecord = {
      id: createResourceId("ingestJob"),
      knowledgeBaseId: document.knowledgeBaseId,
      documentId: document.id,
      stage: "parsing",
      status: "queued",
      progress: 0,
      progressMessage: "Queued for re-ingest parsing.",
      contentHash: document.contentHash,
      idempotencyKey: null,
      deduped: false,
      lockedByKnowledgeBaseId: null,
      inputSnapshotId: randomUUID(),
      retryOfJobId: previousJob?.id ?? null,
      parsedContentId: null,
      changeSetId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.databaseMirror.updateSourceDocument(updatedDocument);
    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(createQueuedJobEvent(job));
    await this.enqueueSourceParse(updatedDocument, job, scope);

    return createDocumentUploadResponse(updatedDocument, job);
  }

  async listDocuments(
    knowledgeBaseId: string,
    input: ListSourceDocumentsInput,
    scope?: ApiResourceScope,
  ): Promise<ListSourceDocumentsResult> {
    await this.getReadableKnowledgeBase(knowledgeBaseId, scope);

    try {
      const dbResult = await this.operationalReadStore.listSourceDocuments({
        knowledgeBaseId,
        page: input.page,
        pageSize: input.pageSize,
        ...(input.keyword === undefined ? {} : { keyword: input.keyword }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.sourceType === undefined ? {} : { sourceType: input.sourceType }),
      });

      if (dbResult !== null) {
        return {
          items: dbResult.items.map(toSourceDocumentResponse),
          page: input.page,
          pageSize: input.pageSize,
          total: dbResult.total,
          hasMore: dbResult.hasMore,
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    throw new ApiError("internal_error");
  }

  async getDocumentDetail(
    documentId: string,
    scope?: ApiResourceScope,
  ): Promise<SourceDocumentDetailResponse> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const [latestJob, parsedContent, mediaAssetsResult, wikiPages] = await Promise.all([
      this.operationalReadStore.getLatestJobByDocumentId(document.id),
      this.operationalReadStore.getParsedContentByDocumentId(document.id),
      this.operationalReadStore.listMediaAssetsByDocumentId(document.id, {
        page: 1,
        pageSize: parsedContentMediaAssetPreviewLimit,
      }),
      this.operationalReadStore.listWikiPageRecordsBySourceDocumentId(
        document.knowledgeBaseId,
        document.id,
        documentDetailRelatedPageLimit,
      ),
    ]);
    const mediaAssets = mediaAssetsResult?.items ?? [];
    const pageRecords = wikiPages ?? [];
    const pageVersions =
      (await this.operationalReadStore.listWikiPageVersionRecordsByPageIds(
        pageRecords.flatMap((page) => {
          const pageId = page.id;

          return typeof pageId === "string" ? [pageId] : [];
        }),
        documentDetailPageVersionLimit,
      )) ?? [];

    return {
      document: toSourceDocumentResponse(document),
      latest_job: latestJob === null ? null : toJobResponse(latestJob),
      parsed_content:
        parsedContent === null
          ? null
          : await toParsedContentResponse(
              parsedContent,
              mediaAssets,
              this.objectStorage,
              this.createParsedMarkdownPreviewOptions(),
            ),
      media_assets: mediaAssets.map(toMediaAssetResponse),
      wiki_pages: pageRecords,
      page_versions: pageVersions,
      delete_preview_required: false,
      update_preview_required: false,
    };
  }

  async previewDelete(
    documentId: string,
    scope?: ApiResourceScope,
  ): Promise<DeleteImpactPreviewResponse> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const affectedPages =
      (await this.operationalReadStore.listWikiPageRecordsBySourceDocumentId(
        document.knowledgeBaseId,
        document.id,
        documentDetailRelatedPageLimit,
      )) ?? [];
    const affectedPageIds = affectedPages.flatMap((page) => {
      const pageId = page.id;

      return typeof pageId === "string" ? [pageId] : [];
    });
    const changeSetId = createResourceId("changeSet");

    return {
      document_id: document.id,
      knowledge_base_id: document.knowledgeBaseId,
      status: "ready",
      affected_page_ids: affectedPageIds,
      affected_edge_ids: [],
      system_page_keys: ["index", "overview", "log"],
      change_set_id: changeSetId,
      impact: {
        affected_resources: affectedPages.map((page) => ({
          id: page.id,
          object_type: "wiki_page",
          title: page.title,
        })),
        unsafe_reasons: [],
        retrieval_index_update: {
          required: true,
          reason: "source_delete",
        },
      },
      apply_action: {
        method: "DELETE",
        path: `/v1/documents/${document.id}`,
        requires_preview_confirmation: true,
      },
      can_apply: true,
    };
  }

  async deleteDocument(
    documentId: string,
    scope?: ApiResourceScope,
  ): Promise<SourceDocumentDeleteResponse> {
    return this.deleteDocumentWithOperationalReads(documentId, scope);
  }

  private async deleteDocumentWithOperationalReads(
    documentId: string,
    scope?: ApiResourceScope,
  ): Promise<SourceDocumentDeleteResponse> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const affectedPages =
      (await this.operationalReadStore.listWikiPageRecordsBySourceDocumentId(
        document.knowledgeBaseId,
        document.id,
        documentDetailRelatedPageLimit,
      )) ?? [];
    const affectedPageIds = affectedPages.flatMap((page) => {
      const pageId = page.id;

      return typeof pageId === "string" ? [pageId] : [];
    });

    const now = new Date().toISOString();
    const changeSetId = createResourceId("changeSet");
    const createdCleanupOperation = createQueuedDeletionCleanupOperation({
      targetType: "source_document",
      targetId: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      now,
      maxAttempts: this.runtimeConfig.limits.deletionCleanup.maxRetries + 1,
      retentionExpiresAt: createRetentionTimestamp(
        now,
        this.runtimeConfig.limits.deletionCleanup.operationRetentionDays,
      ),
      itemRetentionExpiresAt: createRetentionTimestamp(
        now,
        this.runtimeConfig.limits.deletionCleanup.itemRetentionDays,
      ),
    });

    await this.cancelOpenOperationalJobsForDeletedSourceDocument(document, now);

    const updated: SourceDocumentRecord = {
      ...document,
      status: "deleted",
      metadata: {
        ...document.metadata,
        lifecycle_history: [
          ...readLifecycleHistory(document.metadata.lifecycle_history),
          {
            type: "deleted",
            affected_page_ids: affectedPageIds,
            change_set_id: changeSetId,
            cleanup_operation_id: createdCleanupOperation.id,
            deleted_at: now,
          },
        ],
      },
      updatedAt: now,
    };
    const [parsedContent, mediaAssetsResult, jobs] = await Promise.all([
      this.operationalReadStore.getParsedContentByDocumentId(updated.id),
      this.operationalReadStore.listMediaAssetsByDocumentId(updated.id, {
        page: 1,
        pageSize: sourceDocumentDeletionMediaAssetLimit,
      }),
      this.operationalReadStore.listJobsByDocumentId(updated.id),
    ]);
    const mediaAssets = mediaAssetsResult?.items ?? [];

    if (mediaAssetsResult?.hasMore === true) {
      throw new ApiError("invalid_request", {
        message: "Source document cleanup planning exceeded the synchronous media asset limit.",
        details: {
          limit: sourceDocumentDeletionMediaAssetLimit,
          target_type: "source_document",
          target_id: updated.id,
        },
      });
    }

    const jobEventsByJobId = await this.operationalReadStore.listJobEventsByJobIds(
      jobs.map((job) => job.id),
    );
    const activeObjectKeys = await this.operationalReadStore.findReferencedObjectKeys({
      knowledgeBaseId: updated.knowledgeBaseId,
      documentId: updated.id,
      objectKeys: collectSourceDocumentObjectKeysFromRecords({
        document: updated,
        parsedContent,
        mediaAssets,
      }),
    });
    const manifest = collectSourceDocumentManifestFromRecords({
      operationId: createdCleanupOperation.id,
      now,
      maxAttempts: createdCleanupOperation.maxAttempts,
      retainedUntil: createdCleanupOperation.itemRetentionExpiresAt,
      knowledgeBaseId: updated.knowledgeBaseId,
      document: updated,
      parsedContent,
      mediaAssets,
      jobs,
      jobEventsByJobId,
      activeObjectKeys,
    });
    const cleanupOperation = applyManifestToOperation(createdCleanupOperation, manifest);

    await this.databaseMirror.updateSourceDocument(updated);
    await this.databaseMirror.saveDeletionCleanupOperation(cleanupOperation);
    await this.databaseMirror.saveDeletionCleanupItems(manifest.items);
    const queuedCleanupOperation = await this.enqueueDeletionCleanupOperation(cleanupOperation);

    return {
      ...toSourceDocumentResponse(updated),
      document_id: updated.id,
      cleanup_operation: toDeletionCleanupOperationSummaryResponse(queuedCleanupOperation),
      lifecycle_operation: {
        type: "delete_apply",
        status: "applied",
        affected_page_ids: affectedPageIds,
        affected_edge_ids: [],
      },
      change_set: {
        id: changeSetId,
        trigger: "source_delete",
        status: "applied",
      },
      index_update: {
        queued: true,
        reason: "source_delete",
      },
    };
  }

  async getParsedContent(
    documentId: string,
    scope?: ApiResourceScope,
  ): Promise<DocumentParsedContentResponse> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const parsedContent = await this.operationalReadStore.getParsedContentByDocumentId(document.id);

    if (parsedContent === null) {
      return {
        document_id: document.id,
        parsed_content: null,
        status: "not_available",
      };
    }

    const mediaAssets = await this.operationalReadStore.listMediaAssetsByDocumentId(document.id, {
      page: 1,
      pageSize: parsedContentMediaAssetPreviewLimit,
    });

    return {
      document_id: document.id,
      parsed_content: await toParsedContentResponse(
        parsedContent,
        mediaAssets?.items ?? [],
        this.objectStorage,
        this.createParsedMarkdownPreviewOptions(),
      ),
      status: "available",
    };
  }

  async getSourceEvidence(
    documentId: string,
    input: SourceEvidenceInput,
    scope?: ApiResourceScope,
  ): Promise<SourceEvidenceResponse> {
    return this.resolveSourceEvidenceItem(
      {
        ...input,
        document_id: documentId,
      },
      undefined,
      scope,
    );
  }

  async resolveSourceEvidenceBatch(
    input: SourceEvidenceBatchInput,
    scope?: ApiResourceScope,
  ): Promise<SourceEvidenceBatchResponse> {
    if (!Array.isArray(input.items)) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.source_evidence_locator_invalid",
        details: {
          fields: ["items"],
        },
      });
    }

    const limits = this.runtimeConfig.limits.sourceEvidence;

    if (input.items.length > limits.batchMaxItems) {
      throw new ApiError("evidence_limit_exceeded", {
        messageKey: "api.validation.source_evidence_limit_exceeded",
        details: {
          limit: limits.batchMaxItems,
          actual: input.items.length,
          fields: ["items"],
        },
      });
    }

    const items = [];
    let totalTextChars = 0;
    let truncated = false;

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index] as Record<string, unknown>;
      const documentIdValue = typeof item.document_id === "string" ? item.document_id : "";

      try {
        const remainingChars = limits.batchTotalOutputMaxChars - totalTextChars;

        if (remainingChars <= 0) {
          truncated = true;
          throw new ApiError("evidence_limit_exceeded", {
            messageKey: "api.validation.source_evidence_limit_exceeded",
            details: {
              limit: limits.batchTotalOutputMaxChars,
              fields: ["items"],
            },
          });
        }

        const evidence = await this.resolveSourceEvidenceItem(item, remainingChars, scope);
        const itemChars = countEvidenceOutputChars(evidence);
        totalTextChars += itemChars;

        if (totalTextChars > limits.batchTotalOutputMaxChars) {
          truncated = true;
        }

        items.push({
          index,
          document_id: evidence.document_id,
          status: "resolved" as const,
          evidence,
        });
      } catch (error) {
        const apiError =
          error instanceof ApiError
            ? error
            : error instanceof Error
              ? new ApiError("internal_error", { message: error.message })
              : new ApiError("internal_error");

        items.push({
          index,
          document_id: documentIdValue,
          status: "error" as const,
          error: toSourceEvidenceApiError(apiError),
        });
      }
    }

    return {
      items,
      limits: {
        max_items: limits.batchMaxItems,
        total_output_max_chars: limits.batchTotalOutputMaxChars,
      },
      total_text_chars: totalTextChars,
      truncated,
    };
  }

  async listMediaAssets(
    documentId: string,
    input: ListMediaAssetsInput,
    scope?: ApiResourceScope,
  ): Promise<ListMediaAssetsResult> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const dbResult = await this.operationalReadStore.listMediaAssetsByDocumentId(
      document.id,
      input,
    );

    if (dbResult !== null) {
      return {
        items: dbResult.items.map(toMediaAssetResponse),
        page: input.page,
        pageSize: input.pageSize,
        total: dbResult.total,
        hasMore: dbResult.hasMore,
      };
    }

    throw new ApiError("internal_error");
  }

  async getMediaAssetPreview(
    mediaAssetId: string,
    scope?: ApiResourceScope,
  ): Promise<MediaAssetPreviewEnvelope> {
    const mediaAsset = await this.operationalReadStore.getMediaAssetById(mediaAssetId);

    if (mediaAsset === null) {
      throw createMediaAssetNotFoundError();
    }

    await this.requireOperationalLiveDocument(
      mediaAsset.documentId,
      await this.operationalReadStore.getSourceDocumentById(mediaAsset.documentId),
      scope,
      createMediaAssetNotFoundError,
    );

    const expiresInSeconds = 300;
    const previewUrl = await this.objectStorage.createPresignedGetUrl({
      expiresInSeconds,
      key: mediaAsset.objectKey,
    });

    return {
      media_asset_preview: {
        media_asset_id: mediaAsset.id,
        document_id: mediaAsset.documentId,
        mime_type: mediaAsset.mimeType,
        width: mediaAsset.width,
        height: mediaAsset.height,
        locator: JSON.parse(JSON.stringify(mediaAsset.locator)) as Record<string, unknown>,
        caption_status: mediaAsset.captionStatus,
        caption: mediaAsset.caption,
        object_key: mediaAsset.objectKey,
        preview_url: previewUrl,
        expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      },
    };
  }

  async listDocumentProcessingUnits(
    documentId: string,
    input: {
      jobId?: string;
      page: number;
      pageSize: number;
      stage?: DocumentProcessingStage;
      status?: DocumentProcessingUnitStatus;
    },
    scope?: ApiResourceScope,
  ): Promise<{
    items: DocumentProcessingUnitResponse[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> {
    await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );
    const dbResult = await this.operationalReadStore.listDocumentProcessingUnitsByDocumentId(
      documentId,
      input,
    );

    return {
      items: dbResult?.items.map(toDocumentProcessingUnitResponse) ?? [],
      page: input.page,
      pageSize: input.pageSize,
      total: dbResult?.total ?? 0,
      hasMore: dbResult?.hasMore ?? false,
    };
  }

  async retryMediaAssetCaption(
    mediaAssetId: string,
    scope?: ApiResourceScope,
  ): Promise<JobResponse> {
    const mediaAsset = await this.operationalReadStore.getMediaAssetById(mediaAssetId);

    if (mediaAsset === null) {
      throw createMediaAssetNotFoundError();
    }

    if (mediaAsset.captionStatus !== "failed") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.failed_caption_only",
        details: {
          fields: ["caption_status"],
        },
      });
    }

    const document = await this.requireOperationalLiveDocument(
      mediaAsset.documentId,
      await this.operationalReadStore.getSourceDocumentById(mediaAsset.documentId),
      scope,
      createMediaAssetNotFoundError,
    );
    const [parsedContent, latestJob] = await Promise.all([
      this.operationalReadStore.getParsedContentByDocumentId(document.id),
      this.operationalReadStore.getLatestJobByDocumentId(document.id),
    ]);

    if (parsedContent === null || latestJob === null) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.caption_retry_requires_context",
      });
    }

    const datasetConfiguration = await this.requireDatasetConfiguration(
      document.knowledgeBaseId,
      scope,
    );
    const actorScope = createUploadSessionActorScope(scope);

    await this.mediaCaptionQueue.enqueueMediaCaptionJob({
      job_id: latestJob.id,
      tenant_id: actorScope.tenantId,
      project_id: actorScope.projectId,
      knowledge_base_id: document.knowledgeBaseId,
      document_id: document.id,
      parsed_content_id: mediaAsset.parsedContentId ?? parsedContent.id,
      normalized_markdown_object_key: parsedContent.normalizedMarkdownObjectKey,
      content_hash: document.contentHash,
      input_snapshot_id: latestJob.inputSnapshotId,
      media_asset_ids: [mediaAsset.id],
      dataset_configuration_snapshot: toDatasetConfigurationSnapshotPayload(datasetConfiguration),
    });

    return toJobResponse(latestJob);
  }

  async retrySourceDocumentOcr(
    documentId: string,
    input: RetryOcrInput = {},
    scope?: ApiResourceScope,
  ): Promise<JobResponse> {
    const document = await this.requireOperationalLiveDocument(
      documentId,
      await this.operationalReadStore.getSourceDocumentById(documentId),
      scope,
    );

    if (document.mimeType !== "application/pdf") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.ocr_pdf_required",
        details: {
          fields: ["document_id"],
        },
      });
    }
    if (!this.sourceOcrQueue.enabled) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.ocr_queue_disabled",
      });
    }

    const [parsedContent, previousJob] = await Promise.all([
      this.operationalReadStore.getParsedContentByDocumentId(document.id),
      this.operationalReadStore.getLatestJobByDocumentId(document.id),
    ]);

    if (parsedContent === null || previousJob === null) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.ocr_retry_requires_context",
      });
    }

    const pageNumbers = readOcrRetryPageNumbers(input, parsedContent);
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: createResourceId("ingestJob"),
      knowledgeBaseId: document.knowledgeBaseId,
      documentId: document.id,
      stage: "ocr",
      status: "queued",
      progress: 0,
      progressMessage: "Queued for OCR retry.",
      contentHash: document.contentHash,
      idempotencyKey: null,
      deduped: false,
      lockedByKnowledgeBaseId: null,
      inputSnapshotId: randomUUID(),
      retryOfJobId: previousJob.id,
      parsedContentId: parsedContent.id,
      changeSetId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const updatedDocument: SourceDocumentRecord = {
      ...document,
      status: "queued",
      ocrStatus: "queued",
      ocrSummary: {
        mode: input.mode ?? "retry_failed",
        page_numbers: pageNumbers,
        retry_of_job_id: previousJob.id,
      },
      updatedAt: now,
    };

    await this.databaseMirror.updateSourceDocument(updatedDocument);
    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(createQueuedJobEvent(job));
    const actorScope = createUploadSessionActorScope(scope);
    await this.sourceOcrQueue.enqueueSourceOcrJob(
      createSourceOcrRetryPayload(document, parsedContent, job, pageNumbers, actorScope),
    );

    return toJobResponse(job);
  }

  private async uploadFilePart(
    knowledgeBaseId: string,
    part: MultipartFilePart,
    signal: AbortSignal | undefined,
  ): Promise<UploadedFile> {
    const documentId = createResourceId("sourceDocument");
    const objectKey = `sources/${knowledgeBaseId}/${documentId}/${sanitizeObjectKeySegment(
      part.filename,
    )}`;
    const hash = createHash("sha256");
    let size = 0;
    const hashStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.byteLength;
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await this.objectStorage.putObjectStream({
        key: objectKey,
        body: part.file.pipe(hashStream),
        contentType: part.mimetype,
        metadata: {
          knowledgeBaseId,
          documentId,
        },
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      await this.deleteUploadedObjectBestEffort(objectKey);

      if (signal?.aborted === true) {
        throw new ApiError("invalid_request", {
          messageKey: "api.validation.upload_aborted",
        });
      }

      throw createSourceUploadStorageError(error);
    }

    if (part.file.truncated === true) {
      await this.deleteUploadedObjectBestEffort(objectKey);

      throw new ApiError("invalid_request", {
        messageKey: "api.validation.upload_too_large",
        details: {
          fields: ["file"],
        },
      });
    }

    return {
      documentId,
      objectKey,
      name: part.filename,
      mimeType: part.mimetype,
      size,
      contentHash: `sha256:${hash.digest("hex")}`,
    };
  }

  private async uploadBuffer(
    knowledgeBaseId: string,
    input: {
      name: string;
      mimeType: string;
      content: Buffer;
      objectKeyName: string;
    },
  ): Promise<UploadedFile> {
    const documentId = createResourceId("sourceDocument");
    const objectKey = `sources/${knowledgeBaseId}/${documentId}/${input.objectKeyName}`;

    try {
      await this.objectStorage.putObject({
        key: objectKey,
        body: input.content,
        contentType: input.mimeType,
        metadata: {
          knowledgeBaseId,
          documentId,
        },
      });
    } catch (error) {
      throw createSourceUploadStorageError(error);
    }

    return {
      documentId,
      objectKey,
      name: input.name,
      mimeType: input.mimeType,
      size: input.content.byteLength,
      contentHash: `sha256:${createHash("sha256").update(input.content).digest("hex")}`,
    };
  }

  private async resolveSourceEvidenceItem(
    input: Record<string, unknown>,
    batchRemainingChars?: number,
    scope?: ApiResourceScope,
  ): Promise<SourceEvidenceResponse> {
    const normalized = normalizeSourceEvidenceInput(
      input,
      this.runtimeConfig.limits.sourceEvidence,
      batchRemainingChars,
    );
    const document = await this.requireSourceEvidenceDocument(normalized, scope);
    const parsedContent = await this.operationalReadStore.getParsedContentByDocumentId(document.id);

    if (parsedContent === null) {
      throw new ApiError("parsed_content_not_available", {
        messageKey: "api.validation.source_evidence_parsed_content_required",
        details: {
          document_id: document.id,
        },
      });
    }

    if (
      normalized.parsedContentId !== undefined &&
      normalized.parsedContentId !== parsedContent.id
    ) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.source_evidence_locator_invalid",
        details: {
          document_id: document.id,
          expected_parsed_content_id: normalized.parsedContentId,
          actual_parsed_content_id: parsedContent.id,
          fields: ["parsed_content_id"],
        },
      });
    }

    if (normalized.evidenceKind === "ocr") {
      return this.resolveOcrSourceEvidence(document, parsedContent, normalized);
    }

    if (normalized.evidenceKind === "image_caption") {
      return this.resolveMediaSourceEvidence(document, parsedContent, normalized);
    }

    return this.resolveTextSourceEvidence(document, parsedContent, normalized);
  }

  private async resolveTextSourceEvidence(
    document: SourceDocumentRecord,
    parsedContent: ParsedContentRecord,
    input: NormalizedSourceEvidenceInput,
  ): Promise<SourceEvidenceResponse> {
    const objectKey =
      parsedContent.captionedMarkdownObjectKey ?? parsedContent.normalizedMarkdownObjectKey;
    const object = await this.objectStorage.getObject({ key: objectKey });
    const markdownRead = await readObjectBodyTextWithinLimit(
      object.body,
      object.contentLength,
      this.runtimeConfig.limits.parser.maxFileSizeMb * 1024 * 1024,
    );

    if (markdownRead.kind === "fatal") {
      return createSourceEvidenceResponse({
        document,
        parsedContent,
        sourceAnchorId: input.sourceAnchorId,
        evidenceKind: "text",
        locator: input.locator,
        locatorStatus: "not_found",
        excerpt: emptyEvidenceExcerpt(),
        warnings: [
          {
            code: "source_evidence_object_limit_exceeded",
            message: "Source evidence object exceeded configured read limits.",
          },
        ],
      });
    }

    const markdown = markdownRead.text;
    let resolvedRange = resolveTextEvidenceRange(markdown, parsedContent, input);

    if (resolvedRange === null && input.allowFallback) {
      resolvedRange = createFallbackTextEvidenceRange(markdown, input);
    }

    if (resolvedRange === null) {
      return createSourceEvidenceResponse({
        document,
        parsedContent,
        sourceAnchorId: input.sourceAnchorId,
        evidenceKind: "text",
        locator: input.locator,
        locatorStatus: "not_found",
        excerpt: emptyEvidenceExcerpt(),
        warnings: [
          {
            code: "locator_not_found",
            message: "Evidence locator did not match parsed source text.",
          },
        ],
      });
    }

    const excerpt = createSourceEvidenceExcerpt(
      markdown,
      resolvedRange.start,
      resolvedRange.end,
      input.maxChars,
      input.contextChars,
    );

    return createSourceEvidenceResponse({
      document,
      parsedContent,
      sourceAnchorId: input.sourceAnchorId,
      evidenceKind: "text",
      locator: input.locator,
      locatorStatus: resolvedRange.status,
      excerpt,
      warnings: resolvedRange.warnings,
    });
  }

  private resolveOcrSourceEvidence(
    document: SourceDocumentRecord,
    parsedContent: ParsedContentRecord,
    input: NormalizedSourceEvidenceInput,
  ): SourceEvidenceResponse {
    const ocrLocator = parseOcrLocator(input.locator);
    const blocks =
      ocrLocator === null
        ? parsedContent.ocrBlocks.slice(0, 1)
        : parsedContent.ocrBlocks
            .filter((item) => {
              const pageNumber = readRecordNumber(item, "page_number", "pageNumber");
              const blockIndex = readRecordNumber(item, "block_index", "blockIndex");

              if (pageNumber !== ocrLocator.pageNumber || blockIndex === null) {
                return false;
              }

              if (ocrLocator.blockIndex === undefined) {
                return true;
              }

              return blockIndex >= ocrLocator.blockIndex && blockIndex <= ocrLocator.blockEndIndex;
            })
            .sort(
              (left, right) =>
                (readRecordNumber(left, "block_index", "blockIndex") ?? 0) -
                (readRecordNumber(right, "block_index", "blockIndex") ?? 0),
            );
    const block = blocks[0];

    if (block === undefined) {
      return createSourceEvidenceResponse({
        document,
        parsedContent,
        sourceAnchorId: input.sourceAnchorId,
        evidenceKind: "ocr",
        locator: input.locator,
        locatorStatus: "not_found",
        excerpt: emptyEvidenceExcerpt(),
        warnings: [
          {
            code: "ocr_block_not_found",
            message: "OCR block did not match persisted OCR evidence.",
          },
        ],
      });
    }

    const text = blocks
      .map((item) => readRecordString(item, "text") ?? "")
      .filter((item) => item.trim().length > 0)
      .join("\n");
    const excerpt = createPlainTextEvidenceExcerpt(text, input.maxChars);
    const locatorStatus = input.locator === undefined ? "not_provided" : "resolved";
    const warnings: SourceEvidenceWarningResponse[] =
      input.locator === undefined
        ? [
            {
              code: "locator_not_provided",
              message: "No evidence locator was provided; returning a bounded OCR excerpt.",
            },
          ]
        : [];
    const provider = readRecordString(block, "provider");
    const engine = readRecordString(block, "engine");
    const artifactObjectKey = readRecordString(block, "artifact_object_key", "artifactObjectKey");
    const firstBlockIndex = readRecordNumber(block, "block_index", "blockIndex") ?? 0;
    const lastBlockIndex =
      blocks
        .map((item) => readRecordNumber(item, "block_index", "blockIndex"))
        .filter((item): item is number => item !== null)
        .at(-1) ?? firstBlockIndex;

    return createSourceEvidenceResponse({
      document,
      parsedContent,
      sourceAnchorId: input.sourceAnchorId,
      evidenceKind: "ocr",
      locator: input.locator,
      locatorStatus,
      excerpt,
      warnings,
      ocrEvidence: {
        page_number: readRecordNumber(block, "page_number", "pageNumber") ?? 1,
        block_index: firstBlockIndex,
        ...(lastBlockIndex > firstBlockIndex ? { block_end_index: lastBlockIndex } : {}),
        ...(typeof block.confidence === "number" ? { confidence: block.confidence } : {}),
        ...(block.bbox === undefined ? {} : { bbox: JSON.parse(JSON.stringify(block.bbox)) }),
        ...(provider === undefined ? {} : { provider }),
        ...(engine === undefined ? {} : { engine }),
        ...(artifactObjectKey === undefined ? {} : { artifact_object_key: artifactObjectKey }),
      },
    });
  }

  private async resolveMediaSourceEvidence(
    document: SourceDocumentRecord,
    parsedContent: ParsedContentRecord,
    input: NormalizedSourceEvidenceInput,
  ): Promise<SourceEvidenceResponse> {
    const mediaAssetsResult =
      input.mediaAssetId === undefined
        ? await this.operationalReadStore.listMediaAssetsByDocumentId(document.id, {
            page: 1,
            pageSize: 1,
          })
        : null;
    const mediaAsset =
      input.mediaAssetId === undefined
        ? mediaAssetsResult?.items[0]
        : await this.operationalReadStore.getMediaAssetById(input.mediaAssetId);

    if (mediaAsset === undefined || mediaAsset === null || mediaAsset.documentId !== document.id) {
      return createSourceEvidenceResponse({
        document,
        parsedContent,
        sourceAnchorId: input.sourceAnchorId,
        evidenceKind: "image_caption",
        locator: input.locator,
        locatorStatus: "not_found",
        excerpt: emptyEvidenceExcerpt(),
        warnings: [
          {
            code: "media_asset_not_found",
            message: "Media asset did not match this source document.",
          },
        ],
      });
    }

    if (mediaAsset.caption === null || mediaAsset.captionStatus !== "generated") {
      return createSourceEvidenceResponse({
        document,
        parsedContent,
        sourceAnchorId: input.sourceAnchorId,
        evidenceKind: "image_caption",
        locator: input.locator,
        locatorStatus: "not_found",
        excerpt: emptyEvidenceExcerpt(),
        warnings: [
          {
            code: "caption_not_available",
            message: "Media caption is not available.",
          },
        ],
        mediaEvidence: toSourceEvidenceMediaMetadata(mediaAsset),
      });
    }

    return createSourceEvidenceResponse({
      document,
      parsedContent,
      sourceAnchorId: input.sourceAnchorId,
      evidenceKind: "image_caption",
      locator: input.locator,
      locatorStatus:
        input.mediaAssetId === undefined && input.locator === undefined
          ? "not_provided"
          : "resolved",
      excerpt: createPlainTextEvidenceExcerpt(mediaAsset.caption, input.maxChars),
      warnings:
        input.mediaAssetId === undefined && input.locator === undefined
          ? [
              {
                code: "locator_not_provided",
                message:
                  "No media asset ID was provided; returning the first bounded media caption.",
              },
            ]
          : [],
      mediaEvidence: toSourceEvidenceMediaMetadata(mediaAsset),
    });
  }

  private async getReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope?: ApiResourceScope,
    notFoundFactory: () => ApiError = () => new ApiError("knowledge_base_not_found"),
  ): Promise<KnowledgeBaseResponse> {
    const record = await this.operationalReadStore.getKnowledgeBaseById(
      scope ?? defaultApiResourceScope,
      knowledgeBaseId,
    );

    if (record === null) {
      throw notFoundFactory();
    }

    return record;
  }

  private async requireDatasetConfiguration(
    knowledgeBaseId: string,
    scope?: ApiResourceScope,
  ): Promise<DatasetConfigurationResponse> {
    const datasetConfiguration =
      await this.operationalReadStore.getDatasetConfigurationByKnowledgeBaseId(
        scope ?? defaultApiResourceScope,
        knowledgeBaseId,
      );

    if (datasetConfiguration === null) {
      throw new ApiError("internal_error");
    }

    return datasetConfiguration;
  }

  private async requireOperationalLiveDocument(
    documentId: string,
    record: SourceDocumentRecord | null,
    scope?: ApiResourceScope,
    notFoundFactory: () => ApiError = () => new ApiError("document_not_found"),
  ): Promise<SourceDocumentRecord> {
    if (record === null) {
      throw notFoundFactory();
    }
    await this.assertKnowledgeBaseVisible(record.knowledgeBaseId, scope, notFoundFactory);

    if (record.status === "deleted") {
      const cleanupOperationId = readSourceDocumentCleanupOperationId(record.metadata);

      throw new ApiError("resource_deleted", {
        details: {
          target_type: "source_document",
          target_id: documentId,
          cleanup_operation_id: cleanupOperationId,
          guidance: "Reload the source list and select an active source document.",
        },
      });
    }

    return record;
  }

  private async requireSourceEvidenceDocument(
    input: NormalizedSourceEvidenceInput,
    scope?: ApiResourceScope,
  ): Promise<SourceDocumentRecord> {
    if (input.knowledgeBaseId === undefined) {
      return this.requireOperationalLiveDocument(
        input.documentId,
        await this.operationalReadStore.getSourceDocumentById(input.documentId),
        scope,
      );
    }

    await this.getReadableKnowledgeBase(input.knowledgeBaseId, scope, () =>
      createSourceEvidenceDocumentNotFoundError(input),
    );

    const visibleDocument = await this.operationalReadStore.getVisibleSourceDocumentById(
      input.knowledgeBaseId,
      input.documentId,
    );

    if (visibleDocument === null) {
      throw new ApiError("document_not_found", {
        details: {
          document_id: input.documentId,
          knowledge_base_id: input.knowledgeBaseId,
        },
      });
    }

    if (visibleDocument.status === "deleted") {
      await this.requireOperationalLiveDocument(visibleDocument.id, visibleDocument, scope, () =>
        createSourceEvidenceDocumentNotFoundError(input),
      );
    }

    return visibleDocument;
  }

  private async assertKnowledgeBaseVisible(
    knowledgeBaseId: string,
    scope: ApiResourceScope | undefined,
    notFoundFactory: () => ApiError,
  ): Promise<void> {
    const record = await this.operationalReadStore.getKnowledgeBaseById(
      scope ?? defaultApiResourceScope,
      knowledgeBaseId,
    );

    if (record === null) {
      throw notFoundFactory();
    }
  }

  private async findUploadByIdempotencyKey(
    knowledgeBaseId: string,
    idempotencyKey: string | undefined,
  ): Promise<DocumentUploadResponse | undefined> {
    const normalizedKey = normalizeIdempotencyKey(idempotencyKey);

    if (normalizedKey === undefined) {
      return undefined;
    }

    const job = await this.operationalReadStore.getJobByIdempotencyKey(
      knowledgeBaseId,
      normalizedKey,
    );

    if (job === undefined || job === null) {
      return undefined;
    }
    if (job.documentId === null) {
      return undefined;
    }

    const document = await this.operationalReadStore.getSourceDocumentById(job.documentId);

    if (document === undefined || document === null) {
      return undefined;
    }

    return createDocumentUploadResponse(document, job);
  }

  private async findUploadSessionByIdempotencyKey(
    knowledgeBaseId: string,
    idempotencyKey: string,
    scope?: ApiResourceScope,
  ): Promise<UploadSessionRecord | undefined> {
    const actorScope = createUploadSessionActorScope(scope);
    const session = await this.operationalReadStore.getUploadSessionByIdempotencyKey({
      actorId: actorScope.actorId,
      actorType: actorScope.actorType,
      idempotencyKey,
      knowledgeBaseId,
      projectId: actorScope.projectId,
      tenantId: actorScope.tenantId,
    });

    return session ?? undefined;
  }

  private async requireUploadSession(
    knowledgeBaseId: string,
    uploadSessionId: string,
    scope?: ApiResourceScope,
  ): Promise<UploadSessionRecord> {
    const session = await this.operationalReadStore.getUploadSessionById(uploadSessionId);

    if (
      session === undefined ||
      session === null ||
      session.knowledgeBaseId !== knowledgeBaseId ||
      !isUploadSessionScopeMatch(session, createUploadSessionActorScope(scope))
    ) {
      throw new ApiError("upload_session_not_found");
    }

    return session;
  }

  private async findFinalizedUploadSessionResult(
    session: UploadSessionRecord,
  ): Promise<DocumentUploadResponse | undefined> {
    if (session.status !== "finalized" || session.finalizedDocumentId === null) {
      return undefined;
    }

    const document = await this.operationalReadStore.getSourceDocumentById(
      session.finalizedDocumentId,
    );
    const job =
      session.finalizedJobId === null
        ? undefined
        : await this.operationalReadStore.getJobById(session.finalizedJobId);

    if (document === undefined || document === null || job === undefined || job === null) {
      return undefined;
    }

    return createDocumentUploadResponse(document, job);
  }

  private async createUploadSessionResponse(
    session: UploadSessionRecord,
  ): Promise<CreateUploadSessionResponse> {
    const url = await this.objectStorage.createPresignedPutUrl({
      key: session.objectKey,
      contentType: session.mimeType,
      ...(session.contentHash === null
        ? {}
        : { metadata: { "content-sha256": session.contentHash } }),
      expiresInSeconds: this.runtimeConfig.limits.upload.uploadSessionExpiresSeconds,
    });

    return {
      upload_session: toUploadSessionResponse(session),
      presigned_upload: {
        url,
        method: "PUT",
        headers: {
          "content-type": session.mimeType,
        },
        expires_at: session.expiresAt,
      },
    };
  }

  private async runWithUploadTimeout<TValue>(
    operation: (signal: AbortSignal) => Promise<TValue>,
    abortController: AbortController,
  ): Promise<TValue> {
    const timeoutMs = this.runtimeConfig.limits.upload.multipartTimeoutSeconds * 1000;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const operationPromise = operation(abortController.signal);

      return await Promise.race([
        operationPromise,
        createUploadAbortPromise<TValue>(abortController.signal),
        new Promise<TValue>((_resolve, reject) => {
          timeout = setTimeout(() => {
            const error = new ApiError("invalid_request", {
              messageKey: "api.validation.upload_timeout",
            });

            reject(error);
            abortController.abort();
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private async enqueueSourceParse(
    document: SourceDocumentRecord,
    job: JobRecord,
    scope?: ApiResourceScope,
  ): Promise<void> {
    const datasetConfiguration = await this.requireDatasetConfiguration(
      document.knowledgeBaseId,
      scope,
    );
    const actorScope = createUploadSessionActorScope(scope);
    const payload: SourceParseQueuePayload = {
      job_id: job.id,
      tenant_id: actorScope.tenantId,
      project_id: actorScope.projectId,
      knowledge_base_id: job.knowledgeBaseId,
      document_id: document.id,
      content_hash: job.contentHash,
      object_key: document.objectKey,
      mime_type: document.mimeType,
      source_type: document.sourceType,
      input_snapshot_id: job.inputSnapshotId,
      dataset_configuration_snapshot: toDatasetConfigurationSnapshotPayload(datasetConfiguration),
      ocr_policy: datasetConfiguration.values.ocr_policy,
    };

    await this.sourceParseQueue.enqueueSourceParseJob(payload);
    await this.webhookService.emit({
      eventType: "document.ingest.started",
      knowledgeBaseId: job.knowledgeBaseId,
      payload: {
        document_id: document.id,
        job_id: job.id,
        source_type: document.sourceType,
      },
      requestTrace: {
        event_source: "document.enqueue_source_parse",
      },
      ...(scope === undefined ? {} : { scope }),
    });
  }

  private async expireCreatedUploadSessions(now: string): Promise<void> {
    const expiredSessions = await this.operationalReadStore.listExpiredCreatedUploadSessions(
      now,
      expiredUploadSessionSweepLimit,
    );

    for (const session of expiredSessions) {
      try {
        await this.expireUploadSession(session, now);
      } catch {
        await this.expireUploadSessionWithoutCleanup(session, now);
      }
    }
  }

  private async expireUploadSessionWithoutCleanup(
    session: UploadSessionRecord,
    now: string,
  ): Promise<void> {
    const expiredSession: UploadSessionRecord =
      session.status === "expired"
        ? session
        : {
            ...session,
            status: "expired" as const,
            updatedAt: now,
          };

    await this.databaseMirror.updateUploadSession(expiredSession);
  }

  private async expireUploadSession(
    session: UploadSessionRecord,
    now: string,
  ): Promise<UploadSessionRecord> {
    const expiredSession: UploadSessionRecord =
      session.status === "expired"
        ? session
        : {
            ...session,
            status: "expired" as const,
            updatedAt: now,
          };

    if (expiredSession.cleanupOperationId !== null) {
      await this.databaseMirror.updateUploadSession(expiredSession);

      return expiredSession;
    }

    const createdCleanupOperation = createQueuedDeletionCleanupOperation({
      targetType: "source_document",
      targetId: expiredSession.documentId,
      knowledgeBaseId: expiredSession.knowledgeBaseId,
      now,
      maxAttempts: this.runtimeConfig.limits.deletionCleanup.maxRetries + 1,
      retentionExpiresAt: createRetentionTimestamp(
        now,
        this.runtimeConfig.limits.deletionCleanup.operationRetentionDays,
      ),
      itemRetentionExpiresAt: createRetentionTimestamp(
        now,
        this.runtimeConfig.limits.deletionCleanup.itemRetentionDays,
      ),
    });
    const manifest = this.deletionCleanupManifestCollector.collectUploadSessionManifest({
      session: expiredSession,
      operationId: createdCleanupOperation.id,
      now,
      maxAttempts: createdCleanupOperation.maxAttempts,
      retainedUntil: createdCleanupOperation.itemRetentionExpiresAt,
    });
    const cleanupOperation = applyManifestToOperation(createdCleanupOperation, manifest);

    const updatedSession: UploadSessionRecord = {
      ...expiredSession,
      cleanupOperationId: cleanupOperation.id,
      updatedAt: now,
    };

    await this.databaseMirror.saveDeletionCleanupOperation(cleanupOperation);
    await this.databaseMirror.saveDeletionCleanupItems(manifest.items);
    await this.databaseMirror.updateUploadSession(updatedSession);
    await this.enqueueDeletionCleanupOperation(cleanupOperation);

    return updatedSession;
  }

  private async deleteUploadedObjectBestEffort(objectKey: string): Promise<void> {
    try {
      await this.objectStorage.deleteObject({
        key: objectKey,
      });
    } catch {
      // Best-effort cleanup for incomplete upload objects.
    }
  }

  private async persistCreatedSource(
    document: SourceDocumentRecord,
    job: JobRecord,
  ): Promise<void> {
    const event = createQueuedJobEvent(
      job,
      createUploadJobMetadata(document, this.uploadAdmissionService),
    );

    await this.databaseMirror.saveSourceDocument(document);
    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(event);
  }

  private async cancelOpenOperationalJobsForDeletedSourceDocument(
    document: SourceDocumentRecord,
    now: string,
  ): Promise<void> {
    const message = "Canceled because the source document was deleted.";
    await this.databaseMirror.cancelOpenJobsForSourceDocument({
      sourceDocumentId: document.id,
      message,
      metadata: {
        source_document_deleted: true,
      },
      now,
    });
  }

  private async enqueueDeletionCleanupOperation(
    operation: DeletionCleanupOperationRecord,
  ): Promise<DeletionCleanupOperationRecord> {
    const now = new Date().toISOString();

    try {
      const enqueued = await this.deletionCleanupQueue.enqueueDeletionCleanupJob({
        operation_id: operation.id,
      });
      const updated: DeletionCleanupOperationRecord = {
        ...operation,
        queueJobId: enqueued.job_id,
        lastError: null,
        updatedAt: now,
      };

      await this.databaseMirror.updateDeletionCleanupOperation(updated);

      return updated;
    } catch (error) {
      const updated: DeletionCleanupOperationRecord = {
        ...operation,
        lastError: {
          message: "Cleanup queue enqueue failed.",
          detail: error instanceof Error ? error.message : "Unknown cleanup queue error.",
        },
        updatedAt: now,
      };

      await this.databaseMirror.updateDeletionCleanupOperation(updated);

      return updated;
    }
  }
}

function createSourceDocumentRecord(
  knowledgeBaseId: string,
  uploadedFile: UploadedFile,
  uploadData: UploadDataField,
  timestamp: string,
  visibilityMetadata: Pick<
    SourceDocumentRecord,
    "visibilityOrigin" | "ownerKnowledgeBaseId" | "upstreamResourceId" | "forkTombstonedAt"
  >,
  sourceType: "file" | "text" | "url" = "file",
  sourceUrl?: string,
): SourceDocumentRecord {
  const record: SourceDocumentRecord = {
    id: uploadedFile.documentId,
    knowledgeBaseId,
    name: uploadedFile.name,
    displayName: uploadData.display_name ?? uploadedFile.name,
    sourceType,
    mimeType: uploadedFile.mimeType,
    size: uploadedFile.size,
    contentHash: uploadedFile.contentHash,
    objectKey: uploadedFile.objectKey,
    status: "uploaded",
    ocrStatus: "not_required",
    ocrSummary: {},
    metadata: uploadData.metadata ?? {},
    ...visibilityMetadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (uploadData.source_path !== undefined) {
    record.sourcePath = uploadData.source_path;
  }
  if (sourceUrl !== undefined) {
    record.sourceUrl = sourceUrl;
  }

  return record;
}

function createSourceVisibilityMetadata(
  knowledgeBase: KnowledgeBaseResponse,
): Pick<
  SourceDocumentRecord,
  "visibilityOrigin" | "ownerKnowledgeBaseId" | "upstreamResourceId" | "forkTombstonedAt"
> {
  if (knowledgeBase.knowledge_base_type === "fork") {
    return {
      visibilityOrigin: "fork_owned",
      ownerKnowledgeBaseId: knowledgeBase.id,
      upstreamResourceId: null,
      forkTombstonedAt: null,
    };
  }

  return {
    visibilityOrigin: "canonical",
    ownerKnowledgeBaseId: null,
    upstreamResourceId: null,
    forkTombstonedAt: null,
  };
}

function bindMultipartRequestAbort(
  request: MultipartRequest,
  abortController: AbortController,
): () => void {
  const raw = request.raw;

  if (raw === undefined) {
    return () => undefined;
  }
  if (raw.aborted === true || raw.destroyed === true) {
    abortController.abort();

    return () => undefined;
  }

  const onAbort = () => abortController.abort();

  raw.on("aborted", onAbort);

  return () => {
    raw.off("aborted", onAbort);
  };
}

function createUploadAbortPromise<TValue>(signal: AbortSignal): Promise<TValue> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(
        new ApiError("invalid_request", {
          messageKey: "api.validation.upload_aborted",
        }),
      );

      return;
    }

    signal.addEventListener(
      "abort",
      () =>
        reject(
          new ApiError("invalid_request", {
            messageKey: "api.validation.upload_aborted",
          }),
        ),
      { once: true },
    );
  });
}

function createParseJobRecord(
  knowledgeBaseId: string,
  uploadedFile: UploadedFile,
  timestamp: string,
  idempotencyKey: string | undefined,
): JobRecord {
  return {
    id: createResourceId("ingestJob"),
    knowledgeBaseId,
    documentId: uploadedFile.documentId,
    stage: "parsing",
    status: "queued",
    progress: 0,
    progressMessage: "Queued for parsing.",
    contentHash: uploadedFile.contentHash,
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey) ?? null,
    deduped: false,
    lockedByKnowledgeBaseId: null,
    inputSnapshotId: randomUUID(),
    retryOfJobId: null,
    parsedContentId: null,
    changeSetId: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createQueuedJobEvent(record: JobRecord, metadata: Record<string, unknown> = {}) {
  return {
    jobId: record.id,
    type: "job.queued" as const,
    stage: record.stage,
    status: record.status,
    message: record.progressMessage,
    metadata,
    createdAt: record.createdAt,
  };
}

function createUploadJobMetadata(
  document: SourceDocumentRecord,
  uploadAdmissionService: UploadAdmissionService,
): Record<string, unknown> {
  const pressure = uploadAdmissionService.getSnapshot();

  return {
    source_document_id: document.id,
    source_type: document.sourceType,
    upload_size_bytes: document.size,
    mime_type: document.mimeType,
    pressure: {
      active_multipart_uploads: pressure.activeMultipartUploads,
      admission_limit: pressure.multipartAdmissionLimit,
      degraded_threshold: pressure.pressureDegradedThreshold,
      state: pressure.pressure,
    },
  };
}

function createSourceOcrRetryPayload(
  document: SourceDocumentRecord,
  parsedContent: ParsedContentRecord,
  job: JobRecord,
  pageNumbers: readonly number[],
  scope: UploadSessionActorScope,
): SourceOcrQueuePayload {
  return {
    job_id: job.id,
    tenant_id: scope.tenantId,
    project_id: scope.projectId,
    knowledge_base_id: job.knowledgeBaseId,
    document_id: document.id,
    parsed_content_id: parsedContent.id,
    normalized_markdown_object_key: parsedContent.normalizedMarkdownObjectKey,
    content_hash: document.contentHash,
    input_snapshot_id: job.inputSnapshotId,
    source_object_key: document.objectKey,
    candidate_pages: pageNumbers.map((pageNumber) => ({
      pageNumber,
      reason: "forced",
      nativeTextChars: 0,
    })),
  };
}

function normalizeSourceEvidenceInput(
  input: Record<string, unknown>,
  limits: RuntimeConfig["limits"]["sourceEvidence"],
  batchRemainingChars: number | undefined,
): NormalizedSourceEvidenceInput {
  const documentId = readInputString(input.document_id);

  if (documentId === undefined) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_field_required",
      details: {
        fields: ["document_id"],
      },
    });
  }

  const locator = readInputString(input.locator);
  const knowledgeBaseId = readInputString(input.knowledge_base_id);
  const mediaAssetId = readInputString(input.media_asset_id);
  const parsedContentId = readInputString(input.parsed_content_id);
  const sourceAnchorId = readInputString(input.source_anchor_id);
  const evidenceKind = readSourceEvidenceKind(input.evidence_kind, locator, mediaAssetId);
  const maxChars = readSourceEvidenceInteger({
    value: input.max_chars,
    defaultValue: limits.defaultMaxChars,
    maxValue: limits.maxMaxChars,
    field: "max_chars",
  });
  const contextChars = readSourceEvidenceInteger({
    value: input.context_chars,
    defaultValue: limits.defaultContextChars,
    maxValue: limits.maxContextChars,
    field: "context_chars",
    allowZero: true,
  });

  return {
    documentId,
    ...(knowledgeBaseId === undefined ? {} : { knowledgeBaseId }),
    ...(locator === undefined ? {} : { locator }),
    ...(mediaAssetId === undefined ? {} : { mediaAssetId }),
    ...(parsedContentId === undefined ? {} : { parsedContentId }),
    ...(sourceAnchorId === undefined ? {} : { sourceAnchorId }),
    evidenceKind,
    maxChars:
      batchRemainingChars === undefined
        ? maxChars
        : Math.max(1, Math.min(maxChars, batchRemainingChars)),
    contextChars,
    allowFallback: readSourceEvidenceBoolean(input.allow_fallback),
  };
}

function readSourceEvidenceKind(
  value: unknown,
  locator: string | undefined,
  mediaAssetId: string | undefined,
): SourceEvidenceKind {
  if (value === undefined || value === null || value === "") {
    if (mediaAssetId !== undefined || locator?.startsWith("image:") === true) {
      return "image_caption";
    }

    if (isOcrLocatorSyntax(locator)) {
      return "ocr";
    }

    return "text";
  }

  if (typeof value === "string" && sourceEvidenceKinds.includes(value as SourceEvidenceKind)) {
    return value as SourceEvidenceKind;
  }

  throw new ApiError("unsupported_evidence_kind", {
    messageKey: "api.validation.source_evidence_kind_unsupported",
    details: {
      fields: ["evidence_kind"],
    },
  });
}

function readSourceEvidenceInteger(input: {
  value: unknown;
  defaultValue: number;
  maxValue: number;
  field: string;
  allowZero?: boolean;
}): number {
  if (input.value === undefined || input.value === null || input.value === "") {
    return input.defaultValue;
  }

  const parsed = typeof input.value === "number" ? input.value : Number(input.value);
  const minValue = input.allowZero === true ? 0 : 1;

  if (!Number.isSafeInteger(parsed) || parsed < minValue) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_evidence_limit_exceeded",
      details: {
        fields: [input.field],
      },
    });
  }

  if (parsed > input.maxValue) {
    throw new ApiError("evidence_limit_exceeded", {
      messageKey: "api.validation.source_evidence_limit_exceeded",
      details: {
        limit: input.maxValue,
        fields: [input.field],
      },
    });
  }

  return parsed;
}

function readSourceEvidenceBoolean(value: unknown): boolean {
  if (value === true || value === "true") {
    return true;
  }

  return false;
}

function readInputString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveTextEvidenceRange(
  markdown: string,
  parsedContent: ParsedContentRecord,
  input: NormalizedSourceEvidenceInput,
): TextEvidenceRange | null {
  if (input.locator === undefined) {
    return {
      start: 0,
      end: Math.min(markdown.length, input.maxChars),
      status: "not_provided",
      warnings: [
        {
          code: "locator_not_provided",
          message: "No evidence locator was provided; returning a bounded source excerpt.",
        },
      ],
    };
  }

  const lineMatch = /^line:(\d+)(?:-(\d+))?$/u.exec(input.locator);

  if (lineMatch !== null) {
    return resolveLineRange(
      markdown,
      Number(lineMatch[1]),
      lineMatch[2] === undefined ? undefined : Number(lineMatch[2]),
      input.locator,
    );
  }

  if (input.locator === "source_markdown") {
    return {
      start: 0,
      end: Math.min(markdown.length, input.maxChars),
      status: "not_provided",
      warnings: [
        {
          code: "locator_not_specific",
          message:
            "Evidence locator did not include a concrete source line; returning a bounded source excerpt.",
        },
      ],
    };
  }

  const sourceMarkdownLineMatch = /^source_markdown:(\d+)(?:-(\d+))?$/u.exec(input.locator);

  if (sourceMarkdownLineMatch !== null) {
    return resolveLineRange(
      markdown,
      Number(sourceMarkdownLineMatch[1]),
      sourceMarkdownLineMatch[2] === undefined ? undefined : Number(sourceMarkdownLineMatch[2]),
      input.locator,
    );
  }

  if (input.locator.startsWith("line:")) {
    throw new ApiError("invalid_locator", {
      messageKey: "api.validation.source_evidence_locator_invalid",
      details: {
        locator: input.locator,
      },
    });
  }

  if (input.locator.startsWith("source_markdown:")) {
    throw new ApiError("invalid_locator", {
      messageKey: "api.validation.source_evidence_locator_invalid",
      details: {
        locator: input.locator,
      },
    });
  }

  const locatorLine = findParsedLocatorLine(parsedContent.locators, input.locator);

  if (locatorLine !== null) {
    return resolveLineRange(markdown, locatorLine);
  }

  const exactIndex = markdown.indexOf(input.locator);

  if (exactIndex >= 0) {
    return {
      start: exactIndex,
      end: exactIndex + input.locator.length,
      status: "resolved",
      warnings: [],
    };
  }

  const compoundRange = resolveCompoundTextAnchorRange(markdown, input.locator);

  if (compoundRange !== null) {
    return compoundRange;
  }

  if (input.allowFallback) {
    return {
      start: 0,
      end: Math.min(markdown.length, input.maxChars),
      status: "not_found",
      warnings: [
        {
          code: "locator_not_found",
          message: "Evidence locator did not match parsed source text; returning fallback excerpt.",
        },
      ],
    };
  }

  return null;
}

function resolveCompoundTextAnchorRange(
  markdown: string,
  locator: string,
): TextEvidenceRange | null {
  if (!locator.includes(",")) {
    return null;
  }

  const anchors = locator
    .split(",")
    .map((anchor) => anchor.trim())
    .filter((anchor) => anchor.length > 0);

  if (anchors.length < 2) {
    return null;
  }

  const ranges = [];

  for (const anchor of anchors) {
    const index = markdown.indexOf(anchor);

    if (index < 0) {
      return null;
    }

    ranges.push({
      start: index,
      end: index + anchor.length,
    });
  }

  const expandedRange = expandRangeToLineBounds(markdown, {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  });

  return {
    start: expandedRange.start,
    end: expandedRange.end,
    status: "resolved",
    warnings: [],
  };
}

function expandRangeToLineBounds(
  source: string,
  range: { start: number; end: number },
): { start: number; end: number } {
  const lineStart = source.lastIndexOf("\n", Math.max(0, range.start - 1));
  const lineEnd = source.indexOf("\n", range.end);

  return {
    start: lineStart < 0 ? 0 : lineStart + 1,
    end: lineEnd < 0 ? source.length : lineEnd,
  };
}

function resolveLineRange(
  markdown: string,
  lineNumber: number,
  lineEndNumber = lineNumber,
  locator = `line:${lineNumber}`,
): TextEvidenceRange | null {
  if (
    !Number.isSafeInteger(lineNumber) ||
    !Number.isSafeInteger(lineEndNumber) ||
    lineNumber <= 0 ||
    lineEndNumber < lineNumber
  ) {
    throw new ApiError("invalid_locator", {
      messageKey: "api.validation.source_evidence_locator_invalid",
      details: {
        locator,
      },
    });
  }

  const lines = markdown.split("\n");

  if (lineNumber > lines.length) {
    return null;
  }
  const boundedLineEndNumber = Math.min(lineEndNumber, lines.length);

  let start = 0;

  for (let index = 0; index < lineNumber - 1; index += 1) {
    start += lines[index]!.length + 1;
  }
  let end = start;

  for (let index = lineNumber - 1; index < boundedLineEndNumber; index += 1) {
    end += lines[index]!.length;
    if (index < boundedLineEndNumber - 1) {
      end += 1;
    }
  }

  if (markdown.slice(start, end).trim().length === 0) {
    return null;
  }

  return {
    start,
    end,
    status: "resolved",
    warnings: [],
  };
}

function createFallbackTextEvidenceRange(
  markdown: string,
  input: NormalizedSourceEvidenceInput,
): TextEvidenceRange {
  return {
    start: 0,
    end: Math.min(markdown.length, input.maxChars),
    status: "not_found",
    warnings: [
      {
        code: "locator_not_found",
        message: "Evidence locator did not match parsed source text; returning fallback excerpt.",
      },
    ],
  };
}

function findParsedLocatorLine(
  locators: readonly Record<string, unknown>[],
  locator: string,
): number | null {
  const pageMatch = /^page:(\d+)$/u.exec(locator);

  for (const item of locators) {
    const kind = readRecordString(item, "kind");
    const value = readRecordString(item, "value");
    const line = readRecordNumber(item, "line", "line_number", "lineNumber");

    if (kind === "line" && (value === locator || `line:${value}` === locator) && line !== null) {
      return line;
    }

    if (pageMatch !== null && kind === "page" && value === pageMatch[1] && line !== null) {
      return line;
    }
  }

  return null;
}

function createSourceEvidenceExcerpt(
  source: string,
  start: number,
  end: number,
  maxChars: number,
  contextChars: number,
): SourceEvidenceExcerpt {
  const boundedStart = Math.max(0, Math.min(start, source.length));
  const boundedEnd = Math.max(boundedStart, Math.min(end, source.length));
  const text = source.slice(boundedStart, boundedEnd);
  const textTruncated = text.length > maxChars;
  const contextBeforeStart = Math.max(0, boundedStart - contextChars);
  const contextAfterEnd = Math.min(source.length, boundedEnd + contextChars);

  return {
    text: textTruncated ? text.slice(0, maxChars) : text,
    textTruncated,
    contextBefore: source.slice(contextBeforeStart, boundedStart),
    contextAfter: source.slice(boundedEnd, contextAfterEnd),
    contextTruncated: contextBeforeStart > 0 || contextAfterEnd < source.length,
  };
}

function createPlainTextEvidenceExcerpt(text: string, maxChars: number): SourceEvidenceExcerpt {
  const textTruncated = text.length > maxChars;

  return {
    text: textTruncated ? text.slice(0, maxChars) : text,
    textTruncated,
    contextBefore: "",
    contextAfter: "",
    contextTruncated: false,
  };
}

function emptyEvidenceExcerpt(): SourceEvidenceExcerpt {
  return {
    text: "",
    textTruncated: false,
    contextBefore: "",
    contextAfter: "",
    contextTruncated: false,
  };
}

function createSourceEvidenceResponse(input: {
  document: SourceDocumentRecord;
  parsedContent: ParsedContentRecord;
  sourceAnchorId?: string | undefined;
  evidenceKind: SourceEvidenceKind;
  locator: string | undefined;
  locatorStatus: SourceEvidenceResponse["locator_status"];
  excerpt: SourceEvidenceExcerpt;
  warnings: readonly SourceEvidenceWarningResponse[];
  ocrEvidence?: SourceEvidenceResponse["ocr_evidence"];
  mediaEvidence?: SourceEvidenceResponse["media_evidence"];
}): SourceEvidenceResponse {
  const response: SourceEvidenceResponse = {
    document_id: input.document.id,
    knowledge_base_id: input.document.knowledgeBaseId,
    visibility_origin: input.document.visibilityOrigin ?? "canonical",
    owner_knowledge_base_id: input.document.ownerKnowledgeBaseId ?? null,
    upstream_resource_id: input.document.upstreamResourceId ?? null,
    parsed_content_id: input.parsedContent.id,
    locator_status: input.locatorStatus,
    evidence_kind: input.evidenceKind,
    text: input.excerpt.text,
    text_truncated: input.excerpt.textTruncated,
    context_before: input.excerpt.contextBefore,
    context_after: input.excerpt.contextAfter,
    context_truncated: input.excerpt.contextTruncated,
    content_hash: input.document.contentHash,
    parser_name: input.parsedContent.parserName,
    parser_version: input.parsedContent.parserVersion,
    normalized_markdown_object_key: input.parsedContent.normalizedMarkdownObjectKey,
    source_object_key: input.document.objectKey,
    warnings: input.warnings,
  };

  if (input.sourceAnchorId !== undefined) {
    response.source_anchor_id = input.sourceAnchorId;
  }

  if (input.locator !== undefined) {
    response.locator = input.locator;
  }

  if (input.parsedContent.captionedMarkdownObjectKey !== undefined) {
    response.captioned_markdown_object_key = input.parsedContent.captionedMarkdownObjectKey;
  }

  if (input.parsedContent.plainTextObjectKey !== undefined) {
    response.plain_text_object_key = input.parsedContent.plainTextObjectKey;
  }

  if (input.ocrEvidence !== undefined) {
    response.ocr_evidence = input.ocrEvidence;
  }

  if (input.mediaEvidence !== undefined) {
    response.media_evidence = input.mediaEvidence;
  }

  return response;
}

function parseOcrLocator(
  locator: string | undefined,
): { pageNumber: number; blockIndex?: number; blockEndIndex: number } | null {
  if (locator === undefined) {
    return null;
  }

  const pageOnlyMatch = /^(?:ocr\s*:\s*)?page\s*[:=]\s*(\d+)$/u.exec(locator);

  if (pageOnlyMatch !== null) {
    return {
      pageNumber: Number(pageOnlyMatch[1]),
      blockEndIndex: Number.MAX_SAFE_INTEGER,
    };
  }

  const compactBlockMatch =
    /^(?:ocr\s*:\s*)?page\s*[:=]\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/u.exec(locator);

  if (compactBlockMatch !== null) {
    const blockIndex = Number(compactBlockMatch[2]);
    const blockEndIndex =
      compactBlockMatch[3] === undefined ? blockIndex : Number(compactBlockMatch[3]);

    if (blockEndIndex < blockIndex) {
      throw new ApiError("invalid_locator", {
        messageKey: "api.validation.source_evidence_locator_invalid",
        details: {
          locator,
        },
      });
    }

    return {
      pageNumber: Number(compactBlockMatch[1]),
      blockIndex,
      blockEndIndex,
    };
  }

  const match =
    /^(?:ocr\s*:\s*)?page\s*[:=]\s*(\d+)\s*(?::|;)\s*(?:block|block_index)\s*[:=]\s*(\d+)(?:\s*-\s*(\d+))?$/u.exec(
      locator,
    );

  if (match === null) {
    throw new ApiError("invalid_locator", {
      messageKey: "api.validation.source_evidence_locator_invalid",
      details: {
        locator,
      },
    });
  }

  const blockIndex = Number(match[2]);
  const blockEndIndex = match[3] === undefined ? blockIndex : Number(match[3]);

  if (blockEndIndex < blockIndex) {
    throw new ApiError("invalid_locator", {
      messageKey: "api.validation.source_evidence_locator_invalid",
      details: {
        locator,
      },
    });
  }

  return {
    pageNumber: Number(match[1]),
    blockIndex,
    blockEndIndex,
  };
}

function isOcrLocatorSyntax(locator: string | undefined): boolean {
  if (locator === undefined) {
    return false;
  }

  return (
    /^(?:ocr\s*:\s*)?page\s*[:=]\s*\d+\s*(?::|;)\s*(?:block|block_index)\s*[:=]\s*\d+(?:\s*-\s*\d+)?$/u.test(
      locator,
    ) || /^(?:ocr\s*:\s*)?page\s*[:=]\s*\d+\s*:\s*\d+(?:\s*-\s*\d+)?$/u.test(locator)
  );
}

function toSourceEvidenceMediaMetadata(
  record: MediaAssetRecord,
): NonNullable<SourceEvidenceResponse["media_evidence"]> {
  return {
    media_asset_id: record.id,
    mime_type: record.mimeType,
    object_key: record.objectKey,
    locator: JSON.parse(JSON.stringify(record.locator)) as Record<string, unknown>,
    width: record.width,
    height: record.height,
    caption_status: record.captionStatus,
    preview: {
      endpoint: `/v1/media-assets/${record.id}/preview`,
    },
  };
}

function readRecordString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function readRecordNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function countEvidenceOutputChars(evidence: SourceEvidenceResponse): number {
  return evidence.text.length + evidence.context_before.length + evidence.context_after.length;
}

function toSourceEvidenceApiError(error: ApiError) {
  return {
    code: error.code,
    message: error.message,
    ...(error.messageKey === undefined ? {} : { message_key: error.messageKey }),
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

function readOcrRetryPageNumbers(
  input: RetryOcrInput,
  parsedContent: ParsedContentRecord,
): number[] {
  if (
    input.mode !== undefined &&
    input.mode !== "retry_failed" &&
    input.mode !== "reprocess" &&
    input.mode !== "force_for_pdf"
  ) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.ocr_retry_mode_invalid",
      details: {
        fields: ["mode"],
      },
    });
  }

  const providedPageNumbers = Array.isArray(input.page_numbers)
    ? input.page_numbers
        .map((value) => (typeof value === "number" ? value : Number(value)))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    : [];
  const pageNumbers =
    providedPageNumbers.length > 0
      ? providedPageNumbers
      : parsedContent.locators
          .filter((locator) => locator.kind === "page")
          .map((locator) => Number(locator.value))
          .filter((value) => Number.isSafeInteger(value) && value > 0);
  const uniquePageNumbers = [...new Set(pageNumbers)].sort((left, right) => left - right);

  if (uniquePageNumbers.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.ocr_retry_pages_required",
      details: {
        fields: ["page_numbers"],
      },
    });
  }

  return uniquePageNumbers;
}

function toSourceDocumentResponse(record: SourceDocumentRecord): SourceDocumentResponse {
  const response: SourceDocumentResponse = {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    name: record.name,
    display_name: record.displayName,
    source_type: record.sourceType,
    mime_type: record.mimeType,
    size: record.size,
    content_hash: record.contentHash,
    object_key: record.objectKey,
    status: record.status,
    ...(record.ocrStatus === undefined ? {} : { ocr_status: record.ocrStatus }),
    ...(record.ocrSummary === undefined
      ? {}
      : {
          ocr_summary: JSON.parse(JSON.stringify(record.ocrSummary)) as Record<string, unknown>,
        }),
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
    ...(record.visibilityOrigin === undefined
      ? {}
      : { visibility_origin: record.visibilityOrigin }),
    ...(record.ownerKnowledgeBaseId === undefined
      ? {}
      : { owner_knowledge_base_id: record.ownerKnowledgeBaseId }),
    ...(record.upstreamResourceId === undefined
      ? {}
      : { upstream_resource_id: record.upstreamResourceId }),
    ...(record.forkTombstonedAt === undefined
      ? {}
      : { fork_tombstoned_at: record.forkTombstonedAt }),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };

  if (record.sourcePath !== undefined) {
    response.source_path = record.sourcePath;
  }
  if (record.sourceUrl !== undefined) {
    response.source_url = record.sourceUrl;
  }

  return response;
}

function createDocumentUploadResponse(
  document: SourceDocumentRecord,
  job: JobRecord,
): DocumentUploadResponse {
  return {
    document: toSourceDocumentResponse(document),
    job: toJobResponse(job),
    resources: {
      knowledge_base_id: document.knowledgeBaseId,
      source_document_id: document.id,
      job_id: job.id,
    },
    links: [
      {
        rel: "job",
        method: "GET",
        href: `/v1/jobs/${job.id}`,
        resource_type: "ingest_job",
      },
      {
        rel: "source_document",
        method: "GET",
        href: `/v1/documents/${document.id}`,
        resource_type: "source_document",
      },
      {
        rel: "knowledge_base_jobs",
        method: "GET",
        href: `/v1/knowledge-bases/${document.knowledgeBaseId}/jobs`,
        resource_type: "job_list",
      },
      {
        rel: "knowledge_base_ingest_progress",
        method: "GET",
        href: `/v1/knowledge-bases/${document.knowledgeBaseId}/ingest-progress`,
        resource_type: "ingest_progress",
      },
      {
        rel: "retrieve_readiness",
        method: "GET",
        href: `/v1/knowledge-bases/${document.knowledgeBaseId}/ingest-progress`,
        resource_type: "retrieve_readiness",
      },
      {
        rel: "developer_documentation",
        method: "GET",
        href: "/v1/openapi.json",
        resource_type: "developer_documentation",
      },
    ],
  };
}

function toUploadSessionResponse(record: UploadSessionRecord): UploadSessionResponse {
  const response: UploadSessionResponse = {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    document_id: record.documentId,
    object_key: record.objectKey,
    file_name: record.fileName,
    display_name: record.displayName,
    mime_type: record.mimeType,
    size: record.size,
    content_hash: record.contentHash,
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
    status: record.status,
    expires_at: record.expiresAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };

  if (record.sourcePath !== undefined) {
    response.source_path = record.sourcePath;
  }

  return response;
}

function createUploadSessionActorScope(
  scope?: ApiResourceScope,
): Pick<
  UploadSessionRecord,
  "actorAccountId" | "actorId" | "actorSource" | "actorType" | "projectId" | "tenantId"
> {
  const scopedActor = scope as Partial<ApiKeyScope> | undefined;
  const apiKeyId = scopedActor?.apiKeyId;
  const actorType: UploadSessionRecord["actorType"] =
    apiKeyId === "admin_session" ? "admin_session" : apiKeyId === undefined ? "system" : "api_key";

  return {
    actorAccountId:
      typeof scopedActor?.accountId === "string" && scopedActor.accountId.length > 0
        ? scopedActor.accountId
        : null,
    actorId: apiKeyId ?? "system",
    actorSource: scopedActor?.source ?? "system",
    actorType,
    projectId: scope?.projectId ?? defaultApiResourceScope.projectId,
    tenantId: scope?.tenantId ?? defaultApiResourceScope.tenantId,
  };
}

function isUploadSessionScopeMatch(
  session: UploadSessionRecord,
  actorScope: UploadSessionActorScope,
): boolean {
  return (
    session.tenantId === actorScope.tenantId &&
    session.projectId === actorScope.projectId &&
    session.actorType === actorScope.actorType &&
    session.actorId === actorScope.actorId
  );
}

export function toJobResponse(record: JobRecord): JobResponse {
  const progressState = resolveJobProgressState({
    progress: record.progress,
    progressMessage: record.progressMessage,
    status: record.status,
  });

  return {
    id: record.id,
    knowledge_base_id: record.knowledgeBaseId,
    document_id: record.documentId,
    stage: record.stage,
    status: record.status,
    progress: progressState.progress,
    progress_message: progressState.progressMessage,
    content_hash: record.contentHash,
    idempotency_key: record.idempotencyKey,
    deduped: record.deduped,
    locked_by_knowledge_base_id: record.lockedByKnowledgeBaseId,
    input_snapshot_id: record.inputSnapshotId,
    retry_of_job_id: record.retryOfJobId,
    parsed_content_id: record.parsedContentId,
    change_set_id: record.changeSetId,
    error:
      record.error === null
        ? null
        : (JSON.parse(JSON.stringify(record.error)) as Record<string, unknown>),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toParsedContentResponse(
  record: ParsedContentRecord,
  mediaAssets: readonly MediaAssetRecord[],
  objectStorage: ObjectStorageAdapter,
  previewOptions: ParsedMarkdownPreviewOptions,
): Promise<ParsedContentResponse> {
  return toParsedContentResponseAsync(record, mediaAssets, objectStorage, previewOptions);
}

async function toParsedContentResponseAsync(
  record: ParsedContentRecord,
  mediaAssets: readonly MediaAssetRecord[],
  objectStorage: ObjectStorageAdapter,
  previewOptions: ParsedMarkdownPreviewOptions,
): Promise<ParsedContentResponse> {
  const preview = await readParsedMarkdownPreview(record, objectStorage, previewOptions);
  const response: ParsedContentResponse = {
    id: record.id,
    document_id: record.documentId,
    parser_name: record.parserName,
    parser_version: record.parserVersion,
    normalized_markdown_object_key: record.normalizedMarkdownObjectKey,
    markdown_preview: preview.markdown,
    markdown_preview_object_key: preview.objectKey,
    markdown_preview_truncated: preview.truncated,
    locators: cloneJsonArray(record.locators),
    tables: cloneJsonArray(record.tables),
    media_assets: mediaAssets.map(toMediaAssetResponse),
    ocr_status: record.ocrStatus,
    ocr_summary: JSON.parse(JSON.stringify(record.ocrSummary)) as Record<string, unknown>,
    ocr_warnings: cloneJsonArray(record.ocrWarnings),
    ocr_provider_metadata: JSON.parse(JSON.stringify(record.ocrProviderMetadata)) as Record<
      string,
      unknown
    >,
    ocr_page_count: record.ocrPageCount,
    ocr_block_count: record.ocrBlockCount,
    ocr_derived_segment_count: record.ocrDerivedSegmentCount,
    ocr_completed_at: record.ocrCompletedAt,
    ocr_blocks: cloneJsonArray(record.ocrBlocks),
    warnings: cloneJsonArray(record.warnings),
    error:
      record.error === null
        ? null
        : (JSON.parse(JSON.stringify(record.error)) as Record<string, unknown>),
    created_at: record.createdAt,
  };

  if (record.captionedMarkdownObjectKey !== undefined) {
    response.captioned_markdown_object_key = record.captionedMarkdownObjectKey;
  }

  if (record.plainTextObjectKey !== undefined) {
    response.plain_text_object_key = record.plainTextObjectKey;
  }

  if (preview.error !== undefined) {
    response.markdown_preview_error = preview.error;
  }

  return response;
}

async function readParsedMarkdownPreview(
  record: ParsedContentRecord,
  objectStorage: ObjectStorageAdapter,
  previewOptions: ParsedMarkdownPreviewOptions,
): Promise<{
  error?: string;
  markdown: string | null;
  objectKey: string | null;
  truncated: boolean;
}> {
  const objectKey = record.captionedMarkdownObjectKey ?? record.normalizedMarkdownObjectKey;

  if (
    previewOptions.enabled &&
    record.markdownPreview !== undefined &&
    record.markdownPreviewObjectKey === objectKey
  ) {
    return {
      markdown: record.markdownPreview,
      objectKey,
      truncated: record.markdownPreviewTruncated ?? false,
    };
  }

  try {
    const object = await objectStorage.getObject({ key: objectKey });
    const maxChars = previewOptions.maxChars;
    const markdownRead = await readObjectBodyTextWithinLimit(
      object.body,
      object.contentLength,
      maxChars * 4,
    );

    if (markdownRead.kind === "fatal") {
      return {
        error: "Parsed markdown preview exceeded configured read limits.",
        markdown: null,
        objectKey,
        truncated: false,
      };
    }

    const markdown = markdownRead.text;
    const truncated = markdown.length > maxChars;

    return {
      markdown: truncated ? markdown.slice(0, maxChars) : markdown,
      objectKey,
      truncated,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Parsed markdown preview is unavailable.",
      markdown: null,
      objectKey,
      truncated: false,
    };
  }
}

async function readObjectBodyTextWithinLimit(
  body: unknown,
  contentLength: number | undefined,
  maxBytes: number,
): Promise<{ kind: "success"; text: string } | { kind: "fatal"; actualBytes: number }> {
  if (contentLength !== undefined && contentLength > maxBytes) {
    return {
      kind: "fatal",
      actualBytes: contentLength,
    };
  }

  if (body === undefined || body === null) {
    return {
      kind: "success",
      text: "",
    };
  }

  if (typeof body === "string") {
    const byteLength = Buffer.byteLength(body);

    return byteLength > maxBytes
      ? { kind: "fatal", actualBytes: byteLength }
      : { kind: "success", text: body };
  }

  if (body instanceof Uint8Array) {
    return body.byteLength > maxBytes
      ? { kind: "fatal", actualBytes: body.byteLength }
      : { kind: "success", text: Buffer.from(body).toString("utf8") };
  }

  if (hasTransformToString(body)) {
    if (contentLength === undefined) {
      return {
        kind: "fatal",
        actualBytes: maxBytes + 1,
      };
    }

    const text = await body.transformToString("utf8");
    const byteLength = Buffer.byteLength(text);

    return byteLength > maxBytes
      ? { kind: "fatal", actualBytes: byteLength }
      : { kind: "success", text };
  }

  if (isAsyncIterable(body)) {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;

      if (totalBytes > maxBytes) {
        return {
          kind: "fatal",
          actualBytes: totalBytes,
        };
      }

      chunks.push(buffer);
    }

    return {
      kind: "success",
      text: Buffer.concat(chunks, totalBytes).toString("utf8"),
    };
  }

  if (isNodeReadable(body)) {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string);
      totalBytes += buffer.byteLength;

      if (totalBytes > maxBytes) {
        return {
          kind: "fatal",
          actualBytes: totalBytes,
        };
      }

      chunks.push(buffer);
    }

    return {
      kind: "success",
      text: Buffer.concat(chunks, totalBytes).toString("utf8"),
    };
  }

  return {
    kind: "success",
    text: "",
  };
}

function hasTransformToString(
  value: unknown,
): value is { transformToString(encoding?: string): Promise<string> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "transformToString" in value &&
    typeof (value as { transformToString?: unknown }).transformToString === "function"
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function isNodeReadable(value: unknown): value is Readable {
  return (
    value instanceof Transform ||
    (typeof value === "object" && value !== null && "readable" in value)
  );
}

function toMediaAssetResponse(record: MediaAssetRecord): MediaAssetResponse {
  return {
    id: record.id,
    document_id: record.documentId,
    parsed_content_id: record.parsedContentId,
    mime_type: record.mimeType,
    locator: JSON.parse(JSON.stringify(record.locator)) as Record<string, unknown>,
    width: record.width,
    height: record.height,
    object_key: record.objectKey,
    sha256: record.sha256,
    caption_status: record.captionStatus,
    caption: record.caption,
    caption_provider_name: record.captionProviderName,
    caption_model: record.captionModel,
    caption_prompt_version: record.captionPromptVersion,
    caption_model_call_id: record.captionModelCallId,
    caption_cache_hit: record.captionCacheHit,
    caption_attempt_count: record.captionAttemptCount,
    caption_error:
      record.captionError === null
        ? null
        : (JSON.parse(JSON.stringify(record.captionError)) as Record<string, unknown>),
    caption_generated_at: record.captionGeneratedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toDocumentProcessingUnitResponse(
  record: DocumentProcessingUnitRecord,
): DocumentProcessingUnitResponse {
  return {
    id: record.id,
    source_document_id: record.sourceDocumentId,
    job_id: record.jobId,
    parsed_content_id: record.parsedContentId,
    stage: record.stage,
    unit_type: record.unitType,
    unit_key: record.unitKey,
    unit_index: record.unitIndex,
    attempt_scope: record.attemptScope,
    status: record.status,
    content_hash: record.contentHash,
    dedupe_key: record.dedupeKey,
    object_key: record.objectKey,
    object_refs: cloneJsonArray(record.objectRefs),
    locator: JSON.parse(JSON.stringify(record.locator)) as Record<string, unknown>,
    counters: JSON.parse(JSON.stringify(record.counters)) as Record<string, unknown>,
    warnings: cloneJsonArray(record.warnings),
    safe_error:
      record.safeError === null
        ? null
        : (JSON.parse(JSON.stringify(record.safeError)) as Record<string, unknown>),
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
    retry_eligible: record.retryEligible,
    completed_at: record.completedAt,
    updated_at: record.updatedAt,
  };
}

function parseUploadData(value: unknown): UploadDataField {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(value) as Record<string, unknown>;
  const uploadData: UploadDataField = {};

  if (typeof parsed.display_name === "string") {
    uploadData.display_name = parsed.display_name;
  }
  if (typeof parsed.source_path === "string") {
    uploadData.source_path = parsed.source_path;
  }
  if (isJsonObject(parsed.metadata)) {
    uploadData.metadata = parsed.metadata;
  }

  return uploadData;
}

function createUploadDataField(
  displayName: string,
  sourcePath: string | undefined,
  metadata: Record<string, unknown> | undefined,
): UploadDataField {
  const uploadData: UploadDataField = {
    display_name: displayName,
  };

  if (sourcePath !== undefined) {
    uploadData.source_path = sourcePath;
  }
  if (metadata !== undefined) {
    uploadData.metadata = metadata;
  }

  return uploadData;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonArray(
  value: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return JSON.parse(JSON.stringify(value)) as readonly Record<string, unknown>[];
}

function readLifecycleHistory(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (JSON.parse(JSON.stringify(value)) as Record<string, unknown>[])
    : [];
}

function readSourceDocumentCleanupOperationId(metadata: Record<string, unknown>): string | null {
  const lifecycleHistory = metadata.lifecycle_history;

  if (!Array.isArray(lifecycleHistory)) {
    return null;
  }

  for (let index = lifecycleHistory.length - 1; index >= 0; index -= 1) {
    const event = lifecycleHistory[index];

    if (!isJsonObject(event) || event.type !== "deleted") {
      continue;
    }

    const cleanupOperationId = event.cleanup_operation_id;

    if (typeof cleanupOperationId === "string" && cleanupOperationId.length > 0) {
      return cleanupOperationId;
    }
  }

  return null;
}

function readRequiredString(value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_field_required",
      details: {
        fields: [field],
      },
    });
  }

  return trimmed;
}

function readPositiveInteger(value: number | undefined, field: string): number {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_field_required",
      details: {
        fields: [field],
      },
    });
  }

  return value;
}

function readSha256ContentHash(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!/^sha256:[a-f0-9]{64}$/u.test(normalized)) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.content_hash_invalid",
      details: {
        fields: ["content_hash"],
      },
    });
  }

  return normalized;
}

function readObjectContentHash(metadata: Record<string, string> | undefined): string | null {
  if (metadata === undefined) {
    return null;
  }

  const rawHash = metadata["content-sha256"] ?? metadata["x-amz-meta-content-sha256"];

  return rawHash === undefined ? null : readSha256ContentHash(rawHash);
}

function createObjectStorageValidationMetadata(input: {
  contentHash: string;
  contentLength?: number | undefined;
  contentType?: string | undefined;
  etag?: string | undefined;
  metadataContentHash: string | null;
  objectKey: string;
  validatedAt: string;
}): Record<string, unknown> {
  return {
    content_hash: input.contentHash,
    content_length: input.contentLength ?? null,
    content_type: input.contentType ?? null,
    etag: input.etag ?? null,
    metadata_content_hash: input.metadataContentHash,
    object_key: input.objectKey,
    validated_at: input.validatedAt,
  };
}

function readValidUrl(value: string | undefined, config: RuntimeConfig): string {
  const rawUrl = readRequiredString(value, "url");

  try {
    return validateRemoteSourceUrl(
      rawUrl,
      createRemoteSourceSecurityPolicy(config, ["http", "https"]),
    ).toString();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("invalid_request", {
      messageKey: "api.validation.source_url_invalid",
      details: {
        fields: ["url"],
      },
      cause: error,
    });
  }
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function createSourceUploadStorageError(error: unknown): ApiError {
  const details = readSourceUploadStorageFailureDetails(error);

  console.error("Source object upload failed.", details);

  return new ApiError("internal_error", {
    messageKey: "api.validation.source_upload_failed",
    details,
    cause: error,
  });
}

function createMediaAssetNotFoundError(): ApiError {
  return new ApiError("document_not_found", {
    messageKey: "api.validation.media_asset_not_found",
  });
}

function createSourceEvidenceDocumentNotFoundError(input: NormalizedSourceEvidenceInput): ApiError {
  return new ApiError("document_not_found", {
    details: {
      document_id: input.documentId,
      knowledge_base_id: input.knowledgeBaseId,
    },
  });
}

function readSourceUploadStorageFailureDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    operation: "source_upload",
    reason: "storage_upload_failed",
  };

  if (!isJsonObject(error)) {
    return details;
  }

  const name = readStringProperty(error, "name");
  const code = readStringProperty(error, "code") ?? readStringProperty(error, "Code");
  const metadata = isJsonObject(error.$metadata) ? error.$metadata : undefined;
  const httpStatusCode =
    typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;

  if (name !== undefined) {
    details.error_name = name;
  }
  if (code !== undefined) {
    details.error_code = code;
  }
  if (httpStatusCode !== undefined) {
    details.http_status_code = httpStatusCode;
  }

  return details;
}

function readStringProperty(value: Record<string, unknown>, key: string): string | undefined {
  const property = value[key];

  return typeof property === "string" && property.length > 0 ? property : undefined;
}

function toDatasetConfigurationSnapshotPayload(configuration: DatasetConfigurationResponse) {
  return {
    id: configuration.latest_snapshot_id,
    preset_id: configuration.preset_id,
    values: JSON.parse(JSON.stringify(configuration.values)) as Record<string, unknown>,
    version: configuration.version,
  };
}

function createRetentionTimestamp(now: string, days: number | null): string | null {
  if (days === null) {
    return null;
  }

  const timestamp = new Date(now);
  timestamp.setUTCDate(timestamp.getUTCDate() + days);

  return timestamp.toISOString();
}

function toOperationalListError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("internal_error");
}

function sanitizeObjectKeySegment(value: string): string {
  return value.replaceAll("\\", "/").split("/").filter(Boolean).join("-") || "upload.bin";
}
