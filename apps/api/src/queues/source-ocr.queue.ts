import { Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

export const sourceOcrQueueToken = Symbol("sourceOcrQueue");
export const sourceOcrQueueName = "source.ocr";
export const sourceOcrJobName = "source.ocr.document";

export interface SourceOcrQueuePayload {
  job_id: string;
  tenant_id: string;
  project_id: string;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string;
  normalized_markdown_object_key: string;
  content_hash: string;
  input_snapshot_id: string;
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
  source_object_key: string;
  candidate_pages: {
    pageNumber: number;
    reason: "empty_native_text" | "low_native_text" | "forced";
    nativeTextChars: number;
  }[];
}

export interface DatasetConfigurationSnapshotPayload {
  id: string;
  preset_id: string;
  values: Record<string, unknown>;
  version: number;
}

export interface EnqueuedSourceOcrJob {
  queue_name: typeof sourceOcrQueueName;
  job_name: typeof sourceOcrJobName;
  job_id: string;
}

export interface SourceOcrQueue {
  enabled: boolean;
  maxPagesPerDocument?: number;
  minTextCharsPerPage?: number;
  enqueueSourceOcrJob(payload: SourceOcrQueuePayload): Promise<EnqueuedSourceOcrJob>;
  close?(): Promise<void>;
}

export class BullMqSourceOcrQueue implements SourceOcrQueue {
  readonly enabled: boolean;
  readonly maxPagesPerDocument: number;
  readonly minTextCharsPerPage: number;
  private readonly queue: Queue<SourceOcrQueuePayload>;

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
    this.enabled = config.ocr.enabled && config.ocr.serviceBaseUrl !== undefined;
    this.maxPagesPerDocument = config.limits.ocr.maxPagesPerDocument;
    this.minTextCharsPerPage = config.limits.ocr.minTextCharsPerPage;
    this.queue = new Queue<SourceOcrQueuePayload>(sourceOcrQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: Math.max(1, config.limits.ocr.maxRetries + 1),
        backoff: {
          delay: config.limits.ocr.retryBaseDelayMs,
          type: "exponential",
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueSourceOcrJob(payload: SourceOcrQueuePayload): Promise<EnqueuedSourceOcrJob> {
    if (!this.enabled) {
      throw new Error("source.ocr queue is disabled.");
    }

    try {
      await this.queue.add(sourceOcrJobName, payload, {
        jobId: `${payload.job_id}-ocr-${payload.parsed_content_id}`,
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
      queue_name: sourceOcrQueueName,
      job_name: sourceOcrJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqSourceOcrQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): SourceOcrQueue {
  return new BullMqSourceOcrQueue(config, queuePressureRecorder);
}
