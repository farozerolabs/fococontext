# 任务 API

> Jobs 暴露上传、Source Watch 扫描、分叉提交、重建索引、OCR、图片 caption 和清理相关工作的异步入库状态。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于轮询入库任务、批量任务状态、知识库入库进度、可重试失败、可取消任务和阶段时间线。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 创建资料或提交后，轮询 job detail。
- 多文件上传后使用 batch job status，不需要每个 job 单独请求。
- 需要聚合进度和 Retrieve readiness 时，使用 Knowledge Base ingest progress。
- 面向操作人员展示时间线时按最新优先排序，同时把它视为历史记录。
- 只重试失败且可重试的任务；只取消尚未进入终态的活跃任务。

## 端点矩阵

| 方法   | 路径                                                      | 说明                           | operationId                    |
| ------ | --------------------------------------------------------- | ------------------------------ | ------------------------------ |
| `GET`  | `/v1/jobs/{job_id}`                                       | 获取入库任务状态和编译阶段事件 | getIngestJobStatus             |
| `POST` | `/v1/jobs/batch`                                          | 批量查询入库任务状态           | getIngestJobStatuses           |
| `POST` | `/v1/jobs/{job_id}/retry`                                 | 重试入库任务                   | retryIngestJob                 |
| `POST` | `/v1/jobs/{job_id}/cancel`                                | 取消入库任务                   | cancelIngestJob                |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/jobs`            | 列出知识库任务和编译阶段事件   | listKnowledgeBaseJobs          |
| `GET`  | `/v1/knowledge-bases/{knowledge_base_id}/ingest-progress` | 获取聚合入库进度和检索就绪状态 | getKnowledgeBaseIngestProgress |

## 字段说明

| 字段             | 说明                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `status`         | `queued`、`running`、`completed`、`failed` 或 `canceled`。                                                                     |
| `stage`          | 当前阶段，例如 parsing、OCR、captioning、analyzing、generating、merging 或 indexing。                                          |
| `progress`       | 运行中必须低于 100；`100` 只表示 completed 终态。                                                                              |
| `timeline`       | 只追加的历史事件，包含本地化消息和结构化元数据。                                                                               |
| `error`          | 失败任务或失败事件的安全错误摘要。`error.category=output_validation_failed` 表示模型输出在归一化/修复后仍不满足结构化 schema。 |
| `retrieve_ready` | Knowledge Base ingest progress 中的检索就绪标记，客户端不需要从每个 job 自行推导。                                             |
| `request_id`     | 排查支持问题时和 `job_id` 一起记录。                                                                                           |

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
  "/jobs/{job_id}":
    get:
      summary: "Get ingest job status and compile stage events"
      description: "Returns the durable ingest Job. `progress: 100` means terminal completion; running, failed, and canceled jobs stay below `100`. Timeline events are persisted historical events and do not include fabricated future stages."
      operationId: "getIngestJobStatus"
      responses:
        200:
          description: "Ingest job status."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/IngestJob"
              example:
                data:
                  id: "job_example"
                  status: "running"
                  stage: "generating"
                  progress: 55
                  progress_message: "Generating wiki drafts..."
                  events:
                    - type: "job.running"
                      stage: "generating"
                      status: "running"
                      message: "Generating wiki drafts..."
                      metadata:
                        analysis_result_id: "analysis_example"
                      created_at: "2026-05-21T01:00:00.000Z"
                request_id: "req_example"
  "/jobs/{job_id}/retry":
    post:
      summary: "Retry an ingest job"
      operationId: "retryIngestJob"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/jobs/batch":
    post:
      summary: "Resolve multiple ingest job statuses"
      description: "Preserves input order and returns item-level errors for missing or inaccessible jobs without revealing cross-scope existence."
      operationId: "getIngestJobStatuses"
      responses:
        200:
          description: "Batch ingest job status."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/ingest-progress":
    get:
      summary: "Get aggregate ingest progress and Retrieve readiness"
      operationId: "getKnowledgeBaseIngestProgress"
      responses:
        200:
          description: "Knowledge Base ingest progress summary."
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/jobs/{job_id}/cancel":
    post:
      summary: "Cancel an ingest job"
      operationId: "cancelIngestJob"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/jobs":
    get:
      summary: "List Knowledge Base jobs with compile stage events"
      description: "返回面向用户的 Knowledge Base 任务。内部 Graph Insights refresh 记录不会出现在该列表中，Graph Insights 状态通过图谱状态接口查看。"
      operationId: "listKnowledgeBaseJobs"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
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
    IngestJob:
      type: "object"
      required:
        - "id"
        - "status"
        - "stage"
        - "progress"
      properties:
        id:
          "$ref": "#/components/schemas/IngestJobId"
        status:
          type: "string"
          enum:
            - "queued"
            - "running"
            - "completed"
            - "failed"
            - "canceled"
        stage:
          type: "string"
          enum:
            - "parsing"
            - "ocr"
            - "captioning"
            - "analyzing"
            - "generating"
            - "merging"
            - "indexing"
        progress:
          type: "integer"
          description: "`100` is reserved for terminal `completed` jobs. Queued, running, failed, and canceled jobs remain below `100`."
          minimum: 0
          maximum: 100
        progress_message:
          type: "string"
          description: "Human-readable current state. Terminal jobs use terminal copy instead of active stage copy."
        events:
          type: "array"
          description: "Persisted historical job events only. Clients should not infer future stages from this list."
          items:
            type: "object"
            required:
              - "type"
              - "stage"
              - "status"
              - "message"
              - "metadata"
              - "created_at"
            properties:
              type:
                type: "string"
                enum:
                  - "job.queued"
                  - "job.running"
                  - "job.completed"
                  - "job.failed"
                  - "job.canceled"
              stage:
                type: "string"
                enum:
                  - "parsing"
                  - "ocr"
                  - "captioning"
                  - "analyzing"
                  - "generating"
                  - "merging"
                  - "indexing"
              status:
                type: "string"
                enum:
                  - "queued"
                  - "running"
                  - "completed"
                  - "failed"
                  - "canceled"
              message:
                type: "string"
              metadata:
                type: "object"
                description: "Safe event metadata. Prompt-configurable stages may include `prompt_template`; model-output stages may include `structured_output_attempt_count`, `structured_output_repair_attempts`, `structured_output_final_status`, and safe validation issue summaries. Raw provider output, secrets, and full prompt text are excluded."
                additionalProperties: true
              error:
                type:
                  - "object"
                  - "null"
                description: "Safe stage error summary. `category` classifies provider and model-output failures such as `output_validation_failed` without exposing raw provider output or secrets."
                properties:
                  category:
                    type: "string"
                  code:
                    type: "string"
                  message:
                    type: "string"
                  retryable:
                    type: "boolean"
                additionalProperties: true
              created_at:
                "$ref": "#/components/schemas/Timestamp"
            additionalProperties: true
        error:
          type:
            - "object"
            - "null"
          description: "Safe job error summary for failed jobs. `category` separates provider failures from model output validation failures such as `output_validation_failed`."
          properties:
            category:
              type: "string"
            code:
              type: "string"
            message:
              type: "string"
            retryable:
              type: "boolean"
          additionalProperties: true
      additionalProperties: true
    IngestJobId:
      type: "string"
      pattern: "^job_[a-zA-Z0-9]+$"
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

调用 Retrieve 前应以 job 状态为准。任务仍在运行时，Retrieve 可能返回 not-ready 错误。

```bash
curl "http://127.0.0.1:18080/v1/jobs/<job_id>" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## 响应示例

```json
{
  "data": {
    "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q",
    "status": "running",
    "stage": "generating",
    "progress": 55,
    "progress_message": "正在生成 Wiki 草稿...",
    "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2",
    "timeline": [
      {
        "event": "job.running",
        "message": "正在生成 Wiki 草稿...",
        "created_at": "2026-05-22T10:00:00.000Z"
      }
    ]
  },
  "request_id": "req_job_detail"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl \"http://127.0.0.1:18080/v1/jobs/<job_id>\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\""
  response:
    summary: "响应示例"
    value: '{ "data": { "id": "job_01HX2Y7E8F9G0H1J2K3M4N5P6Q", "status": "running", "stage": "generating", "progress": 55, "progress_message": "正在生成 Wiki 草稿...", "document_id": "doc_01HX2Y36C4D5F6G7H8J9K0M1N2", "timeline": [ { "eve'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `404 job_not_found`：任务不存在或当前不可见。
- `409 job_not_retryable`：任务不是 failed 状态，或无法安全重启。
- `409 job_not_cancelable`：任务已经进入终态，或已被清理流程隔离。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
