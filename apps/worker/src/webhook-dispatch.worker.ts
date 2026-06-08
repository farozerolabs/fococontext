import { createHash, createHmac } from "node:crypto";

import { Queue, Worker } from "bullmq";
import { sql, type Kysely } from "kysely";
import type { RuntimeConfig } from "@fococontext/core";
import { createResourceId, type WebhookEventType } from "@fococontext/contracts";
import type { DatabaseSchema } from "@fococontext/db";

export const webhookDispatchQueueName = "webhook.dispatch";
export const webhookDispatchJobName = "webhook.dispatch.event";

export interface WebhookDispatchPayload {
  delivery_id: string;
  webhook_id: string;
  event_type: WebhookEventType;
  knowledge_base_id: string | null;
  target_url: string;
  payload: Record<string, unknown>;
  request_trace: Record<string, unknown>;
  attempt: number;
  secret_configured: boolean;
  signing_secret: string | null;
  timeout_seconds: number;
  max_attempts: number;
  retry_base_delay_ms: number;
  retry_backoff: "fixed" | "exponential";
}

export interface WebhookDispatchProcessorResult {
  delivery_id: string;
  status: "queued" | "delivered" | "failed";
  attempt_count: number;
  next_attempt_at: string | null;
  response_status?: number | null;
  response_body?: string | null;
  last_attempt_at?: string;
}

export interface WebhookDispatchProcessor {
  process(payload: WebhookDispatchPayload): Promise<WebhookDispatchProcessorResult>;
}

export function createWebhookDispatchJobId(deliveryId: string, attempt: number): string {
  return `${deliveryId}-attempt-${attempt}`;
}

export interface WorkerWebhookEventInput {
  eventType: WebhookEventType;
  knowledgeBaseId: string | null;
  payload: Record<string, unknown>;
  requestTrace?: Record<string, unknown>;
}

export interface WorkerWebhookEventEmitter {
  emit(input: WorkerWebhookEventInput): Promise<void>;
  close?(): Promise<void>;
}

export interface HttpWebhookDispatchProcessorOptions {
  now?: () => Date;
  fetch?: typeof fetch;
}

export interface WebhookDispatchQueueJob {
  name: string;
  data: WebhookDispatchPayload;
}

export class BullMqWebhookDispatchWorker {
  private readonly worker: Worker<WebhookDispatchPayload>;

