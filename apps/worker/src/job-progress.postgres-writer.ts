import { sql, type Kysely } from "kysely";
import {
  isTerminalJobEventType,
  resolveJobProgressState,
  type JobProgressEventType,
} from "@fococontext/contracts";
import {
  recordRuntimeQueuePressureEvent,
  type RuntimeQueuePressureEvent,
  type RuntimeQueuePressureRecorder,
  type RuntimeQueueWorkKind,
} from "@fococontext/core";
import type { DatabaseSchema } from "@fococontext/db";
import type { WorkerWebhookEventEmitter } from "./webhook-dispatch.worker.js";

export type WorkerJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";
export type WorkerJobStage =
  | "parsing"
  | "ocr"
  | "captioning"
  | "analyzing"
  | "generating"
  | "merging"
  | "indexing";

export interface WorkerJobProgressUpdate {
  jobId: string;
  knowledgeBaseId: string;
  inputSnapshotId: string;
  stage: WorkerJobStage;
  status: WorkerJobStatus;
  progress: number;
  message: string;
  parsedContentId?: string | null;
  changeSetId?: string | null;
  error?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  now?: string;
}

export interface WorkerJobProgressWriter {
  updateJobProgress(input: WorkerJobProgressUpdate): Promise<void>;
}

export type WorkerJobGuardReason =
  | "job_not_found"
  | "job_canceled"
  | "stale_input_snapshot"
  | "knowledge_base_deleted"
  | "source_deleted";

export interface WorkerJobGuardInput {
  jobId: string;
  knowledgeBaseId: string;
  inputSnapshotId: string;
  sourceDocumentId?: string | null;
}

export interface WorkerJobGuardResult {
  canContinue: boolean;
  reason?: WorkerJobGuardReason;
}

export interface WorkerJobStateGuard {
  canContinueJob(input: WorkerJobGuardInput): Promise<WorkerJobGuardResult>;
}

