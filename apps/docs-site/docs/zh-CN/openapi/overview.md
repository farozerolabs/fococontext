# API 概览

> FocoContext 是服务端 Wiki-first 知识库 API。它接收资料，把资料编译为 Wiki 页面、图谱和版本状态，再把可追溯的检索上下文返回给你的业务后端。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

公开文档站只发布人类可读指南。机器可读契约保留在实例本地，确保它始终匹配当前运行的 Docker 镜像和环境配置。

先用已鉴权的契约文件发现所有可用路径、schema、响应和错误结构。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 第一次接入 FocoContext 时从这里开始。
- 用机器可读 OpenAPI 契约生成客户端，用下面的页面理解每组接口怎么接。
- Bearer API Key 必须保存在服务端。纯浏览器应用应调用你自己的后端，由后端再调用 FocoContext。

## 端点矩阵

| 方法   | 路径                                               | 说明                 | operationId              |
| ------ | -------------------------------------------------- | -------------------- | ------------------------ |
| `GET`  | `/v1/knowledge-bases`                              | 列出知识库           | listKnowledgeBases       |
| `POST` | `/v1/knowledge-bases`                              | 创建知识库           | createKnowledgeBase      |
| `POST` | `/v1/knowledge-bases/{knowledge_base_id}/retrieve` | 检索 Wiki 知识上下文 | retrieveKnowledgeContext |

## 字段说明

| 字段       | 说明                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Base URL   | 本地是 `http://127.0.0.1:18080/v1`，生产环境换成你的 HTTPS API 域名。                                         |
| 契约地址   | `GET /openapi.json` 位于 API host 根路径。匿名访问会被拒绝；需要管理后台登录会话或 Bearer API Key。           |
| 成功响应包 | JSON 成功响应包含 `data` 和 `request_id`；列表额外包含 `pagination`。                                         |
| 错误响应包 | 错误响应包含稳定 `error.code`、本地化 `error.message`、可选 `message_key`、结构化 `details` 和 `request_id`。 |

## 服务端分页与大知识库行为

列表端点会在服务端完成受限分页，然后再序列化响应。请求未传分页字段时，默认 `page_size` 为 `20`；通用最大值为 `100`，具体端点如果有不同边界，会在对应页面说明。支持 cursor 的列表接受 `cursor` 搭配 `limit` 或 `page_size`，还有下一页时返回 `pagination.next_cursor`。

客户端应把过滤、搜索、排序和分页参数传给 API，由服务端按当前租户、项目和知识库 scope 查询。不要把全量行加载到前端或调用方内存后再过滤。管理后台通过 session-authenticated routes 使用同一套服务行为。

Runtime status 会在 `dependencies.metrics.api`、`dependencies.metrics.cache` 和相关 pressure 字段中暴露安全的运行信号。这些字段适合接入监控面板和支持日志：它们展示端点分组、延迟桶、返回数量、page size、cache hit/miss 汇总、图谱就绪状态和 warning code 计数，同时不会泄露租户数据、API Key、对象 key 或原始文档内容。

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
  "/knowledge-bases/{knowledge_base_id}/retrieve":
    post:
      summary: "Retrieve wiki-based knowledge context"
      description: "Retrieves Wiki Page-centered context with citations, graph-expanded items, context pack data, and optional trace metadata."
      operationId: "retrieveKnowledgeContext"
      requestBody:
        required: true
        content:
          "application/json":
            schema:
              "$ref": "#/components/schemas/RetrieveRequest"
            example:
              context_budget_tokens: 4000
              graph_depth: 1
              include_context_pack: true
              include_expand_hints: true
              include_graph: true
              include_trace: true
              mode: "hybrid"
              query: "中文 graph context"
              top_k: 10
      responses:
        200:
          description: "Retrieve result."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/RetrieveResponse"
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
    RequestId:
      type: "string"
      pattern: "^req_[a-zA-Z0-9]+$"
    Pagination:
      type: "object"
      required:
        - "page"
        - "page_size"
        - "total"
        - "has_more"
      properties:
        page:
          type: "integer"
          minimum: 1
        page_size:
          type: "integer"
          minimum: 1
        total:
          type: "integer"
          minimum: 0
        has_more:
          type: "boolean"
        next_cursor:
          oneOf:
            - type: "string"
            - type: "null"
          description: "支持 cursor 的列表在还有下一页时返回的不透明游标。"
```

## 请求示例

先鉴权调用 `GET /openapi.json`，再创建知识库、上传资料、轮询任务、查看 Wiki 和图谱输出，最后调用 Retrieve。

```bash
curl "http://127.0.0.1:18080/openapi.json" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## 响应示例

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "FocoContext Knowledge OpenAPI",
    "version": "0.1.0"
  },
  "servers": [{ "url": "http://127.0.0.1:18080/v1" }]
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: 'curl "http://127.0.0.1:18080/openapi.json" -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"'
  response:
    summary: "响应示例"
    value: '{ "openapi": "3.1.0", "info": { "title": "FocoContext Knowledge OpenAPI", "version": "0.1.0" }, "servers": [{ "url": "http://127.0.0.1:18080/v1" }] }'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `401 invalid_api_key`：受保护的 `/v1` 路由需要 `Authorization: Bearer <FOCOCONTEXT_API_KEY>`。
- `400 invalid_request`：请求校验失败；如果返回 `error.details.fields`，按字段修正。
- `404 not_found`：资源不存在，或已被生命周期状态隐藏。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
