import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ApiError, createResourceId, webhookEventTypes } from "@fococontext/contracts";
import type { WebhookEventType } from "@fococontext/contracts";
import type { RuntimeConfig } from "@fococontext/core";

import { defaultApiResourceScope, type ApiResourceScope } from "../auth/api-key.guard.js";
import { isApiResourceInScope, requireScopedWebhook } from "../auth/resource-scope.js";
import { apiDatabaseMirrorToken, type ApiDatabaseMirror } from "../database/api-database-mirror.js";
import {
  operationalReadStoreToken,
  type OperationalReadStore,
} from "../database/operational-read-store.js";
import { KnowledgeBaseService } from "../knowledge-bases/knowledge-base.service.js";
import {
  webhookDispatchQueueToken,
  type WebhookDispatchQueue,
} from "../queues/webhook-dispatch.queue.js";
import { runtimeConfigToken } from "../runtime-config.provider.js";
import { WebhookRepository } from "./webhook.repository.js";
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookDeliveryEnvelope,
  WebhookDeliveryListEnvelope,
  WebhookDeliveryRecord,
  WebhookDeliveryResponse,
  WebhookEnvelope,
  WebhookListEnvelope,
  WebhookRecord,
  WebhookResponse,
} from "./webhook.types.js";

@Injectable()
export class WebhookService {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly repository: WebhookRepository,
    @Inject(apiDatabaseMirrorToken) private readonly databaseMirror: ApiDatabaseMirror,
    @Inject(operationalReadStoreToken) private readonly operationalReadStore: OperationalReadStore,
    @Inject(runtimeConfigToken) private readonly runtimeConfig: RuntimeConfig,
    @Inject(webhookDispatchQueueToken) private readonly webhookDispatchQueue: WebhookDispatchQueue,
  ) {}

  async create(
    input: CreateWebhookInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<WebhookEnvelope> {
    const knowledgeBaseId = readOptionalKnowledgeBaseId(input.knowledge_base_id);

    if (knowledgeBaseId !== null) {
      this.knowledgeBaseService.get(knowledgeBaseId, scope);
    }

    const now = new Date().toISOString();
    const record = this.repository.createWebhook({
      id: createResourceId("webhook"),
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      knowledgeBaseId,
      url: readUrl(input.url),
      events: readEvents(input.events),
      status: this.runtimeConfig.webhook.delivery.enabled ? "enabled" : "disabled",
      secretConfigured: readSecretConfigured(input.secret),
      secret: readSecret(input.secret),
      createdAt: now,
      updatedAt: now,
    });
    await this.databaseMirror.saveWebhook(record);

    return {
      webhook: this.toWebhookResponse(record),
    };
  }

  list(scope: ApiResourceScope = defaultApiResourceScope): WebhookListEnvelope {
    return {
      webhooks: this.repository
        .listWebhooks()
        .filter((webhook) => isApiResourceInScope(webhook, scope))
        .map((webhook) => this.toWebhookResponse(webhook)),
    };
  }

  async listPaginated(
    input: { page: number; pageSize: number },
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<{
    webhooks: readonly WebhookResponse[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> {
    try {
      const dbResult = await this.operationalReadStore.listWebhooks(scope, input);

      if (dbResult !== null) {
        return {
          webhooks: dbResult.items.map((webhook) =>
            this.toWebhookResponse(webhook, dbResult.latestDeliveriesByWebhookId.get(webhook.id)),
          ),
          page: input.page,
          pageSize: input.pageSize,
          total: dbResult.total,
          hasMore: dbResult.hasMore,
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    const start = (input.page - 1) * input.pageSize;
    const webhooks = this.list(scope).webhooks;

    return {
      webhooks: webhooks.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: webhooks.length,
      hasMore: start + input.pageSize < webhooks.length,
    };
  }

  async get(
    webhookId: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<WebhookEnvelope> {
    const dbResult = await this.getOperationalWebhook(webhookId, scope);

    if (dbResult !== null) {
      return {
        webhook: this.toWebhookResponse(dbResult.webhook, dbResult.latestDelivery ?? undefined),
      };
    }

    const webhook = this.requireWebhook(webhookId, scope);

    return {
      webhook: this.toWebhookResponse(webhook),
    };
  }

  async update(
    webhookId: string,
    input: UpdateWebhookInput,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<WebhookEnvelope> {
    const current = this.requireWebhook(webhookId, scope);

    const now = new Date().toISOString();
    const nextStatus = readOptionalWebhookStatus(input.status) ?? current.status;
    const nextSecret =
      input.secret === undefined
        ? {
            secret: current.secret,
            secretConfigured: current.secretConfigured,
          }
        : {
            secret: readSecret(input.secret ?? undefined),
            secretConfigured: readSecretConfigured(input.secret ?? undefined),
          };
    const updated = this.repository.updateWebhook({
      ...current,
      ...(input.url === undefined ? {} : { url: readUrl(input.url) }),
      ...(input.events === undefined ? {} : { events: readEvents(input.events) }),
      status: this.runtimeConfig.webhook.delivery.enabled ? nextStatus : "disabled",
      ...nextSecret,
      updatedAt: now,
    });

    await this.databaseMirror.saveWebhook(updated);

    return {
      webhook: this.toWebhookResponse(updated),
    };
  }

  listDeliveries(
    webhookId: string,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): WebhookDeliveryListEnvelope {
    this.requireWebhook(webhookId, scope);

    return {
      deliveries: this.repository
        .listDeliveriesForWebhook(webhookId)
        .map((delivery) => toWebhookDeliveryResponse(delivery)),
    };
  }

  async listDeliveriesPaginated(
    webhookId: string,
    input: { page: number; pageSize: number },
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<{
    deliveries: readonly WebhookDeliveryResponse[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> {
    await this.requireWebhookForRead(webhookId, scope);
    try {
      const dbResult = await this.operationalReadStore.listWebhookDeliveriesByWebhookId(
        webhookId,
        input,
      );

      if (dbResult !== null) {
        return {
          deliveries: dbResult.items.map((delivery) => toWebhookDeliveryResponse(delivery)),
          page: input.page,
          pageSize: input.pageSize,
          total: dbResult.total,
          hasMore: dbResult.hasMore,
        };
      }
    } catch (error) {
      throw toOperationalListError(error);
    }

    const start = (input.page - 1) * input.pageSize;
    const deliveries = this.listDeliveries(webhookId, scope).deliveries;

    return {
      deliveries: deliveries.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: deliveries.length,
      hasMore: start + input.pageSize < deliveries.length,
    };
  }

  async emit(input: {
    eventType: WebhookEventType;
    knowledgeBaseId: string | null;
    payload: Record<string, unknown>;
    requestTrace?: Record<string, unknown>;
    scope?: ApiResourceScope;
  }): Promise<WebhookDeliveryRecord[]> {
    const deliveries: WebhookDeliveryRecord[] = [];

    if (!this.runtimeConfig.webhook.delivery.enabled) {
      return deliveries;
    }

    const eventScope = input.scope ?? this.resolveEventScope(input.knowledgeBaseId);

    for (const webhook of this.repository
      .listMatchingWebhooks({
        eventType: input.eventType,
        knowledgeBaseId: input.knowledgeBaseId,
      })
      .filter((candidate) => isApiResourceInScope(candidate, eventScope))) {
      deliveries.push(await this.createAndEnqueueDelivery(webhook, input));
    }

    return deliveries;
  }

  async test(
    webhookId: string,
    input: Record<string, unknown>,
    scope: ApiResourceScope = defaultApiResourceScope,
  ): Promise<WebhookDeliveryEnvelope> {
    const webhook = this.requireWebhook(webhookId, scope);

    const eventType = readOptionalEventType(input.event_type) ?? "webhook.test";

    if (!webhook.events.includes(eventType)) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.webhook_event_invalid",
        details: {
          fields: ["event_type"],
          invalid: [eventType],
        },
      });
    }

    const delivery = await this.createAndEnqueueDelivery(webhook, {
      eventType,
      knowledgeBaseId: webhook.knowledgeBaseId,
      payload: readPayload(input.payload),
      requestTrace: {
        event_source: "test",
      },
    });

    return {
      delivery: toWebhookDeliveryResponse(delivery),
    };
  }

  private requireWebhook(webhookId: string, scope: ApiResourceScope): WebhookRecord {
    const webhook = requireScopedWebhook(this.repository.getWebhook(webhookId), scope, () =>
      createWebhookNotFoundError(webhookId),
    );

    if (webhook.knowledgeBaseId !== null) {
      try {
        this.knowledgeBaseService.assertReadableKnowledgeBase(webhook.knowledgeBaseId, scope);
      } catch (error) {
        if (error instanceof ApiError && error.code === "knowledge_base_not_found") {
          throw createWebhookNotFoundError(webhookId);
        }

        throw error;
      }
    }

    return webhook;
  }

  private async requireWebhookForRead(
    webhookId: string,
    scope: ApiResourceScope,
  ): Promise<WebhookRecord> {
    const dbResult = await this.getOperationalWebhook(webhookId, scope);

    if (dbResult !== null) {
      return dbResult.webhook;
    }

    return this.requireWebhook(webhookId, scope);
  }

  private async getOperationalWebhook(
    webhookId: string,
    scope: ApiResourceScope,
  ): Promise<{
    webhook: WebhookRecord;
    latestDelivery: WebhookDeliveryRecord | null;
  } | null> {
    try {
      const dbResult = await this.operationalReadStore.getWebhookById(scope, webhookId);

      if (dbResult !== null || !this.operationalReadStore.supportsOperationalReads) {
        return dbResult;
      }

      throw createWebhookNotFoundError(webhookId);
    } catch (error) {
      throw toOperationalListError(error);
    }
  }

  private resolveEventScope(knowledgeBaseId: string | null): ApiResourceScope {
    if (knowledgeBaseId === null) {
      throw new ApiError("invalid_request", {
        messageKey: "api.validation.webhook_scope_required",
      });
    }

    const scope = this.knowledgeBaseService.getResourceScope(knowledgeBaseId);

    if (scope === undefined) {
      throw new ApiError("knowledge_base_not_found");
    }

    return scope;
  }

  private toWebhookResponse(
    record: WebhookRecord,
    latestDelivery: WebhookDeliveryRecord | undefined = this.repository.getLatestDelivery(
      record.id,
    ),
  ): WebhookResponse {
    return {
      id: record.id,
      knowledge_base_id: record.knowledgeBaseId,
      url: record.url,
      events: record.events,
      status: record.status,
      secret_configured: record.secretConfigured,
      delivery_backend: createDeliveryBackendStatus(record),
      latest_delivery:
        latestDelivery === undefined ? null : toWebhookDeliveryResponse(latestDelivery),
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  private async createAndEnqueueDelivery(
    webhook: WebhookRecord,
    input: {
      eventType: WebhookEventType;
      knowledgeBaseId: string | null;
      payload: Record<string, unknown>;
      requestTrace?: Record<string, unknown>;
    },
  ): Promise<WebhookDeliveryRecord> {
    const body = createWebhookDeliveryBody(webhook, input);
    const signing = createSigningMetadata(body, webhook.secretConfigured);
    let delivery = this.repository.createDelivery({
      webhookId: webhook.id,
      knowledgeBaseId: input.knowledgeBaseId,
      eventType: input.eventType,
      payload: body,
      requestTrace: input.requestTrace ?? {},
      maxAttempts: this.runtimeConfig.limits.webhookDelivery.maxRetries + 1,
      signing,
    });

    await this.databaseMirror.saveWebhookDelivery(delivery);
    try {
      await this.webhookDispatchQueue.enqueueWebhookDispatch({
        delivery_id: delivery.id,
        webhook_id: webhook.id,
        event_type: input.eventType,
        knowledge_base_id: input.knowledgeBaseId,
        target_url: webhook.url,
        payload: body,
        request_trace: delivery.requestTrace,
        attempt: 1,
        secret_configured: webhook.secretConfigured,
        signing_secret: webhook.secret,
        timeout_seconds: this.runtimeConfig.limits.webhookDelivery.timeoutSeconds,
        max_attempts: delivery.maxAttempts,
        retry_base_delay_ms: this.runtimeConfig.limits.webhookDelivery.retryBaseDelayMs,
        retry_backoff: this.runtimeConfig.limits.webhookDelivery.retryBackoff,
      });
    } catch (error) {
      delivery = this.repository.updateDelivery({
        ...delivery,
        status: "failed",
        responseBody: error instanceof Error ? error.message : "Webhook queue enqueue failed.",
        attemptCount: 1,
        lastAttemptAt: new Date().toISOString(),
      });
      await this.databaseMirror.saveWebhookDelivery(delivery);
    }

    return delivery;
  }
}

function createDeliveryBackendStatus(record: WebhookRecord): WebhookResponse["delivery_backend"] {
  if (record.status === "enabled") {
    return {
      enabled: true,
      reason: null,
    };
  }

  return {
    enabled: false,
    reason: "webhook_delivery_backend_disabled",
  };
}

function readOptionalKnowledgeBaseId(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function readUrl(value: string | undefined): string {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.webhook_url_required",
      details: {
        fields: ["url"],
      },
    });
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Unsupported webhook URL protocol.");
    }

    return parsed.toString();
  } catch (error) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.webhook_url_invalid",
      details: {
        fields: ["url"],
      },
      cause: error,
    });
  }
}

function readEvents(value: WebhookEventType[] | undefined): WebhookEventType[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.webhook_events_required",
      details: {
        fields: ["events"],
      },
    });
  }

  const invalid = value.filter((event) => !webhookEventTypes.includes(event));

  if (invalid.length > 0) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.webhook_event_invalid",
      details: {
        fields: ["events"],
        invalid,
      },
    });
  }

  return [...new Set(value)];
}

