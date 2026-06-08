import { Injectable } from "@nestjs/common";
import { createResourceId } from "@fococontext/contracts";
import type { WebhookEventType } from "@fococontext/contracts";

import type {
  CreateWebhookDeliveryInput,
  WebhookDeliveryRecord,
  WebhookRecord,
} from "./webhook.types.js";

@Injectable()
export class WebhookRepository {
  private readonly webhooks = new Map<string, WebhookRecord>();
  private readonly deliveries = new Map<string, WebhookDeliveryRecord>();

  createWebhook(record: WebhookRecord): WebhookRecord {
    this.webhooks.set(record.id, cloneWebhookRecord(record));

    return cloneWebhookRecord(record);
  }

  updateWebhook(record: WebhookRecord): WebhookRecord {
    this.webhooks.set(record.id, cloneWebhookRecord(record));

    return cloneWebhookRecord(record);
  }

  getWebhook(id: string): WebhookRecord | undefined {
    const record = this.webhooks.get(id);

    return record === undefined ? undefined : cloneWebhookRecord(record);
  }

  listWebhooks(): WebhookRecord[] {
    return [...this.webhooks.values()].map(cloneWebhookRecord);
  }

  listMatchingWebhooks(input: {
    knowledgeBaseId: string | null;
    eventType: WebhookEventType;
  }): WebhookRecord[] {
    return [...this.webhooks.values()]
      .filter((webhook) => webhook.status === "enabled")
      .filter((webhook) => webhook.events.includes(input.eventType))
      .filter(
        (webhook) =>
          webhook.knowledgeBaseId === null || webhook.knowledgeBaseId === input.knowledgeBaseId,
      )
      .map(cloneWebhookRecord);
  }

  replaceSnapshot(input: {
    webhooks: readonly WebhookRecord[];
    deliveries: readonly WebhookDeliveryRecord[];
  }): void {
    this.webhooks.clear();
    this.deliveries.clear();

    for (const webhook of input.webhooks) {
      this.webhooks.set(webhook.id, cloneWebhookRecord(webhook));
    }
    for (const delivery of input.deliveries) {
      this.deliveries.set(delivery.id, cloneWebhookDeliveryRecord(delivery));
    }
  }

  createDelivery(input: CreateWebhookDeliveryInput): WebhookDeliveryRecord {
    const record: WebhookDeliveryRecord = {
      id: createResourceId("webhookDelivery"),
      webhookId: input.webhookId,
      knowledgeBaseId: input.knowledgeBaseId ?? null,
      eventType: input.eventType,
      payload: { ...input.payload },
      status: "queued",
      requestTrace: { ...input.requestTrace },
      responseStatus: null,
      responseBody: null,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 1,
      nextAttemptAt: null,
      lastAttemptAt: null,
      signing: input.signing ?? {
        algorithm: null,
        contentDigest: null,
        secretConfigured: false,
      },
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };

    this.deliveries.set(record.id, cloneWebhookDeliveryRecord(record));

    return cloneWebhookDeliveryRecord(record);
  }

  updateDelivery(record: WebhookDeliveryRecord): WebhookDeliveryRecord {
    this.deliveries.set(record.id, cloneWebhookDeliveryRecord(record));

    return cloneWebhookDeliveryRecord(record);
  }

  listDeliveriesForWebhook(webhookId: string): WebhookDeliveryRecord[] {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.webhookId === webhookId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneWebhookDeliveryRecord);
  }

  getLatestDelivery(webhookId: string): WebhookDeliveryRecord | undefined {
    return this.listDeliveriesForWebhook(webhookId)[0];
  }
}

function cloneWebhookRecord(record: WebhookRecord): WebhookRecord {
  return {
    ...record,
    events: [...record.events],
  };
}

function cloneWebhookDeliveryRecord(record: WebhookDeliveryRecord): WebhookDeliveryRecord {
  return {
    ...record,
    payload: { ...record.payload },
    requestTrace: { ...record.requestTrace },
    signing: { ...record.signing },
  };
}
