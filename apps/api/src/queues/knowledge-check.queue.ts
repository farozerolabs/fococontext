import { Queue } from "bullmq";
import type { RuntimeConfig } from "@fococontext/core";

export const knowledgeCheckQueueToken = Symbol("knowledgeCheckQueue");
export const knowledgeCheckQueueName = "knowledge.check";
export const knowledgeCheckJobName = "knowledge.check.run";

export interface KnowledgeCheckQueuePayload {
  check_id: string;
}

export interface EnqueuedKnowledgeCheckJob {
  queue_name: typeof knowledgeCheckQueueName;
  job_name: typeof knowledgeCheckJobName;
  job_id: string;
}

export interface KnowledgeCheckQueue {
  enqueueKnowledgeCheckJob(payload: KnowledgeCheckQueuePayload): Promise<EnqueuedKnowledgeCheckJob>;
  close?(): Promise<void>;
}

export class BullMqKnowledgeCheckQueue implements KnowledgeCheckQueue {
  private readonly queue: Queue<KnowledgeCheckQueuePayload>;

  constructor(config: RuntimeConfig) {
    this.queue = new Queue<KnowledgeCheckQueuePayload>(knowledgeCheckQueueName, {
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

  async enqueueKnowledgeCheckJob(
    payload: KnowledgeCheckQueuePayload,
  ): Promise<EnqueuedKnowledgeCheckJob> {
    await this.queue.add(knowledgeCheckJobName, payload, {
      jobId: payload.check_id,
    });

    return {
      queue_name: knowledgeCheckQueueName,
      job_name: knowledgeCheckJobName,
      job_id: payload.check_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqKnowledgeCheckQueue(config: RuntimeConfig): KnowledgeCheckQueue {
  return new BullMqKnowledgeCheckQueue(config);
}