function readOptionalWebhookStatus(value: unknown): WebhookRecord["status"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "enabled" || value === "disabled") {
    return value;
  }

  throw new ApiError("invalid_request", {
    messageKey: "api.validation.webhook_status_invalid",
    details: {
      fields: ["status"],
    },
  });
}

function readSecretConfigured(value: string | undefined): boolean {
  return value?.trim() !== undefined && value.trim().length > 0;
}

function readSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function readOptionalEventType(value: unknown): WebhookEventType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (!webhookEventTypes.includes(value as WebhookEventType)) {
    throw new ApiError("invalid_request", {
      messageKey: "api.validation.webhook_event_invalid",
      details: {
        fields: ["event_type"],
        invalid: [value],
      },
    });
  }

  return value as WebhookEventType;
}

function readPayload(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function createWebhookDeliveryBody(
  webhook: WebhookRecord,
  input: {
    eventType: WebhookEventType;
    knowledgeBaseId: string | null;
    payload: Record<string, unknown>;
  },
): Record<string, unknown> {
  return {
    event_type: input.eventType,
    webhook_id: webhook.id,
    knowledge_base_id: input.knowledgeBaseId,
    data: input.payload,
    created_at: new Date().toISOString(),
  };
}

function createSigningMetadata(
  payload: Record<string, unknown>,
  secretConfigured: boolean,
): WebhookDeliveryRecord["signing"] {
  return {
    algorithm: secretConfigured ? "hmac-sha256" : null,
    contentDigest: createContentDigest(payload),
    secretConfigured,
  };
}

function createContentDigest(payload: Record<string, unknown>): string {
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("base64");

  return `sha256=:${digest}:`;
}

function toWebhookDeliveryResponse(record: WebhookDeliveryRecord): WebhookDeliveryResponse {
  return {
    id: record.id,
    webhook_id: record.webhookId,
    knowledge_base_id: record.knowledgeBaseId,
    event_type: record.eventType,
    payload: { ...record.payload },
    status: record.status,
    request_trace: { ...record.requestTrace },
    response_status: record.responseStatus,
    response_body: record.responseBody,
    attempt_count: record.attemptCount,
    max_attempts: record.maxAttempts,
    next_attempt_at: record.nextAttemptAt,
    last_attempt_at: record.lastAttemptAt,
    signing: {
      algorithm: record.signing.algorithm,
      content_digest: record.signing.contentDigest,
      secret_configured: record.signing.secretConfigured,
    },
    created_at: record.createdAt,
    delivered_at: record.deliveredAt,
  };
}

function toOperationalListError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("internal_error");
}

function createWebhookNotFoundError(webhookId: string): ApiError {
  return new ApiError("invalid_request", {
    message: "Webhook not found.",
    details: {
      webhook_id: webhookId,
    },
  });
}
