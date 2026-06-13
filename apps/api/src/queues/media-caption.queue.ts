import { Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

export const mediaCaptionQueueToken = Symbol("mediaCaptionQueue");
export const mediaCaptionQueueName = "media.caption";
export const mediaCaptionJobName = "media.caption.document";

export interface MediaCaptionQueuePayload {
  job_id: string;
  tenant_id: string;
  project_id: string;
  knowledge_base_id: string;
  document_id: string;
  parsed_content_id: string;
  normalized_markdown_object_key: string;
  content_hash: string;
  input_snapshot_id: string;
  media_asset_ids: readonly string[];
  dataset_configuration_snapshot?: DatasetConfigurationSnapshotPayload | null;
}

export interface DatasetConfigurationSnapshotPayload {
  id: string;
  preset_id: string;
  values: Record<string, unknown>;
  version: number;
}

export interface EnqueuedMediaCaptionJob {
  queue_name: typeof mediaCaptionQueueName;
  job_name: typeof mediaCaptionJobName;
  job_id: string;
}

export interface MediaCaptionQueue {
  enqueueMediaCaptionJob(payload: MediaCaptionQueuePayload): Promise<EnqueuedMediaCaptionJob>;
  close?(): Promise<void>;
}

export class BullMqMediaCaptionQueue implements MediaCaptionQueue {
  private readonly queue: Queue<MediaCaptionQueuePayload>;

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
    this.queue = new Queue<MediaCaptionQueuePayload>(mediaCaptionQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: Math.max(1, (config.models.visionCaption?.requestMaxRetries ?? 2) + 1),
        backoff: {
          delay: config.limits.visionCaption.retryBaseDelayMs,
          type: "exponential",
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueMediaCaptionJob(
    payload: MediaCaptionQueuePayload,
  ): Promise<EnqueuedMediaCaptionJob> {
    try {
      await this.queue.add(mediaCaptionJobName, payload, {
        jobId: `${payload.job_id}-caption-${payload.parsed_content_id}`,
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
      queue_name: mediaCaptionQueueName,
      job_name: mediaCaptionJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqMediaCaptionQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): MediaCaptionQueue {
  return new BullMqMediaCaptionQueue(config, queuePressureRecorder);
}