export class PostgresWorkerJobProgressWriter
  implements WorkerJobProgressWriter, WorkerJobStateGuard
{
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly webhookEvents?: WorkerWebhookEventEmitter,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {}

  async canContinueJob(input: WorkerJobGuardInput): Promise<WorkerJobGuardResult> {
    const result = await sql<{
      status: string;
      inputSnapshotId: string | null;
      knowledgeBaseStatus: string | null;
      knowledgeBaseDeletedAt: Date | string | null;
      sourceStatus: string | null;
      sourceLifecycleStatus: string | null;
    }>`
      select
        jobs.status,
        jobs.metadata ->> 'input_snapshot_id' as "inputSnapshotId",
        knowledge_bases.status as "knowledgeBaseStatus",
        knowledge_bases.deleted_at as "knowledgeBaseDeletedAt",
        source_documents.status as "sourceStatus",
        source_documents.lifecycle_status as "sourceLifecycleStatus"
      from jobs
      left join knowledge_bases on knowledge_bases.id = jobs.knowledge_base_id
      left join source_documents on source_documents.id = ${input.sourceDocumentId ?? null}
      where jobs.id = ${input.jobId}
        and jobs.knowledge_base_id = ${input.knowledgeBaseId}
    `.execute(this.db);
    const row = result.rows[0];

    if (row === undefined) {
      return { canContinue: false, reason: "job_not_found" };
    }
    if (row.status === "canceled") {
      return { canContinue: false, reason: "job_canceled" };
    }
    if (row.inputSnapshotId !== input.inputSnapshotId) {
      return { canContinue: false, reason: "stale_input_snapshot" };
    }
    if (row.knowledgeBaseStatus === "deleted" || row.knowledgeBaseDeletedAt !== null) {
      return { canContinue: false, reason: "knowledge_base_deleted" };
    }
    if (row.sourceStatus === "deleted" || row.sourceLifecycleStatus === "deleted") {
      return { canContinue: false, reason: "source_deleted" };
    }

    return { canContinue: true };
  }

  async updateJobProgress(input: WorkerJobProgressUpdate): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    const error = input.error === undefined ? null : input.error;
    const eventType = toJobEventType(input.status);
    const eventId = isTerminalJobEventType(eventType)
      ? `${input.jobId}:${eventType}`
      : `${input.jobId}:${eventType}:${input.stage}:${now}`;
    const timingMetadata = await this.readProgressTimingMetadata(input.jobId, input.stage, now);
    const metadata = {
      ...(input.metadata ?? {}),
      ...timingMetadata,
    };
    const progressState = resolveJobProgressState({
      progress: input.progress,
      progressMessage: input.message,
      status: input.status,
    });
    const resultPatch = {
      ...(input.parsedContentId === undefined ? {} : { parsed_content_id: input.parsedContentId }),
      ...(input.changeSetId === undefined ? {} : { change_set_id: input.changeSetId }),
    };
    const updated = await sql<{ id: string }>`
      update jobs
      set
        status = ${input.status},
        stage = ${input.stage},
        progress = case
          when ${input.status} = 'completed' then 100
          else greatest(least(progress, 99), ${progressState.progress})
        end,
        progress_message = ${progressState.progressMessage},
        result = coalesce(result, '{}'::jsonb) || ${JSON.stringify(resultPatch)}::jsonb,
        error = ${error === null ? null : JSON.stringify(error)}::jsonb,
        updated_at = ${now}
      where id = ${input.jobId}
        and knowledge_base_id = ${input.knowledgeBaseId}
        and metadata ->> 'input_snapshot_id' = ${input.inputSnapshotId}
        and status <> 'canceled'
        and (
          status not in ('completed', 'failed', 'canceled')
          or status = ${input.status}
        )
        and exists (
          select 1
          from knowledge_bases
          where knowledge_bases.id = ${input.knowledgeBaseId}
            and knowledge_bases.status <> 'deleted'
            and knowledge_bases.deleted_at is null
        )
      returning id
    `.execute(this.db);

    if (updated.rows[0] === undefined) {
      return;
    }

    await this.recordQueuePressure(input);

    await sql`
      insert into job_events (
        id,
        tenant_id,
        project_id,
        job_id,
        event_type,
        message,
        metadata,
        created_at
      )
      values (
        ${eventId},
        (select tenant_id from jobs where id = ${input.jobId}),
        (select project_id from jobs where id = ${input.jobId}),
        ${input.jobId},
        ${eventType},
        ${progressState.progressMessage},
        ${JSON.stringify({
          ...metadata,
          stage: input.stage,
          status: input.status,
        })}::jsonb,
        ${now}
      )
      on conflict (id) do nothing
    `.execute(this.db);

    await this.emitWebhookEvents(input, eventType, progressState.progressMessage);
  }

  private async emitWebhookEvents(
    input: WorkerJobProgressUpdate,
    eventType: JobProgressEventType,
    progressMessage: string,
  ): Promise<void> {
    if (this.webhookEvents === undefined || !isTerminalJobEventType(eventType)) {
      return;
    }

    const basePayload = {
      change_set_id: input.changeSetId ?? null,
      input_snapshot_id: input.inputSnapshotId,
      job_id: input.jobId,
      metadata: input.metadata ?? {},
      parsed_content_id: input.parsedContentId ?? null,
      progress: input.progress,
      progress_message: progressMessage,
      stage: input.stage,
      status: input.status,
    };
    const requestTrace = {
      event_source: "worker.job_progress",
      job_event_type: eventType,
    };

    if (input.status === "completed") {
      await this.webhookEvents.emit({
        eventType: "document.ingest.completed",
        knowledgeBaseId: input.knowledgeBaseId,
        payload: basePayload,
        requestTrace,
      });
      await this.webhookEvents.emit({
        eventType: "retrieve.readiness.changed",
        knowledgeBaseId: input.knowledgeBaseId,
        payload: {
          ...basePayload,
          ready: true,
        },
        requestTrace,
      });

      const knowledgeVersionId = readString(input.metadata?.knowledge_version_id);
      if (input.changeSetId !== undefined) {
        await this.webhookEvents.emit({
          eventType: "change_set.created",
          knowledgeBaseId: input.knowledgeBaseId,
          payload: {
            change_set_id: input.changeSetId,
            job_id: input.jobId,
          },
          requestTrace,
        });
      }
      if (knowledgeVersionId !== null) {
        await this.webhookEvents.emit({
          eventType: "version.created",
          knowledgeBaseId: input.knowledgeBaseId,
          payload: {
            change_set_id: input.changeSetId ?? null,
            job_id: input.jobId,
            knowledge_version_id: knowledgeVersionId,
          },
          requestTrace,
        });
      }
      return;
    }

    if (input.status === "failed") {
      await this.webhookEvents.emit({
        eventType: "document.ingest.failed",
        knowledgeBaseId: input.knowledgeBaseId,
        payload: {
          ...basePayload,
          error: input.error ?? null,
        },
        requestTrace,
      });
    }
  }

  private async recordQueuePressure(input: WorkerJobProgressUpdate): Promise<void> {
    const event = toRuntimeQueuePressureEvent(input.status);

    if (event === null) {
      return;
    }

    await recordRuntimeQueuePressureEvent(this.queuePressureRecorder, {
      event,
      now: new Date(input.now ?? Date.now()),
      scopeId: input.knowledgeBaseId,
      workKind: toRuntimeQueueWorkKind(input.stage),
    }).catch((error: unknown) => {
      console.warn("Runtime queue pressure recording failed.", error);
    });
  }

  private async readProgressTimingMetadata(
    jobId: string,
    stage: WorkerJobStage,
    now: string,
  ): Promise<Record<string, unknown>> {
    const result = await sql<{
      lastCreatedAt: Date | string | null;
      stageStartedAt: Date | string | null;
    }>`
      select
        (
          select created_at
          from job_events
          where job_id = ${jobId}
          order by created_at desc
          limit 1
        ) as "lastCreatedAt",
        (
          select min(created_at)
          from job_events
          where job_id = ${jobId}
            and metadata ->> 'stage' = ${stage}
        ) as "stageStartedAt"
    `.execute(this.db);
    const row = result.rows[0];
    const nowMs = new Date(now).getTime();
    const lastEventMs = readTimestampMs(row?.lastCreatedAt);
    const stageStartedMs = readTimestampMs(row?.stageStartedAt) ?? nowMs;

    return {
      duration_since_previous_event_ms: lastEventMs === null ? 0 : Math.max(0, nowMs - lastEventMs),
      stage_duration_ms: Math.max(0, nowMs - stageStartedMs),
    };
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readTimestampMs(value: Date | string | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function toJobEventType(status: WorkerJobStatus): JobProgressEventType {
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

function toRuntimeQueuePressureEvent(status: WorkerJobStatus): RuntimeQueuePressureEvent | null {
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "started";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed" || status === "canceled") {
    return "failed";
  }

  return null;
}

function toRuntimeQueueWorkKind(stage: WorkerJobStage): RuntimeQueueWorkKind {
  if (stage === "parsing" || stage === "ocr" || stage === "captioning") {
    return "source-parse";
  }

  return "wiki-compile";
}
