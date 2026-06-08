# Webhook API

> Webhook 让你的后端不用频繁轮询，也能感知入库、检索就绪、资料生命周期、清理和测试事件。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于创建 webhook receiver、校验签名、查看投递记录，并在入库和资料生命周期事件后减少轮询。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 从可信后端创建 webhook，并使用 HTTPS receiver URL。
- 用 delivery history 排查接收端失败和重试行为。
- 接收 payload 前必须校验签名。

## 端点矩阵

| 方法    | 路径                                   | 说明                  | operationId           |
| ------- | -------------------------------------- | --------------------- | --------------------- |
| `GET`   | `/v1/webhooks`                         | 列出 Webhook          | listWebhooks          |
| `POST`  | `/v1/webhooks`                         | 创建 Webhook          | createWebhook         |
| `GET`   | `/v1/webhooks/{webhook_id}`            | 获取 Webhook          | getWebhook            |
| `PATCH` | `/v1/webhooks/{webhook_id}`            | 更新 Webhook          | updateWebhook         |
| `POST`  | `/v1/webhooks/{webhook_id}/test`       | 发送 Webhook 测试事件 | sendWebhookTestEvent  |
| `GET`   | `/v1/webhooks/{webhook_id}/deliveries` | 列出 Webhook 投递记录 | listWebhookDeliveries |

## 字段说明

| 字段                | 说明                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `events`            | 事件类型，例如 `document.ingest.completed`、`document.ingest.failed`、`retrieve.readiness.updated` 和 `webhook.test`。 |
| `secret`            | 可选共享密钥，用于 HMAC SHA-256 签名。创建后不会再次返回。                                                             |
| `knowledge_base_id` | 可选作用域；省略时表示账号级事件。                                                                                     |
| 投递请求头          | 包含 timestamp、delivery ID、content digest 和 signature。                                                             |
| 重试                | 由 env 配置。接收端失败不会回滚原始操作。                                                                              |

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

## 请求示例

可用 Webhook 在入库完成后触发下游索引、缓存失效、通知或产品 UI 刷新。

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

## 响应示例

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

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/webhooks\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"url\": \"https://example.com/fococontext/webhook\", \"events\": [\"document.in"
  response:
    summary: "响应示例"
    value: '{ "data": { "id": "wh_01HX2Z6C7D8E9F0G1H2J3K4M5N", "url": "https://example.com/fococontext/webhook", "events": ["document.ingest.completed", "retrieve.readiness.updated"], "enabled": true, "latest_delivery": null }, "req'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `400 webhook_url_invalid`：URL 格式错误、生产环境不是 HTTPS，或不满足 allow-list 规则。
- `409 webhook_runtime_not_configured`：投递 Worker 或 secret 配置不完整。
- `404 webhook_not_found`：webhook 不存在或已删除。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
