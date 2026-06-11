import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId } from "@fococontext/contracts";
import type { ObjectStorageAdapter } from "@fococontext/storage";

import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import type { JobRecord, SourceDocumentRecord } from "../documents/document.types.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import type { DatasetConfigurationResponse } from "../knowledge-bases/knowledge-base.types.js";
import { objectStorageToken } from "../object-storage.provider.js";
import {
  sourceParseQueueToken,
  type SourceParseQueue,
  type SourceParseQueuePayload,
} from "../queues/source-parse.queue.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import type {
  SubmitWikiDraftInput,
  WikiDraftApplyMode,
  WikiDraftSourceRef,
  WikiDraftStatus,
  WikiDraftSubmissionResponse,
} from "./wiki-draft.types.js";

const defaultApplyMode: WikiDraftApplyMode = "auto_ingest";

@Injectable()
export class WikiDraftService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    @Inject(objectStorageToken) private readonly objectStorage: ObjectStorageAdapter,
    @Inject(sourceParseQueueToken) private readonly sourceParseQueue: SourceParseQueue,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    private readonly webhookService: WebhookService,
  ) {}

  async submit(
    knowledgeBaseId: string,
    input: SubmitWikiDraftInput,
    scope?: ApiResourceScope,
  ): Promise<WikiDraftSubmissionResponse> {
    const knowledgeBase = await this.knowledgeBaseService.get(knowledgeBaseId, scope);
    const title = readRequiredString(input.title, "title");
    const markdown = readRequiredString(input.markdown, "markdown");
    const applyMode = readApplyMode(input.apply_mode);
    const sources = readSources(input.sources);
    const tags = readTags(input.tags);
    const metadata = cloneMetadata(input.metadata);
    const now = new Date().toISOString();
    const draftId = createWikiDraftId();
    const changeSetId = createResourceId("changeSet");
    const document = createWikiDraftDocumentRecord({
      knowledgeBaseId,
      draftId,
      changeSetId,
      title,
      markdown,
      sources,
      tags,
      metadata,
      applyMode,
      baseKnowledgeVersionId: knowledgeBase.current_version_id,
      now,
    });
    const job = createWikiDraftJobRecord({
      knowledgeBaseId,
      document,
      changeSetId,
      now,
    });
    const status = toWikiDraftStatus();
    await this.objectStorage.putObject({
      key: document.objectKey,
      body: Buffer.from(markdown),
      contentType: "text/markdown",
      metadata: {
        knowledgeBaseId,
        documentId: document.id,
        draftId,
      },
    });
    await this.databaseMirror.saveSourceDocument(document);
    await this.databaseMirror.saveJob(job);
    await this.databaseMirror.appendJobEvent(createQueuedJobEvent(job));
    await this.enqueueSourceParse(document, job, scope);
    await this.webhookService.emit({
      eventType: "wiki_draft.created",
      knowledgeBaseId,
      payload: {
        change_set_id: changeSetId,
        document_id: document.id,
        draft_id: draftId,
        job_id: job.id,
      },
      requestTrace: {
        event_source: "wiki_draft.submit",
      },
      ...(scope === undefined ? {} : { scope }),
    });

    return {
      draft_id: draftId,
      document_id: document.id,
      job_id: job.id,
      change_set_id: changeSetId,
      status,
      base_knowledge_version_id: knowledgeBase.current_version_id,
      target_knowledge_version_id: null,
    };
  }

  private async enqueueSourceParse(
    document: SourceDocumentRecord,
    job: JobRecord,
    scope?: ApiResourceScope,
  ): Promise<void> {
    const datasetConfiguration = await this.knowledgeBaseService.getDatasetConfiguration(
      document.knowledgeBaseId,
      scope,
    );
    const payload: SourceParseQueuePayload = {
      job_id: job.id,
      knowledge_base_id: job.knowledgeBaseId,
      document_id: document.id,
      content_hash: job.contentHash,
      object_key: document.objectKey,
      mime_type: document.mimeType,
      source_type: document.sourceType,
      input_snapshot_id: job.inputSnapshotId,
      dataset_configuration_snapshot: toDatasetConfigurationSnapshotPayload(datasetConfiguration),
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
        event_source: "wiki_draft.enqueue_source_parse",
      },
      ...(scope === undefined ? {} : { scope }),
    });
  }
}

