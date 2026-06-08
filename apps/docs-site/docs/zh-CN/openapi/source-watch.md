# Source Watch API

> Source Watch 把外部位置变成可重复的资料发现规则。在部署条件满足时，规则可以扫描挂载目录、S3 前缀、URL 列表和 Git 仓库。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于从挂载目录、S3 prefix、URL 列表或 Git repository 中发现资料变化。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 服务器目录挂载到 API 容器后，使用 mounted directory 规则。
- S3、URL list 和 Git 规则使用独立 Source Watch 凭据，不复用服务自己的对象存储桶。
- 用 scan history 观察定时扫描、失败恢复、已创建资料和删除候选。

## 端点矩阵

| 方法    | 路径                                                         | 说明                       | operationId                |
| ------- | ------------------------------------------------------------ | -------------------------- | -------------------------- |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/source-watch-rules` | 列出 Source Watch 规则     | listSourceWatchRules       |
| `POST`  | `/v1/knowledge-bases/{knowledge_base_id}/source-watch-rules` | 创建 Source Watch 规则     | createSourceWatchRule      |
| `GET`   | `/v1/source-watch-rules/{rule_id}`                           | 获取 Source Watch 规则状态 | getSourceWatchRuleStatus   |
| `PATCH` | `/v1/source-watch-rules/{rule_id}`                           | 更新 Source Watch 规则     | updateSourceWatchRule      |
| `POST`  | `/v1/source-watch-rules/{rule_id}/scan`                      | 扫描 Source Watch 规则     | scanSourceWatchRule        |
| `POST`  | `/v1/source-watch-rules/{rule_id}/enable`                    | 启用 Source Watch 规则     | enableSourceWatchRule      |
| `POST`  | `/v1/source-watch-rules/{rule_id}/disable`                   | 禁用 Source Watch 规则     | disableSourceWatchRule     |
| `GET`   | `/v1/source-watch-rules/{rule_id}/scans`                     | 列出 Source Watch 扫描历史 | listSourceWatchScanHistory |
| `GET`   | `/v1/scheduled-import-jobs/{scheduled_import_job_id}`        | 获取定时导入任务           | getScheduledImportJob      |

## 字段说明

| 字段                | 说明                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| `source_kind`       | `mounted_directory`、`s3_prefix`、`url_list` 或 `git_repo`。              |
| `location`          | 适配器专用对象，例如容器路径、S3 bucket/prefix、URL 列表或 Git 仓库 URL。 |
| `auto_ingest`       | 为 true 时，新增或变更来源会创建 Source Document 和 Job。                 |
| `delete_candidates` | 潜在删除项必须先做 delete impact preview，再进入清理。                    |
| scan history        | 定时和手动扫描的持久状态，包含失败和重试元数据。                          |

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
  "/knowledge-bases/{knowledge_base_id}/source-watch-rules":
    get:
      summary: "List source watch rules"
      operationId: "listSourceWatchRules"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    post:
      summary: "Create a source watch rule"
      operationId: "createSourceWatchRule"
      responses:
        201:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}":
    get:
      summary: "Get source watch rule status"
      operationId: "getSourceWatchRuleStatus"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    patch:
      summary: "Update a source watch rule"
      operationId: "updateSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/scan":
    post:
      summary: "Scan a source watch rule"
      operationId: "scanSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/enable":
    post:
      summary: "Enable a source watch rule"
      operationId: "enableSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/disable":
    post:
      summary: "Disable a source watch rule"
      operationId: "disableSourceWatchRule"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/source-watch-rules/{rule_id}/scans":
    get:
      summary: "List source watch scan history"
      operationId: "listSourceWatchScanHistory"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/scheduled-import-jobs/{scheduled_import_job_id}":
    get:
      summary: "Get scheduled import job"
      operationId: "getScheduledImportJob"
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
    SourceWatchRuleId:
      type: "string"
      pattern: "^swr_[a-zA-Z0-9]+$"
    ScheduledImportJobId:
      type: "string"
      pattern: "^sij_[a-zA-Z0-9]+$"
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

规则扫描会进入正常入库流程。创建的文件仍然走 Source Document、Job、Wiki、Graph、Version 和 Retrieve readiness。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/source-watch-rules" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mounted docs",
    "source_kind": "mounted_directory",
    "location": { "path": "/source-watch/docs" },
    "auto_ingest": true,
    "schedule": "*/15 * * * *"
  }'
```

## 响应示例

```json
{
  "data": {
    "id": "swr_01HX2YS4T5V6W7X8Y9Z0A1B2C3",
    "name": "Mounted docs",
    "source_kind": "mounted_directory",
    "enabled": true,
    "last_scan_status": null
  },
  "request_id": "req_source_watch"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/source-watch-rules\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"name\": \"Mounted docs\", \"so"
  response:
    summary: "响应示例"
    value: '{ "data": { "id": "swr_01HX2YS4T5V6W7X8Y9Z0A1B2C3", "name": "Mounted docs", "source_kind": "mounted_directory", "enabled": true, "last_scan_status": null }, "request_id": "req_source_watch" }'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `400 source_watch_adapter_not_configured`：适配器运行条件或凭据缺失。
- `400 source_watch_location_invalid`：路径、URL、bucket、prefix 或仓库不合法。
- `409 source_watch_scan_locked`：该规则已有扫描正在运行。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
