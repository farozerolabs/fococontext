import { Job, Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

export const sourceParseQueueToken = Symbol("sourceParseQueue");
export const sourceParseQueueName = "source.parse";
export const sourceParseJobName = "source.parse.document";

export interface SourceParseQueuePayload {
  job_id: string;
  knowledge_base_id: string;
  document_id: string;
  content_hash: string;
  object_key: string;
  mime_type: string;
  source_type: "file" | "text" | "url" | "wiki_draft";
  input_snapshot_id: string;
  ocr_policy?: SourceParseOcrPolicy;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
}

export interface DatasetConfigurationSnapshotPayload {
  id: string;
  preset_id: string;
  values: Record<string, unknown>;
  version: number;
}

export interface SourceParseOcrPolicy {
  mode: "auto" | "disabled" | "force_for_pdf";
  max_pages_per_document: number | null;
  min_text_chars_per_page: number | null;
}

export interface EnqueuedSourceParseJob {
  queue_name: typeof sourceParseQueueName;
  job_name: typeof sourceParseJobName;
  job_id: string;
}

export type SourceParseQueueJobStatus = "queued" | "running" | "completed" | "failed" | "unknown";

export interface SourceParseQueueJobResult {
  status?: "completed" | "failed";
  parsed_content_id?: string | null;
  error?: Record<string, unknown> | null;
  cache?: Record<string, unknown>;
}

export interface SourceParseQueueJobSnapshot {
  status: SourceParseQueueJobStatus;
  progress: number;
  result: SourceParseQueueJobResult | null;
  failed_reason: string | null;
}

export interface SourceParseQueue {
  enqueueSourceParseJob(payload: SourceParseQueuePayload): Promise<EnqueuedSourceParseJob>;
  getSourceParseJobStatus?(jobId: string): Promise<SourceParseQueueJobSnapshot | undefined>;
  close?(): Promise<void>;
}

export class BullMqSourceParseQueue implements SourceParseQueue {
  private readonly queue: Queue<SourceParseQueuePayload>;

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
    this.queue = new Queue<SourceParseQueuePayload>(sourceParseQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueSourceParseJob(payload: SourceParseQueuePayload): Promise<EnqueuedSourceParseJob> {
    try {
      await this.queue.add(sourceParseJobName, payload, {
        jobId: payload.job_id,
      });
      await recordQueuePressureQueued({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "source-parse",
      });
    } catch (error) {
      await recordQueuePressureBackpressure({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "source-parse",
      });
      throw error;
    }

    return {
      queue_name: sourceParseQueueName,
      job_name: sourceParseJobName,
      job_id: payload.job_id,
    };
  }

  async getSourceParseJobStatus(jobId: string): Promise<SourceParseQueueJobSnapshot | undefined> {
    const job = await Job.fromId<SourceParseQueuePayload, SourceParseQueueJobResult>(
      this.queue,
      jobId,
    );

    if (job === undefined) {
      return undefined;
    }

    return {
      status: normalizeBullMqState(await job.getState(), job.returnvalue),
      progress: normalizeProgress(job.progress),
      result: normalizeResult(job.returnvalue),
      failed_reason: typeof job.failedReason === "string" ? job.failedReason : null,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqSourceParseQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): SourceParseQueue {
  return new BullMqSourceParseQueue(config, queuePressureRecorder);
}

function normalizeBullMqState(
  state: Awaited<ReturnType<Job["getState"]>>,
  result: SourceParseQueueJobResult | null,
): SourceParseQueueJobStatus {
  if (state === "completed" && result?.status === "failed") {
    return "failed";
  }
  if (state === "completed") {
    return "completed";
  }
  if (state === "failed") {
    return "failed";
  }
  if (state === "active") {
    return "running";
  }
  if (state === "waiting" || state === "waiting-children" || state === "delayed") {
    return "queued";
  }

  return "unknown";
}

function normalizeProgress(progress: unknown): number {
  return typeof progress === "number" && Number.isFinite(progress) ? progress : 0;
}

function normalizeResult(value: unknown): SourceParseQueueJobResult | null {
  if (!isJsonObject(value)) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as SourceParseQueueJobResult;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
