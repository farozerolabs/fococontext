import { Queue } from "bullmq";
import type { RuntimeConfig, RuntimeQueuePressureRecorder } from "@fococontext/core";
import type { WebhookEventType } from "@fococontext/contracts";

import { recordQueuePressureBackpressure, recordQueuePressureQueued } from "./queue-pressure.js";

export const webhookDispatchQueueName = "webhook.dispatch";
export const webhookDispatchJobName = "webhook.dispatch.event";

export interface WebhookDispatchPayload {
  delivery_id: string;
  webhook_id: string;
  event_type: WebhookEventType;
  knowledge_base_id: string | null;
  target_url: string;
  payload: Record<string, unknown>;
  request_trace?: Record<string, unknown>;
  attempt: number;
  secret_configured: boolean;
  signing_secret: string | null;
  timeout_seconds: number;
  max_attempts: number;
  retry_base_delay_ms: number;
  retry_backoff: "fixed" | "exponential";
}

export const webhookDispatchQueueToken = Symbol("webhookDispatchQueue");

export interface EnqueuedWebhookDispatchJob {
  queue_name: typeof webhookDispatchQueueName;
  job_name: typeof webhookDispatchJobName;
  job_id: string;
}

export interface WebhookDispatchQueue {
  enqueueWebhookDispatch(payload: WebhookDispatchPayload): Promise<EnqueuedWebhookDispatchJob>;
  close?(): Promise<void>;
}

export function createWebhookDispatchJobId(deliveryId: string, attempt: number): string {
  return `${deliveryId}-attempt-${attempt}`;
}

export class BullMqWebhookDispatchQueue implements WebhookDispatchQueue {
  private readonly queue: Queue<WebhookDispatchPayload>;

  constructor(
    config: RuntimeConfig,
    private readonly queuePressureRecorder?: RuntimeQueuePressureRecorder,
  ) {
    this.queue = new Queue<WebhookDispatchPayload>(webhookDispatchQueueName, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueWebhookDispatch(
    payload: WebhookDispatchPayload,
  ): Promise<EnqueuedWebhookDispatchJob> {
    try {
      await this.queue.add(webhookDispatchJobName, payload, {
        jobId: createWebhookDispatchJobId(payload.delivery_id, payload.attempt),
      });
      await recordQueuePressureQueued({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "source-watch",
      });
    } catch (error) {
      await recordQueuePressureBackpressure({
        recorder: this.queuePressureRecorder,
        scopeId: payload.knowledge_base_id,
        workKind: "source-watch",
      });
      throw error;
    }

    return {
      queue_name: webhookDispatchQueueName,
      job_name: webhookDispatchJobName,
      job_id: payload.delivery_id,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullMqWebhookDispatchQueue(
  config: RuntimeConfig,
  queuePressureRecorder?: RuntimeQueuePressureRecorder,
): WebhookDispatchQueue {
  return new BullMqWebhookDispatchQueue(config, queuePressureRecorder);
}
