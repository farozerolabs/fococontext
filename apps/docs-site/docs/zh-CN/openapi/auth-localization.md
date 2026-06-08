# 认证与本地化

> 开发者 API 使用 Bearer API Key。管理后台登录使用 Cookie 管理员会话，两者是不同认证边界。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于接入认证、本地化人类可读消息和稳定机器码。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 服务端集成应配置 `FOCOCONTEXT_API_KEY` 或生成的 API Key。
- 你的产品需要本地化人类可读消息时，发送 `X-Fococontext-Locale`。
- 业务逻辑只能依赖稳定 code、ID、枚举值和对象字段。

## 端点矩阵

| 方法   | 路径                  | 说明       | operationId         |
| ------ | --------------------- | ---------- | ------------------- |
| `GET`  | `/v1/knowledge-bases` | 列出知识库 | listKnowledgeBases  |
| `POST` | `/v1/knowledge-bases` | 创建知识库 | createKnowledgeBase |

## 字段说明

| 字段          | 说明                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| Authorization | 所有受保护 `/v1` 请求都带 `Authorization: Bearer <FOCOCONTEXT_API_KEY>`。                |
| 语言顺序      | 先读 `X-Fococontext-Locale`，再读 `Accept-Language`，最后使用服务默认语言。              |
| 可本地化字段  | `error.message`、任务进度消息和时间线消息可以本地化。                                    |
| 稳定字段      | `error.code`、ID、枚举值、对象 key、供应商名、模型名、文件名和 `context_pack` 保持稳定。 |

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
  "/knowledge-bases":
    get:
      summary: "List knowledge bases"
      operationId: "listKnowledgeBases"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
    post:
      summary: "Create a knowledge base"
      operationId: "createKnowledgeBase"
      responses:
        201:
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

API Key 用于服务端进程。管理后台账号密码只用于 Admin Console 登录。

```bash
curl "http://127.0.0.1:18080/v1/knowledge-bases" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>" \
  -H "X-Fococontext-Locale: zh-CN"
```

## 响应示例

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 0,
    "has_more": false
  },
  "request_id": "req_auth_example"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl \"http://127.0.0.1:18080/v1/knowledge-bases\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\" \\ -H \"X-Fococontext-Locale: zh-CN\""
  response:
    summary: "响应示例"
    value: '{ "data": [], "pagination": { "page": 1, "page_size": 20, "total": 0, "has_more": false }, "request_id": "req_auth_example" }'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `401 invalid_api_key`：API Key 缺失、格式错误、已撤销或不存在。
- `403 forbidden`：调用方已认证，但没有执行该操作的权限。
- `400 invalid_locale`：语言不受支持；使用 `en-US` 或 `zh-CN`。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
