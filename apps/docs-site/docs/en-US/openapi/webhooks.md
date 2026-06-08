# Webhooks API

> Webhooks let your backend observe ingest, retrieval readiness, source lifecycle, cleanup, and test events without polling every resource.

## Integration Context

Fetch the complete machine-readable contract from your deployed API instance at authenticated `GET /openapi.json`.

Use this page to create webhook receivers, verify signatures, inspect deliveries, and reduce polling after ingest and source lifecycle events.

## When to Use This Page

- Create webhooks from a trusted backend with an HTTPS receiver URL.
- Use delivery history to debug receiver failures and retry behavior.
- Verify signatures before accepting payloads into your application.

## Endpoint Matrix

| Method  | Path                                   | Summary                   | operationId           |
| ------- | -------------------------------------- | ------------------------- | --------------------- |
| `GET`   | `/v1/webhooks`                         | List webhooks             | listWebhooks          |
| `POST`  | `/v1/webhooks`                         | Create a webhook          | createWebhook         |
| `GET`   | `/v1/webhooks/{webhook_id}`            | Get a webhook             | getWebhook            |
| `PATCH` | `/v1/webhooks/{webhook_id}`            | Update a webhook          | updateWebhook         |
| `POST`  | `/v1/webhooks/{webhook_id}/test`       | Send a webhook test event | sendWebhookTestEvent  |
| `GET`   | `/v1/webhooks/{webhook_id}/deliveries` | List webhook deliveries   | listWebhookDeliveries |

## Field Guide

| Field               | Meaning                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `events`            | Event types such as `document.ingest.completed`, `document.ingest.failed`, `retrieve.readiness.updated`, and `webhook.test`. |
| `secret`            | Optional shared secret used for HMAC SHA-256 signatures. It is never returned after creation.                                |
| `knowledge_base_id` | Optional scope; omit it for account-wide events.                                                                             |
| Delivery headers    | Include timestamp, delivery ID, content digest, and signature.                                                               |
| Retries             | Configured by env. Failed receivers do not roll back originating operations.                                                 |

## OpenAPI

