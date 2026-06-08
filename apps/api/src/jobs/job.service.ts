import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId, normalizeJobTimelineEvents } from "@fococontext/contracts";

import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  apiDatabaseHydratorToken,
  type ApiDatabaseHydrator,
} from "../database/api-database-hydrator.js";
import type { ApiResourceScope } from "../auth/api-key.guard.js";
import { DocumentRepository } from "../documents/document.repository.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import { toJobResponse } from "../documents/document.service.js";
import {
  sourceParseQueueToken,
  type SourceParseQueue,
  type SourceParseQueueJobSnapshot,
} from "../queues/source-parse.queue.js";
import { WebhookService } from "../webhooks/webhook.service.js";
import { isHiddenFromKnowledgeBaseJobList } from "./job-visibility.js";
import type {
  BatchIngestJobStatusInput,
  BatchIngestJobStatusResponse,
  BatchIngestJobStatusResultResponse,
  JobDetailResponse,
  JobEventRecord,
  JobEventResponse,
  JobRecord,
  JobStage,
  KnowledgeBaseIngestProgressResponse,
} from "../documents/document.types.js";

@Injectable()
export class JobService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    @Inject(sourceParseQueueToken) private readonly sourceParseQueue: SourceParseQueue,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(apiDatabaseHydratorToken) private readonly databaseHydrator: ApiDatabaseHydrator,
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
    await this.databaseHydrator.refresh();
    this.assertReadableKnowledgeBase(
      knowledgeBaseId,
      scope,
      () => new ApiError("knowledge_base_not_found"),
    );
    const jobs = (
      await Promise.all(
        this.repository
          .listJobs(knowledgeBaseId)
          .filter((job) => !isHiddenFromKnowledgeBaseJobList(job))
          .map((job) => this.reconcileSourceParseState(job)),
      )
    ).sort((left, right) =>
      compareUpdatedAtDesc(left.updatedAt, left.id, right.updatedAt, right.id),
    );
    const start = (input.page - 1) * input.pageSize;
    const end = start + input.pageSize;

    return {
      items: jobs.slice(start, end).map((job) => this.toJobDetailResponse(job)),
      page: input.page,
      pageSize: input.pageSize,
      total: jobs.length,
      hasMore: end < jobs.length,
    };
  }

  async get(jobId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    await this.databaseHydrator.refresh();
    return this.toJobDetailResponse(
      await this.reconcileSourceParseState(this.requireJob(jobId, scope)),
    );
  }

  async batch(
    input: BatchIngestJobStatusInput,
    scope?: ApiResourceScope,
  ): Promise<BatchIngestJobStatusResponse> {
    await this.databaseHydrator.refresh();
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

    const items = await Promise.all(
      jobIds.map(async (jobId, index): Promise<BatchIngestJobStatusResultResponse> => {
        try {
          const job = await this.reconcileSourceParseState(this.requireJob(jobId, scope));

          return {
            index,
            job_id: jobId,
            status: "resolved",
            job: this.toJobDetailResponse(job),
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
    await this.databaseHydrator.refresh();
    this.assertReadableKnowledgeBase(
      knowledgeBaseId,
      scope,
      () => new ApiError("knowledge_base_not_found"),
    );
    const jobs = (
      await Promise.all(
        this.repository
          .listJobs(knowledgeBaseId)
          .filter((job) => !isHiddenFromKnowledgeBaseJobList(job))
          .map((job) => this.reconcileSourceParseState(job)),
      )
    ).sort((left, right) =>
      compareUpdatedAtDesc(left.updatedAt, left.id, right.updatedAt, right.id),
    );
    const counts = {
      total: jobs.length,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
    };
    const stageCounts = createEmptyStageCounts();
    let progressSum = 0;

    for (const job of jobs) {
      counts[job.status] += 1;
      stageCounts[job.stage] += 1;
      progressSum += toJobResponse(job).progress;
    }

    const latestJob = jobs[0];
    const latestCreatedJob = [...jobs].sort((left, right) =>
      compareUpdatedAtDesc(left.createdAt, left.id, right.createdAt, right.id),
    )[0];

    return {
      knowledge_base_id: knowledgeBaseId,
      overall_progress:
        jobs.length === 0 ? 100 : Math.min(100, Math.max(0, Math.round(progressSum / jobs.length))),
      retrieve_ready: jobs.length === 0 || (counts.running === 0 && counts.queued === 0),
      latest_job_created_at: latestCreatedJob?.createdAt ?? null,
      latest_job_updated_at: latestJob?.updatedAt ?? null,
      counts,
      stage_counts: stageCounts,
      jobs: jobs
        .slice(0, ingestProgressRepresentativeJobLimit)
        .map((job) => this.toJobDetailResponse(job)),
      links: [
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
      ],
    };
  }

  async cancel(jobId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    await this.databaseHydrator.refresh();
    const job = this.requireJob(jobId, scope);

    if (job.status === "canceled") {
      return this.toJobDetailResponse(job);
    }
    if (job.status === "completed") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.completed_job_cancel",
      });
    }

    const now = new Date().toISOString();
    const updated = this.repository.updateJob({
      ...job,
      status: "canceled",
      progressMessage: "Canceled before parsing completed.",
      updatedAt: now,
    });
    const event = this.repository.appendJobEvent({
      jobId: updated.id,
      type: "job.canceled",
      stage: updated.stage,
      status: updated.status,
      message: updated.progressMessage,
      metadata: {},
      createdAt: now,
    });
    await this.databaseMirror.updateJob(updated);
    await this.databaseMirror.appendJobEvent(event);

    return this.toJobDetailResponse(updated);
  }

  async retry(jobId: string, scope?: ApiResourceScope): Promise<JobDetailResponse> {
    await this.databaseHydrator.refresh();
    const original = this.requireJob(jobId, scope);

    if (original.status === "running") {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.running_job_retry",
      });
    }

    const now = new Date().toISOString();
    const retried = this.repository.createJob({
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
    });
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

    return this.toJobDetailResponse(retried);
  }

  private requireJob(jobId: string, scope?: ApiResourceScope): JobRecord {
    const job = this.repository.findJobById(jobId);

    if (job === undefined) {
      throw new ApiError("job_not_found");
    }
    this.assertReadableKnowledgeBase(
      job.knowledgeBaseId,
      scope,
      () => new ApiError("job_not_found"),
    );

    return job;
  }

  private assertReadableKnowledgeBase(
    knowledgeBaseId: string,
    scope: ApiResourceScope | undefined,
    notFoundFactory: () => ApiError,
  ): void {
    if (scope === undefined) {
      return;
    }

    try {
      this.knowledgeBaseService.assertReadableKnowledgeBase(knowledgeBaseId, scope);
    } catch (error) {
      if (error instanceof ApiError && error.code === "knowledge_base_not_found") {
        throw notFoundFactory();
      }

      throw error;
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

    const updated = this.repository.updateJob(reconciled);

    const event = this.repository.appendJobEvent({
      jobId: updated.id,
      type: toJobEventType(updated.status),
      stage: updated.stage,
      status: updated.status,
      message: updated.progressMessage,
      metadata: readSourceParseResultMetadata(snapshot.result),
      createdAt: updated.updatedAt,
    });
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

  private toJobDetailResponse(job: JobRecord): JobDetailResponse {
    return {
      ...toJobResponse(job),
      events: normalizeJobTimelineEvents(this.repository.listJobEvents(job.id)).map(
        toJobEventResponse,
      ),
    };
  }
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

function compareUpdatedAtDesc(
  leftUpdatedAt: string,
  leftId: string,
  rightUpdatedAt: string,
  rightId: string,
): number {
  const updatedAtOrder = rightUpdatedAt.localeCompare(leftUpdatedAt);

  return updatedAtOrder === 0 ? rightId.localeCompare(leftId) : updatedAtOrder;
}

const batchJobStatusMaxItems = 50;
const ingestProgressRepresentativeJobLimit = 20;

const jobStages: readonly JobStage[] = [
  "uploading",
  "parsing",
  "ocr",
  "captioning",
  "analyzing",
  "generating",
  "merging",
  "indexing",
];

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

function createEmptyStageCounts(): Record<JobStage, number> {
  return Object.fromEntries(jobStages.map((stage) => [stage, 0])) as Record<JobStage, number>;
}
