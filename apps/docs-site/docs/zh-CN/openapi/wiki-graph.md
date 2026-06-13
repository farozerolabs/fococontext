# Wiki 与图谱 API

> Wiki Page 是入库后形成的长期知识资产。Graph 接口暴露关系、证据、社区、桥接点、知识空白和检索扩展信号。

## 接入说明

完整机器可读契约由你部署后的 API 实例通过鉴权 `GET /openapi.json` 提供。

本页用于渲染生成后的 Wiki 页面、查看页面关系、展示图谱视图，并校验可移植 Markdown 导出。生成 SDK 或做契约校验时，应以你部署实例返回的完整 `/openapi.json` 为准。

## 适用场景

- 用 pages 接口渲染生成的 Markdown、页面元数据、来源引用和版本。
- 用 graph 接口支持 Graph View、相关页面探索和图谱检索调试。
- 你的产品需要可移植 Wiki 内容时，使用 Markdown export 和 contract validation。

## 端点矩阵

| 方法    | 路径                                                                 | 说明               | operationId              |
| ------- | -------------------------------------------------------------------- | ------------------ | ------------------------ |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/pages`                      | 列出 Wiki 页面     | listWikiPages            |
| `GET`   | `/v1/pages/{page_id}`                                                | 获取 Wiki 页面     | getWikiPage              |
| `PATCH` | `/v1/pages/{page_id}`                                                | 更新 Wiki 页面     | updateWikiPage           |
| `GET`   | `/v1/pages/{page_id}/related`                                        | 列出相关 Wiki 页面 | listRelatedWikiPages     |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/system-pages`               | 列出系统页面       | listSystemPages          |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/system-pages/{type}`        | 获取系统页面       | getSystemPage            |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/graph`                      | 获取知识图谱       | getKnowledgeGraph        |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/graph/insights`             | 获取图谱洞察       | getGraphInsights         |
| `GET`   | `/v1/knowledge-bases/{knowledge_base_id}/markdown-export`            | 导出 Markdown      | exportMarkdown           |
| `POST`  | `/v1/knowledge-bases/{knowledge_base_id}/markdown-contract/validate` | 校验 Markdown 契约 | validateMarkdownContract |

## 字段说明

| 字段                | 说明                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `page_type`         | `source`、`entity`、`concept`、`synthesis`、`comparison`、`query` 或 `system`。                 |
| `source_refs`       | 指向 text、OCR 或 image caption 证据的可追溯记录。                                              |
| `relation_type`     | `wikilink`、`shared_source`、`common_neighbor`、`type_affinity` 或 `manual`。                   |
| `visibility_origin` | 区分 canonical、上游继承和 fork-owned 记录。                                                    |
| `graph_insights`    | 社区、桥接点、孤立页面、稀疏区域、知识空白和意外连接。                                          |
| `graph_readiness`   | 图谱相关 API 返回的物化图谱洞察状态。                                                           |
| `warnings`          | 非致命图谱 warning code，例如 `graph.readiness.updating` 或 `graph.limit.edge_budget_reached`。 |

## 图谱就绪状态

Graph API 和 Retrieve 响应可以包含 `graph_readiness`，用于区分直接 Wiki 检索结果和物化图谱洞察是否就绪。状态值包括 `queued`、`updating`、`ready`、`failed`、`partial` 或 `stale`。

`ready` 适合用于图谱洞察看板和重度依赖图谱的 Agent 展开。`queued` 或 `updating` 表示可以展示进度并稍后重试。`partial`、`stale` 或 `failed` 表示直接 Wiki 结果仍可使用，图谱洞察区域应标记为受限。非 ready 状态也会以 `graph.readiness.<state>` 形式进入请求级 warnings。

大型知识库应通过列表 API 分页读取 Wiki 页面和系统页面，不要为了前端过滤一次性请求所有节点。当前视图用 graph endpoints，层层深入用 Retrieve Expand，运行压力用 runtime metrics 查看。

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
  "/knowledge-bases/{knowledge_base_id}/pages":
    get:
      summary: "List wiki pages"
      operationId: "listWikiPages"
      responses:
        200:
          description: "Wiki pages."
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
                          "$ref": "#/components/schemas/WikiPage"
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
  "/pages/{page_id}/related":
    get:
      summary: "List related wiki pages"
      operationId: "listRelatedWikiPages"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/system-pages":
    get:
      summary: "List system pages"
      operationId: "listSystemPages"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/system-pages/{type}":
    get:
      summary: "Get a system page"
      operationId: "getSystemPage"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/graph":
    get:
      summary: "Get knowledge graph"
      description: "Returns graph nodes and edges derived from Wiki links, generated relationships, shared sources, common neighbors, type affinity, and evidence relationships."
      operationId: "getKnowledgeGraph"
      responses:
        200:
          description: "Knowledge graph."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/Graph"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/graph/insights":
    get:
      summary: "Get graph insights"
      description: "Returns graph insight status plus isolated pages, sparse pages, bridge pages, communities, knowledge gaps, surprising connections, and explicit empty reasons."
      operationId: "getGraphInsights"
      responses:
        200:
          description: "Graph insights."
          content:
            "application/json":
              schema:
                allOf:
                  - "$ref": "#/components/schemas/SuccessEnvelope"
                  - type: "object"
                    properties:
                      data:
                        "$ref": "#/components/schemas/GraphInsights"
        400:
          "$ref": "#/components/responses/BadRequest"
        401:
          "$ref": "#/components/responses/Unauthorized"
        500:
          "$ref": "#/components/responses/InternalServerError"
  "/knowledge-bases/{knowledge_base_id}/markdown-export":
    get:
      summary: "Export Markdown"
      operationId: "exportMarkdown"
      responses:
        200:
          description: "Standard JSON response envelope"
          content:
            "application/json":
              schema:
                "$ref": "#/components/schemas/SuccessEnvelope"
  "/knowledge-bases/{knowledge_base_id}/markdown-contract/validate":
    post:
      summary: "Validate Markdown Contract"
      operationId: "validateMarkdownContract"
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
    Graph:
      type: "object"
      required:
        - "knowledge_base_id"
        - "nodes"
        - "edges"
      properties:
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        nodes:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphNode"
        edges:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphEdge"
      additionalProperties: true
    GraphNode:
      type: "object"
      required:
        - "page_id"
        - "title"
        - "type"
        - "source_refs"
      properties:
        page_id:
          "$ref": "#/components/schemas/WikiPageId"
        page_version_id:
          "$ref": "#/components/schemas/PageVersionId"
        title:
          type: "string"
        type:
          type: "string"
        source_refs:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceRef"
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
      additionalProperties: true
    GraphEdge:
      type: "object"
      required:
        - "edge_id"
        - "from_page_id"
        - "to_page_id"
        - "relation_type"
        - "weight"
        - "source_document_ids"
      properties:
        edge_id:
          "$ref": "#/components/schemas/GraphEdgeId"
        from_page_id:
          "$ref": "#/components/schemas/WikiPageId"
        to_page_id:
          "$ref": "#/components/schemas/WikiPageId"
        relation_type:
          type: "string"
        explanation:
          type: "string"
        source_document_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/SourceDocumentId"
        weight:
          type: "number"
        algorithm:
          "$ref": "#/components/schemas/GraphAlgorithmMetadata"
        signal_contributions:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphSignalContribution"
        visibility_origin:
          "$ref": "#/components/schemas/VisibilityOrigin"
      additionalProperties: true
    GraphInsights:
      type: "object"
      required:
        - "knowledge_base_id"
        - "status"
        - "isolated_pages"
        - "sparse_pages"
        - "bridge_pages"
        - "knowledge_gaps"
        - "communities"
        - "surprising_connections"
        - "empty_reasons"
        - "snapshot"
      properties:
        knowledge_base_id:
          "$ref": "#/components/schemas/KnowledgeBaseId"
        status:
          "$ref": "#/components/schemas/GraphInsightStatus"
        snapshot:
          "$ref": "#/components/schemas/GraphInsightSnapshot"
        isolated_pages:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        sparse_pages:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        bridge_pages:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        knowledge_gaps:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        communities:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        surprising_connections:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphInsightItem"
        empty_reasons:
          type: "object"
          additionalProperties:
            type: "string"
      additionalProperties: true
    GraphInsightItem:
      type: "object"
      required:
        - "id"
        - "insight_type"
      properties:
        id:
          type: "string"
        insight_type:
          type: "string"
          enum:
            - "isolated_page"
            - "sparse_page"
            - "bridge_page"
            - "knowledge_gap"
            - "community"
            - "surprising_connection"
        page_id:
          oneOf:
            - "$ref": "#/components/schemas/WikiPageId"
            - type: "null"
        page_ids:
          type: "array"
          items:
            "$ref": "#/components/schemas/WikiPageId"
        reason_codes:
          type: "array"
          items:
            type: "string"
        signal_contributions:
          type: "array"
          items:
            "$ref": "#/components/schemas/GraphSignalContribution"
        severity:
          type: "string"
          enum:
            - "low"
            - "medium"
            - "high"
      additionalProperties: true
    SourceRef:
      type: "object"
      description: "Traceable source evidence attached to a page, graph edge, or result."
      properties:
        document_id:
          "$ref": "#/components/schemas/SourceDocumentId"
        locator:
          type: "string"
        media_asset_id:
          "$ref": "#/components/schemas/MediaAssetId"
        evidence_kind:
          type: "string"
          enum:
            - "text"
            - "image_caption"
            - "ocr"
          description: "Identifies whether the source evidence came from native text, OCR text, or a vision caption."
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

入库完成后，应同时读取 pages 和 graph。具备来源引用的页面适合作为生产级证据。

```bash
curl "http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/graph?include_insights=true" \
  -H "Authorization: Bearer <FOCOCONTEXT_API_KEY>"
