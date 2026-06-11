import { Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

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

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
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
    try {
      await this.queue.add(knowledgeCheckJobName, payload, {
        jobId: payload.check_id,
      });
      await recordQueuePressureQueued({
        recorder: this.queuePressureRecorder,
        workKind: "knowledge-check",
      });
    } catch (error) {
      await recordQueuePressureBackpressure({
        recorder: this.queuePressureRecorder,
        workKind: "knowledge-check",
      });
      throw error;
    }

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

export function createBullMqKnowledgeCheckQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): KnowledgeCheckQueue {
  return new BullMqKnowledgeCheckQueue(config, queuePressureRecorder);
}
