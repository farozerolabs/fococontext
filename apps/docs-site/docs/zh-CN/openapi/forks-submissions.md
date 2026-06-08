# 分叉与提交 API

> Fork 用于隔离用户私有覆盖层和 canonical Knowledge Base。应用可以把用户私有内容提交到 fork，避免污染共享知识库。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于在 canonical Knowledge Base 之上接入用户、工作区、客户或实验用途的知识覆盖层。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 按外部用户、账号、工作区或租户覆盖层 resolve/create fork。
- 把开发者控制的内容提交到 fork，复用普通资料入库流程。
- 需要上游 canonical 上下文加目标 fork 覆盖层时，用 fork ID 调 Retrieve。

## 端点矩阵

| 方法     | 路径                                                    | 说明               | operationId              |
| -------- | ------------------------------------------------------- | ------------------ | ------------------------ |
| `GET`    | `/v1/knowledge-bases/{knowledge_base_id}/forks`         | 列出知识库分叉     | listKnowledgeBaseForks   |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/forks`         | 创建知识库分叉     | createKnowledgeBaseFork  |
| `POST`   | `/v1/knowledge-bases/{knowledge_base_id}/forks/resolve` | 解析知识库分叉     | resolveKnowledgeBaseFork |
| `GET`    | `/v1/forks/{fork_id}`                                   | 获取知识库分叉     | getKnowledgeBaseFork     |
| `DELETE` | `/v1/forks/{fork_id}`                                   | 删除知识库分叉     | deleteKnowledgeBaseFork  |
| `POST`   | `/v1/forks/{fork_id}/sync`                              | 同步知识库分叉     | syncKnowledgeBaseFork    |
| `POST`   | `/v1/forks/{fork_id}/submissions`                       | 提交生成知识到分叉 | submitForkKnowledge      |

## 字段说明

| 字段                | 说明                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `owner_type`        | 外部 owner 类型，例如 user、account、workspace 或 tenant。       |
| `external_owner_id` | 你的产品里的稳定 owner 标识。                                    |
| `visibility_origin` | Fork retrieve 包含上游继承和 fork-owned 记录，并排除其他 forks。 |
| submission          | 在 fork 内创建 Source Document 和 Job，不提供 hosted research。  |
| sync                | 把上游 canonical 更新同步到 fork 可见性模型。                    |

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
  "/knowledge-bases/{knowledge_base_id}/forks":
    get:
      summary: "List knowledge base forks"
      description: "Lists forked Knowledge Bases derived from the selected canonical Knowledge Base."
      operationId: "listKnowledgeBaseForks"
      responses:
        200:
          description: "Forked Knowledge Bases."
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
                          "$ref": "#/components/schemas/KnowledgeBase"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    post:
      summary: "Create a knowledge base fork"
      description: "Creates a forked Knowledge Base with explicit external owner metadata. Use resolve for idempotent lookup-or-create behavior."
      operationId: "createKnowledgeBaseFork"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/ForkResolveRequest"
      responses:
        200:
          description: "Forked Knowledge Base."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkResolveResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/forks/resolve":
    post:
      summary: "Resolve a knowledge base fork"
      description: "Idempotently returns an existing active fork or creates one for the canonical Knowledge Base and external owner."
      operationId: "resolveKnowledgeBaseFork"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/ForkResolveRequest"
      responses:
        200:
          description: "Resolved forked Knowledge Base."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkResolveResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/forks/{fork_id}":
    get:
      summary: "Get a knowledge base fork"
      operationId: "getKnowledgeBaseFork"
      responses:
        200:
          description: "Forked Knowledge Base."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/KnowledgeBase"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
    delete:
      summary: "Delete a knowledge base fork"
      description: "Hides the fork and queues cleanup for fork-owned overlay records while preserving upstream canonical resources."
      operationId: "deleteKnowledgeBaseFork"
      responses:
        200:
          description: "Fork deletion accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkDeleteResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/forks/{fork_id}/sync":
    post:
      summary: "Sync a knowledge base fork"
      description: "Synchronizes a fork from its canonical upstream using a fork-owned versioned operation."
      operationId: "syncKnowledgeBaseFork"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/ForkSyncRequest"
      responses:
        200:
          description: "Fork sync status."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkSyncResponse"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/forks/{fork_id}/submissions":
    post:
      summary: "Submit generated knowledge to a fork"
      description: "Accepts developer-generated Markdown or text plus evidence metadata and routes it through the normal fork-owned ingest pipeline."
      operationId: "submitForkKnowledge"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/CreateForkSubmissionRequest"
      responses:
        201:
          description: "Fork-owned submission accepted."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/ForkSubmissionResponse"
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
    ForkOwner:
      type: "object"
      required:
        - "owner_type"
        - "external_owner_id"
        - "display_name"
      properties:
        owner_type:
          type: "string"
          enum:
            - "user"
            - "workspace"
            - "customer"
            - "session"
            - "custom"
        external_owner_id:
          type: "string"
        display_name:
          type:
            - "string"
            - "null"
      additionalProperties: false
    ForkResolveRequest:
      type: "object"
      required:
        - "owner_type"
        - "external_owner_id"
      properties:
        owner_type:
          type: "string"
          enum:
            - "user"
            - "workspace"
            - "customer"
            - "session"
            - "custom"
        external_owner_id:
          type: "string"
        display_name:
          type:
            - "string"
            - "null"
        upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
      additionalProperties: false
    ForkResolveResponse:
      type: "object"
      required:
        - "created"
        - "fork"
      properties:
        created:
          type: "boolean"
        fork:
          "$ref": "#/components/schemas/KnowledgeBase"
      additionalProperties: false
    ForkSubmissionCitation:
      type: "object"
      properties:
        label:
          type: "string"
        title:
          type: "string"
        url:
          type: "string"
          format: "uri"
        locator:
          type: "string"
        metadata:
          "$ref": "#/components/schemas/CommonMetadata"
      additionalProperties: false
    ForkSubmissionEvidence:
      type: "object"
      properties:
        source_type:
          type: "string"
          description: "Developer-provided provenance type such as web, file, api, or user."
        title:
          type: "string"
        url:
          type: "string"
          format: "uri"
        snippet:
          type: "string"
        metadata:
          "$ref": "#/components/schemas/CommonMetadata"
      additionalProperties: false
    ForkSubmissionResponse:
      type: "object"
      required:
        - "fork_id"
        - "upstream_knowledge_base_id"
        - "document"
        - "job"
        - "evidence"
        - "citations"
      properties:
        fork_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        upstream_knowledge_base_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeBaseId"
            - type: "null"
        document:
          "$ref": "#/components/schemas/SourceDocument"
        job:
          "$ref": "#/components/schemas/IngestJob"
        evidence:
          type: "array"
          items:
            "$ref": "#/components/schemas/ForkSubmissionEvidence"
        citations:
          type: "array"
          items:
            "$ref": "#/components/schemas/ForkSubmissionCitation"
      additionalProperties: true
    ForkSyncRequest:
      type: "object"
      properties:
        target_upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
      additionalProperties: false
    ForkSyncResponse:
      type: "object"
      required:
        - "fork_id"
        - "sync_status"
        - "operation_id"
        - "change_set_id"
        - "source_upstream_version_id"
        - "target_upstream_version_id"
        - "current_fork_version_id"
        - "conflicts"
      properties:
        fork_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        sync_status:
          type: "string"
          enum:
            - "synced"
            - "outdated"
            - "syncing"
            - "failed"
        operation_id:
          type:
            - "string"
            - "null"
        change_set_id:
          oneOf:
            - "$ref": "#/components/schemas/ChangeSetId"
            - type: "null"
        source_upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
        target_upstream_version_id:
          oneOf:
            - "$ref": "#/components/schemas/KnowledgeVersionId"
            - type: "null"
        current_fork_version_id:
          "$ref": "#/components/schemas/KnowledgeVersionId"
        conflicts:
          type: "array"
          items:
            type: "object"
            required:
              - "type"
              - "upstream_page_id"
              - "fork_page_id"
              - "slug"
              - "title"
            properties:
              type:
                type: "string"
                enum:
                  - "fork_page_conflict"
              upstream_page_id:
                "$ref": "#/components/schemas/PageId"
              fork_page_id:
                "$ref": "#/components/schemas/PageId"
              slug:
                type: "string"
              title:
                type: "string"
            additionalProperties: true
      additionalProperties: true
    ForkDeleteResponse:
      type: "object"
      required:
        - "id"
        - "status"
        - "cleanup"
      properties:
        id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        status:
          type: "string"
          enum:
            - "deleted"
        cleanup:
          "$ref": "#/components/schemas/CleanupOperation"
      additionalProperties: false
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

Fork 适合终端用户私有记忆、产品工作区覆盖层或租户定制。canonical 数据保持干净且共享。

```bash
curl -X POST "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/forks/resolve" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_type": "user",
    "external_owner_id": "user_123"
  }'
```

## 响应示例

```json
{
  "data": {
    "fork": {
      "id": "kb_fork_01HX2Z1A2B3C4D5E6F7G8H9J0K",
      "knowledge_base_type": "fork",
      "upstream_knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A"
    },
    "created": true
  },
  "request_id": "req_fork_resolve"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl -X POST \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/forks/resolve\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"Content-Type: application/json\" \\ -d '{ \"owner_type\": \"user\", \"external_"
  response:
    summary: "响应示例"
    value: '{ "data": { "fork": { "id": "kb_fork_01HX2Z1A2B3C4D5E6F7G8H9J0K", "knowledge_base_type": "fork", "upstream_knowledge_base_id": "kb_01HX2XJ7Q3ZK3E5P3M7N9C2Y5A" }, "created": true }, "request_id": "req_fork_resolve" }'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `400 fork_target_invalid`：目标已经是 fork，或不能被 fork。
- `400 fork_submission_requires_fork`：submission 必须写入 fork Knowledge Base。
- `409 fork_owner_conflict`：owner 映射与已有 fork 冲突。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