```yaml
openapi: "3.1.0"
info:
  title: "FocoContext Knowledge OpenAPI"
  version: "0.1.0"
  description: "Developer API for self-hosted Wiki-first knowledge ingestion, graph retrieval, versioning, and retrieval workflows. Human-readable messages support `X-Fococontext-Locale` and `Accept-Language`; machine-readable codes, IDs, enum values, and schema fields remain stable."
servers:
  - url: "http://localhost:18080/v1"
security:
  - bearerAuth: []
paths:
  "/webhooks":
    get:
      summary: "List webhooks"
      description: "Lists webhook subscriptions with delivery readiness and latest delivery summary. Secrets are never returned."
      operationId: "listWebhooks"
      parameters:
        - name: "page"
          in: "query"
          schema:
            type: "integer"
            minimum: 1
        - name: "page_size"
          in: "query"
          schema:
            type: "integer"
            minimum: 1
            maximum: 100
      responses:
        200:
          description: "Webhook subscriptions."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/ListEnvelope"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    post:
      summary: "Create a webhook"
      description: "Creates an enabled webhook when delivery runtime is configured. Delivery requests are signed with HMAC SHA-256 when a secret is provided."
      operationId: "createWebhook"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/WebhookCreateRequest"
            example:
              events:
                - "webhook.test"
                - "document.ingest.completed"
              knowledge_base_id: null
              secret: "replace-with-shared-secret"
              url: "https://example.com/fococontext/webhook"
      responses:
        201:
          description: "Webhook created."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/Webhook"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/webhooks/{webhook_id}":
    get:
      summary: "Get a webhook"
      operationId: "getWebhook"
      responses:
        200:
          description: "Webhook detail."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/Webhook"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    patch:
      summary: "Update a webhook"
      operationId: "updateWebhook"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/WebhookUpdateRequest"
            example:
              events:
                - "document.ingest.completed"
                - "document.ingest.failed"
              status: "enabled"
      responses:
        200:
          description: "Webhook updated."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/Webhook"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/webhooks/{webhook_id}/test":
    post:
      summary: "Send a webhook test event"
      operationId: "sendWebhookTestEvent"
      responses:
        202:
          description: "Webhook delivery queued."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/WebhookDelivery"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/webhooks/{webhook_id}/deliveries":
    get:
      summary: "List webhook deliveries"
      operationId: "listWebhookDeliveries"
      parameters:
        - name: "page"
          in: "query"
          schema:
            type: "integer"
            minimum: 1
        - name: "page_size"
          in: "query"
          schema:
            type: "integer"
            minimum: 1
            maximum: 100
      responses:
        200:
          description: "Webhook deliveries."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/ListEnvelope"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
components:
  securitySchemes:
    bearerAuth:
      type: "http"
      scheme: "bearer"
      description: "Use `Authorization: Bearer <FOCOCONTEXT_API_KEY>` for developer API calls. Admin Console sign-in uses the admin username/password flow instead."
  parameters:
    Locale:
      name: "X-Fococontext-Locale"
      in: "header"
      required: false
      description: "Preferred locale for human-readable API messages. Supported values are `en-US` and `zh-CN`."
      schema:
        type: "string"
        enum:
          - "en-US"
          - "zh-CN"
  responses:
    BadRequest:
      description: "The request is invalid. See `error.details` for field-level context."
      content:
        "application/json":
          schema:
            "$ref": "#/components/schemas/ErrorEnvelope"
    Unauthorized:
      description: "The Bearer API key is missing or invalid."
      content:
        "application/json":
          schema:
            "$ref": "#/components/schemas/ErrorEnvelope"
    InternalServerError:
      description: "The server failed unexpectedly. Use `request_id` for support correlation."
      content:
        "application/json":
          schema:
            "$ref": "#/components/schemas/ErrorEnvelope"
  schemas:
    Webhook:
      type: "object"
      required:
        - "id"
        - "url"
        - "events"
        - "status"
        - "secret_configured"
        - "delivery_backend"
      properties:
        id:
          "$ref": "#/components/schemas/WebhookId"
        knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        url:
          type: "string"
          format: "uri"
        events:
          type: "array"
          items:
            type: "string"
            enum:
              - "document.ingest.started"
              - "document.ingest.completed"
              - "document.ingest.failed"
              - "wiki_draft.created"
              - "knowledge_check.completed"
              - "page.created"
              - "page.updated"
              - "change_set.created"
              - "version.created"
              - "rollback.completed"
              - "knowledge_base.reindexed"
              - "fork.sync.completed"
              - "fork.sync.failed"
              - "cleanup.completed"
              - "cleanup.failed"
              - "retrieve.readiness.changed"
              - "webhook.test"
        status:
          type: "string"
          enum:
            - "enabled"
            - "disabled"
        secret_configured:
          type: "boolean"
        delivery_backend:
          type: "object"
          properties:
            enabled:
              type: "boolean"
            reason:
              type:
                - "string"
                - "null"
          additionalProperties: true
        latest_delivery:
          oneOf:
            - "$ref": "#/components/schemas/WebhookDelivery"
            - type: "null"
      additionalProperties: true
    WebhookCreateRequest:
      type: "object"
      required:
        - "url"
        - "events"
      properties:
        url:
          type: "string"
          format: "uri"
        events:
          type: "array"
          items:
            type: "string"
            enum:
              - "document.ingest.started"
              - "document.ingest.completed"
              - "document.ingest.failed"
              - "wiki_draft.created"
              - "knowledge_check.completed"
              - "page.created"
              - "page.updated"
              - "change_set.created"
              - "version.created"
              - "rollback.completed"
              - "knowledge_base.reindexed"
              - "fork.sync.completed"
              - "fork.sync.failed"
              - "cleanup.completed"
              - "cleanup.failed"
              - "retrieve.readiness.changed"
              - "webhook.test"
        knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        secret:
          type: "string"
          description: "Optional HMAC secret used to generate X-Fococontext-Signature. The secret is never returned."
      additionalProperties: false
    WebhookUpdateRequest:
      type: "object"
      properties:
        url:
          type: "string"
          format: "uri"
        events:
          type: "array"
          items:
            type: "string"
            enum:
              - "document.ingest.started"
              - "document.ingest.completed"
              - "document.ingest.failed"
              - "wiki_draft.created"
              - "knowledge_check.completed"
              - "page.created"
              - "page.updated"
              - "change_set.created"
              - "version.created"
              - "rollback.completed"
              - "knowledge_base.reindexed"
              - "fork.sync.completed"
              - "fork.sync.failed"
              - "cleanup.completed"
              - "cleanup.failed"
              - "retrieve.readiness.changed"
              - "webhook.test"
        status:
          type: "string"
          enum:
            - "enabled"
            - "disabled"
        secret:
          type:
            - "string"
            - "null"
          description: "Provide a new HMAC secret or null/empty value to clear the subscription secret."
      additionalProperties: false
    WebhookDelivery:
      type: "object"
      required:
        - "id"
        - "webhook_id"
        - "event_type"
        - "status"
        - "attempt_count"
        - "signing"
      properties:
        id:
          "$ref": "#/components/schemas/WebhookDeliveryId"
        webhook_id:
          "$ref": "#/components/schemas/WebhookId"
        event_type:
          type: "string"
          enum:
            - "document.ingest.started"
            - "document.ingest.completed"
            - "document.ingest.failed"
            - "wiki_draft.created"
            - "knowledge_check.completed"
            - "page.created"
            - "page.updated"
            - "change_set.created"
            - "version.created"
            - "rollback.completed"
            - "knowledge_base.reindexed"
            - "fork.sync.completed"
            - "fork.sync.failed"
            - "cleanup.completed"
            - "cleanup.failed"
            - "retrieve.readiness.changed"
            - "webhook.test"
        status:
          type: "string"
          enum:
            - "queued"
            - "delivered"
            - "failed"
        attempt_count:
          type: "integer"
          minimum: 0
        max_attempts:
          type: "integer"
          minimum: 1
        signing:
          type: "object"
          description: "Webhook deliveries use X-Fococontext-Signature, X-Fococontext-Timestamp, X-Fococontext-Delivery-Id, and X-Fococontext-Content-Digest headers."
          additionalProperties: true
      additionalProperties: true
    WebhookDeliveryId:
      type: "string"
      pattern: "^whd_[a-zA-Z0-9]+$"
    SuccessEnvelope:
      type: "object"
      required:
        - "data"
        - "request_id"
      properties:
        data: true
        request_id:
          "$ref": "#/components/schemas/RequestId"
    ErrorEnvelope:
      type: "object"
      required:
        - "error"
        - "request_id"
      properties:
        error:
          "$ref": "#/components/schemas/ApiError"
        request_id:
          "$ref": "#/components/schemas/RequestId"
    ApiError:
      type: "object"
      required:
        - "code"
        - "message"
      properties:
        code:
          type: "string"
          enum:
            - "invalid_api_key"
            - "forbidden"
            - "knowledge_base_not_found"
            - "document_not_found"
            - "job_not_found"
            - "upload_session_not_found"
            - "page_not_found"
            - "version_not_found"
            - "unsupported_file_type"
            - "parser_failed"
            - "parser_timeout"
            - "password_protected_pdf"
            - "parser_output_empty"
            - "invalid_request"
            - "ingest_failed"
            - "change_set_conflict"
            - "retrieve_index_not_ready"
            - "fork_target_invalid"
            - "fork_submission_requires_fork"
            - "document_delete_preview_required"
            - "cleanup_operation_not_found"
            - "cleanup_operation_not_retryable"
            - "resource_deleted"
            - "resource_cleanup_pending"
            - "ingest_lock_conflict"
            - "rate_limited"
            - "internal_error"
        message:
          type: "string"
          description: "Human-readable message localized by `X-Fococontext-Locale` or `Accept-Language` when supported."
        locale:
          type: "string"
          enum:
            - "en-US"
            - "zh-CN"
        message_key:
          type: "string"
          description: "Optional stable localization key for clients that want to render their own copy."
        details:
          type: "object"
          additionalProperties: true
```

