import type { WebhookEventType } from "@fococontext/contracts";

export type WebhookStatus = "enabled" | "disabled";
export type WebhookDeliveryStatus = "queued" | "delivered" | "failed";

export interface CreateWebhookInput {
  url?: string;
  events?: WebhookEventType[];
  secret?: string;
  knowledge_base_id?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: WebhookEventType[];
  secret?: string | null;
  status?: WebhookStatus;
}

export interface WebhookRecord {
  id: string;
  tenantId: string;
  projectId: string;
  knowledgeBaseId: string | null;
  url: string;
  events: readonly WebhookEventType[];
  status: WebhookStatus;
  secretConfigured: boolean;
  secret: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliverySigningMetadata {
  algorithm: "hmac-sha256" | null;
  contentDigest: string | null;
  secretConfigured: boolean;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  knowledgeBaseId: string | null;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  requestTrace: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  signing: WebhookDeliverySigningMetadata;
  createdAt: string;
  deliveredAt: string | null;
}

export interface CreateWebhookDeliveryInput {
  webhookId: string;
  knowledgeBaseId?: string | null;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  requestTrace: Record<string, unknown>;
  maxAttempts?: number;
  signing?: WebhookDeliverySigningMetadata;
}

export interface WebhookDeliveryBackendStatus {
  enabled: boolean;
  reason: "webhook_delivery_backend_not_configured" | "webhook_delivery_backend_disabled" | null;
}

export interface WebhookDeliveryResponse {
  id: string;
  webhook_id: string;
  knowledge_base_id: string | null;
  event_type: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  request_trace: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  signing: {
    algorithm: "hmac-sha256" | null;
    content_digest: string | null;
    secret_configured: boolean;
  };
  created_at: string;
  delivered_at: string | null;
}

export interface WebhookResponse {
  id: string;
  knowledge_base_id: string | null;
  url: string;
  events: readonly WebhookEventType[];
  status: WebhookStatus;
  secret_configured: boolean;
  delivery_backend: WebhookDeliveryBackendStatus;
  latest_delivery: WebhookDeliveryResponse | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEnvelope {
  webhook: WebhookResponse;
}

export interface WebhookListEnvelope {
  webhooks: readonly WebhookResponse[];
}

export interface WebhookDeliveryEnvelope {
  delivery: WebhookDeliveryResponse;
}

export interface WebhookDeliveryListEnvelope {
  deliveries: readonly WebhookDeliveryResponse[];
}
