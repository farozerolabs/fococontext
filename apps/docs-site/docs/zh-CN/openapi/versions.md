# 版本与回滚 API

> 版本能力让生成的知识可审计。入库、资料生命周期、分叉提交、页面更新、回滚和重建索引都会创建可追踪的 Change Set 和版本。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于查看 Change Set、Knowledge Version、Page Version、diff、rollback 记录，以及影响 Retrieve 行为的审计轨迹。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 用版本诊断错误入库，或解释 Retrieve 结果为什么变化。
- 用 rollback 创建新的安全版本，历史版本继续保留。
- 手动变更前，用 Change Set 查看页面、图谱、来源和索引影响。

## 端点矩阵

| 方法    | 路径                                               | 说明               | operationId               |
| ------- | -------------------------------------------------- | ------------------ | ------------------------- |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/versions` | 列出知识库版本     | listKnowledgeBaseVersions |
| `GET`   | `/v1/change-sets/{change_set_id}`                  | 获取变更集         | getChangeSet              |
| `POST`  | `/v1/change-sets/{change_set_id}/apply`            | 应用变更集         | applyChangeSet            |
| `POST`  | `/v1/change-sets/{change_set_id}/discard`          | 丢弃变更集         | discardChangeSet          |
| `POST`  | `/v1/knowledge-bases/{knowledge_base_id}/rollback` | 回滚知识库         | rollbackKnowledgeBase     |
| `GET`   | `/v1/pages/{page_id}/versions`                     | 列出 Wiki 页面版本 | listWikiPageVersions      |
| `POST`  | `/v1/pages/{page_id}/rollback`                     | 回滚 Wiki 页面     | rollbackWikiPage          |
| `GET`   | `/v1/pages/{page_id}`                              | 获取 Wiki 页面     | getWikiPage               |
| `PATCH` | `/v1/pages/{page_id}`                              | 更新 Wiki 页面     | updateWikiPage            |

## 字段说明

| 字段                   | 说明                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `knowledge_version_id` | 不可变知识库检查点。                                                                     |
| `page_version_id`      | 不可变 Wiki 页面检查点。                                                                 |
| `change_set_id`        | 描述变更内容和原因的 diff 容器。                                                         |
| `trigger`              | 来源，例如 ingest、rollback、source_delete、page_merge、fork_submission 或 manual_edit。 |
| `rollback`             | 创建指向旧内容的新版本；历史版本继续保留。                                               |

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
  "/knowledge-bases/{knowledge_base_id}/versions":
    get:
      summary: "List knowledge base versions"
      operationId: "listKnowledgeBaseVersions"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/change-sets/{change_set_id}":
    get:
      summary: "Get a change set"
      operationId: "getChangeSet"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/change-sets/{change_set_id}/apply":
    post:
      summary: "Apply a change set"
      operationId: "applyChangeSet"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/change-sets/{change_set_id}/discard":
    post:
      summary: "Discard a change set"
      operationId: "discardChangeSet"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/rollback":
    post:
      summary: "Roll back a knowledge base"
      operationId: "rollbackKnowledgeBase"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/pages/{page_id}/versions":
    get:
      summary: "List wiki page versions"
      operationId: "listWikiPageVersions"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/pages/{page_id}/rollback":
    post:
      summary: "Roll back a wiki page"
      operationId: "rollbackWikiPage"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/pages/{page_id}":
    get:
      summary: "Get a wiki page"
      operationId: "getWikiPage"
      responses:
        200:
          description: "Wiki page detail."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/WikiPage"
    patch:
      summary: "Update a wiki page"
      operationId: "updateWikiPage"
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
    KnowledgeVersionId:
      type: "string"
      pattern: "^kbv_[a-zA-Z0-9]+$"
    PageVersionId:
      type: "string"
      pattern: "^pgv_[a-zA-Z0-9]+$"
    ChangeSetId:
      type: "string"
      pattern: "^cs_[a-zA-Z0-9]+$"
    WikiPage:
      type: "object"
      required:
        - "id"
        - "knowledge_base_id"
        - "slug"
        - "title"
        - "type"
        - "status"
        - "markdown"
        - "frontmatter"
        - "source_document_ids"
        - "metadata"
      properties:
        id:
          "$ref": "#/components/schemas/WikiPageId"
        markdown:
          type: "string"
          description: "Renderable Markdown with frontmatter-compatible metadata, wikilinks, source references, media references, and Markdown extensions."
        source_refs:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceRef"
        media_refs:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        wikilink_targets:
          type: "array"
          items:
            type: "object"
            additionalProperties: true
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
      additionalProperties: true
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

生产恢复时，先获取 versions，再查看 Change Set，然后回滚知识库或单个页面。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/rollback" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"target_version_id":"kbv_000012","reason":"Restore known good docs"}'
```

## 响应示例

```json
{
  "data": {
    "rollback_id": "rb_01HX2YR8S9T0V1W2X3Y4Z5A6B7",
    "change_set_id": "cs_01HX2YF4G5H6J7K8M9N0P1Q2R3",
    "knowledge_version_id": "kbv_000013",
    "affected_page_ids": ["page_01HX2YA2BC3D4E5F6G7H8J9K0M"]
  },
  "request_id": "req_rollback"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/rollback\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{\"target_version_id\":\"kbv_000012\",\"reas"
  response:
    summary: "响应示例"
    value: '{ "data": { "rollback_id": "rb_01HX2YR8S9T0V1W2X3Y4Z5A6B7", "change_set_id": "cs_01HX2YF4G5H6J7K8M9N0P1Q2R3", "knowledge_version_id": "kbv_000013", "affected_page_ids": ["page_01HX2YA2BC3D4E5F6G7H8J9K0M"] }, "request_id"'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `404 version_not_found`：请求的版本不存在。
- `409 stale_version`：目标版本无法应用到当前状态。
- `409 resource_deleted`：已删除资源不能通过普通路由继续更新或回滚。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