```

## 响应示例

```json
{
  "data": {
    "nodes": [
      {
        "id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M",
        "title": "Source cleanup",
        "page_type": "concept",
        "visibility_origin": "canonical"
      }
    ],
    "edges": [
      {
        "id": "edge_01HX2YM4N5P6Q7R8S9T0V1W2X3",
        "source_page_id": "page_a",
        "target_page_id": "page_b",
        "relation_type": "shared_source",
        "weight": 0.82
      }
    ]
  },
  "request_id": "req_graph"
}
```

## 示例

```yaml
examples:
  request:
    summary: "请求示例"
    value: "curl \"http://127.0.0.1:18080/v1/knowledge-bases/<knowledge_base_id>/graph?include_insights=true\" \\ -H \"Authorization: Bearer <FOCOCONTEXT_API_KEY>\""
  response:
    summary: "响应示例"
    value: '{ "data": { "nodes": [ { "id": "page_01HX2YA2BC3D4E5F6G7H8J9K0M", "title": "Source cleanup", "page_type": "concept", "visibility_origin": "canonical" } ], "edges": [ { "id": "edge_01HX2YM4N5P6Q7R8S9T0V1W2X3", "source_pag'
responses:
  "200":
    description: "成功响应，返回标准 JSON 响应包。"
  "400":
    description: "请求无效，查看 error.code 和 details。"
  "401":
    description: "API Key 缺失或无效。"
```

## 错误处理

- `404 page_not_found`：页面不存在，或被 fork 可见性隐藏。
- `409 retrieval_not_ready`：图谱或索引状态尚未就绪。
- `400 invalid_graph_depth`：请求的扩展深度超过配置限制。

## 生产注意事项

- 所有示例都使用占位符，例如 `<FOCOCONTEXT_API_KEY>`、`<knowledge_base_id>`、`<job_id>`；生产环境请替换为真实值。
- 程序判断依赖结构化字段，不依赖本地化文案。
- 如果页面示例和 `GET /openapi.json` 有差异，以 `GET /openapi.json` 为准，并同步修正文档。
- 管理后台和开发者 API 使用同一套服务能力；API 是集成边界。
