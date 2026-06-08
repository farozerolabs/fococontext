# 错误与限制

> 错误信息面向人类可本地化，面向程序保持稳定。运行限制采用 env-first，保护上传、解析、OCR、图片 caption、检索、Source Watch、Webhook 和清理流程。
> Runtime health 和 settings payload 也会暴露 provider-neutral S3-compatible 操作压力。Class A 表示写入、列表、multipart 和控制面类操作；Class B 表示对象读取和 metadata 读取。实际价格和计费名称取决于所配置的 provider。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于处理结构化错误、运行限制、清理任务、request ID 和本地化消息。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 按 `error.code` 处理错误，`error.message` 用于展示。
- 日志里记录 `request_id` 和资源 ID，方便支持和重试流程。
- 向操作人员展示限制错误时，尽量同时展示相关配置名。
- 只有 `settled_state.is_settled` 为 true 时，才把 cleanup 视为完全完成。

## 端点矩阵

| 方法   | 路径                                                  | 说明             | operationId           |
| ------ | ----------------------------------------------------- | ---------------- | --------------------- |
| `GET`  | `/v1/cleanup-operations`                              | 列出删除清理任务 | listCleanupOperations |
| `GET`  | `/v1/cleanup-operations/{cleanup_operation_id}`       | 获取删除清理任务 | getCleanupOperation   |
| `POST` | `/v1/cleanup-operations/{cleanup_operation_id}/retry` | 重试删除清理任务 | retryCleanupOperation |

## 字段说明

| 字段                                            | 说明                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `error.code`                                    | 客户端逻辑使用的稳定枚举。                                                        |
| `error.message`                                 | 本地化的人类可读消息。                                                            |
| `message_key`                                   | 客户端想自行翻译时使用的翻译 key。                                                |
| `details`                                       | 结构化字段，例如非法字段、目标资源、清理任务、重试时间或限制名。                  |
| 清理任务                                        | 隐藏 Knowledge Base、资料、对象、索引和行清理的异步删除状态。                     |
| `settled_state`                                 | 分阶段清理验证，包含对象存储、数据库、pending、failed 和 residual artifact 计数。 |
| `dependencies.metrics.objectStorageOperations`  | 最近窗口内按 class、operation、caller、status 汇总的 S3-compatible 操作计数。     |
| `dependencies.pressure.objectStorageOperations` | 操作压力状态、Class A/B 阈值、hot callers 和 tuning guidance keys。               |

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
  "/cleanup-operations":
    get:
      summary: "List deletion cleanup operations"
      description: "Returns asynchronous cleanup operations for visible deletion, object cleanup, database cleanup, and retry status."
      operationId: "listCleanupOperations"
      responses:
        200:
          description: "Deletion cleanup operations."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/ListEnvelope"
                  - type: "object"
                    properties:
                      data:
                        type: "array"
                        items:
                          "$ref": "#/components/schemas/CleanupOperation"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/cleanup-operations/{cleanup_operation_id}":
    get:
      summary: "Get deletion cleanup operation"
      description: "Returns cleanup phase, item counts, settled-state verification, retry eligibility, and safe error summaries without provider secrets."
      operationId: "getCleanupOperation"
      responses:
        200:
          description: "Deletion cleanup operation."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/CleanupOperation"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/cleanup-operations/{cleanup_operation_id}/retry":
    post:
      summary: "Retry deletion cleanup operation"
      description: "Queues retry work for retryable failed or pending cleanup items."
      operationId: "retryCleanupOperation"
      responses:
        200:
          description: "Deletion cleanup retry accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/CleanupRetryResponse"
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
    StaleResourceErrorDetails:
      type: "object"
      required:
        - "target_type"
        - "target_id"
      properties:
        target_type:
          type: "string"
          enum:
            - "knowledge_base"
            - "source_document"
        target_id:
          "$ref": "#/components/schemas/ResourceId"
        cleanup_operation_id:
          oneOf:
            - "$ref": "#/components/schemas/CleanupOperationId"
            - type: "null"
        guidance:
          type: "string"
      additionalProperties: true
    CleanupOperation:
      type: "object"
      required:
        - "id"
        - "target_type"
        - "target_id"
        - "knowledge_base_id"
        - "status"
        - "phase"
        - "retryable"
        - "item_counts"
        - "created_at"
        - "updated_at"
      properties:
        id:
          "$ref": "#/components/schemas/CleanupOperationId"
        target_type:
          type: "string"
          enum:
            - "knowledge_base"
            - "source_document"
            - "source_watch_rule"
            - "webhook"
            - "import_preview"
            - "retrieval_trace"
        target_id:
          "$ref": "#/components/schemas/ResourceId"
        knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        status:
          "$ref": "#/components/schemas/CleanupStatus"
        phase:
          "$ref": "#/components/schemas/CleanupPhase"
        retryable:
          type: "boolean"
        item_counts:
          "$ref": "#/components/schemas/CleanupItemCounts"
        created_at:
          "$ref": "#/components/schemas/Timestamp"
        updated_at:
          "$ref": "#/components/schemas/Timestamp"
      additionalProperties: true
    CleanupRetryResponse:
      type: "object"
      required:
        - "cleanup_operation"
      properties:
        cleanup_operation:
          "$ref": "#/components/schemas/CleanupOperation"
      additionalProperties: false
    CleanupItemSummary:
      type: "object"
      required:
        - "id"
        - "operation_id"
        - "item_type"
        - "status"
        - "phase"
      properties:
        id:
          type: "string"
        operation_id:
          "$ref": "#/components/schemas/CleanupOperationId"
        item_type:
          type: "string"
          enum:
            - "object"
            - "database_row"
            - "reference"
            - "audit"
        status:
          type: "string"
          enum:
            - "pending"
            - "running"
            - "deleted"
            - "skipped"
            - "failed"
        phase:
          "$ref": "#/components/schemas/CleanupPhase"
      additionalProperties: true
```

## 请求示例

资料删除后可以立即返回 `resource_deleted`，对象存储清理继续通过 cleanup operation 执行。Accepted 或 queued cleanup 不等于完全 settled cleanup。

```bash
curl "http://127.0.0.1:18080/v1/cleanup-operations?knowledge_base_id=<knowledge_base_id>" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## 响应示例

```json
{
  "error": {
    "code": "resource_cleanup_pending",
    "message": "资源清理仍在执行。",
    "message_key": "api.error.resource_cleanup_pending",
    "details": {
      "target_type": "source_document",
      "target_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
      "cleanup_operation_id": "cleanup_01HX2Z9P0Q1R2S3T4V5W6X7Y8Z"
    }
  },
  "request_id": "req_error"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl \"http://127.0.0.1:18080/v1/cleanup-operations?knowledge_base_id=<knowledge_base_id>\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\""
  response:
    summary: "响应示例"
    value: '{ "error": { "code": "resource_cleanup_pending", "message": "资源清理仍在执行。", "message_key": "api.error.resource_cleanup_pending", "details": { "target_type": "source_document", "target_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", '
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `400 invalid_request`：请求结构或校验失败。
- `401 invalid_api_key`：认证失败。
- `404 not_found`：资源不存在或当前不可见。
- `409 resource_deleted`：资源已删除，不能继续普通操作。
- `429 rate_limit_error`：达到运行限制或上游模型供应商限流。
- `500 internal_error`：未预期服务端错误；联系支持时带上 `request_id`。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
