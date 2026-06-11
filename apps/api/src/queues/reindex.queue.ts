import { Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

export const reindexQueueToken = Symbol("reindexQueue");
export const reindexQueueName = "retrieval.reindex";
export const reindexJobName = "retrieval.reindex.run";

export interface ReindexQueuePayload {
  job_id: string;
  knowledge_base_id: string;
  requested_knowledge_version_id: string | null;
}

export interface EnqueuedReindexJob {
  queue_name: typeof reindexQueueName;
  job_name: typeof reindexJobName;
  job_id: string;
}

export interface ReindexQueue {
  enqueueReindexJob(payload: ReindexQueuePayload): Promise<EnqueuedReindexJob>;
  close?(): Promise<void>;
}

export class BullMqReindexQueue implements ReindexQueue {
  private readonly queue: Queue<ReindexQueuePayload>;

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
    this.queue = new Queue<ReindexQueuePayload>(reindexQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          delay: 5_000,
          type: "exponential",
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueReindexJob(payload: ReindexQueuePayload): Promise<EnqueuedReindexJob> {
    try {
      await this.queue.add(reindexJobName, payload, {
        jobId: payload.job_id,
      });
      await recordQueuePressureQueued({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "retrieval-reindex",
      });
    } catch (error) {
      await recordQueuePressureBackpressure({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "retrieval-reindex",
      });
      throw error;
    }

    return {
      queue_name: reindexQueueName,
      job_name: reindexJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqReindexQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): ReindexQueue {
  return new BullMqReindexQueue(config, queuePressureRecorder);
}