## Request Example

Use Webhooks to trigger downstream indexing, cache invalidation, notifications, or product UI refresh after ingest completes.

```bash
curl -X POST "http://127.0.0.1:18080/v1/webhooks" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/fococontext/webhook",
    "events": ["document.ingest.completed", "retrieve.readiness.updated"],
    "secret": "<webhook_secret>"
  }'
```

## Response Example

```json
{
  "data": {
    "id": "wh_01HX2Z6C7D8E9F0G1H2J3K4M5N",
    "url": "https://example.com/fococontext/webhook",
    "events": ["document.ingest.completed", "retrieve.readiness.updated"],
    "enabled": true,
    "latest_delivery": null
  },
  "request_id": "req_webhook_create"
}
```

## Examples

```yaml
examples:
  request:
    summary: "Request example"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/webhooks\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"url\": \"https://example.com/fococontext/webhook\", \"events\": [\"document.in"
  response:
    summary: "Response example"
    value: '{ "data": { "id": "wh_01HX2Z6C7D8E9F0G1H2J3K4M5N", "url": "https://example.com/fococontext/webhook", "events": ["document.ingest.completed", "retrieve.readiness.updated"], "enabled": true, "latest_delivery": null }, "req'
responses:
  "200":
    description: "Successful response with the standard JSON envelope."
  "400":
    description: "Invalid request; inspect error.code and details."
  "401":
    description: "API key is missing or invalid."
```

## Error Handling

- `400 webhook_url_invalid`: URL is malformed, not HTTPS in production, or fails allow-list rules.
- `409 webhook_runtime_not_configured`: delivery worker or secret configuration is incomplete.
- `404 webhook_not_found`: webhook ID does not exist or has been deleted.

## Production Notes

- All examples use placeholders such as `<FOCOCONTEXT_API_KEY>`, `<knowledge_base_id>`, and `<job_id>`; replace them with real values in production.
- Program logic should use structured fields, not localized human-readable text.
- If this page differs from `GET /openapi.json`, treat `GET /openapi.json` as the source of truth and update the documentation.
- Admin Console and external developers use the same service capabilities; use the API as the integration boundary.