  constructor(config: RuntimeConfig, processor: WebhookDispatchProcessor) {
    this.worker = new Worker<WebhookDispatchPayload>(
      webhookDispatchQueueName,
      createWebhookDispatchJobProcessor(processor),
      createWebhookDispatchWorkerOptions(config),
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

export function createWebhookDispatchWorkerOptions(config: RuntimeConfig) {
  return {
    concurrency: config.limits.webhookDelivery.concurrency,
    connection: {
      url: config.redis.url,
    },
  };
}

export class PostgresWebhookDispatchProcessor implements WebhookDispatchProcessor {
  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly delegate: WebhookDispatchProcessor = createHttpWebhookDispatchProcessor(),
    private readonly retryQueue?: Queue<WebhookDispatchPayload>,
  ) {}

  async process(payload: WebhookDispatchPayload): Promise<WebhookDispatchProcessorResult> {
    const result = await this.delegate.process(payload);

    await sql`
      update webhook_deliveries
      set
        status = ${result.status},
        response_status = ${result.response_status ?? null},
        response_body = ${result.response_body ?? null},
        attempt_count = ${result.attempt_count},
        next_attempt_at = ${result.next_attempt_at},
        last_attempt_at = ${result.last_attempt_at ?? new Date().toISOString()},
        delivered_at = ${result.status === "delivered" ? (result.last_attempt_at ?? new Date().toISOString()) : null}
      where id = ${result.delivery_id}
    `.execute(this.db);

    if (
      result.status === "failed" &&
      result.next_attempt_at !== null &&
      payload.attempt < payload.max_attempts &&
      this.retryQueue !== undefined
    ) {
      const nextAttempt = payload.attempt + 1;
      const delay = Math.max(0, Date.parse(result.next_attempt_at) - Date.now());

      await this.retryQueue.add(
        webhookDispatchJobName,
        {
          ...payload,
          attempt: nextAttempt,
        },
        {
          delay,
          jobId: createWebhookDispatchJobId(payload.delivery_id, nextAttempt),
        },
      );
    }

    return result;
  }
}

export class PostgresWebhookEventEmitter implements WorkerWebhookEventEmitter {
  private readonly queue: Queue<WebhookDispatchPayload>;

  constructor(
    private readonly db: Kysely<DatabaseSchema>,
    private readonly config: RuntimeConfig,
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

  async emit(input: WorkerWebhookEventInput): Promise<void> {
    if (!this.config.webhook.delivery.enabled) {
      return;
    }
    if (input.knowledgeBaseId === null) {
      return;
    }

    const result = await sql<{
      id: string;
      tenant_id: string;
      project_id: string;
      knowledge_base_id: string | null;
      target_url: string;
      secret_configured: boolean;
      secret_ciphertext: string | null;
    }>`
      with event_scope as (
        select tenant_id, project_id
        from knowledge_bases
        where id = ${input.knowledgeBaseId}
      )
      select
        webhooks.id,
        webhooks.tenant_id,
        webhooks.project_id,
        webhooks.knowledge_base_id,
        webhooks.target_url,
        webhooks.secret_configured,
        webhooks.secret_ciphertext
      from webhooks
      join event_scope
        on event_scope.tenant_id = webhooks.tenant_id
       and event_scope.project_id = webhooks.project_id
      where webhooks.status = 'enabled'
        and ${input.eventType} = any(event_types)
        and (knowledge_base_id is null or knowledge_base_id = ${input.knowledgeBaseId})
    `.execute(this.db);

    for (const webhook of result.rows) {
      await this.createAndEnqueueDelivery(webhook, input);
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  private async createAndEnqueueDelivery(
    webhook: {
      id: string;
      tenant_id: string;
      project_id: string;
      knowledge_base_id: string | null;
      target_url: string;
      secret_configured: boolean;
      secret_ciphertext: string | null;
    },
    input: WorkerWebhookEventInput,
  ): Promise<void> {
    const deliveryId = createResourceId("webhookDelivery");
    const body = {
      event_type: input.eventType,
      webhook_id: webhook.id,
      knowledge_base_id: input.knowledgeBaseId,
      data: input.payload,
      created_at: new Date().toISOString(),
    };
    const signing = {
      algorithm: webhook.secret_configured ? "hmac-sha256" : null,
      contentDigest: createContentDigest(JSON.stringify(body)),
      secretConfigured: webhook.secret_configured,
    };
    const requestTrace = input.requestTrace ?? {};
    const maxAttempts = this.config.limits.webhookDelivery.maxRetries + 1;

    await sql`
      insert into webhook_deliveries (
        id,
        tenant_id,
        project_id,
        webhook_id,
        knowledge_base_id,
        event_type,
        payload,
        status,
        request_trace,
        attempt_count,
        max_attempts,
        signing,
        created_at
      )
      values (
        ${deliveryId},
        ${webhook.tenant_id},
        ${webhook.project_id},
        ${webhook.id},
        ${input.knowledgeBaseId},
        ${input.eventType},
        ${JSON.stringify(body)}::jsonb,
        'queued',
        ${JSON.stringify(requestTrace)}::jsonb,
        0,
        ${maxAttempts},
        ${JSON.stringify(signing)}::jsonb,
        now()
      )
    `.execute(this.db);

    await this.queue.add(
      webhookDispatchJobName,
      {
        delivery_id: deliveryId,
        webhook_id: webhook.id,
        event_type: input.eventType,
        knowledge_base_id: input.knowledgeBaseId,
        target_url: webhook.target_url,
        payload: body,
        request_trace: requestTrace,
        attempt: 1,
        secret_configured: webhook.secret_configured,
        signing_secret: webhook.secret_ciphertext,
        timeout_seconds: this.config.limits.webhookDelivery.timeoutSeconds,
        max_attempts: maxAttempts,
        retry_base_delay_ms: this.config.limits.webhookDelivery.retryBaseDelayMs,
        retry_backoff: this.config.limits.webhookDelivery.retryBackoff,
      },
      {
        jobId: createWebhookDispatchJobId(deliveryId, 1),
      },
    );
  }
}

export function createWebhookDispatchJobProcessor(
  processor: WebhookDispatchProcessor,
): (job: WebhookDispatchQueueJob) => Promise<WebhookDispatchProcessorResult> {
  return async (job) => {
    if (job.name !== webhookDispatchJobName) {
      throw new Error(`Unsupported webhook.dispatch job: ${job.name}`);
    }

    return processor.process(job.data);
  };
}

export function createHttpWebhookDispatchProcessor(
  options: HttpWebhookDispatchProcessorOptions = {},
): WebhookDispatchProcessor {
  const now = options.now ?? (() => new Date());
  const fetchImplementation = options.fetch ?? fetch;

  return {
    async process(payload) {
      const timestamp = Math.floor(now().getTime() / 1000).toString();
      const body = JSON.stringify(payload.payload);
      const headers = createWebhookHeaders(payload, body, timestamp);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, payload.timeout_seconds) * 1000,
      );

      try {
        const response = await fetchImplementation(payload.target_url, {
          body,
          headers,
          method: "POST",
          signal: controller.signal,
        });
        const responseBody = await response.text();

        if (response.ok) {
          return {
            delivery_id: payload.delivery_id,
            status: "delivered",
            attempt_count: payload.attempt,
            next_attempt_at: null,
            response_status: response.status,
            response_body: truncateResponseBody(responseBody),
            last_attempt_at: now().toISOString(),
          };
        }

        return {
          delivery_id: payload.delivery_id,
          status: "failed",
          attempt_count: payload.attempt,
          next_attempt_at: computeNextAttemptAt(payload, now()),
          response_status: response.status,
          response_body: truncateResponseBody(responseBody),
          last_attempt_at: now().toISOString(),
        };
      } catch (error) {
        return {
          delivery_id: payload.delivery_id,
          status: "failed",
          attempt_count: payload.attempt,
          next_attempt_at: computeNextAttemptAt(payload, now()),
          response_status: null,
          response_body: truncateResponseBody(error instanceof Error ? error.message : "error"),
          last_attempt_at: now().toISOString(),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function createWebhookHeaders(
  payload: WebhookDispatchPayload,
  body: string,
  timestamp: string,
): Record<string, string> {
  const contentDigest = createContentDigest(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-fococontext-content-digest": contentDigest,
    "x-fococontext-delivery-id": payload.delivery_id,
    "x-fococontext-event": payload.event_type,
    "x-fococontext-timestamp": timestamp,
  };

  if (payload.secret_configured && payload.signing_secret !== null) {
    headers["x-fococontext-signature"] = createSignature({
      body,
      contentDigest,
      deliveryId: payload.delivery_id,
      secret: payload.signing_secret,
      timestamp,
    });
  }

  return headers;
}

function createContentDigest(body: string): string {
  return `sha256=:${createHash("sha256").update(body).digest("base64")}:`;
}

function createSignature(input: {
  body: string;
  contentDigest: string;
  deliveryId: string;
  secret: string;
  timestamp: string;
}): string {
  const signed = [input.deliveryId, input.timestamp, input.contentDigest, input.body].join(".");

  return `sha256=${createHmac("sha256", input.secret).update(signed).digest("hex")}`;
}

function computeNextAttemptAt(payload: WebhookDispatchPayload, now: Date): string | null {
  if (payload.attempt >= payload.max_attempts) {
    return null;
  }

  const multiplier =
    payload.retry_backoff === "exponential" ? 2 ** Math.max(0, payload.attempt - 1) : 1;

  return new Date(now.getTime() + payload.retry_base_delay_ms * multiplier).toISOString();
}

function truncateResponseBody(value: string): string {
  return value.slice(0, 2000);
}
