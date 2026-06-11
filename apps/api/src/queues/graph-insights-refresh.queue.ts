import { Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

export const graphInsightsRefreshQueueToken = Symbol("graphInsightsRefreshQueue");
export const graphInsightsRefreshQueueName = "graph.insights.refresh";
export const graphInsightsRefreshJobName = "graph.insights.refresh.run";

export interface GraphInsightsRefreshQueuePayload {
  job_id: string;
  knowledge_base_id: string;
  requested_knowledge_version_id: string | null;
}

export interface EnqueuedGraphInsightsRefreshJob {
  queue_name: typeof graphInsightsRefreshQueueName;
  job_name: typeof graphInsightsRefreshJobName;
  job_id: string;
}

export interface GraphInsightsRefreshQueue {
  enqueueGraphInsightsRefreshJob(
    payload: GraphInsightsRefreshQueuePayload,
  ): Promise<EnqueuedGraphInsightsRefreshJob>;
  close?(): Promise<void>;
}

export class BullMqGraphInsightsRefreshQueue implements GraphInsightsRefreshQueue {
  private readonly queue: Queue<GraphInsightsRefreshQueuePayload>;

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
    this.queue = new Queue<GraphInsightsRefreshQueuePayload>(graphInsightsRefreshQueueName, {
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

  async enqueueGraphInsightsRefreshJob(
    payload: GraphInsightsRefreshQueuePayload,
  ): Promise<EnqueuedGraphInsightsRefreshJob> {
    try {
      await this.queue.add(graphInsightsRefreshJobName, payload, {
        jobId: payload.job_id,
      });
      await recordQueuePressureQueued({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "graph-refresh",
      });
    } catch (error) {
      await recordQueuePressureBackpressure({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "graph-refresh",
      });
      throw error;
    }

    return {
      queue_name: graphInsightsRefreshQueueName,
      job_name: graphInsightsRefreshJobName,
      job_id: payload.job_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqGraphInsightsRefreshQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): GraphInsightsRefreshQueue {
  return new BullMqGraphInsightsRefreshQueue(config, queuePressureRecorder);
}
