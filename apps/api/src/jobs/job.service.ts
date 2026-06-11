import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId, normalizeJobTimelineEvents } from "@fococontext/contracts";

import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import { toJobResponse } from "../documents/document.service.js";
import {
  type DatasetConfigurationSnapshotPayload,
  sourceParseQueueToken,
  type SourceParseQueue,
  type SourceParseQueueJobSnapshot,
} from "../queues/source-parse.queue.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import type {
  BatchIngestJobStatusInput,
  BatchIngestJobStatusResponse,
  BatchIngestJobStatusResultResponse,
  BackgroundOperationRecord,
  BackgroundOperationResponse,
  JobDetailResponse,
  JobEventRecord,
  JobEventResponse,
  JobRecord,
  KnowledgeBaseIngestProgressResponse,
  SourceDocumentRecord,
} from "../documents/document.types.js";

type ResolvedBatchJobStatusResult =
  | {
      index: number;
      job_id: string;
      status: "resolved";
      job: JobRecord;
    }
  | {
      index: number;
      job_id: string;
      status: "error";
      error: NonNullable<BatchIngestJobStatusResultResponse["error"]>;
    };

@Injectable()
export class JobService {
  constructor(
    @Inject(sourceParseQueueToken) private readonly sourceParseQueue: SourceParseQueue,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
    private readonly webhookService: WebhookService,
  ) {}

