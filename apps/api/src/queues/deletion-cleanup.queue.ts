import { Queue } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";

export const deletionCleanupQueueToken = Symbol("deletionCleanupQueue");
export const deletionCleanupQueueName = "deletion.cleanup";
export const deletionCleanupJobName = "deletion.cleanup.operation";

export interface DeletionCleanupQueuePayload {
  operation_id: string;
}

export interface EnqueuedDeletionCleanupJob {
  queue_name: typeof deletionCleanupQueueName;
  job_name: typeof deletionCleanupJobName;
  job_id: string;
}

export interface DeletionCleanupQueue {
  enqueueDeletionCleanupJob(
    payload: DeletionCleanupQueuePayload,
  ): Promise<EnqueuedDeletionCleanupJob>;
  close?(): Promise<void>;
}

export class BullMqDeletionCleanupQueue implements DeletionCleanupQueue {
  private readonly queue: Queue<DeletionCleanupQueuePayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<DeletionCleanupQueuePayload>(deletionCleanupQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: Math.max(1, config.limits.deletionCleanup.maxRetries + 1),
        backoff: {
          delay: config.limits.deletionCleanup.retryBaseDelayMs,
          type: config.limits.deletionCleanup.retryBackoff,
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueDeletionCleanupJob(
    payload: DeletionCleanupQueuePayload,
  ): Promise<EnqueuedDeletionCleanupJob> {
    await this.queue.add(deletionCleanupJobName, payload, {
      jobId: payload.operation_id,
    });

    return {
      queue_name: deletionCleanupQueueName,
      job_name: deletionCleanupJobName,
      job_id: payload.operation_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqDeletionCleanupQueue(config: RuntimeConfig): DeletionCleanupQueue {
  return new BullMqDeletionCleanupQueue(config);
}