function toDatasetConfigurationSnapshotPayload(configuration: DatasetConfigurationResponse) {
  return {
    id: configuration.latest_snapshot_id,
    preset_id: configuration.preset_id,
    values: JSON.parse(JSON.stringify(configuration.values)) as Record<string, unknown>,
    version: configuration.version,
  };
}

function createWikiDraftDocumentRecord(input: {
  knowledgeBaseId: string;
  draftId: string;
  changeSetId: string;
  title: string;
  markdown: string;
  sources: readonly WikiDraftSourceRef[];
  tags: readonly string[];
  metadata: Record<string, unknown>;
  applyMode: WikiDraftApplyMode;
  baseKnowledgeVersionId: string;
  now: string;
}): SourceDocumentRecord {
  const metadata: Record<string, unknown> = {
    ...input.metadata,
    draft_id: input.draftId,
    change_set_id: input.changeSetId,
    apply_mode: input.applyMode,
    base_knowledge_version_id: input.baseKnowledgeVersionId,
    target_knowledge_version_id: null,
    tags: [...input.tags],
    sources: input.sources.map((source) => ({ ...source })),
  };

  return {
    id: createResourceId("sourceDocument"),
    knowledgeBaseId: input.knowledgeBaseId,
    name: `${input.title}.md`,
    displayName: input.title,
    sourceType: "wiki_draft",
    mimeType: "text/markdown",
    size: Buffer.byteLength(input.markdown),
    contentHash: createContentHash(input.markdown),
    objectKey: `wiki-drafts/${input.knowledgeBaseId}/${input.draftId}.md`,
    status: "uploaded",
    metadata,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function createWikiDraftJobRecord(input: {
  knowledgeBaseId: string;
  document: SourceDocumentRecord;
  changeSetId: string;
  now: string;
}): JobRecord {
  return {
    id: createResourceId("ingestJob"),
    knowledgeBaseId: input.knowledgeBaseId,
    documentId: input.document.id,
    stage: "parsing",
    status: "queued",
    progress: 0,
    progressMessage: "Queued for Wiki Draft parsing.",
    contentHash: input.document.contentHash,
    idempotencyKey: null,
    deduped: false,
    lockedByKnowledgeBaseId: input.knowledgeBaseId,
    inputSnapshotId: randomUUID(),
    retryOfJobId: null,
    parsedContentId: null,
    changeSetId: input.changeSetId,
    error: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function createQueuedJobEvent(record: JobRecord) {
  return {
    jobId: record.id,
    type: "job.queued" as const,
    stage: record.stage,
    status: record.status,
    message: record.progressMessage,
    metadata: {},
    createdAt: record.createdAt,
  };
}

function readRequiredString(value: string | undefined, field: string): string {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.wiki_draft_required_field",
      messageParams: {
        field,
      },
      details: {
        fields: [field],
      },
    });
  }

  return normalized;
}

function readApplyMode(value: WikiDraftApplyMode | undefined): WikiDraftApplyMode {
  if (value === undefined) {
    return defaultApplyMode;
  }

  if (value === "auto_ingest") {
    return value;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.wiki_draft_apply_mode_invalid",
    details: {
      fields: ["apply_mode"],
    },
  });
}

function readSources(value: WikiDraftSourceRef[] | undefined): WikiDraftSourceRef[] {
  return (value ?? []).map((source) => ({
    document_id: readRequiredString(source.document_id, "sources.document_id"),
    locator: readRequiredString(source.locator, "sources.locator"),
  }));
}

function readTags(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
}

function cloneMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value === undefined ? {} : (JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
}

function toWikiDraftStatus(): WikiDraftStatus {
  return "queued_for_ingest";
}

function createWikiDraftId(): string {
  return `draft_${randomUUID().replaceAll("-", "")}`;
}

function createContentHash(markdown: string): string {
  return `sha256:${createHash("sha256").update(markdown).digest("hex")}`;
}