  async list(
    knowledgeBaseId: string,
    input: { page: number; pageSize: number },
    scope?: ApiResourceScope,
  ): Promise<{
    items: JobDetailResponse[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> {
    await this.assertReadableKnowledgeBase(
      knowledgeBaseId,
      scope,
      () => new ApiError("knowledge_base_not_found"),
    );
    try {
      const dbResult = await this.operationalReadStore.listJobs({
        knowledgeBaseId,
        page: input.page,
        pageSize: input.pageSize,
      });

      if (dbResult !== null) {
        const jobs = await Promise.all(
          dbResult.items.map((job) => this.reconcileSourceParseState(job)),
        );
        const eventsByJobId = await this.operationalReadStore.listJobEventsByJobIds(
          jobs.map((job) => job.id),
        );
        const operationsByJobId = await this.operationalReadStore.listBackgroundOperationsByJobIds(
          jobs.map((job) => job.id),
        );

        return {
          items: jobs.map((job) =>
            this.toJobDetailResponse(
              job,
              eventsByJobId.get(job.id) ?? [],
              operationsByJobId.get(job.id) ?? [],
            ),
          ),
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

  async get(jobId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    const job = await this.reconcileSourceParseState(await this.requireJob(jobId, scope));

    return this.toJobDetailResponse(
      job,
      await this.getJobEvents(job.id),
      await this.getBackgroundOperations(job.id),
    );
  }

  async batch(
    input: BatchIngestJobStatusInput,
    scope?: ApiResourceScope,
  ): Promise<BatchIngestJobStatusResponse> {
    const jobIds = readBatchJobIds(input);

    if (jobIds.length > batchJobStatusMaxItems) {
      throw new ApiError("invalid_request", {
        details: {
          field: "job_ids",
          limit: batchJobStatusMaxItems,
          actual: jobIds.length,
        },
      });
    }

    const jobsById = await this.operationalReadStore.listJobsByIds(jobIds);
    const resolved = await Promise.all(
      jobIds.map(async (jobId, index): Promise<ResolvedBatchJobStatusResult> => {
        try {
          const job = await this.reconcileSourceParseState(
            await this.requireLoadedJob(jobId, jobsById.get(jobId), scope),
          );

          return {
            index,
            job_id: jobId,
            status: "resolved",
            job,
          };
        } catch (error) {
          if (error instanceof ApiError && error.code === "job_not_found") {
            return {
              index,
              job_id: jobId,
              status: "error",
              error: {
                code: "job_not_found",
                message: "Job not found.",
                details: {
                  job_id: jobId,
                },
              },
            };
          }

          throw error;
        }
      }),
    );
    const eventsByJobId = await this.operationalReadStore.listJobEventsByJobIds(
      resolved.flatMap((item) => (item.status === "resolved" ? [item.job.id] : [])),
    );
    const operationsByJobId = await this.operationalReadStore.listBackgroundOperationsByJobIds(
      resolved.flatMap((item) => (item.status === "resolved" ? [item.job.id] : [])),
    );
    const items = resolved.map((item): BatchIngestJobStatusResultResponse => {
      if (item.status === "error") {
        return item;
      }

      return {
        index: item.index,
        job_id: item.job_id,
        status: "resolved",
        job: this.toJobDetailResponse(
          item.job,
          eventsByJobId.get(item.job.id) ?? [],
          operationsByJobId.get(item.job.id) ?? [],
        ),
      };
    });

    return {
      items,
      limits: {
        max_items: batchJobStatusMaxItems,
      },
    };
  }

  async getKnowledgeBaseIngestProgress(
    knowledgeBaseId: string,
    scope?: ApiResourceScope,
  ): Promise<KnowledgeBaseIngestProgressResponse> {
    await this.assertReadableKnowledgeBase(
      knowledgeBaseId,
      scope,
      () => new ApiError("knowledge_base_not_found"),
    );
    try {
      const dbProgress = await this.operationalReadStore.getKnowledgeBaseIngestProgress(
        knowledgeBaseId,
        ingestProgressRepresentativeJobLimit,
      );

      if (dbProgress !== null) {
        const jobs = await Promise.all(
          dbProgress.representativeJobs.map((job) => this.reconcileSourceParseState(job)),
        );
        const eventsByJobId = await this.operationalReadStore.listJobEventsByJobIds(
          jobs.map((job) => job.id),
        );

        return {
          knowledge_base_id: knowledgeBaseId,
          overall_progress: dbProgress.overallProgress,
          retrieve_ready: dbProgress.counts.running === 0 && dbProgress.counts.queued === 0,
          latest_job_created_at: dbProgress.latestJobCreatedAt,
          latest_job_updated_at: dbProgress.latestJobUpdatedAt,
          counts: {
            total:
              dbProgress.counts.queued +
              dbProgress.counts.running +
              dbProgress.counts.completed +
              dbProgress.counts.failed +
              dbProgress.counts.canceled,
            queued: dbProgress.counts.queued,
            running: dbProgress.counts.running,
            completed: dbProgress.counts.completed,
            failed: dbProgress.counts.failed,
            canceled: dbProgress.counts.canceled,
          },
          stage_counts: dbProgress.stageCounts,
          jobs: jobs.map((job) => this.toJobDetailResponse(job, eventsByJobId.get(job.id) ?? [])),
          links: createIngestProgressLinks(knowledgeBaseId),
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    throw new ApiError("internal_error");
  }

  async cancel(jobId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    const job = await this.requireJob(jobId, scope);

    if (job.status === "canceled") {
      return this.toJobDetailResponse(
        job,
        await this.getJobEvents(job.id),
        await this.getBackgroundOperations(job.id),
      );
    }
    if (job.status === "completed") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.completed_job_cancel",
      });
    }
    if (job.status === "failed") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.terminal_job_cancel",
      });
    }

    const now = new Date().toISOString();
    const updated: JobRecord = {
      ...job,
      status: "canceled",
      progressMessage: "Canceled before parsing completed.",
      updatedAt: now,
    };
    const event: JobEventRecord = {
      jobId: updated.id,
      type: "job.canceled",
      stage: updated.stage,
      status: updated.status,
      message: updated.progressMessage,
      metadata: {},
      createdAt: now,
    };
    await this.databaseMirror.updateJob(updated);
    await this.databaseMirror.appendJobEvent(event);

    return this.toJobDetailResponse(
      updated,
      await this.getJobEvents(updated.id),
      await this.getBackgroundOperations(updated.id),
    );
  }

  async retry(jobId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    const original = await this.requireJob(jobId, scope);

    if (original.status === "queued" || original.status === "running") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.running_job_retry",
      });
    }
    if (original.status === "completed") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.completed_job_retry",
      });
    }
    if (original.status === "failed" && original.error?.retryable === false) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.non_retryable_job_retry",
      });
    }
    if (original.documentId === null) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.job_retry_document_required",
      });
    }

    const document = await this.requireRetryDocument(original.documentId, original, scope);
    const datasetConfiguration =
      await this.operationalReadStore.getDatasetConfigurationByKnowledgeBaseId(
        scope ?? defaultApiResourceScope,
        original.knowledgeBaseId,
      );

    if (datasetConfiguration === null) {
      throw new ApiError("internal_error");
    }

    const now = new Date().toISOString();
    const retried: JobRecord = {
      ...original,
      id: createResourceId("ingestJob"),
      stage: "parsing",
      status: "queued",
      progress: 0,
      progressMessage: "Queued for retry.",
      retryOfJobId: original.id,
      parsedContentId: null,
      changeSetId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.databaseMirror.saveJob(retried);
    await this.databaseMirror.appendJobEvent({
      jobId: retried.id,
      type: "job.queued",
      stage: retried.stage,
      status: retried.status,
      message: retried.progressMessage,
      metadata: {},
      createdAt: retried.createdAt,
    });
    await this.sourceParseQueue.enqueueSourceParseJob({
      job_id: retried.id,
      knowledge_base_id: retried.knowledgeBaseId,
      document_id: document.id,
      content_hash: retried.contentHash,
      object_key: document.objectKey,
      mime_type: document.mimeType,
      source_type: document.sourceType,
      input_snapshot_id: retried.inputSnapshotId,
      dataset_configuration_snapshot: toDatasetConfigurationSnapshotPayload(datasetConfiguration),
      ocr_policy: datasetConfiguration.values.ocr_policy,
    });
    await this.webhookService.emit({
      eventType: "document.ingest.started",
      knowledgeBaseId: retried.knowledgeBaseId,
      payload: {
        document_id: document.id,
        job_id: retried.id,
        retry_of_job_id: original.id,
        source_type: document.sourceType,
      },
      requestTrace: {
        event_source: "job.retry",
      },
      ...(scope === undefined ? {} : { scope }),
    });

    return this.toJobDetailResponse(
      retried,
      await this.getJobEvents(retried.id),
      await this.getBackgroundOperations(retried.id),
    );
  }

  private async requireRetryDocument(
    documentId: string,
    job: JobRecord,
    scope?: ApiResourceScope,
  ): Promise<SourceDocumentRecord> {
    const document = await this.operationalReadStore.getSourceDocumentById(documentId);

    if (
      document === null ||
      document.knowledgeBaseId !== job.knowledgeBaseId ||
      document.status === "deleted"
    ) {
      throw new ApiError("document_not_found");
    }

    await this.assertReadableKnowledgeBase(
      document.knowledgeBaseId,
      scope,
      () => new ApiError("knowledge_base_not_found"),
    );

    return document;
  }

  private async requireJob(jobId: string, scope?: ApiResourceScope): Promise<JobRecord> {
    try {
      return this.requireLoadedJob(jobId, await this.operationalReadStore.getJobById(jobId), scope);
    } catch (error) {
      throw toOperationalListError(error);
    }
  }

  private async requireLoadedJob(
    jobId: string,
    job: JobRecord | null | undefined,
    scope?: ApiResourceScope,
  ): Promise<JobRecord> {
    if (job === null || job === undefined) {
      throw new ApiError("job_not_found");
    }
    await this.assertReadableKnowledgeBase(
      job.knowledgeBaseId,
      scope,
      () => new ApiError("job_not_found"),
    );

    return job;
  }

  private async assertReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope: ApiResourceScope | undefined,
    notFoundFactory: () => ApiError,
  ): Promise<void> {
    const resolvedScope = scope ?? defaultApiResourceScope;
    const knowledgeBase = await this.operationalReadStore.getKnowledgeBaseById(
      resolvedScope,
      knowledgeBaseId,
    );

    if (knowledgeBase === null) {
      throw notFoundFactory();
    }
  }

  private async reconcileSourceParseState(job: JobRecord): Promise<JobRecord> {
    if (job.documentId === null || job.stage !== "parsing") {
      return job;
    }

    const snapshot = await this.sourceParseQueue.getSourceParseJobStatus?.(job.id);

    if (snapshot === undefined || snapshot.status === "unknown" || snapshot.status === "queued") {
      return job;
    }

    const reconciled = toReconciledJob(job, snapshot);

    if (isSameJobState(job, reconciled)) {
      return job;
    }

    const updated = reconciled;

    const event: JobEventRecord = {
      jobId: updated.id,
      type: toJobEventType(updated.status),
      stage: updated.stage,
      status: updated.status,
      message: updated.progressMessage,
      metadata: readSourceParseResultMetadata(snapshot.result),
      createdAt: updated.updatedAt,
    };
    await this.databaseMirror.updateJob(updated);
    await this.databaseMirror.appendJobEvent(event);
    if (updated.status === "failed") {
      await this.webhookService.emit({
        eventType: "document.ingest.failed",
        knowledgeBaseId: updated.knowledgeBaseId,
        payload: {
          document_id: updated.documentId,
          error: updated.error,
          job_id: updated.id,
          stage: updated.stage,
        },
        requestTrace: {
          event_source: "job.reconcile_source_parse_state",
        },
      });
    }

    return updated;
  }

  private toJobDetailResponse(
    job: JobRecord,
    events: readonly JobEventRecord[],
    backgroundOperations: readonly BackgroundOperationRecord[] = [],
  ): JobDetailResponse {
    return {
      ...toJobResponse(job),
      background_operations: backgroundOperations.map(toBackgroundOperationResponse),
      events: normalizeJobTimelineEvents(events).map(toJobEventResponse),
    };
  }

  private async getJobEvents(jobId: string): Promise<readonly JobEventRecord[]> {
    const eventsByJobId = await this.operationalReadStore.listJobEventsByJobIds([jobId]);

    return eventsByJobId.get(jobId) ?? [];
  }

  private async getBackgroundOperations(
    jobId: string,
  ): Promise<readonly BackgroundOperationRecord[]> {
    const operationsByJobId = await this.operationalReadStore.listBackgroundOperationsByJobIds([
      jobId,
    ]);

    return operationsByJobId.get(jobId) ?? [];
  }
}

function createIngestProgressLinks(
  knowledgeBaseId: string,
): KnowledgeBaseIngestProgressResponse["links"] {
  return [
    {
      rel: "knowledge_base_jobs",
      method: "GET",
      href: `/v1/knowledge-bases/${knowledgeBaseId}/jobs`,
      resource_type: "job_list",
    },
    {
      rel: "retrieve_readiness",
      method: "GET",
      href: `/v1/knowledge-bases/${knowledgeBaseId}/ingest-progress`,
      resource_type: "retrieve_readiness",
    },
  ];
}

function toReconciledJob(job: JobRecord, snapshot: SourceParseQueueJobSnapshot): JobRecord {
  const now = new Date().toISOString();

  if (snapshot.status === "completed") {
    return {
      ...job,
      stage: "analyzing",
      status: "running",
      progress: Math.max(job.progress, 30),
      progressMessage: "Analyzing content...",
      parsedContentId: readOptionalString(snapshot.result?.parsed_content_id),
      error: null,
      updatedAt: now,
    };
  }

  if (snapshot.status === "failed") {
    return {
      ...job,
      status: "failed",
      progress: Math.max(job.progress, snapshot.progress),
      progressMessage: "Parsing failed.",
      error: snapshot.result?.error ?? createQueueFailureError(snapshot.failed_reason),
      updatedAt: now,
    };
  }

  return {
    ...job,
    status: "running",
    progress: Math.max(job.progress, snapshot.progress),
    progressMessage: "Parsing source document.",
    updatedAt: now,
  };
}

function isSameJobState(left: JobRecord, right: JobRecord): boolean {
  return (
    left.status === right.status &&
    left.progress === right.progress &&
    left.progressMessage === right.progressMessage &&
    left.parsedContentId === right.parsedContentId &&
    JSON.stringify(left.error) === JSON.stringify(right.error)
  );
}

function toJobEventType(status: JobRecord["status"]): JobEventRecord["type"] {
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

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function createQueueFailureError(reason: string | null): Record<string, unknown> {
  return {
    code: "source_parse_failed",
    message: reason ?? "Source parse job failed.",
  };
}

function readSourceParseResultMetadata(
  result: SourceParseQueueJobSnapshot["result"],
): Record<string, unknown> {
  const cache = result?.cache;

  if (cache === undefined) {
    return {};
  }

  return {
    parser_cache: JSON.parse(JSON.stringify(cache)) as Record<string, unknown>,
  };
}

function toDatasetConfigurationSnapshotPayload(configuration: {
  latest_snapshot_id: string;
  preset_id: string;
  values: Record<string, unknown>;
  version: number;
}): DatasetConfigurationSnapshotPayload {
  return {
    id: configuration.latest_snapshot_id,
    preset_id: configuration.preset_id,
    values: JSON.parse(JSON.stringify(configuration.values)) as Record<string, unknown>,
    version: configuration.version,
  };
}

function toJobEventResponse(record: JobEventRecord): JobEventResponse {
  return {
    type: record.type,
    stage: record.stage,
    status: record.status,
    message: record.message,
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
    created_at: record.createdAt,
  };
}

function toBackgroundOperationResponse(
  record: BackgroundOperationRecord,
): BackgroundOperationResponse {
  return {
    id: record.id,
    job_id: record.jobId,
    knowledge_base_id: record.knowledgeBaseId,
    operation_kind: record.operationKind,
    stage: record.stage,
    status: record.status,
    cursor: JSON.parse(JSON.stringify(record.cursor)) as Record<string, unknown>,
    processed_count: record.processedCount,
    failed_count: record.failedCount,
    total_count: record.totalCount,
    last_item_id: record.lastItemId,
    safe_error:
      record.safeError === null
        ? null
        : (JSON.parse(JSON.stringify(record.safeError)) as Record<string, unknown>),
    metadata: JSON.parse(JSON.stringify(record.metadata)) as Record<string, unknown>,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toOperationalListError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("internal_error");
}

const batchJobStatusMaxItems = 50;
const ingestProgressRepresentativeJobLimit = 20;

function readBatchJobIds(input: BatchIngestJobStatusInput): string[] {
  if (!Array.isArray(input.job_ids)) {
    throw new ApiError("invalid_request", {
      details: {
        field: "job_ids",
        reason: "array_required",
      },
    });
  }

  if (input.job_ids.length === 0) {
    throw new ApiError("invalid_request", {
      details: {
        field: "job_ids",
        reason: "non_empty_array_required",
      },
    });
  }

  return input.job_ids.map((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ApiError("invalid_request", {
        details: {
          field: `job_ids.${index}`,
          reason: "non_empty_string_required",
        },
      });
    }

    return value.trim();
  });
}
